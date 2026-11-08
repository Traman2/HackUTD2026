package com.hackutd.realestate.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/** An error from the backend, with a message that is safe to show to the user. */
class SpacetimeException(message: String, val httpStatus: Int) : Exception(message)

/**
 * The only class that talks HTTP. Uses SpacetimeDB's HTTP API (there is no Kotlin SDK).
 * Never logs the token.
 */
class SpacetimeClient(
    private val host: String,
    private val db: String,
    private val http: OkHttpClient = defaultHttpClient(),
) {
    private val base get() = "$host/v1/database/$db"

    private val s3Http: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .build()
    }

    /** POST /v1/identity → a new identity token. */
    suspend fun createIdentity(): String {
        val body = execute(Request.Builder().url("$host/v1/identity").post(EMPTY_BODY).build())
        return JSONObject(body).getString("token")
    }

    /** Calls a reducer. Succeeds with HTTP 200 and an empty body, otherwise throws. */
    suspend fun callReducer(token: String, name: String, args: JSONArray) {
        call(token, name, args)
    }

    /** Calls a procedure and returns its JSON-encoded return value. */
    suspend fun callProcedure(token: String, name: String, args: JSONArray): String =
        call(token, name, args)

    /**
     * Uploads bytes to a signed S3 PUT URL from request_ticket_photo_upload. The headers must
     * match what was signed, so this uses a plain client without the ngrok header.
     */
    suspend fun putSignedUpload(url: String, photo: PreparedPhoto) {
        val request = Request.Builder()
            .url(url)
            .header("x-amz-checksum-sha256", photo.sha256Base64)
            // A ByteArray body sends Content-Type exactly as given and sets Content-Length.
            .put(photo.bytes.toRequestBody(photo.contentType.toMediaType()))
            .build()
        withContext(Dispatchers.IO) {
            try {
                s3Http.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        throw SpacetimeException(
                            "Photo upload to storage failed (HTTP ${response.code}). Try again.",
                            response.code,
                        )
                    }
                }
            } catch (e: IOException) {
                throw SpacetimeException("Couldn't upload the photo. Check your connection.", 0)
            }
        }
    }

    private suspend fun call(token: String, name: String, args: JSONArray): String = execute(
        Request.Builder()
            .url("$base/call/$name")
            .header("Authorization", "Bearer $token")
            // Bytes, not a String: OkHttp would add "; charset=utf-8" to a String body,
            // and SpacetimeDB rejects anything but exactly "application/json" (HTTP 415).
            .post(args.toString().toByteArray(Charsets.UTF_8).toRequestBody(JSON))
            .build()
    )

    /** Runs one SQL statement and returns its rows (each row is a positional JSONArray). */
    suspend fun sql(token: String, query: String): JSONArray {
        val body = execute(
            Request.Builder()
                .url("$base/sql")
                .header("Authorization", "Bearer $token")
                .post(query.toRequestBody(TEXT))
                .build()
        )
        return JSONArray(body).getJSONObject(0).getJSONArray("rows")
    }

    private suspend fun execute(request: Request): String = withContext(Dispatchers.IO) {
        try {
            http.newCall(request).execute().use { response -> readOrThrow(response) }
        } catch (e: SpacetimeException) {
            throw e
        } catch (e: IOException) {
            throw SpacetimeException(UNREACHABLE, 0)
        }
    }

    private fun readOrThrow(response: Response): String {
        val text = response.body.string()
        if (response.isSuccessful) return text
        if (response.code == 404 && text.contains("ERR_NGROK")) {
            throw SpacetimeException(UNREACHABLE, response.code)
        }
        val message = text.removePrefix(FATAL_PREFIX).trim()
            .ifEmpty { "Server error (HTTP ${response.code})." }
        throw SpacetimeException(message, response.code)
    }

    companion object {
        const val UNREACHABLE =
            "Can't reach the server. Check your connection and that the PC tunnel is running."
        private const val FATAL_PREFIX = "The module instance encountered a fatal error: "
        private val JSON = "application/json".toMediaType()
        private val TEXT = "text/plain".toMediaType()
        private val EMPTY_BODY = ByteArray(0).toRequestBody(null)

        fun defaultHttpClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            // Free ngrok shows a warning page to browser-like requests; this skips it.
            .addInterceptor { chain ->
                chain.proceed(
                    chain.request().newBuilder().header("ngrok-skip-browser-warning", "true").build()
                )
            }
            .build()
    }
}

// Row value helpers. Options are [0, value] when present and [1, []] when empty.
// Timestamps are one-element arrays of microseconds since epoch.

fun JSONArray.optionString(i: Int): String? =
    getJSONArray(i).let { if (it.getInt(0) == 0) it.getString(1) else null }

fun JSONArray.timestampMicros(i: Int): Long = getJSONArray(i).getLong(0)

fun JSONArray.optionTimestampMicros(i: Int): Long? =
    getJSONArray(i).let { if (it.getInt(0) == 0) it.getJSONArray(1).getLong(0) else null }
