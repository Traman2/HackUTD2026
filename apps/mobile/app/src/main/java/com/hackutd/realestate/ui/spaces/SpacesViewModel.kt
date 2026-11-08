package com.hackutd.realestate.ui.spaces

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hackutd.realestate.data.Repository
import com.hackutd.realestate.data.Space
import com.hackutd.realestate.ui.isLoggedOut
import com.hackutd.realestate.ui.userMessage
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SpacesUiState(
    /** Null until the first load finishes. */
    val spaces: List<Space>? = null,
    /** True while a pull-to-refresh is running. */
    val refreshing: Boolean = false,
    /** Shown full screen when there is nothing to show yet. */
    val loadError: String? = null,
    val signingOut: Boolean = false,
    /** One-off message for the snackbar. */
    val message: String? = null,
)

class SpacesViewModel(private val repository: Repository) : ViewModel() {
    private val _state = MutableStateFlow(SpacesUiState())
    val state: StateFlow<SpacesUiState> = _state.asStateFlow()

    val profile = repository.profile

    private var loadJob: Job? = null

    /**
     * Loads spaces. [userInitiated] shows the pull-to-refresh spinner; otherwise it refreshes
     * quietly (used when the screen opens or comes back into view).
     */
    fun load(userInitiated: Boolean = false) {
        if (loadJob?.isActive == true) return
        _state.update { it.copy(refreshing = userInitiated, loadError = null) }
        loadJob = viewModelScope.launch {
            try {
                val spaces = repository.spaces()
                _state.update { it.copy(spaces = spaces, refreshing = false) }
            } catch (e: Exception) {
                if (e.isLoggedOut()) {
                    repository.onSessionExpired()
                    return@launch
                }
                _state.update {
                    if (it.spaces == null) {
                        it.copy(refreshing = false, loadError = e.userMessage())
                    } else {
                        // Keep showing the old list; just report the failure.
                        it.copy(refreshing = false, message = e.userMessage())
                    }
                }
            }
        }
    }

    /** On success the profile becomes null and navigation returns to Login. */
    fun signOut() {
        if (_state.value.signingOut) return
        _state.update { it.copy(signingOut = true) }
        viewModelScope.launch {
            try {
                repository.logout()
                _state.update { it.copy(signingOut = false) }
            } catch (e: Exception) {
                _state.update { it.copy(signingOut = false, message = e.userMessage()) }
            }
        }
    }

    fun messageShown() = _state.update { it.copy(message = null) }
}
