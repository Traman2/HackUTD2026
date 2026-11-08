package com.hackutd.realestate.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

/** App-facing data access. Screens talk to this, never to SpacetimeClient directly. */
class Repository(
    private val client: SpacetimeClient,
    private val session: SessionStore,
) {
    private val tokenMutex = Mutex()

    private val _profile = MutableStateFlow<Profile?>(null)

    /** The signed-in user, or null when signed out. */
    val profile: StateFlow<Profile?> = _profile.asStateFlow()

    /** Voice procedures return a JSON string encoded by the database HTTP API. */
    suspend fun voiceCall(name: String, args: JSONArray): JSONObject {
        val body = client.callProcedure(ensureToken(), name, args)
        val decoded = JSONTokener(body).nextValue()
        return if (decoded is String) JSONObject(decoded) else decoded as JSONObject
    }

    suspend fun pauseVoice(sessionId: String, ended: Boolean = false) {
        client.callReducer(ensureToken(), "set_resolution_session_status",
            JSONArray().put(sessionId).put(if (ended) "ended" else "paused"))
    }

    /** The saved identity token, or a new one from the backend (saved for next time). */
    suspend fun ensureToken(): String = tokenMutex.withLock {
        session.token() ?: client.createIdentity().also { session.save(it) }
    }

    /** The signed-in user, or null when this device has no session. */
    suspend fun currentProfile(): Profile? {
        val rows = client.sql(ensureToken(), "SELECT username, display_name FROM my_profile")
        val profile = if (rows.length() == 0) null else rows.getJSONArray(0).let {
            Profile(username = it.getString(0), displayName = it.getString(1))
        }
        _profile.value = profile
        return profile
    }

    /** Signs in an existing account (accounts are created on the web). */
    suspend fun login(username: String, password: String): Profile {
        client.callReducer(
            ensureToken(), "login",
            JSONArray().put(username.trim().lowercase()).put(password),
        )
        return currentProfile()
            ?: throw SpacetimeException("Signed in, but no profile was found. Try again.", 200)
    }

    /**
     * Signs out. Keeps the identity token so the device keeps the same identity.
     * Throws if the server can't be reached, so the user stays signed in rather than
     * seeing the login screen while the backend still has a session.
     */
    suspend fun logout() {
        client.callReducer(ensureToken(), "logout", JSONArray())
        _profile.value = null
    }

    /** The user's spaces with open-ticket counts: newest first, archived last. */
    suspend fun spaces(): List<Space> {
        val token = ensureToken()
        val spaceRows = client.sql(
            token, "SELECT id, name, description, archived, updated_at FROM my_spaces",
        )
        val ticketRows = client.sql(token, "SELECT space_id, status FROM my_tickets")

        val openBySpace = mutableMapOf<Long, Int>()
        for (i in 0 until ticketRows.length()) {
            val row = ticketRows.getJSONArray(i)
            if (row.getString(1) in ACTIVE_TICKET_STATUSES) {
                openBySpace.merge(row.getLong(0), 1, Int::plus)
            }
        }

        return (0 until spaceRows.length())
            .map { i ->
                val row = spaceRows.getJSONArray(i)
                val id = row.getLong(0)
                Space(
                    id = id,
                    name = row.getString(1),
                    description = row.getString(2),
                    archived = row.getBoolean(3),
                    updatedAtMicros = row.timestampMicros(4),
                    openTickets = openBySpace[id] ?: 0,
                )
            }
            .sortedWith(compareBy<Space> { it.archived }.thenByDescending { it.updatedAtMicros })
    }

    /** A space's tickets: active first, then by priority, then newest. */
    suspend fun tickets(spaceId: Long): List<Ticket> =
        queryTickets("WHERE space_id = $spaceId").sortedWith(TICKET_ORDER)

    /** One ticket, or null if it no longer exists. */
    suspend fun ticket(ticketId: Long): Ticket? = queryTickets("WHERE id = $ticketId").firstOrNull()

    /** Photos attached to a ticket (metadata only; the images are in S3). */
    suspend fun ticketPhotos(ticketId: Long): List<TicketPhoto> {
        val rows = client.sql(
            ensureToken(),
            "SELECT id, step_order, status FROM my_ticket_photos WHERE ticket_id = $ticketId",
        )
        return (0 until rows.length()).map { i ->
            val row = rows.getJSONArray(i)
            TicketPhoto(id = row.getLong(0), stepOrder = row.getInt(1), status = row.getString(2))
        }
    }

    /** Marks a step done / failed / skipped, or "pending" to clear it. Note: up to 500 chars. */
    suspend fun updateStep(ticketId: Long, stepOrder: Int, status: String, note: String) {
        client.callReducer(
            ensureToken(), "update_ticket_step",
            JSONArray().put(ticketId).put(stepOrder).put(status).put(note.take(500)),
        )
    }

    /** Moves a ticket to another status (the backend enforces allowed transitions). */
    suspend fun setTicketStatus(ticketId: Long, status: String, note: String = "") {
        client.callReducer(
            ensureToken(), "set_ticket_status",
            JSONArray().put(ticketId).put(status).put(note),
        )
    }

    /**
     * Attaches a photo to a step (or the ticket when [stepOrder] is 0):
     * 1. ask the backend for a signed S3 upload URL,
     * 2. PUT the bytes straight to S3,
     * 3. confirm, so the backend verifies the object and records it in ticket_photos.
     */
    suspend fun uploadTicketPhoto(
        ticketId: Long,
        stepOrder: Int,
        photo: PreparedPhoto,
        source: String = "phone",
        caption: String = "",
    ): Long {
        val token = ensureToken()
        val response = client.callProcedure(
            token, "request_ticket_photo_upload",
            JSONArray()
                .put(ticketId).put(stepOrder).put(photo.contentType).put(photo.bytes.size)
                .put(photo.sha256Base64).put(caption.take(300)).put(source),
        )
        val (photoId, url) = parseUploadTicket(response)
        client.putSignedUpload(url, photo)
        val confirmed = client.callProcedure(token, "confirm_ticket_photo_upload", JSONArray().put(photoId))
        if (confirmed.trim() == "false") {
            throw SpacetimeException("The photo couldn't be verified. Try again.", 200)
        }
        return photoId
    }

    private suspend fun queryTickets(where: String): List<Ticket> {
        val rows = client.sql(
            ensureToken(),
            "SELECT id, title, kind, priority, status, asset_label, equipment_code, " +
                "summary, safety_notes, steps, updated_at FROM my_tickets $where",
        )
        return (0 until rows.length()).map { parseTicket(rows.getJSONArray(it)) }
    }

    /** Clears local sign-in state after the backend reports the session is gone. */
    fun onSessionExpired() {
        _profile.value = null
    }

    private companion object {
        val ACTIVE_TICKET_STATUSES = setOf("open", "in_progress")

        private fun statusRank(status: String) = when (status) {
            "in_progress" -> 0
            "open" -> 1
            else -> 2
        }

        private fun priorityRank(priority: String) = when (priority) {
            "critical" -> 0
            "high" -> 1
            "elevated" -> 2
            else -> 3
        }

        val TICKET_ORDER = compareBy<Ticket>({ statusRank(it.status) }, { priorityRank(it.priority) })
            .thenByDescending { it.updatedAtMicros }
    }
}

