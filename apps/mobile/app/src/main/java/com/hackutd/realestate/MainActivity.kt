package com.hackutd.realestate

import android.os.Bundle
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.core.net.toUri
import com.hackutd.realestate.glasses.WearablesPermissionRequester
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionStatus
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.coroutines.resume
import com.hackutd.realestate.ui.RealEstateNavHost
import com.hackutd.realestate.ui.theme.RealEstateTheme

class MainActivity : ComponentActivity(), WearablesPermissionRequester {
    private val permissionMutex = Mutex()
    private var bluetoothContinuation: CancellableContinuation<Boolean>? = null
    private var cameraContinuation: CancellableContinuation<PermissionStatus>? = null

    // Register unconditionally before STARTED, including when Android recreates this activity.
    private val bluetoothLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val pending = bluetoothContinuation
        bluetoothContinuation = null
        pending?.resume(granted)
    }
    private val cameraLauncher = registerForActivityResult(Wearables.RequestPermissionContract()) { result ->
        val pending = cameraContinuation
        cameraContinuation = null
        pending?.resume(result.getOrDefault(PermissionStatus.Denied))
    }

    override suspend fun requestBluetoothPermission(): Boolean = permissionMutex.withLock {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
        ) return@withLock true
        val preferences = getPreferences(MODE_PRIVATE)
        if (preferences.getBoolean("bluetooth_requested", false) &&
            !shouldShowRequestPermissionRationale(Manifest.permission.BLUETOOTH_CONNECT)
        ) {
            // A permanently denied permission can only be changed in Android Settings.
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, "package:$packageName".toUri()))
            return@withLock false
        }
        suspendCancellableCoroutine { continuation ->
            bluetoothContinuation = continuation
            continuation.invokeOnCancellation { bluetoothContinuation = null }
            preferences.edit { putBoolean("bluetooth_requested", true) }
            try {
                bluetoothLauncher.launch(Manifest.permission.BLUETOOTH_CONNECT)
            } catch (error: Exception) {
                bluetoothContinuation = null
                continuation.resume(false)
            }
        }
    }

    override suspend fun requestWearablesPermission(permission: Permission): PermissionStatus = permissionMutex.withLock {
        suspendCancellableCoroutine { continuation ->
            cameraContinuation = continuation
            continuation.invokeOnCancellation { cameraContinuation = null }
            try {
                cameraLauncher.launch(permission)
            } catch (error: Exception) {
                cameraContinuation = null
                continuation.resume(PermissionStatus.Denied)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            RealEstateTheme {
                RealEstateNavHost(glassesActivity = this)
            }
        }
    }

    override fun onDestroy() {
        bluetoothContinuation?.cancel()
        cameraContinuation?.cancel()
        super.onDestroy()
    }
}
