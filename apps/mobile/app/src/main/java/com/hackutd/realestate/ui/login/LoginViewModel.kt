package com.hackutd.realestate.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hackutd.realestate.data.Repository
import com.hackutd.realestate.ui.userMessage
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val username: String = "",
    val password: String = "",
    val loading: Boolean = false,
    val error: String? = null,
) {
    val canSubmit: Boolean get() = username.isNotBlank() && password.isNotEmpty() && !loading
}

class LoginViewModel(private val repository: Repository) : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    private val _loggedIn = Channel<Unit>(Channel.BUFFERED)

    /** Fires once after a successful sign-in. Navigation listens to this. */
    val loggedIn = _loggedIn.receiveAsFlow()

    fun onUsernameChange(value: String) = _state.update { it.copy(username = value, error = null) }

    fun onPasswordChange(value: String) = _state.update { it.copy(password = value, error = null) }

    fun submit() {
        val current = _state.value
        if (!current.canSubmit) return

        // Same rules as the backend, so mistakes show before the network call.
        validate(current.username, current.password)?.let { message ->
            _state.update { it.copy(error = message) }
            return
        }

        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                repository.login(current.username, current.password)
                _state.update { it.copy(loading = false, password = "") }
                _loggedIn.send(Unit)
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.userMessage()) }
            }
        }
    }

    private fun validate(username: String, password: String): String? {
        val name = username.trim().lowercase()
        return when {
            name.length !in 3..32 -> "Username must be 3–32 characters."
            !USERNAME_PATTERN.matches(name) -> "Username can only use letters, numbers and _."
            password.length > 128 -> "Password must be at most 128 characters."
            else -> null
        }
    }

    private companion object {
        val USERNAME_PATTERN = Regex("^[a-z0-9_]+$")
    }
}
