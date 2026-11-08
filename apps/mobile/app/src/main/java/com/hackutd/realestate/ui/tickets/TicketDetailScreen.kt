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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import com.hackutd.realestate.data.TicketPhoto
import com.hackutd.realestate.data.TicketStep
import com.hackutd.realestate.ui.AppButton
import com.hackutd.realestate.ui.AppCard
import com.hackutd.realestate.ui.AppTopBar
import com.hackutd.realestate.ui.Badge
import com.hackutd.realestate.ui.BadgeTone
import com.hackutd.realestate.ui.ButtonVariant
import com.hackutd.realestate.ui.GlassesIcon
import com.hackutd.realestate.ui.ProgressBar
import com.hackutd.realestate.ui.SectionLabel
import com.hackutd.realestate.ui.appTextFieldColors
import com.hackutd.realestate.ui.theme.AppTheme
import com.hackutd.realestate.ui.MessageWithAction
import com.hackutd.realestate.ui.PriorityChip
import com.hackutd.realestate.ui.StatusChip
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
    // Photo open in the full-screen viewer.
    var viewingPhotoId by rememberSaveable { mutableStateOf<Long?>(null) }

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
            AppTopBar(title = ticket?.assetLabel?.ifBlank { null } ?: "Ticket", onBack = onBack)
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
                        loadPhoto = viewModel::loadPhoto,
                        onOpenPhoto = { viewingPhotoId = it.id },
                    )
                }
            }
        }
    }

    val viewingPhoto = state.photos.firstOrNull { it.id == viewingPhotoId }
    if (viewingPhoto != null) {
        PhotoViewer(
            photo = viewingPhoto,
            title = if (viewingPhoto.stepOrder == 0) "Ticket photo" else "Step ${viewingPhoto.stepOrder}",
            load = viewModel::loadPhoto,
            onDismiss = { viewingPhotoId = null },
        )
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
    loadPhoto: PhotoLoader,
    onOpenPhoto: (TicketPhoto) -> Unit,
) {
    val currentOrder = ticket.currentStep?.order
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(key = "header") {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    PriorityChip(ticket.priority)
                    StatusChip(ticket.status)
                    Badge(kindLabel(ticket.kind))
                }
                Text(ticket.title, style = MaterialTheme.typography.headlineSmall)
                if (ticket.equipmentCode.isNotBlank() && ticket.equipmentCode != ticket.assetLabel) {
                    Text(
                        "Equipment · ${ticket.equipmentCode}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = AppTheme.colors.muted,
                    )
                }
            }
        }
        if (ticket.safetyNotes.isNotBlank()) {
            item(key = "safety") { SafetyCard(ticket.safetyNotes) }
        }
        if (ticket.summary.isNotBlank()) {
            item(key = "summary") {
                Text(ticket.summary, style = MaterialTheme.typography.bodyMedium, color = AppTheme.colors.muted)
            }
        }
        item(key = "steps-header") {
            val total = ticket.steps.size
            Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionLabel("Steps", trailing = "${ticket.completedSteps} of $total done")
                if (total > 0) {
                    ProgressBar(
                        progress = ticket.completedSteps.toFloat() / total,
                        color = if (ticket.completedSteps == total) AppTheme.colors.green else AppTheme.colors.foreground,
                    )
                }
            }
        }
        items(ticket.steps, key = { "step-${it.order}" }) { step ->
            StepRow(
                step = step,
                isCurrent = ticket.isActive && step.order == currentOrder,
                saving = state.savingStep == step.order,
                photos = state.photosFor(step.order),
                loadPhoto = loadPhoto,
                onOpenPhoto = onOpenPhoto,
                onClick = { onStepClick(step) },
            )
        }
        // Photos taken for the ticket as a whole rather than a specific step.
        val ticketPhotos = state.photosFor(0)
        if (ticketPhotos.isNotEmpty()) {
            item(key = "photos") {
                Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    SectionLabel("Photos", trailing = "${ticketPhotos.size}")
                    TicketPhotoGrid(ticketPhotos, loadPhoto, onOpenPhoto)
                }
            }
        }
    }
}

