package com.hackutd.realestate.ui

import android.text.format.DateUtils
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/** Small rounded label. */
@Composable
fun Chip(text: String, container: Color, content: Color, modifier: Modifier = Modifier) {
    Surface(color = container, contentColor = content, shape = MaterialTheme.shapes.small, modifier = modifier) {
        Text(
            text,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

/** Full-screen message with one button, e.g. a load error with Retry. */
@Composable
fun MessageWithAction(message: String, action: String, onAction: () -> Unit) {
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(message, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyLarge)
            Button(onClick = onAction) { Text(action) }
        }
    }
}

/** "5 minutes ago", "Yesterday", etc. Timestamps from the backend are microseconds. */
fun relativeTime(micros: Long): String {
    val millis = micros / 1000
    val now = System.currentTimeMillis()
    if (now - millis < DateUtils.MINUTE_IN_MILLIS) return "just now"
    return DateUtils.getRelativeTimeSpanString(millis, now, DateUtils.MINUTE_IN_MILLIS).toString()
}

// Ticket labels and colors shared by the ticket screens.

object TicketColors {
    val Critical = Color(0xFFD32F2F)
    val High = Color(0xFFF57C00)
    val Elevated = Color(0xFFFFB300)
    val Done = Color(0xFF2E7D32)
    val Failed = Color(0xFFC62828)
}

fun priorityColor(priority: String): Color = when (priority) {
    "critical" -> TicketColors.Critical
    "high" -> TicketColors.High
    else -> TicketColors.Elevated
}

fun priorityLabel(priority: String): String = priority.replaceFirstChar { it.uppercase() }

fun statusLabel(status: String): String = when (status) {
    "open" -> "Open"
    "in_progress" -> "In progress"
    "resolved" -> "Resolved"
    "closed" -> "Closed"
    "cancelled" -> "Cancelled"
    else -> status
}

fun kindLabel(kind: String): String = when (kind) {
    "resolve" -> "Resolve"
    "discovery" -> "Discovery"
    else -> kind.replaceFirstChar { it.uppercase() }
}

@Composable
fun StatusChip(status: String) {
    val scheme = MaterialTheme.colorScheme
    when (status) {
        "in_progress" -> Chip(statusLabel(status), scheme.tertiaryContainer, scheme.onTertiaryContainer)
        "open" -> Chip(statusLabel(status), scheme.primaryContainer, scheme.onPrimaryContainer)
        "resolved", "closed" -> Chip(statusLabel(status), TicketColors.Done.copy(alpha = 0.15f), TicketColors.Done)
        else -> Chip(statusLabel(status), scheme.surfaceVariant, scheme.onSurfaceVariant)
    }
}

@Composable
fun PriorityChip(priority: String) {
    val color = priorityColor(priority)
    Chip(priorityLabel(priority), color.copy(alpha = 0.15f), color)
}
