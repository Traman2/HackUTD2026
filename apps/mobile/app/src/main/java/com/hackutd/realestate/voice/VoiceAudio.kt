package com.hackutd.realestate.voice

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.*
import android.os.Build
import androidx.core.content.ContextCompat
import kotlinx.coroutines.*
import java.io.File

/** Phone input is the reliable camera-compatible default; glasses input is opt-in. */
class AudioRouteManager(context: Context) {
    private val audio = context.getSystemService(AudioManager::class.java)
    private var previousMode = audio.mode
    private var changed = false
    fun input(glasses: Boolean): AudioDeviceInfo? {
        previousMode = audio.mode
        if (glasses) {
            val device = audio.getDevices(AudioManager.GET_DEVICES_INPUTS).firstOrNull {
                it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || (Build.VERSION.SDK_INT >= 31 && it.type == AudioDeviceInfo.TYPE_BLE_HEADSET)
            } ?: error("Glasses microphone is unavailable. Use phone microphone.")
            changed = true
            audio.mode = AudioManager.MODE_IN_COMMUNICATION
            if (Build.VERSION.SDK_INT >= 31) {
                val route = audio.availableCommunicationDevices.firstOrNull { it.id == device.id || it.type == device.type }
                    ?: error("No glasses communication route. Use phone microphone.")
                check(audio.setCommunicationDevice(route)) { "Couldn't select glasses microphone." }
            } else {
                @Suppress("DEPRECATION")
                audio.startBluetoothSco()
            }
            return device
        }
        return audio.getDevices(AudioManager.GET_DEVICES_INPUTS).firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_MIC }
    }
    fun restore() {
        if (!changed) return
        if (Build.VERSION.SDK_INT >= 31) audio.clearCommunicationDevice()
        else { @Suppress("DEPRECATION") audio.stopBluetoothSco() }
        audio.mode = previousMode
        changed = false
    }
}

class VoiceRecorder(private val context: Context, private val scope: CoroutineScope) {
    private var recorder: AudioRecord? = null
    private var job: Job? = null
    @SuppressLint("MissingPermission")
    fun start(input: AudioDeviceInfo?, onFrame: (ByteArray) -> Boolean, onError: (String) -> Unit) {
        check(ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { "Allow microphone access first." }
        check(recorder == null) { "Microphone already active." }
        val minimum = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        check(minimum > 0) { "16 kHz recording is unavailable." }
        val record = AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
            .setAudioFormat(AudioFormat.Builder().setSampleRate(16000).setChannelMask(AudioFormat.CHANNEL_IN_MONO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
            .setBufferSizeInBytes(maxOf(minimum * 2, 6400)).build()
        recorder = record
        if (input != null) check(record.setPreferredDevice(input)) { "Couldn't select microphone." }
        check(record.state == AudioRecord.STATE_INITIALIZED) { "Microphone failed to initialize." }
        record.startRecording()
        job = scope.launch(Dispatchers.IO) {
            try {
                val frame = ByteArray(3200)
                while (isActive) {
                    val read = record.read(frame, 0, frame.size, AudioRecord.READ_BLOCKING)
                    if (read < 0) error("Microphone disconnected.")
                    if (read > 0 && !onFrame(frame.copyOf(read))) error("Voice connection is too slow. Reconnect and retry.")
                }
            } catch (e: Exception) { if (isActive) withContext(Dispatchers.Main) { onError(e.message ?: "Microphone failed.") } }
        }
    }
    fun stop() {
        job?.cancel(); job = null
        recorder?.let { record -> runCatching { record.stop() }; record.release() }
        recorder = null
    }
}

class VoicePlayer(private val context: Context) {
    private var player: MediaPlayer? = null
    private var file: File? = null
    fun play(bytes: ByteArray, onRoute: (String) -> Unit, onComplete: () -> Unit, onError: () -> Unit) {
        stop()
        val temp = File.createTempFile("resolution-", ".mp3", context.cacheDir).also { it.writeBytes(bytes) }
        file = temp
        player = MediaPlayer().apply {
            setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            setDataSource(temp.absolutePath)
            setOnPreparedListener {
                start()
                onRoute(routedDevice?.productName?.toString() ?: "System media output (select glasses in Android media controls)")
            }
            setOnCompletionListener { stop(); onComplete() }
            setOnErrorListener { _, _, _ -> stop(); onError(); true }
            prepareAsync()
        }
    }
    fun stop() { player?.release(); player = null; file?.delete(); file = null }
}
