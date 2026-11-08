package com.hackutd.realestate.ui

import android.text.format.DateUtils
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.hackutd.realestate.ui.theme.AppTheme

/** Full-screen message with one button, e.g. a load error with Retry. */
@Composable
fun MessageWithAction(message: String, action: String, onAction: () -> Unit) {
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(message, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyLarge, color = AppTheme.colors.muted)
            AppButton(action, onClick = onAction, variant = ButtonVariant.Secondary)
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

fun priorityTone(priority: String): BadgeTone = when (priority) {
    "critical" -> BadgeTone.Red
    "high" -> BadgeTone.Amber
    else -> BadgeTone.Gray
}

@Composable
fun priorityColor(priority: String): Color = when (priority) {
    "critical" -> AppTheme.colors.red
    "high" -> AppTheme.colors.amber
    else -> AppTheme.colors.muted
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
    val tone = when (status) {
        "in_progress" -> BadgeTone.Blue
        "resolved", "closed" -> BadgeTone.Green
        else -> BadgeTone.Gray
    }
    Badge(statusLabel(status), tone = tone, dot = true)
}

@Composable
fun PriorityChip(priority: String) {
    Badge(priorityLabel(priority), tone = priorityTone(priority))
}
