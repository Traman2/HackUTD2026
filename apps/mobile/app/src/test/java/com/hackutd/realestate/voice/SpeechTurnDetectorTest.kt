package com.hackutd.realestate.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SpeechTurnDetectorTest {
    private val silence = ByteArray(3200)
    private val speech = ByteArray(3200).also { frame ->
        for (i in frame.indices step 2) { frame[i] = 0; frame[i + 1] = 20 }
    }
    private fun speak(detector: SpeechTurnDetector) { for (i in 1..6) detector.frame(speech, i * 100L) }

    @Test fun silenceNeverSendsAnObservation() {
        val detector = SpeechTurnDetector(0)
        assertEquals(SpeechTurnDetector.Decision.WAIT, detector.frame(silence, 2000))
        assertEquals(SpeechTurnDetector.Decision.DISCARD, detector.frame(silence, 26000))
    }
    @Test fun sentenceWaitsForBothPauseAndStableTranscript() {
        val detector = SpeechTurnDetector(0)
        speak(detector)
        detector.transcript("I can see water here.", 900)
        assertEquals(SpeechTurnDetector.Decision.WAIT, detector.frame(silence, 1300))
        assertEquals(SpeechTurnDetector.Decision.SEND, detector.frame(silence, 2100))
    }
    @Test fun fragmentsWithLongGapsAreDiscarded() {
        val detector = SpeechTurnDetector(0)
        speak(detector)
        detector.transcript("I see", 900)
        assertEquals(SpeechTurnDetector.Decision.WAIT, detector.frame(silence, 2100))
        assertEquals(SpeechTurnDetector.Decision.DISCARD, detector.frame(silence, 4700))
    }
    @Test fun speechContinuingDuringAPauseDoesNotSend() {
        val detector = SpeechTurnDetector(0)
        speak(detector)
        detector.transcript("I can see water", 900)
        assertEquals(SpeechTurnDetector.Decision.WAIT, detector.frame(speech, 2000))
        assertEquals(SpeechTurnDetector.Decision.WAIT, detector.frame(silence, 3000))
    }
    @Test fun stableTextRequiresActualAudioActivity() {
        val detector = SpeechTurnDetector(0)
        detector.transcript("I can see water here", 100)
        assertEquals(SpeechTurnDetector.Decision.WAIT, detector.frame(silence, 2100))
    }
    @Test fun conciseAnswersWorkButIncompleteSentencesDoNot() {
        assertTrue(SpeechTurnDetector.complete("Nothing unusual."))
        assertTrue(SpeechTurnDetector.complete("Confirm."))
        assertFalse(SpeechTurnDetector.complete("I see"))
        assertFalse(SpeechTurnDetector.complete("I can see water and"))
        assertFalse(SpeechTurnDetector.complete("um uh"))
    }
    @Test fun oneWordAnswersDoNotRequireThreeHundredMillisecondsOfSpeech() {
        val detector = SpeechTurnDetector(0)
        detector.frame(speech, 100)
        detector.transcript("Done.", 400)
        assertEquals(SpeechTurnDetector.Decision.SEND, detector.frame(silence, 1700))
    }
}
