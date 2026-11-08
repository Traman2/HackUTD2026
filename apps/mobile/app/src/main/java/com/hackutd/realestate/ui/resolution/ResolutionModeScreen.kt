package com.hackutd.realestate.ui.resolution

import android.app.Application
import android.content.pm.ActivityInfo
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TriStateCheckbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hackutd.realestate.MainActivity
import com.hackutd.realestate.RealEstateApp
import com.hackutd.realestate.data.Ticket
import com.hackutd.realestate.data.TicketStep
import com.hackutd.realestate.glasses.GlassesConnection
import com.hackutd.realestate.ui.AppButton
import com.hackutd.realestate.ui.ButtonVariant
import com.hackutd.realestate.ui.GlassesIcon
import androidx.compose.foundation.BorderStroke
import com.hackutd.realestate.ui.tickets.PhotoBadge
import com.hackutd.realestate.ui.tickets.TicketDetailUiState
import com.hackutd.realestate.ui.tickets.TicketDetailViewModel
import com.meta.wearable.dat.camera.types.StreamState
import com.meta.wearable.dat.core.types.RegistrationState
import kotlinx.coroutines.launch
import com.hackutd.realestate.voice.VoiceViewModel
import com.hackutd.realestate.voice.VoicePanel

class ResolutionViewModel(app: Application) : AndroidViewModel(app) {
    val glasses = (app as RealEstateApp).glasses
    override fun onCleared() { glasses.disconnect() }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResolutionModeScreen(
    activity: MainActivity,
    ticketViewModel: TicketDetailViewModel,
    onBack: () -> Unit,
    viewModel: ResolutionViewModel = viewModel(),
    voice: VoiceViewModel = viewModel(),
) {
    val glasses = viewModel.glasses
    val connection by glasses.connection.collectAsStateWithLifecycle()
    val registration by glasses.registration.collectAsStateWithLifecycle()
    val preview by glasses.video.state.collectAsStateWithLifecycle()
    val ticketState by ticketViewModel.state.collectAsStateWithLifecycle()
    val voiceState by voice.state.collectAsStateWithLifecycle()
    LaunchedEffect(voiceState.ticketChange) { if (voiceState.ticketChange > 0) ticketViewModel.load() }
    DisposableEffect(voice) { onDispose { voice.stop() } }
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val view = LocalView.current
    var opened by rememberSaveable { mutableStateOf(false) }
    var resumeConnection by rememberSaveable { mutableStateOf(false) }
    var registrationRequested by rememberSaveable { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var settingsOpen by rememberSaveable { mutableStateOf(false) }

    fun connect() {
        if (busy) return
        busy = true
        // This job survives visits to Meta AI and only retains the current Activity in the UI.
        scope.launch {
            try {
                if (glasses.prepare(activity)) {
                    if (glasses.registration.value == RegistrationState.REGISTERED) {
                        glasses.connect(activity)
                    } else {
                        registrationRequested = true
                        glasses.register(activity)
                    }
                }
            } finally { busy = false }
        }
    }

    DisposableEffect(view, activity) {
        val previousKeepOn = view.keepScreenOn
        val previousOrientation = activity.requestedOrientation
        view.keepScreenOn = true
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        onDispose {
            view.keepScreenOn = previousKeepOn
            activity.requestedOrientation = previousOrientation
        }
    }
    LaunchedEffect(activity) {
        if (!opened) {
            opened = true
            connect()
        }
    }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) {
        if (!activity.isChangingConfigurations) {
            voice.stop()
            resumeConnection = glasses.session.value != null
            glasses.disconnect()
        }
    }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        ticketViewModel.load()
        if (resumeConnection) {
            resumeConnection = false
            connect()
        }
    }
    LaunchedEffect(registration, lifecycleState, busy) {
        if (registrationRequested && registration == RegistrationState.REGISTERED &&
            lifecycleState == Lifecycle.State.RESUMED && !busy
        ) {
            registrationRequested = false
            connect()
        }
    }
    LaunchedEffect(ticketState.message) {
        ticketState.message?.let {
            snackbar.showSnackbar(it)
            ticketViewModel.messageShown()
        }
    }

