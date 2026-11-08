package com.hackutd.realestate.glasses

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HevcAnnexBTest {
    @Test fun mixedStartCodesPreserveEachCompleteNal() {
        val vps = nal(32, prefix = 4)
        val sps = nal(33, prefix = 3)
        val picture = nal(19, prefix = 4)
        val parsed = HevcAnnexB.parse(vps + sps + picture)
        assertEquals(listOf(32, 33, 19), parsed.map { it.type })
        assertArrayEquals(vps, parsed[0].bytes)
        assertArrayEquals(sps, parsed[1].bytes)
        assertArrayEquals(picture, parsed[2].bytes)
    }

    @Test fun incompleteHeadersAndNonAnnexBDataAreIgnored() {
        assertTrue(HevcAnnexB.parse(byteArrayOf()).isEmpty())
        assertTrue(HevcAnnexB.parse(byteArrayOf(1, 2, 3, 4)).isEmpty())
        assertTrue(HevcAnnexB.parse(byteArrayOf(0, 0, 1, 64)).isEmpty())
        assertTrue(HevcAnnexB.parse(byteArrayOf(0, 0, 0, 1)).isEmpty())
    }

    @Test fun parameterSetsAloneAreNotVideoPictures() {
        val units = HevcAnnexB.parse(nal(32) + nal(33) + nal(34) + nal(39))
        assertFalse(HevcAnnexB.hasPicture(units))
        assertFalse(HevcAnnexB.isKeyFrame(units))
    }

    @Test fun allIrapTypesCanStartADecoderButInterFramesCannot() {
        for (type in 16..23) {
            val units = HevcAnnexB.parse(nal(type))
            assertTrue(HevcAnnexB.isKeyFrame(units))
            assertTrue(HevcAnnexB.hasPicture(units))
        }
        val predicted = HevcAnnexB.parse(nal(1))
        assertTrue(HevcAnnexB.hasPicture(predicted))
        assertFalse(HevcAnnexB.isKeyFrame(predicted))
    }

    @Test fun separateOutOfOrderParameterSetsAreCombinedInCodecOrder() {
        val cache = HevcParameterSets()
        cache.offer(HevcAnnexB.parse(nal(34)))
        cache.offer(HevcAnnexB.parse(nal(32)))
        assertNull(cache.complete())
        cache.offer(HevcAnnexB.parse(nal(33)))
        assertArrayEquals(nal(32) + nal(33) + nal(34), cache.complete())
    }

    @Test fun configurationEmbeddedInAKeyFrameCanPrimeANewSurface() {
        val cache = HevcParameterSets()
        val units = HevcAnnexB.parse(nal(32) + nal(33) + nal(34) + nal(20))
        cache.offer(units)
        assertTrue(HevcAnnexB.isKeyFrame(units))
        assertArrayEquals(nal(32) + nal(33) + nal(34), cache.complete())
    }

    @Test fun newParameterSetsReplaceEarlierConfiguration() {
        val cache = HevcParameterSets()
        cache.offer(HevcAnnexB.parse(nal(32) + nal(33) + nal(34)))
        val changedSps = nal(33, payload = 8)
        cache.offer(HevcAnnexB.parse(changedSps))
        assertArrayEquals(nal(32) + changedSps + nal(34), cache.complete())
    }

    @Test fun reconnectCannotReuseThePreviousStreamsParameterSets() {
        val cache = HevcParameterSets()
        cache.offer(HevcAnnexB.parse(nal(32) + nal(33) + nal(34)))
        cache.clear()
        cache.offer(HevcAnnexB.parse(nal(32)))
        assertNull(cache.complete())
    }

    private fun nal(type: Int, prefix: Int = 4, payload: Byte = 7): ByteArray =
        (if (prefix == 4) byteArrayOf(0, 0, 0, 1) else byteArrayOf(0, 0, 1)) +
            byteArrayOf((type shl 1).toByte(), 1, payload)
}
