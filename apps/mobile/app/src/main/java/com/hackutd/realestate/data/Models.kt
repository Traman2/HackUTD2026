package com.hackutd.realestate.data

/** The signed-in user, from the my_profile view. */
data class Profile(val username: String, val displayName: String)

/** A property space, from the my_spaces view. */
data class Space(
    val id: Long,
    val name: String,
    val description: String,
    val archived: Boolean,
    val updatedAtMicros: Long,
    /** Tickets in this space that are open or in progress. */
    val openTickets: Int = 0,
)

/** A troubleshooting ticket, from the my_tickets view. */
data class Ticket(
    val id: Long,
    val title: String,
    /** resolve | discovery */
    val kind: String,
    /** critical | high | elevated */
    val priority: String,
    /** open | in_progress | resolved | closed | cancelled */
    val status: String,
    val assetLabel: String,
    val equipmentCode: String,
    val summary: String,
    val safetyNotes: String,
    val steps: List<TicketStep>,
    val updatedAtMicros: Long,
) {
    /** Steps can be changed only while the ticket is open or in progress. */
    val isActive: Boolean get() = status == "open" || status == "in_progress"
    val completedSteps: Int get() = steps.count { it.status != "pending" }
    /** The first pending step, or null when every step is marked. */
    val currentStep: TicketStep? get() = steps.firstOrNull { it.status == "pending" }
    val canResolve: Boolean get() = isActive && steps.none { it.status == "pending" }
}

data class TicketStep(
    val order: Int,
    val instruction: String,
    /** observe | measure | verify | photo | record | escalate */
    val kind: String,
    val expectedResult: String,
    val requiresPhoto: Boolean,
    /** pending | done | failed | skipped */
    val status: String,
    val result: String?,
    val completedAtMicros: Long?,
)

/** A photo attached to a ticket (bytes live in S3), from the my_ticket_photos view. */
data class TicketPhoto(
    val id: Long,
    /** 0 = the ticket itself, 1..n = a step. */
    val stepOrder: Int,
    /** requested | verified | failed */
    val status: String,
)

/** A photo ready to upload: JPEG bytes plus the base64 SHA-256 S3 checks them against. */
class PreparedPhoto(val bytes: ByteArray, val contentType: String, val sha256Base64: String)
