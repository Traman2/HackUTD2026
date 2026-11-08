package com.hackutd.realestate.glasses

import android.media.MediaCodec
import android.media.MediaCodecList
import android.media.MediaFormat
import android.os.Handler
import android.os.HandlerThread
import android.os.Process
import android.view.Surface
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

/** Bounded, asynchronous HEVC decoding directly to a Surface. Codec calls share one thread. */
internal class HevcDecoder(
    width: Int,
    height: Int,
    surface: Surface,
    config: ByteArray,
    private val onRendered: () -> Unit,
    private val onError: (String) -> Unit,
) {
    private data class Frame(val bytes: ByteArray, val timeUs: Long, val keyFrame: Boolean)
    private val thread = HandlerThread("GlassesHevcDecoder", Process.THREAD_PRIORITY_VIDEO).apply { start() }
    private val handler = Handler(thread.looper)
    private val closed = AtomicBoolean(false)
    private val feedPosted = AtomicBoolean(false)
    private val queueLock = Any()
    private val frames = ArrayDeque<Frame>()
    private var needsKeyFrame = true
    // Only accessed on the codec thread.
    private val inputBuffers = ArrayDeque<Int>()
    private var codec: MediaCodec? = null
    private var rendered = false

    init {
        handler.post {
            if (!closed.get()) {
                try {
                    val mime = MediaFormat.MIMETYPE_VIDEO_HEVC
                    // Meta's sample excludes these decoders because they corrupt glasses frames.
                    val candidates = MediaCodecList(MediaCodecList.ALL_CODECS).codecInfos.filter {
                        !it.isEncoder && it.name !in setOf("OMX.Exynos.hevc.dec", "c2.mtk.hevc.decoder") &&
                            it.supportedTypes.any { type -> type.equals(mime, ignoreCase = true) }
                    }
                    val selected = candidates.firstOrNull { it.isHardwareAccelerated }
                        ?: candidates.firstOrNull()
                        ?: error("This phone has no compatible HEVC decoder.")
                    val decoder = MediaCodec.createByCodecName(selected.name)
                    codec = decoder
                    decoder.setCallback(object : MediaCodec.Callback() {
                        override fun onInputBufferAvailable(codec: MediaCodec, index: Int) {
                            if (closed.get()) return
                            inputBuffers.addLast(index)
                            feed()
                        }

                        override fun onOutputBufferAvailable(codec: MediaCodec, index: Int, info: MediaCodec.BufferInfo) {
                            if (closed.get()) return
                            try {
                                val show = info.size > 0 && surface.isValid
                                codec.releaseOutputBuffer(index, show)
                                if (show && !rendered) {
                                    rendered = true
                                    onRendered()
                                }
                            } catch (error: Exception) { fail(error) }
                        }

                        override fun onError(codec: MediaCodec, error: MediaCodec.CodecException) = fail(error)
                        override fun onOutputFormatChanged(codec: MediaCodec, format: MediaFormat) = Unit
                    }, handler)
                    val format = MediaFormat.createVideoFormat(mime, width, height).apply {
                        setByteBuffer("csd-0", ByteBuffer.wrap(config))
                    }
                    decoder.configure(format, surface, null, 0)
                    decoder.setVideoScalingMode(MediaCodec.VIDEO_SCALING_MODE_SCALE_TO_FIT)
                    decoder.start()
                } catch (error: Exception) { fail(error) }
            }
        }
    }

    fun enqueue(bytes: ByteArray, timeUs: Long, keyFrame: Boolean) {
        if (closed.get()) return
        synchronized(queueLock) {
            // Prefer catching up at the next keyframe to accumulating seconds of latency.
            if (frames.size >= 24) {
                frames.clear()
                needsKeyFrame = true
            }
            if (needsKeyFrame && !keyFrame) return
            needsKeyFrame = false
            frames.addLast(Frame(bytes, timeUs, keyFrame))
        }
        if (feedPosted.compareAndSet(false, true)) handler.post {
            feedPosted.set(false)
            feed()
        }
    }

    private fun feed() {
        if (closed.get()) return
        val decoder = codec ?: return
        try {
            while (inputBuffers.isNotEmpty()) {
                val frame = synchronized(queueLock) { frames.removeFirstOrNull() } ?: break
                val index = inputBuffers.removeFirst()
                val input = checkNotNull(decoder.getInputBuffer(index))
                check(input.capacity() >= frame.bytes.size) { "The glasses video frame is too large to decode." }
                input.clear()
                input.put(frame.bytes)
                decoder.queueInputBuffer(
                    index, 0, frame.bytes.size, frame.timeUs,
                    if (frame.keyFrame) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0,
                )
            }
        } catch (error: Exception) { fail(error) }
    }

    private fun fail(error: Exception) {
        if (!closed.get()) {
            onError(error.message ?: "Couldn't decode glasses video.")
            stop()
        }
    }

    fun stop() {
        if (!closed.compareAndSet(false, true)) return
        synchronized(queueLock) { frames.clear() }
        handler.post {
            val decoder = codec
            codec = null
            inputBuffers.clear()
            try { decoder?.stop() } catch (_: Exception) { /* Codec may already have failed. */ }
            try { decoder?.release() } catch (_: Exception) { /* Still release the thread. */ }
            thread.quitSafely()
        }
    }
}
