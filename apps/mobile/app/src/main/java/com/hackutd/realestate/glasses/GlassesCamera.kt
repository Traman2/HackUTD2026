package com.hackutd.realestate.glasses

import android.graphics.ImageDecoder
import android.view.Surface
import java.nio.ByteBuffer
import android.util.Base64
import com.hackutd.realestate.data.PreparedPhoto
import com.meta.wearable.dat.camera.types.PhotoData
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import com.meta.wearable.dat.camera.Camera
import com.meta.wearable.dat.camera.addCamera
import com.meta.wearable.dat.camera.types.StreamConfiguration
import com.meta.wearable.dat.camera.types.StreamState
import com.meta.wearable.dat.camera.types.VideoFrame
import com.meta.wearable.dat.camera.types.VideoQuality
import com.meta.wearable.dat.core.session.DeviceSession
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class GlassesPreviewState(
    val stream: StreamState? = null,
    val firstFrameRendered: Boolean = false,
    val width: Int = 504,
    val height: Int = 896,
    val error: String? = null,
)

/** Owns one camera capability, and can rebuild its decoder after the UI surface changes. */
class GlassesCamera(private val scope: CoroutineScope) {
    private val captureMutex = Mutex()
    private val _state = MutableStateFlow(GlassesPreviewState())
    val state = _state.asStateFlow()
    private var camera: Camera? = null
    private var streamJob: Job? = null
    private var firstFrameTimeout: Job? = null
    private val frameDispatcher = Dispatchers.Default.limitedParallelism(1)
    private val decoderLock = Any()
    private var generation = 0
    private var surface: Surface? = null
    private var decoder: HevcDecoder? = null
    private var decoderWidth = 0
    private var decoderHeight = 0
    private val parameterSets = HevcParameterSets()

