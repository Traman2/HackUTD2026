package com.hackutd.realestate.ui.spaces

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hackutd.realestate.data.Space
import com.hackutd.realestate.ui.AppCard
import com.hackutd.realestate.ui.AppTopBar
import com.hackutd.realestate.ui.Badge
import com.hackutd.realestate.ui.BadgeTone
import com.hackutd.realestate.ui.MessageWithAction
import com.hackutd.realestate.ui.theme.AppTheme
import com.hackutd.realestate.ui.relativeTime
import com.hackutd.realestate.ui.repositoryFactory

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SpacesScreen(
    onOpenSpace: (Space) -> Unit,
    viewModel: SpacesViewModel = viewModel(factory = repositoryFactory(::SpacesViewModel)),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val profile by viewModel.profile.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var menuOpen by remember { mutableStateOf(false) }

    // Loads on first open and whenever the screen comes back into view (e.g. back from a space).
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
            AppTopBar(
                title = "Spaces",
                subtitle = profile?.let { it.displayName.ifBlank { it.username } },
                actions = {
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(Icons.Default.MoreVert, contentDescription = "More options")
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text(if (state.signingOut) "Signing out…" else "Sign out") },
                            enabled = !state.signingOut,
                            onClick = {
                                menuOpen = false
                                viewModel.signOut()
                            },
                        )
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        val spaces = state.spaces
        val loadError = state.loadError
        Box(Modifier.fillMaxSize().padding(padding)) {
            when {
                spaces == null && loadError != null ->
                    MessageWithAction(loadError, "Retry", onAction = { viewModel.load() })
                spaces == null ->
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                else -> PullToRefreshBox(
                    isRefreshing = state.refreshing,
                    onRefresh = { viewModel.load(userInitiated = true) },
                    modifier = Modifier.fillMaxSize(),
                ) {
                    SpacesList(spaces, onOpenSpace)
                }
            }
        }
    }
}

@Composable
private fun SpacesList(spaces: List<Space>, onOpenSpace: (Space) -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (spaces.isEmpty()) {
            // Inside the list so pull-to-refresh still works on an empty screen.
            item {
                Box(Modifier.fillParentMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        "No spaces yet. Create one on the web app.",
                        textAlign = TextAlign.Center,
                        color = AppTheme.colors.muted,
                    )
                }
            }
        }
        items(spaces, key = { it.id }) { space ->
            SpaceCard(space, onClick = { onOpenSpace(space) })
        }
    }
}

@Composable
private fun SpaceCard(space: Space, onClick: () -> Unit) {
    val colors = AppTheme.colors
    AppCard(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().alpha(if (space.archived) 0.6f else 1f),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                space.name,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (space.archived) {
                Spacer(Modifier.width(8.dp))
                Badge("Archived")
            }
            Spacer(Modifier.width(4.dp))
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = colors.muted,
                modifier = Modifier.size(20.dp),
            )
        }
        if (space.description.isNotBlank()) {
            Text(
                space.description,
                style = MaterialTheme.typography.bodyMedium,
                color = colors.muted,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        HorizontalDivider(color = colors.border, modifier = Modifier.padding(vertical = 2.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OpenTicketsBadge(space.openTickets)
            Spacer(Modifier.weight(1f))
            Text(
                "Updated ${relativeTime(space.updatedAtMicros)}",
                style = MaterialTheme.typography.labelSmall,
                color = colors.muted,
            )
        }
    }
}

@Composable
private fun OpenTicketsBadge(count: Int) {
    val label = when (count) {
        0 -> "No open tickets"
        1 -> "1 open ticket"
        else -> "$count open tickets"
    }
    Badge(label, tone = if (count == 0) BadgeTone.Gray else BadgeTone.Blue, dot = count > 0)
}
