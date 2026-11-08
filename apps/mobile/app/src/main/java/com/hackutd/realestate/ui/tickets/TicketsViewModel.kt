package com.hackutd.realestate.ui.tickets

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hackutd.realestate.data.Repository
import com.hackutd.realestate.data.Ticket
import com.hackutd.realestate.ui.isLoggedOut
import com.hackutd.realestate.ui.userMessage
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class TicketFilter(val label: String) {
    All("All"), Open("Open"), InProgress("In progress"), Done("Done");

    fun matches(ticket: Ticket): Boolean = when (this) {
        All -> true
        Open -> ticket.status == "open"
        InProgress -> ticket.status == "in_progress"
        Done -> !ticket.isActive
    }
}

data class TicketsUiState(
    val spaceName: String,
    val tickets: List<Ticket>? = null,
    val filter: TicketFilter = TicketFilter.All,
    val refreshing: Boolean = false,
    val loadError: String? = null,
    val message: String? = null,
)

class TicketsViewModel(
    private val repository: Repository,
    savedState: SavedStateHandle,
) : ViewModel() {
    private val spaceId: Long = checkNotNull(savedState[ARG_SPACE_ID])

    private val _state = MutableStateFlow(TicketsUiState(spaceName = savedState[ARG_SPACE_NAME] ?: ""))
    val state: StateFlow<TicketsUiState> = _state.asStateFlow()

    private var loadJob: Job? = null

    fun load(userInitiated: Boolean = false) {
        if (loadJob?.isActive == true) return
        _state.update { it.copy(refreshing = userInitiated, loadError = null) }
        loadJob = viewModelScope.launch {
            try {
                val tickets = repository.tickets(spaceId)
                _state.update { it.copy(tickets = tickets, refreshing = false) }
            } catch (e: Exception) {
                if (e.isLoggedOut()) {
                    repository.onSessionExpired()
                    return@launch
                }
                _state.update {
                    if (it.tickets == null) it.copy(refreshing = false, loadError = e.userMessage())
                    else it.copy(refreshing = false, message = e.userMessage())
                }
            }
        }
    }

    fun setFilter(filter: TicketFilter) = _state.update { it.copy(filter = filter) }

    fun messageShown() = _state.update { it.copy(message = null) }

    companion object {
        const val ARG_SPACE_ID = "spaceId"
        const val ARG_SPACE_NAME = "spaceName"
    }
}