@Composable
private fun SafetyCard(notes: String) {
    // Vercel-style "warning" note: tinted fill with a matching border.
    val amber = AppTheme.colors.amber
    Surface(
        color = amber.copy(alpha = 0.08f),
        contentColor = MaterialTheme.colorScheme.onSurface,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, amber.copy(alpha = 0.35f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(Icons.Default.Warning, contentDescription = null, tint = amber, modifier = Modifier.size(20.dp))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Safety", style = MaterialTheme.typography.titleSmall, color = amber)
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
    photos: List<TicketPhoto>,
    loadPhoto: PhotoLoader,
    onOpenPhoto: (TicketPhoto) -> Unit,
    onClick: () -> Unit,
) {
    val photoCount = photos.size
    AppCard(
        onClick = onClick,
        highlighted = isCurrent,
        contentPadding = PaddingValues(14.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StepMarker(step, saving)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (isCurrent) {
                    Text("CURRENT STEP", style = MaterialTheme.typography.labelSmall, color = AppTheme.colors.blue)
                }
                Text(
                    step.instruction,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = if (isCurrent) FontWeight.Medium else FontWeight.Normal,
                    color = if (step.status == "pending") MaterialTheme.colorScheme.onSurface else AppTheme.colors.muted,
                )
                if (step.expectedResult.isNotBlank()) {
                    Text(
                        "Expected: ${step.expectedResult}",
                        style = MaterialTheme.typography.bodySmall,
                        color = AppTheme.colors.muted,
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
                if (photos.isNotEmpty()) {
                    PhotoStrip(photos, loadPhoto, onOpenPhoto, modifier = Modifier.padding(top = 6.dp))
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
internal fun PhotoBadge(photoCount: Int, modifier: Modifier = Modifier) {
    Badge(
        text = when (photoCount) {
            0 -> "Photo needed"
            1 -> "1 photo"
            else -> "$photoCount photos"
        },
        tone = if (photoCount > 0) BadgeTone.Green else BadgeTone.Amber,
        icon = GlassesIcon,
        modifier = modifier,
    )
}

/** Circle showing the step number (pending) or its result. */
@Composable
private fun StepMarker(step: TicketStep, saving: Boolean) {
    val colors = AppTheme.colors
    val size = Modifier.size(28.dp)
    if (saving) {
        Box(size, contentAlignment = Alignment.Center) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
        }
        return
    }
    val (background, content) = when (step.status) {
        "done" -> colors.green to Color.White
        "failed" -> colors.red to Color.White
        "skipped" -> colors.subtle to colors.muted
        else -> Color.Transparent to colors.foreground
    }
    Box(
        modifier = size
            .background(background, CircleShape)
            .then(
                if (step.status == "pending") Modifier.border(1.dp, colors.borderStrong, CircleShape)
                else Modifier
            ),
        contentAlignment = Alignment.Center,
    ) {
        when (step.status) {
            "done" -> Icon(Icons.Default.Check, "Done", tint = content, modifier = Modifier.size(16.dp))
            "failed" -> Icon(Icons.Default.Close, "Failed", tint = content, modifier = Modifier.size(16.dp))
            "skipped" -> Text("–", color = content, fontWeight = FontWeight.Bold)
            else -> Text("${step.order}", color = content, style = MaterialTheme.typography.labelMedium)
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
    Surface(color = AppTheme.colors.background) {
        Column {
            HorizontalDivider(thickness = 1.dp, color = AppTheme.colors.border)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                when {
                    ticket.isActive -> {
                        AppButton(
                            text = "Start Agent Resolution Mode",
                            onClick = { onStartResolution?.invoke() },
                            enabled = onStartResolution != null,
                            large = true,
                            icon = GlassesIcon,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        AppButton(
                            text = if (ticket.canResolve) "Mark resolved" else "Mark resolved (finish every step first)",
                            onClick = onResolve,
                            variant = ButtonVariant.Secondary,
                            enabled = ticket.canResolve,
                            loading = savingStatus,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    ticket.status == "resolved" || ticket.status == "cancelled" -> AppButton(
                        text = "Reopen",
                        onClick = { onReopen(if (ticket.status == "resolved") "in_progress" else "open") },
                        variant = ButtonVariant.Secondary,
                        loading = savingStatus,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    else -> Text(
                        "This ticket is closed.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = AppTheme.colors.muted,
                    )
                }
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

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = AppTheme.colors.background,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SectionLabel("Step ${step.order}")
            Text(step.instruction, style = MaterialTheme.typography.titleMedium)
            if (step.expectedResult.isNotBlank()) {
                Text(
                    "Expected: ${step.expectedResult}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = AppTheme.colors.muted,
                )
            }
            if (step.requiresPhoto || photoCount > 0) {
                PhotoBadge(photoCount)
            }

            if (!ticketActive) {
                Text(
                    "Reopen the ticket to change steps.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = AppTheme.colors.red,
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
                shape = MaterialTheme.shapes.medium,
                colors = appTextFieldColors(),
                modifier = Modifier.fillMaxWidth(),
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AppButton(
                    "Failed",
                    onClick = { onSetStatus("failed", note) },
                    variant = ButtonVariant.Danger,
                    enabled = ticketActive,
                    modifier = Modifier.weight(1f),
                )
                AppButton(
                    "Skip",
                    onClick = { onSetStatus("skipped", note) },
                    variant = ButtonVariant.Secondary,
                    enabled = ticketActive,
                    modifier = Modifier.weight(1f),
                )
                AppButton(
                    "Done",
                    onClick = { onSetStatus("done", note) },
                    enabled = ticketActive,
                    icon = Icons.Default.Check,
                    modifier = Modifier.weight(1f),
                )
            }
            if (step.status != "pending") {
                AppButton(
                    "Reset to pending",
                    onClick = { onSetStatus("pending", "") },
                    variant = ButtonVariant.Ghost,
                    enabled = ticketActive,
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                )
            }
        }
    }
}
