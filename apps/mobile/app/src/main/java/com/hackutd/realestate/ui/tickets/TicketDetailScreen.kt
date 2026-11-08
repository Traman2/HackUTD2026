package com.hackutd.realestate.ui.tickets

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hackutd.realestate.data.Ticket
import com.hackutd.realestate.data.TicketStep
import com.hackutd.realestate.ui.Chip
import com.hackutd.realestate.ui.GlassesIcon
import com.hackutd.realestate.ui.MessageWithAction
import com.hackutd.realestate.ui.PriorityChip
import com.hackutd.realestate.ui.StatusChip
import com.hackutd.realestate.ui.TicketColors
import com.hackutd.realestate.ui.appFactory
import com.hackutd.realestate.ui.kindLabel

/**
 * One ticket: safety notes, summary and the step checklist. Tapping a step opens a sheet to
 * mark it and attach photos. [onStartResolution] is null until Resolution Mode exists.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TicketDetailScreen(
    onBack: () -> Unit,
    onStartResolution: ((Ticket) -> Unit)?,
    viewModel: TicketDetailViewModel = viewModel(
        factory = appFactory { app, saved -> TicketDetailViewModel(app.repository, saved) },
    ),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }

    // Step whose sheet is open.
    var sheetStep by rememberSaveable { mutableStateOf<Int?>(null) }

    LifecycleResumeEffect(viewModel) {
        viewModel.load()
        onPauseOrDispose { }
    }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbar.showSnackbar(it)
            viewModel.messageShown()
        }
    }

    val ticket = state.ticket
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(ticket?.assetLabel?.ifBlank { null } ?: "Ticket") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        bottomBar = {
            if (ticket != null) {
                TicketActions(
                    ticket = ticket,
                    savingStatus = state.savingStatus,
                    onStartResolution = onStartResolution?.let { start -> { start(ticket) } },
                    onResolve = { viewModel.setStatus("resolved", "Ticket resolved.") },
                    onReopen = { status -> viewModel.setStatus(status, "Ticket reopened.") },
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        val loadError = state.loadError
        Box(Modifier.fillMaxSize().padding(padding)) {
            when {
                ticket == null && loadError != null ->
                    MessageWithAction(loadError, "Retry", onAction = { viewModel.load() })
                ticket == null ->
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                else -> PullToRefreshBox(
                    isRefreshing = state.refreshing,
                    onRefresh = { viewModel.load(userInitiated = true) },
                    modifier = Modifier.fillMaxSize(),
                ) {
                    TicketContent(
                        ticket = ticket,
                        state = state,
                        onStepClick = { sheetStep = it.order },
                    )
                }
            }
        }
    }

    val openStep = ticket?.steps?.firstOrNull { it.order == sheetStep }
    if (ticket != null && openStep != null) {
        StepSheet(
            step = openStep,
            ticketActive = ticket.isActive,
            photoCount = state.photoCount(openStep.order),
            onSetStatus = { status, note ->
                viewModel.updateStep(openStep.order, status, note)
                sheetStep = null
            },
            onDismiss = { sheetStep = null },
        )
    }
}

@Composable
private fun TicketContent(
    ticket: Ticket,
    state: TicketDetailUiState,
    onStepClick: (TicketStep) -> Unit,
) {
    val currentOrder = ticket.currentStep?.order
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(key = "header") {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    ticket.title,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PriorityChip(ticket.priority)
                    StatusChip(ticket.status)
                    Chip(
                        kindLabel(ticket.kind),
                        MaterialTheme.colorScheme.surfaceVariant,
                        MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (ticket.equipmentCode.isNotBlank() && ticket.equipmentCode != ticket.assetLabel) {
                    Text(
                        "Equipment: ${ticket.equipmentCode}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        if (ticket.safetyNotes.isNotBlank()) {
            item(key = "safety") { SafetyCard(ticket.safetyNotes) }
        }
        if (ticket.summary.isNotBlank()) {
            item(key = "summary") {
                Text(ticket.summary, style = MaterialTheme.typography.bodyMedium)
            }
        }
        item(key = "steps-header") {
            Text(
                "Steps · ${ticket.completedSteps} of ${ticket.steps.size} done",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
        items(ticket.steps, key = { "step-${it.order}" }) { step ->
            StepRow(
                step = step,
                isCurrent = ticket.isActive && step.order == currentOrder,
                saving = state.savingStep == step.order,
                photoCount = state.photoCount(step.order),
                onClick = { onStepClick(step) },
            )
        }
    }
}

@Composable
private fun SafetyCard(notes: String) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(Icons.Default.Warning, contentDescription = null)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Safety", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(notes, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun StepRow(
    step: TicketStep,
    isCurrent: Boolean,
    saving: Boolean,
    photoCount: Int,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (isCurrent) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
            else MaterialTheme.colorScheme.surfaceContainerLow,
        ),
        border = if (isCurrent) BorderStroke(1.5.dp, MaterialTheme.colorScheme.primary) else null,
    ) {
        Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StepMarker(step, saving)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    step.instruction,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = if (isCurrent) FontWeight.SemiBold else FontWeight.Normal,
                )
                if (step.expectedResult.isNotBlank()) {
                    Text(
                        "Expected: ${step.expectedResult}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                step.result?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        "Note: $it",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Medium,
                    )
                }
                if (step.requiresPhoto || photoCount > 0) {
                    PhotoBadge(
                        photoCount = photoCount,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
    }
}

/**
 * Glasses badge: "Photo needed" until a photo is taken through the glasses,
 * then the number of photos attached (green).
 */
