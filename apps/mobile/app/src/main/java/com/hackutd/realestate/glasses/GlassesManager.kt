package com.hackutd.realestate.glasses

import android.app.Activity
import android.app.Application
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.selectors.AutoDeviceSelector
import com.meta.wearable.dat.core.session.DeviceSession
import com.meta.wearable.dat.core.session.DeviceSessionState
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionStatus
import com.meta.wearable.dat.core.types.RegistrationState
import com.meta.wearable.dat.core.types.WearablesError
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

sealed interface GlassesConnection {
    data object Idle : GlassesConnection
    data object NeedsBluetooth : GlassesConnection
    data object NeedsRegistration : GlassesConnection
    data object NeedsPermission : GlassesConnection
    data object Connecting : GlassesConnection
    data object Connected : GlassesConnection
    data object Paused : GlassesConnection
    data object Stopped : GlassesConnection
    data class Error(val message: String) : GlassesConnection
}

/** All entry points run on Main. Only SDK/session observers use the application scope. */
class GlassesManager(private val app: Application, private val scope: CoroutineScope) {
    val video = GlassesCamera(scope)
    private val _connection = MutableStateFlow<GlassesConnection>(GlassesConnection.Idle)
    val connection = _connection.asStateFlow()
    private val _registration = MutableStateFlow(RegistrationState.UNAVAILABLE)
    val registration = _registration.asStateFlow()
    private val _deviceCount = MutableStateFlow(0)
    val deviceCount = _deviceCount.asStateFlow()

    private var initialized = false
    private val connectMutex = Mutex()
    private var sessionJob: Job? = null
    private var timeoutJob: Job? = null
    // The camera capability is added only once this session reports STARTED.
    private val _session = MutableStateFlow<DeviceSession?>(null)
    val session = _session.asStateFlow()

    fun initialize(): Boolean {
        if (initialized) return true
        val result = Wearables.initialize(app)
        val error = result.errorOrNull()
        if (result.isFailure && error != WearablesError.ALREADY_INITIALIZED) {
            _connection.value = GlassesConnection.Error(error?.description ?: "Couldn't initialize glasses.")
            return false
        }
        initialized = true
        _registration.value = Wearables.registrationState.value
        scope.launch {
            Wearables.registrationState.collect { registration ->
                _registration.value = registration
                if (registration != RegistrationState.REGISTERED) {
                    disconnect()
                    _connection.value = GlassesConnection.NeedsRegistration
                } else if (_connection.value == GlassesConnection.NeedsRegistration) {
                    _connection.value = GlassesConnection.Idle
                }
            }
        }
        scope.launch { Wearables.devices.collect { _deviceCount.value = it.size } }
        scope.launch {
            Wearables.registrationErrorStream.collect {
                _connection.value = GlassesConnection.Error(it.description)
            }
        }
        return true
    }

    suspend fun prepare(permissions: WearablesPermissionRequester): Boolean {
        if (!permissions.requestBluetoothPermission()) {
            _connection.value = GlassesConnection.NeedsBluetooth
            return false
        }
        return initialize()
    }

    fun register(activity: Activity) {
        if (!initialized) return
        try {
            Wearables.startRegistration(activity)
        } catch (error: Exception) {
            _connection.value = GlassesConnection.Error(error.message ?: "Install Meta AI and pair your glasses first.")
        }
    }

    suspend fun connect(permissions: WearablesPermissionRequester) = connectMutex.withLock {
        if (_session.value != null) return@withLock
        try {
            if (!prepare(permissions)) return@withLock
            if (Wearables.registrationState.value != RegistrationState.REGISTERED) {
                _connection.value = GlassesConnection.NeedsRegistration
                return@withLock
            }
            val result = Wearables.checkPermissionStatus(Permission.CAMERA)
            if (result.isFailure) {
                _connection.value = GlassesConnection.Error(result.errorOrNull()?.description ?: "Couldn't check camera access.")
                return@withLock
            }
            if (result.getOrNull() != PermissionStatus.Granted) {
                _connection.value = GlassesConnection.NeedsPermission
                if (permissions.requestWearablesPermission(Permission.CAMERA) != PermissionStatus.Granted) {
                    return@withLock
                }
            }
            val created = Wearables.createSession(AutoDeviceSelector())
            val newSession = created.getOrNull()
            if (newSession == null) {
                _connection.value = GlassesConnection.Error(created.errorOrNull()?.description ?: "Couldn't connect to glasses.")
                return@withLock
            }
            _connection.value = GlassesConnection.Connecting
            _session.value = newSession
            // Subscribe to both flows before start(), under one cancellable child job.
            sessionJob = scope.launch(start = CoroutineStart.UNDISPATCHED) {
                launch(start = CoroutineStart.UNDISPATCHED) {
                    newSession.errors.collect { error ->
                        if (_session.value === newSession) {
                            disconnect()
                            _connection.value = GlassesConnection.Error(error.description)
                        }
                    }
                }
                launch(start = CoroutineStart.UNDISPATCHED) {
                    newSession.state.collect { state ->
                        if (_session.value === newSession) {
                            when (state) {
                                DeviceSessionState.STARTED -> {
                                    timeoutJob?.cancel()
                                    _connection.value = GlassesConnection.Connected
                                    video.start(newSession)
                                }
                                DeviceSessionState.PAUSED -> {
                                    timeoutJob?.cancel()
                                    _connection.value = GlassesConnection.Paused
                                }
                                DeviceSessionState.STOPPED -> disconnect()
                                else -> Unit
                            }
                        }
                    }
                }
            }
            timeoutJob = scope.launch {
                delay(30_000)
                if (_session.value === newSession && _connection.value == GlassesConnection.Connecting) {
                    disconnect()
                    _connection.value = GlassesConnection.Error("Couldn't connect. Unfold and wear your glasses, then try again.")
                }
            }
            newSession.start()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            disconnect()
            _connection.value = GlassesConnection.Error(error.message ?: "Couldn't connect to glasses.")
        }
    }

    fun disconnect() {
        video.stop()
        timeoutJob?.cancel()
        timeoutJob = null
        sessionJob?.cancel()
        sessionJob = null
        val oldSession = _session.value
        _session.value = null
        oldSession?.stop()
        if (oldSession != null) _connection.value = GlassesConnection.Stopped
    }

}
