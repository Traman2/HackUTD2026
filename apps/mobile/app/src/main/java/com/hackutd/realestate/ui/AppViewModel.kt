package com.hackutd.realestate.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hackutd.realestate.data.Profile
import com.hackutd.realestate.data.Repository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** What the app shows before the first screen: checking, signed in/out, or can't connect. */
sealed interface StartState {
    data object Checking : StartState
    data object SignedOut : StartState
    data class SignedIn(val profile: Profile) : StartState
    data class Failed(val message: String) : StartState
}

/** Decides the first screen by checking whether this device already has a session. */
class AppViewModel(private val repository: Repository) : ViewModel() {
    private val _start = MutableStateFlow<StartState>(StartState.Checking)
    val start: StateFlow<StartState> = _start.asStateFlow()

    /** The signed-in user (null after sign-out or session expiry). */
    val profile: StateFlow<Profile?> = repository.profile

    init {
        check()
    }

    fun check() {
        _start.value = StartState.Checking
        viewModelScope.launch {
            _start.value = try {
                repository.currentProfile()?.let { StartState.SignedIn(it) } ?: StartState.SignedOut
            } catch (e: Exception) {
                StartState.Failed(e.userMessage())
            }
        }
    }
}
