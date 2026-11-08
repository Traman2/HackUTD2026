package com.hackutd.realestate.voice

import android.app.Application
import android.os.SystemClock
import android.util.Base64
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.hackutd.realestate.RealEstateApp
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class VoiceUiState(
    val phase: String = "idle", val sessionId: String? = null, val transcript: String = "", val reply: String = "",
    val error: String? = null, val pending: JSONObject? = null, val revision: Int = 0, val halted: Boolean = false,
    val route: String = "Phone microphone · system media output", val ticketChange: Int = 0,
) { val connected get() = phase in setOf("ready", "listening", "thinking", "speaking", "capturing") }

class VoiceViewModel(app: Application) : AndroidViewModel(app) {
    private val repository = (app as RealEstateApp).repository
    private val glasses = (app as RealEstateApp).glasses
    private val _state = MutableStateFlow(VoiceUiState())
    val state = _state.asStateFlow()
    private val client = VoiceSessionClient()
    private val routes = AudioRouteManager(app)
    private val recorder = VoiceRecorder(app, viewModelScope)
    private val player = VoicePlayer(app)
    private var listenJob: Job? = null
    private var recordTimer: Job? = null
    private var generation = 0
    private var running = false
    private var recordingRequested = false
    private var sessionEnded = false
    private var detector: SpeechTurnDetector? = null
    private var pauseJob: Job? = null
    private var captureJob: Job? = null
    private var capturePending = false
    private var emergencyPlaybackPending = false
    private val capturedRequests = mutableSetOf<String>()

    fun start(ticketId: Long) {
        if (_state.value.phase !in setOf("idle", "paused")) return
        val epoch = ++generation
        running = true
        sessionEnded = false
        capturedRequests.clear()
        _state.update { it.copy(phase = "connecting", error = null, transcript = "") }
        viewModelScope.launch {
            try {
                pauseJob?.join()
                if (epoch != generation) return@launch
                val session = repository.voiceCall("start_resolution_session", JSONArray().put(ticketId).put(UUID.randomUUID().toString()))
                if (epoch != generation) return@launch
                snapshot(session)
                val grant = repository.voiceCall("authorize_resolution_voice", JSONArray().put(session.getString("sessionId")))
                if (epoch != generation) return@launch
                client.connect(grant, { message -> viewModelScope.launch { if (epoch == generation) receive(message) } }, { reason ->
                    viewModelScope.launch { if (epoch == generation) fail(reason) }
                })
            } catch (e: Exception) { if (epoch == generation) fail(e.message ?: "Couldn't start the agent.") }
        }
    }

    private fun snapshot(value: JSONObject) {
        sessionEnded = value.optString("status") in setOf("ended", "halted")
        _state.update { it.copy(sessionId = value.getString("sessionId"), revision = value.getInt("revision"), halted = value.optString("status") == "halted",
            pending = value.optJSONObject("pendingAction"), ticketChange = it.ticketChange + 1) }
    }

    private fun receive(msg: JSONObject) {
        when (msg.getString("type")) {
            "session.ready" -> {
                snapshot(msg.getJSONObject("snapshot"))
                _state.update { it.copy(phase = "ready", error = null) }
                // Always speak the current checklist step, including when resuming.
                if (msg.getJSONObject("snapshot").optJSONObject("photoRequest") == null) sendText("start")
            }
            "photo.request" -> capturePhoto(msg)
            "photo.completed" -> {
                snapshot(msg.getJSONObject("snapshot")); capturePending = false
                _state.update { it.copy(reply = msg.getJSONObject("turn").getString("assistantTranscript")) }
                if (sessionEnded && !emergencyPlaybackPending && _state.value.phase != "speaking") stop()
            }
            "utterance.ready" -> {
                if (!running || !recordingRequested) return
                try {
                    val input = routes.input(false)
                    val epoch = generation
                    val turnDetector = SpeechTurnDetector(SystemClock.elapsedRealtime())
                    detector = turnDetector
                    recorder.start(input, { frame ->
                        val sent = client.audio(frame)
                        viewModelScope.launch {
                            if (epoch == generation && detector === turnDetector && _state.value.phase == "listening") {
                                when (turnDetector.frame(frame, SystemClock.elapsedRealtime())) {
                                    SpeechTurnDetector.Decision.SEND -> finishRecording(false)
                                    SpeechTurnDetector.Decision.DISCARD -> finishRecording(true)
                                    else -> Unit
                                }
                            }
                        }
                        sent
                    }) { error -> fail(error) }
                    _state.update { it.copy(phase = "listening", route = "${input?.productName ?: "System microphone"} · system media output") }
                    recordTimer = viewModelScope.launch { delay(27000); finishRecording(true) }
                } catch (e: Exception) { fail(e.message ?: "Microphone failed.") }
            }
            "transcript.partial", "transcript.final" -> {
                val text = msg.getString("text")
                detector?.transcript(text, SystemClock.elapsedRealtime())
                _state.update { it.copy(transcript = text) }
            }
            "utterance.discarded" -> {
                _state.update { it.copy(phase = "ready", transcript = "") }
                listenAgain()
            }
            "assistant.message" -> {
                snapshot(msg.getJSONObject("snapshot"))
                if (msg.getJSONObject("snapshot").optJSONObject("photoRequest") == null) capturePending = false
                _state.update { it.copy(reply = msg.getJSONObject("turn").getString("assistantTranscript")) }
            }
            "audio.ready" -> {
                val epoch = generation
                val turnId = msg.getString("clientTurnId")
                _state.update { it.copy(phase = "speaking") }
                try {
                    player.play(Base64.decode(msg.getString("base64"), Base64.DEFAULT), { route ->
                        if (epoch == generation) _state.update { it.copy(route = "Phone microphone · $route") }
                    }, {
                        if (epoch == generation && running) {
                            client.send(JSONObject().put("type", "playback.completed").put("clientTurnId", turnId))
                            _state.update { it.copy(phase = "ready") }
                            emergencyPlaybackPending = false
                            if (sessionEnded && !capturePending) stop()
                            else if (capturePending) _state.update { it.copy(phase = "capturing") }
                            else listenAgain()
                        }
                    }, { if (epoch == generation) fail("Couldn't play the reply. Start the agent to retry.") })
                } catch (_: Exception) { fail("Couldn't play the reply. Start the agent to retry.") }
            }
            "turn.completed" -> if (_state.value.phase == "thinking") {
                _state.update { it.copy(phase = "ready") }
                if (sessionEnded && !capturePending && !emergencyPlaybackPending) stop()
                else if (!capturePending && !emergencyPlaybackPending) listenAgain()
            }
            "error" -> fail(msg.optString("message", "Voice request failed. Start the agent to retry."))
        }
    }

