package com.hackutd.realestate.ui.tickets

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hackutd.realestate.data.Ticket
import com.hackutd.realestate.ui.Chip
import com.hackutd.realestate.ui.MessageWithAction
import com.hackutd.realestate.ui.StatusChip
import com.hackutd.realestate.ui.appFactory
import com.hackutd.realestate.ui.kindLabel
import com.hackutd.realestate.ui.priorityColor
import com.hackutd.realestate.ui.priorityLabel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TicketsScreen(
    onBack: () -> Unit,
    onOpenTicket: (Ticket) -> Unit,
    viewModel: TicketsViewModel = viewModel(
        factory = appFactory { app, saved -> TicketsViewModel(app.repository, saved) },
    ),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }

    // Loads on open and on return from a ticket, so step progress stays current.
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

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        state.spaceName.ifBlank { "Tickets" },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        val tickets = state.tickets
        val loadError = state.loadError
        Column(Modifier.fillMaxSize().padding(padding)) {
            FilterRow(selected = state.filter, onSelect = viewModel::setFilter)
            Box(Modifier.fillMaxSize()) {
                when {
                    tickets == null && loadError != null ->
                        MessageWithAction(loadError, "Retry", onAction = { viewModel.load() })
                    tickets == null ->
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    else -> PullToRefreshBox(
                        isRefreshing = state.refreshing,
                        onRefresh = { viewModel.load(userInitiated = true) },
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        TicketsList(tickets, state.filter, onOpenTicket)
                    }
                }
            }
        }
    }
}

@Composable
private fun FilterRow(selected: TicketFilter, onSelect: (TicketFilter) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        TicketFilter.entries.forEach { filter ->
            FilterChip(
                selected = filter == selected,
                onClick = { onSelect(filter) },
                label = { Text(filter.label) },
            )
        }
    }
}

@Composable
private fun TicketsList(tickets: List<Ticket>, filter: TicketFilter, onOpenTicket: (Ticket) -> Unit) {
    // Under "All", finished tickets go in a collapsed "Done" section at the bottom.
    val visible = tickets.filter { filter.matches(it) }
    val active = if (filter == TicketFilter.All) visible.filter { it.isActive } else visible
    val done = if (filter == TicketFilter.All) visible.filter { !it.isActive } else emptyList()
    var doneExpanded by rememberSaveable { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (visible.isEmpty()) {
            item {
                Box(Modifier.fillParentMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        if (tickets.isEmpty()) "No tickets yet. Generate tickets on the web app."
                        else "No ${filter.label.lowercase()} tickets.",
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        items(active, key = { it.id }) { ticket ->
            TicketCard(ticket, onClick = { onOpenTicket(ticket) })
        }
        if (done.isNotEmpty()) {
            item(key = "done-header") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { doneExpanded = !doneExpanded }
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "Done (${done.size})",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    Icon(
                        if (doneExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                        contentDescription = if (doneExpanded) "Hide done tickets" else "Show done tickets",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (doneExpanded) {
                items(done, key = { it.id }) { ticket ->
                    TicketCard(ticket, onClick = { onOpenTicket(ticket) })
                }
            }
        }
    }
}

@Composable
private fun TicketCard(ticket: Ticket, onClick: () -> Unit) {
    val total = ticket.steps.size
    val completed = ticket.completedSteps
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            // Priority color bar down the left edge.
            Box(
                Modifier
                    .width(6.dp)
                    .fillMaxHeight()
                    .background(priorityColor(ticket.priority)),
            )
            Column(
                modifier = Modifier.padding(16.dp).weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        priorityLabel(ticket.priority).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = priorityColor(ticket.priority),
                    )
                    Spacer(Modifier.weight(1f))
                    StatusChip(ticket.status)
                }
                Text(
                    ticket.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (ticket.assetLabel.isNotBlank()) {
                        Chip(
                            ticket.assetLabel,
                            MaterialTheme.colorScheme.secondaryContainer,
                            MaterialTheme.colorScheme.onSecondaryContainer,
                        )
                    }
                    Chip(
                        kindLabel(ticket.kind),
                        MaterialTheme.colorScheme.surfaceVariant,
                        MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (total > 0) {
                    Text(
                        "$completed of $total steps",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    LinearProgressIndicator(
                        progress = { completed.toFloat() / total },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}
