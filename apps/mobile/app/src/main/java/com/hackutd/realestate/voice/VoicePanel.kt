package com.hackutd.realestate.voice

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.hackutd.realestate.ui.AppButton
import com.hackutd.realestate.ui.ButtonVariant
import com.hackutd.realestate.ui.resolution.GlassBorder

@Composable
fun VoicePanel(ticketId: Long, state: VoiceUiState, voice: VoiceViewModel) {
    val context = LocalContext.current
    var attempted by rememberSaveable(ticketId) { mutableStateOf(false) }
    var permissionDenied by remember { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { allowed ->
        permissionDenied = !allowed
        if (allowed) voice.start(ticketId)
    }
    fun start() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) voice.start(ticketId)
        else permission.launch(Manifest.permission.RECORD_AUDIO)
    }
    LaunchedEffect(ticketId) {
        if (!attempted && state.phase == "idle") { attempted = true; start() }
    }
    val running = state.connected || state.phase == "connecting"
    Surface(color = Color.Black.copy(alpha = 0.65f), contentColor = Color.White, shape = RoundedCornerShape(16.dp), border = GlassBorder) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("AI resolution agent", style = MaterialTheme.typography.titleSmall)
                    Text(if (state.halted) "Inspection halted" else when (state.phase) {
                        "connecting" -> "Connecting…"
                        "listening" -> "Listening · speak naturally"
                        "thinking" -> "Thinking…"
                        "speaking" -> "Speaking…"
                        "capturing" -> "Saving glasses photo…"
                        "ready" -> "Ready to listen"
                        else -> "Stopped"
                    }, color = Color(0xFF91E3B2), style = MaterialTheme.typography.labelSmall)
                }
                AppButton(
                    if (running) "Stop" else "Start agent",
                    onClick = { if (running) voice.stop() else start() },
                    variant = if (running) ButtonVariant.Secondary else ButtonVariant.Primary,
                )
            }
            if (state.reply.isNotBlank()) Text(state.reply, maxLines = 4, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
            if (state.transcript.isNotBlank()) Text("You: ${state.transcript}", color = Color.White.copy(alpha = 0.7f), maxLines = 2,
                overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
            if (running) Text("Pause when you're finished. Clear answers save automatically. Say ‘take a photo’ for evidence.",
                color = Color.White.copy(alpha = 0.6f), style = MaterialTheme.typography.labelSmall)
            state.error?.let { Text(it, color = Color(0xFFFFD69A), style = MaterialTheme.typography.bodySmall, maxLines = 3) }
            if (permissionDenied) Text("Allow microphone access in Android settings, then start the agent.",
                color = Color(0xFFFFD69A), style = MaterialTheme.typography.bodySmall)
        }
    }
}