    private fun capturePhoto(message: JSONObject) {
        val requestId = message.getString("requestId")
        if (!capturedRequests.add(requestId)) return
        recorder.stop(); routes.restore(); recordingRequested = false; recordTimer?.cancel(); detector = null; listenJob?.cancel()
        snapshot(message.getJSONObject("snapshot"))
        val emergency = message.optBoolean("emergency")
        capturePending = true
        emergencyPlaybackPending = emergency
        _state.update { it.copy(phase = "capturing", reply = if (emergency)
            "Inspection halted. Move to safety. Attempting an automatic photo; do not stay for it." else "Taking a glasses photo and saving it to this checklist step…") }
        val epoch = generation
        captureJob = viewModelScope.launch {
            val result = JSONObject().put("type", "photo.result").put("requestId", requestId)
            try {
                val photo = withTimeout(if (emergency) 3000L else 9000L) { glasses.video.capturePhoto() }
                val photoId = repository.uploadTicketPhoto(message.getString("ticketId").toLong(), message.getInt("stepOrder"),
                    photo, source = "glasses", caption = message.optString("caption"))
                result.put("photoId", photoId.toString())
                if (epoch == generation) _state.update { it.copy(ticketChange = it.ticketChange + 1) }
            } catch (e: Exception) {
                if (e is CancellationException && !currentCoroutineContext().isActive) throw e
                result.put("error", (e.message ?: "Glasses photo failed.").take(300))
                if (epoch == generation) _state.update { it.copy(error = if (emergency)
                    "Photo unavailable. Inspection is halted; move to safety." else "Photo couldn't be attached. Check the glasses connection and S3 access, then ask to take a photo again.") }
            }
            if (epoch == generation) client.send(result)
        }
    }

    private fun bindAction(msg: JSONObject) {
        _state.value.pending?.let { msg.put("actionId", it.getString("id")).put("revision", _state.value.revision) }
    }

    private fun sendText(text: String) {
        if (_state.value.phase != "ready") return
        val msg = JSONObject().put("type", "text").put("clientTurnId", UUID.randomUUID().toString()).put("text", text)
        bindAction(msg)
        if (client.send(msg)) _state.update { it.copy(phase = "thinking", error = null) } else fail("Voice connection lost.")
    }

    private fun listenAgain() {
        listenJob?.cancel()
        if (!running || sessionEnded || capturePending) return
        val epoch = generation
        listenJob = viewModelScope.launch {
            // Microphone remains off during playback and the speaker's echo tail.
            delay(450)
            if (epoch != generation || !running || _state.value.phase != "ready") return@launch
            recordingRequested = true
            val msg = JSONObject().put("type", "utterance.start").put("clientTurnId", UUID.randomUUID().toString()).put("sampleRate", 16000)
            bindAction(msg)
            if (client.send(msg)) _state.update { it.copy(phase = "thinking", transcript = "") } else fail("Voice connection lost.")
        }
    }

    private fun finishRecording(discard: Boolean) {
        if (_state.value.phase != "listening") return
        recorder.stop(); routes.restore(); recordingRequested = false; recordTimer?.cancel(); detector = null
        _state.update { it.copy(phase = "thinking") }
        if (!client.send(JSONObject().put("type", if (discard) "utterance.discard" else "utterance.end"))) fail("Voice connection lost.")
    }

    private fun fail(message: String) { stop(); _state.update { it.copy(error = message) } }
    private fun release() {
        running = false; listenJob?.cancel(); recordTimer?.cancel(); captureJob?.cancel(); capturePending = false; emergencyPlaybackPending = false; detector = null; recordingRequested = false
        recorder.stop(); player.stop(); routes.restore()
    }
    fun stop() {
        ++generation; release(); client.close()
        val id = _state.value.sessionId
        _state.update { it.copy(phase = "paused", pending = null) }
        if (id != null && !sessionEnded) pauseJob = viewModelScope.launch { runCatching { repository.pauseVoice(id) } }
    }
    override fun onCleared() { ++generation; release(); client.close() }
}
