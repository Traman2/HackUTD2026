package com.hackutd.realestate.voice

import com.hackutd.realestate.BuildConfig
import okhttp3.*
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class VoiceSessionClient {
    private val http = OkHttpClient.Builder().pingInterval(20, TimeUnit.SECONDS).readTimeout(0, TimeUnit.SECONDS).build()
    private var socket: WebSocket? = null
    fun connect(ticket: JSONObject, receive: (JSONObject) -> Unit, closed: (String) -> Unit) {
        close()
        val host = BuildConfig.SPACETIME_HOST.trimEnd('/')
        val url = host.replaceFirst("https://", "wss://").replaceFirst("http://", "ws://") + "/agent/voice"
        socket = http.newWebSocket(Request.Builder().url(url).header("ngrok-skip-browser-warning", "true").build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) { webSocket.send(JSONObject().put("type", "authenticate").put("ticket", ticket).toString()) }
            override fun onMessage(webSocket: WebSocket, text: String) {
                try { receive(JSONObject(text)) } catch (_: Exception) { closed("Invalid voice server response.") }
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { closed("Voice connection lost. Reconnect to resume.") }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { closed(reason.ifBlank { "Voice disconnected." }) }
        })
    }
    fun send(value: JSONObject): Boolean = socket?.send(value.toString()) == true
    fun audio(bytes: ByteArray): Boolean {
        val connection = socket ?: return false
        return connection.queueSize() < 256000 && connection.send(bytes.toByteString())
    }
    fun close() { socket?.cancel(); socket = null }
}
