package com.hackutd.realestate.glasses

/** Parses Annex B access units; glasses can send parameter sets together or separately. */
internal object HevcAnnexB {
    data class Nal(val type: Int, val bytes: ByteArray)

    fun parse(bytes: ByteArray): List<Nal> {
        val starts = mutableListOf<Pair<Int, Int>>()
        var index = 0
        while (index + 2 < bytes.size) {
            val prefix = when {
                bytes[index] != 0.toByte() || bytes[index + 1] != 0.toByte() -> 0
                bytes[index + 2] == 1.toByte() -> 3
                index + 3 < bytes.size && bytes[index + 2] == 0.toByte() && bytes[index + 3] == 1.toByte() -> 4
                else -> 0
            }
            if (prefix > 0) {
                starts += index to prefix
                index += prefix
            } else index++
        }
        return starts.mapIndexedNotNull { position, (start, prefix) ->
            val end = starts.getOrNull(position + 1)?.first ?: bytes.size
            if (start + prefix + 1 >= end) null
            else Nal((bytes[start + prefix].toInt() and 0x7e) shr 1, bytes.copyOfRange(start, end))
        }
    }

    fun isKeyFrame(units: List<Nal>) = units.any { it.type in 16..23 }
    fun hasPicture(units: List<Nal>) = units.any { it.type in 0..31 }
}

internal class HevcParameterSets {
    private val parameters = mutableMapOf<Int, ByteArray>()

    fun offer(units: List<HevcAnnexB.Nal>) {
        units.filter { it.type in 32..34 }.forEach { parameters[it.type] = it.bytes }
    }

    fun complete(): ByteArray? {
        val parts = (32..34).map { parameters[it] ?: return null }
        val result = ByteArray(parts.sumOf { it.size })
        var offset = 0
        parts.forEach { it.copyInto(result, offset); offset += it.size }
        return result
    }

    fun clear() = parameters.clear()
}