@Composable
private fun PhotoBadge(photoCount: Int, modifier: Modifier = Modifier) {
    val attached = photoCount > 0
    val container = if (attached) TicketColors.Done.copy(alpha = 0.15f) else MaterialTheme.colorScheme.tertiaryContainer
    val content = if (attached) TicketColors.Done else MaterialTheme.colorScheme.onTertiaryContainer
    Surface(color = container, contentColor = content, shape = MaterialTheme.shapes.small, modifier = modifier) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(GlassesIcon, contentDescription = null, modifier = Modifier.size(16.dp))
            Text(
                when (photoCount) {
                    0 -> "Photo needed"
                    1 -> "1 photo"
                    else -> "$photoCount photos"
                },
                style = MaterialTheme.typography.labelMedium,
            )
        }
    }
}

/** Circle showing the step number (pending) or its result. */
@Composable
private fun StepMarker(step: TicketStep, saving: Boolean) {
    val size = Modifier.size(32.dp)
    if (saving) {
        Box(size, contentAlignment = Alignment.Center) {
            CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
        }
        return
    }
    val (background, content) = when (step.status) {
        "done" -> TicketColors.Done to Color.White
        "failed" -> TicketColors.Failed to Color.White
        "skipped" -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
        else -> Color.Transparent to MaterialTheme.colorScheme.primary
    }
    Box(
        modifier = size
            .background(background, CircleShape)
            .then(
                if (step.status == "pending") {
                    Modifier.border(1.5.dp, MaterialTheme.colorScheme.primary, CircleShape)
                } else Modifier
            ),
        contentAlignment = Alignment.Center,
    ) {
        when (step.status) {
            "done" -> Icon(Icons.Default.Check, "Done", tint = content, modifier = Modifier.size(18.dp))
            "failed" -> Icon(Icons.Default.Close, "Failed", tint = content, modifier = Modifier.size(18.dp))
            "skipped" -> Text("–", color = content, fontWeight = FontWeight.Bold)
            else -> Text("${step.order}", color = content, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun TicketActions(
    ticket: Ticket,
    savingStatus: Boolean,
    onStartResolution: (() -> Unit)?,
    onResolve: () -> Unit,
    onReopen: (status: String) -> Unit,
) {
    Surface(tonalElevation = 3.dp, shadowElevation = 8.dp) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            when {
                ticket.isActive -> {
                    Button(
                        onClick = { onStartResolution?.invoke() },
                        enabled = onStartResolution != null,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) { Text("Start Agent Resolution Mode") }
                    OutlinedButton(
                        onClick = onResolve,
                        enabled = ticket.canResolve && !savingStatus,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            when {
                                savingStatus -> "Saving…"
                                ticket.canResolve -> "Mark resolved"
                                else -> "Mark resolved (finish every step first)"
                            }
                        )
                    }
                }
                ticket.status == "resolved" -> OutlinedButton(
                    onClick = { onReopen("in_progress") },
                    enabled = !savingStatus,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (savingStatus) "Saving…" else "Reopen") }
                ticket.status == "cancelled" -> OutlinedButton(
                    onClick = { onReopen("open") },
                    enabled = !savingStatus,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (savingStatus) "Saving…" else "Reopen") }
                else -> Text(
                    "This ticket is closed.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** Sheet for one step: mark it done / failed / skipped, add a note, attach photos. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StepSheet(
    step: TicketStep,
    ticketActive: Boolean,
    photoCount: Int,
    onSetStatus: (status: String, note: String) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var note by rememberSaveable(step.order) { mutableStateOf(step.result.orEmpty()) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Step ${step.order}",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(step.instruction, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            if (step.expectedResult.isNotBlank()) {
                Text(
                    "Expected: ${step.expectedResult}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (!ticketActive) {
                Text(
                    "Reopen the ticket to change steps.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            OutlinedTextField(
                value = note,
                onValueChange = { if (it.length <= 500) note = it },
                label = { Text("Note (optional)") },
                placeholder = { Text("What did you see or measure?") },
                supportingText = { Text("${note.length} / 500") },
                enabled = ticketActive,
                minLines = 2,
                maxLines = 5,
                modifier = Modifier.fillMaxWidth(),
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = { onSetStatus("failed", note) },
                    enabled = ticketActive,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = TicketColors.Failed),
                    modifier = Modifier.weight(1f),
                ) { Text("Failed") }
                OutlinedButton(
                    onClick = { onSetStatus("skipped", note) },
                    enabled = ticketActive,
                    modifier = Modifier.weight(1f),
                ) { Text("Skip") }
                Button(
                    onClick = { onSetStatus("done", note) },
                    enabled = ticketActive,
                    colors = ButtonDefaults.buttonColors(containerColor = TicketColors.Done),
                    modifier = Modifier.weight(1f),
                ) { Text("Done") }
            }
            if (step.status != "pending") {
                TextButton(
                    onClick = { onSetStatus("pending", "") },
                    enabled = ticketActive,
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                ) { Text("Reset to pending") }
            }

            if (step.requiresPhoto || photoCount > 0) {
                PhotoBadge(photoCount)
            }
        }
    }
}
