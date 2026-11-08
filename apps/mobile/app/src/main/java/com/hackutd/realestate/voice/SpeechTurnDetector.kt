package com.hackutd.realestate.voice

import kotlin.math.sqrt

/** Local endpointing: audio activity + stable text + a pause. No action follows silence. */
class SpeechTurnDetector(private val startedAt: Long) {
    enum class Decision { WAIT, SEND, DISCARD }
    private var noise = 0.004
    private var voicedMs = 0L
    private var lastVoiceAt = startedAt
    private var textChangedAt = startedAt
    private var text = ""

    fun transcript(value: String, now: Long) {
        if (value.trim() != text) { text = value.trim(); textChangedAt = now }
    }

    fun frame(pcm: ByteArray, now: Long): Decision {
        var energy = 0.0
        for (i in 0 until pcm.size - 1 step 2) {
            val sample = ((pcm[i].toInt() and 255) or (pcm[i + 1].toInt() shl 8)).toShort().toDouble() / 32768.0
            energy += sample * sample
        }
        val rms = sqrt(energy / maxOf(1, pcm.size / 2))
        val threshold = (noise * 3.0).coerceIn(0.012, 0.06)
        if (rms > threshold) { lastVoiceAt = now; voicedMs += pcm.size * 1000L / 32000 }
        else noise = noise * 0.98 + rms * 0.02
        val quiet = now - lastVoiceAt
        val stable = now - textChangedAt
        val emergency = emergency(text)
        if (voicedMs >= 100 && quiet >= (if (emergency) 400 else 1400) && stable >= (if (emergency) 250 else 700) && complete(text)) return Decision.SEND
        // Drop stray words after a long gap instead of treating them as a command.
        if (quiet >= 4000 && voicedMs > 0 && stable >= 1500) return Decision.DISCARD
        if (now - startedAt >= 26000) return if (voicedMs >= 100 && complete(text) && stable >= 700) Decision.SEND else Decision.DISCARD
        return Decision.WAIT
    }

    companion object {
        fun emergency(text: String): Boolean {
            val value = text.lowercase().replace('’', '\'')
            if (Regex("^(is|could|would|what|if|should|can|do|does|did)\\b").containsMatchIn(value.trim())) return false
            if (Regex("\\b(no|not|isn't|is not|without)\\s+(a\\s+)?(fire|flood|flooding|smoke)\\b|\\b(fire drill|fire extinguisher|fire alarm test|what if|if there|in case|was on fire|used to flood)\\b").containsMatchIn(value)) return false
            return Regex("\\b(on fire|building is burning|room is burning|flames|flooding|flooded|rising water|heavy smoke|thick smoke|fire spreading)\\b|\\bthere('s| is) (a )?fire\\b").containsMatchIn(value)
        }
        fun photoRequest(text: String): Boolean {
            val value = text.lowercase().replace('’', '\'')
            return Regex("\\b(take|capture|snap|save|attach|add|shoot)\\b.{0,45}\\b(photo|picture|image|snapshot)\\b").containsMatchIn(value) &&
                !Regex("\\b(don't|do not|never|no need to)\\b").containsMatchIn(value)
        }
        fun complete(text: String): Boolean {
            val value = text.lowercase().replace(Regex("[.!?,]"), "").replace('’', '\'').trim()
            if (value.isBlank() || value.matches(Regex("(um|uh|hmm|erm|ah)(\\s+(um|uh|hmm|erm|ah))*"))) return false
            if (emergency(text) || photoRequest(text)) return true
            val shortAnswers = setOf("done", "clear", "normal", "good", "okay", "ok", "skip", "resolved", "finish", "yes", "no", "confirm", "yes confirm", "cancel", "reject", "repeat", "repeat that", "next", "previous", "back", "stop", "nothing", "nothing unusual", "nothing wrong", "no issues", "no problems", "looks good", "all clear", "i see nothing", "i see nothing unusual", "i don't see anything", "i do not see anything")
            if (value in shortAnswers) return true
            return value.split(Regex("\\s+")).size >= 4 && !value.contains(Regex("\\b(and|but|because|so|the|a|an|is|are|i|there|with|to|of)$"))
        }
    }
}