/** Row: [id, title, kind, priority, status, asset_label, equipment_code, summary, safety_notes, steps, updated_at] */
private fun parseTicket(row: JSONArray): Ticket {
    val steps = row.getJSONArray(9)
    return Ticket(
        id = row.getLong(0),
        title = row.getString(1),
        kind = row.getString(2),
        priority = row.getString(3),
        status = row.getString(4),
        assetLabel = row.getString(5),
        equipmentCode = row.getString(6),
        summary = row.getString(7),
        safetyNotes = row.getString(8),
        steps = (0 until steps.length()).map { parseStep(steps.getJSONArray(it)) }.sortedBy { it.order },
        updatedAtMicros = row.timestampMicros(10),
    )
}

/** Step: [order, instruction, kind, expected_result, requires_photo, status, result?, completed_at?] */
private fun parseStep(a: JSONArray) = TicketStep(
    order = a.getInt(0),
    instruction = a.getString(1),
    kind = a.getString(2),
    expectedResult = a.getString(3),
    requiresPhoto = a.getBoolean(4),
    status = a.getString(5),
    result = a.optionString(6),
    completedAtMicros = a.optionTimestampMicros(7),
)

/**
 * request_ticket_photo_upload returns { photoId, url, expiresAt, contentType, checksumSha256 }.
 * Accepts it as a JSON object (by field name) or a positional array, whichever the server sends.
 */
private fun parseUploadTicket(body: String): Pair<Long, String> =
    when (val value = JSONTokener(body).nextValue()) {
        is JSONObject -> {
            val id = if (value.has("photoId")) value.getLong("photoId") else value.getLong("photo_id")
            id to value.getString("url")
        }
        is JSONArray -> value.getLong(0) to value.getString(1)
        else -> throw SpacetimeException("Unexpected reply when starting the photo upload.", 200)
    }