    /** In-stream still capture: does not stop video or save a screenshot of the overlay. */
    suspend fun capturePhoto(): PreparedPhoto = captureMutex.withLock {
        val active = camera ?: error("Glasses camera is not connected.")
        check(_state.value.stream == StreamState.STREAMING) { "Glasses camera is not streaming." }
        val result = withTimeout(8000) { active.stream.capturePhoto() }
        val photo = result.getOrNull() ?: error(result.errorOrNull()?.description ?: "Couldn't capture a glasses photo.")
        withContext(Dispatchers.Default) {
            val (bytes, contentType) = when (photo) {
                is PhotoData.Bitmap -> {
                    val output = ByteArrayOutputStream()
                    check(photo.bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, output)) { "Couldn't encode the photo." }
                    output.toByteArray() to "image/jpeg"
                }
                is PhotoData.HEIC -> {
                    val heic = ByteArray(photo.data.remaining()).also { photo.data.duplicate().get(it) }
                    // Browsers can't show HEIC, so store JPEG. Keep the original if it can't be decoded.
                    heicToJpeg(heic)?.let { it to "image/jpeg" } ?: (heic to "image/heic")
                }
            }
            check(bytes.size in 100..15 * 1024 * 1024) { "Glasses photo size is unsupported." }
            PreparedPhoto(bytes, contentType, Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(bytes), Base64.NO_WRAP))
        }
    }

    /** Decodes HEIC (applying its rotation) and re-encodes it as JPEG, or null if decoding fails. */
    private fun heicToJpeg(heic: ByteArray): ByteArray? = runCatching {
        val source = ImageDecoder.createSource(ByteBuffer.wrap(heic))
        val bitmap = ImageDecoder.decodeBitmap(source) { decoder, _, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
        ByteArrayOutputStream().use { output ->
            check(bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, output))
            output.toByteArray()
        }.also { bitmap.recycle() }
    }.getOrNull()

    fun start(session: DeviceSession) {
        if (camera != null) return
        try {
            val result = session.addCamera(StreamConfiguration(
                videoQuality = VideoQuality.MEDIUM, frameRate = 24, compressVideo = true,
            ))
            val added = result.getOrNull()
            if (added == null) {
                _state.update { it.copy(error = result.errorOrNull()?.description ?: "Couldn't start the glasses camera.") }
                return
            }
            camera = added
            val currentGeneration = synchronized(decoderLock) {
                generation++
                _state.value = GlassesPreviewState(stream = StreamState.STARTING)
                generation
            }
            streamJob = scope.launch(start = CoroutineStart.UNDISPATCHED) {
                launch(frameDispatcher, start = CoroutineStart.UNDISPATCHED) {
                    added.stream.videoStream.collect { onFrame(it, currentGeneration) }
                }
                launch(start = CoroutineStart.UNDISPATCHED) {
                    added.stream.state.collect { stream ->
                        _state.update { it.copy(stream = stream) }
                    }
                }
                launch(start = CoroutineStart.UNDISPATCHED) {
                    added.stream.errorStream.collect { error -> stop(error.description) }
                }
            }
            firstFrameTimeout = scope.launch {
                delay(20_000)
                if (!_state.value.firstFrameRendered && _state.value.stream != StreamState.PAUSED) {
                    stop("No glasses video arrived. Check that your glasses are unfolded and being worn, then reconnect.")
                }
            }
            added.stream.start().onFailure { error, _ -> stop(error.description) }
        } catch (error: Exception) {
            stop(error.message ?: "Couldn't start the glasses camera.")
        }
    }

    private fun onFrame(frame: VideoFrame, currentGeneration: Int) {
        if (!frame.isCompressed || frame.width <= 0 || frame.height <= 0) return
        val bytes = ByteArray(frame.buffer.remaining()).also { frame.buffer.duplicate().get(it) }
        val units = HevcAnnexB.parse(bytes)
        synchronized(decoderLock) {
            if (generation != currentGeneration) return
            parameterSets.offer(units)
            _state.update { it.copy(width = frame.width, height = frame.height) }
            if (!HevcAnnexB.hasPicture(units)) return
            val keyFrame = HevcAnnexB.isKeyFrame(units)
            if (decoder != null && (decoderWidth != frame.width || decoderHeight != frame.height)) {
                clearDecoder()
            }
            val target = surface?.takeIf { it.isValid } ?: return
            if (decoder == null) {
                val config = parameterSets.complete() ?: return
                if (!keyFrame) return
                decoderWidth = frame.width
                decoderHeight = frame.height
                decoder = HevcDecoder(
                    frame.width, frame.height, target, config,
                    onRendered = {
                        synchronized(decoderLock) {
                            if (generation == currentGeneration && surface === target) {
                                _state.update { it.copy(firstFrameRendered = true) }
                            }
                        }
                    },
                    onError = { message ->
                        scope.launch {
                            if (generation == currentGeneration && surface === target) stop(message)
                        }
                    },
                )
            }
            decoder?.enqueue(bytes, frame.presentationTimeUs, keyFrame)
        }
    }

    fun attachSurface(target: Surface) = synchronized(decoderLock) {
        if (surface !== target) {
            clearDecoder()
            surface = target
        }
    }

    fun detachSurface(target: Surface) = synchronized(decoderLock) {
        if (surface === target) {
            clearDecoder()
            surface = null
        }
    }

    private fun clearDecoder() {
        decoder?.stop()
        decoder = null
        _state.update { it.copy(firstFrameRendered = false) }
    }

    /** Main-thread caller stops the capability before its parent DeviceSession is stopped. */
    fun stop(error: String? = null) {
        streamJob?.cancel()
        streamJob = null
        firstFrameTimeout?.cancel()
        firstFrameTimeout = null
        synchronized(decoderLock) {
            generation++
            clearDecoder()
            parameterSets.clear()
            _state.value = GlassesPreviewState(error = error)
        }
        val oldCamera = camera
        camera = null
        try { oldCamera?.stop() } catch (_: Exception) { /* The device may have disconnected already. */ }
    }
}