    val paused = connection == GlassesConnection.Paused || preview.stream == StreamState.PAUSED
    val live = connection == GlassesConnection.Connected && preview.stream == StreamState.STREAMING &&
        preview.firstFrameRendered && preview.error == null
    val waiting = busy || connection == GlassesConnection.Connecting || registration == RegistrationState.REGISTERING ||
        (connection == GlassesConnection.Connected && preview.error == null &&
            preview.stream !in setOf(StreamState.STOPPED, StreamState.CLOSED) && !paused)
    val connectionMessage = when {
        preview.error != null -> preview.error!!
        paused -> "Paused by glasses"
        live -> "Live glasses video"
        else -> when (val state = connection) {
            GlassesConnection.NeedsBluetooth -> "Allow Nearby devices to connect your glasses"
            GlassesConnection.NeedsRegistration -> "Connect your glasses through Meta AI"
            GlassesConnection.NeedsPermission -> "Allow camera access in Meta AI"
            GlassesConnection.Connecting -> "Connecting to glasses…"
            GlassesConnection.Connected -> if (waiting) "Waiting for glasses video…" else "Glasses camera stopped"
            GlassesConnection.Stopped -> "Glasses disconnected"
            is GlassesConnection.Error -> state.message
            else -> "Connect your glasses"
        }
    }
    val reconnect = {
        glasses.disconnect()
        connect()
    }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        GlassesVideo(glasses.video, preview.width, preview.height, Modifier.fillMaxSize())
        Surface(
            modifier = Modifier.align(Alignment.TopCenter).fillMaxWidth(),
            color = Color.Black.copy(alpha = 0.48f), contentColor = Color.White,
        ) {
            Row(
                Modifier.statusBarsPadding().padding(end = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Exit Resolution Mode") }
                Text(
                    ticketState.ticket?.assetLabel?.ifBlank { null } ?: "Resolution Mode",
                    Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    if (live) "● LIVE" else if (paused) "PAUSED" else "OFFLINE",
                    color = if (live) Color(0xFF91E3B2) else Color.White,
                    style = MaterialTheme.typography.labelSmall,
                )
                IconButton(onClick = { settingsOpen = true }) { Icon(GlassesIcon, "Glasses connection settings") }
            }
        }
        if (!live) {
            Box(
                Modifier.fillMaxWidth().fillMaxHeight(0.5f).statusBarsPadding().padding(top = 56.dp, start = 24.dp, end = 24.dp),
                contentAlignment = Alignment.Center,
            ) {
                ConnectionPanel(
                    connectionMessage, waiting, paused,
                    if (registration != RegistrationState.REGISTERED) "Connect glasses"
                    else if (connection == GlassesConnection.NeedsPermission) "Allow camera access" else "Reconnect",
                    onConnect = reconnect,
                )
            }
        }
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().fillMaxHeight(0.72f)
            .navigationBarsPadding().padding(horizontal = 10.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        ticketState.ticket?.let { VoicePanel(it.id, voiceState, voice) }
        ChecklistOverlay(
            state = ticketState,
            onToggle = { step ->
                ticketViewModel.updateStep(step.order, if (step.status == "done") "pending" else "done", step.result.orEmpty())
            },
            onRetry = { ticketViewModel.load(userInitiated = true) },
            modifier = Modifier.fillMaxWidth().weight(1f),
        )
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.Center).padding(16.dp))
    }
    if (settingsOpen) {
        ModalBottomSheet(onDismissRequest = { settingsOpen = false }) {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Glasses", style = MaterialTheme.typography.titleLarge)
                Text(connectionMessage, Modifier.padding(vertical = 12.dp), textAlign = TextAlign.Center)
                AppButton("Reconnect", onClick = { reconnect(); settingsOpen = false }, enabled = !busy, variant = ButtonVariant.Secondary, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
private fun ConnectionPanel(message: String, waiting: Boolean, paused: Boolean, action: String, onConnect: () -> Unit) {
    Surface(color = Color.Black.copy(alpha = 0.7f), contentColor = Color.White, shape = RoundedCornerShape(16.dp), border = GlassBorder) {
        Column(
            Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (waiting && !paused) CircularProgressIndicator(Modifier.size(28.dp), color = Color.White)
            Text(message, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
            if (!waiting && !paused) AppButton(action, onClick = onConnect, icon = GlassesIcon)
        }
    }
}

@Composable
private fun ChecklistOverlay(
    state: TicketDetailUiState,
    onToggle: (TicketStep) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val ticket = state.ticket
    val listState = rememberLazyListState()
    var safetyExpanded by rememberSaveable(ticket?.id) { mutableStateOf(false) }
    val current = ticket?.currentStep?.order
    LaunchedEffect(current) {
        ticket?.steps?.indexOfFirst { it.order == current }?.takeIf { it >= 0 }?.let { listState.animateScrollToItem(it) }
    }
    Surface(
        modifier, shape = RoundedCornerShape(16.dp), border = GlassBorder,
        color = Color.Black.copy(alpha = 0.65f), contentColor = Color.White,
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (ticket == null) {
                Text(state.loadError ?: "Loading checklist…", style = MaterialTheme.typography.bodyMedium)
                if (state.loadError != null) TextButton(onClick = onRetry) { Text("Retry", color = Color.White) }
                else CircularProgressIndicator(Modifier.size(24.dp), color = Color.White)
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        ticket.title, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall,
                        maxLines = 2, overflow = TextOverflow.Ellipsis,
                    )
                    Text("${ticket.completedSteps}/${ticket.steps.size}", Modifier.padding(start = 12.dp), style = MaterialTheme.typography.labelMedium)
                }
                if (ticket.safetyNotes.isNotBlank()) {
                    Surface(
                        color = Color.White.copy(alpha = 0.08f),
                        contentColor = Color(0xFFFFD69A),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth().clickable { safetyExpanded = true },
                    ) {
                        Row(Modifier.padding(8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.Warning, null, Modifier.size(18.dp))
                            Column {
                                Text("Safety · Tap to read", style = MaterialTheme.typography.labelSmall)
                                Text(
                                    ticket.safetyNotes, style = MaterialTheme.typography.bodySmall,
                                    maxLines = 2, overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
                LazyColumn(state = listState, modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    itemsIndexed(ticket.steps, key = { _, step -> step.order }) { _, step ->
                        ChecklistStep(step, ticket, state, step.order == current, onToggle)
                    }
                }
                if (current == null) Text("All steps complete", style = MaterialTheme.typography.labelMedium)
            }
        }
    }
    if (safetyExpanded && ticket != null) {
        AlertDialog(
            onDismissRequest = { safetyExpanded = false },
            title = { Text("Safety notes") },
            text = { Text(ticket.safetyNotes, Modifier.verticalScroll(rememberScrollState())) },
            confirmButton = { TextButton(onClick = { safetyExpanded = false }) { Text("Close") } },
        )
    }
}

@Composable
private fun ChecklistStep(step: TicketStep, ticket: Ticket, state: TicketDetailUiState, current: Boolean, onToggle: (TicketStep) -> Unit) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = if (current) Color.White.copy(alpha = 0.12f) else Color.Transparent,
        contentColor = Color.White,
    ) {
        Row(Modifier.fillMaxWidth().padding(end = 8.dp), verticalAlignment = Alignment.Top) {
            if (state.savingStep == step.order) {
                Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(22.dp), color = Color.White, strokeWidth = 2.dp) }
            } else {
                TriStateCheckbox(
                    state = when (step.status) {
                        "done" -> ToggleableState.On
                        "pending" -> ToggleableState.Off
                        else -> ToggleableState.Indeterminate
                    },
                    onClick = { onToggle(step) },
                    enabled = ticket.isActive && state.savingStep == null && !state.savingStatus,
                    colors = CheckboxDefaults.colors(
                        checkedColor = Color(0xFF91E3B2),
                        uncheckedColor = Color.White.copy(alpha = 0.8f),
                        checkmarkColor = Color.Black,
                        disabledCheckedColor = Color(0xFF91E3B2).copy(alpha = 0.5f),
                        disabledUncheckedColor = Color.White.copy(alpha = 0.35f),
                        disabledIndeterminateColor = Color.White.copy(alpha = 0.35f),
                    ),
                    modifier = Modifier.semantics { contentDescription = "Step ${step.order}: ${step.status}" },
                )
            }
            Column(Modifier.weight(1f).padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("${step.order}. ${step.instruction}", style = MaterialTheme.typography.bodyMedium, fontWeight = if (current) FontWeight.SemiBold else FontWeight.Normal)
                if (current && step.expectedResult.isNotBlank()) Text("Expected: ${step.expectedResult}", style = MaterialTheme.typography.bodySmall)
                if (step.status == "failed" || step.status == "skipped") Text(step.status.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelSmall)
                if (step.requiresPhoto || state.photoCount(step.order) > 0) PhotoBadge(state.photoCount(step.order))
            }
        }
    }
}

/** Hairline border for the dark glass panels over the video. */
internal val GlassBorder = BorderStroke(1.dp, Color.White.copy(alpha = 0.12f))
