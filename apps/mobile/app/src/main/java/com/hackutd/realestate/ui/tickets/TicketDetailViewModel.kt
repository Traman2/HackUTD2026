package com.hackutd.realestate.ui.tickets

import android.graphics.Bitmap
import android.graphics.ImageDecoder
import java.nio.ByteBuffer
import android.util.LruCache
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hackutd.realestate.data.Repository
import com.hackutd.realestate.data.Ticket
import com.hackutd.realestate.data.TicketPhoto
import com.hackutd.realestate.ui.isLoggedOut
import com.hackutd.realestate.ui.userMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class TicketDetailUiState(
    val ticket: Ticket? = null,
    /** Verified photos attached to this ticket (taken through the glasses). */
    val photos: List<TicketPhoto> = emptyList(),
    val refreshing: Boolean = false,
    val loadError: String? = null,
    /** Step whose status is being saved. */
    val savingStep: Int? = null,
    val savingStatus: Boolean = false,
    /** One-off message for the snackbar. */
    val message: String? = null,
) {
    fun photoCount(stepOrder: Int): Int = photos.count { it.stepOrder == stepOrder }
    fun photosFor(stepOrder: Int): List<TicketPhoto> = photos.filter { it.stepOrder == stepOrder }
}

class TicketDetailViewModel(
    private val repository: Repository,
    savedState: SavedStateHandle,
) : ViewModel() {
    private val ticketId: Long = checkNotNull(savedState[ARG_TICKET_ID])

    private val _state = MutableStateFlow(TicketDetailUiState())
    val state: StateFlow<TicketDetailUiState> = _state.asStateFlow()

    private var loadJob: Job? = null

    fun load(userInitiated: Boolean = false) {
        if (loadJob?.isActive == true) return
        _state.update { it.copy(refreshing = userInitiated, loadError = null) }
        loadJob = viewModelScope.launch {
            try {
                reload()
                _state.update { it.copy(refreshing = false) }
            } catch (e: Exception) {
                if (handleLoggedOut(e)) return@launch
                _state.update {
                    if (it.ticket == null) it.copy(refreshing = false, loadError = e.userMessage())
                    else it.copy(refreshing = false, message = e.userMessage())
                }
            }
        }
    }

    /** Saves a step's status and note to the tickets table. */
    fun updateStep(stepOrder: Int, status: String, note: String) {
        if (_state.value.savingStep != null) return
        _state.update { it.copy(savingStep = stepOrder) }
        viewModelScope.launch {
            try {
                repository.updateStep(ticketId, stepOrder, status, note.trim())
                reload()
            } catch (e: Exception) {
                if (handleLoggedOut(e)) return@launch
                _state.update { it.copy(message = e.userMessage()) }
            } finally {
                _state.update { it.copy(savingStep = null) }
            }
        }
    }

    /** Resolve / reopen. The backend checks the transition is allowed. */
    fun setStatus(status: String, successMessage: String) {
        if (_state.value.savingStatus) return
        _state.update { it.copy(savingStatus = true) }
        viewModelScope.launch {
            try {
                repository.setTicketStatus(ticketId, status)
                reload()
                _state.update { it.copy(message = successMessage) }
            } catch (e: Exception) {
                if (handleLoggedOut(e)) return@launch
                _state.update { it.copy(message = e.userMessage()) }
            } finally {
                _state.update { it.copy(savingStatus = false) }
            }
        }
    }

    fun messageShown() = _state.update { it.copy(message = null) }

    /**
     * Downloads and decodes a photo, scaled down so its longer side is at most [maxSize] px.
     * Results are cached for the app's lifetime, so the signed URL only needs to work once.
     */
    suspend fun loadPhoto(photo: TicketPhoto, maxSize: Int): ImageBitmap {
        val key = "${photo.id}:$maxSize"
        photoCache.get(key)?.let { return it }
        val url = photo.url ?: throw IllegalStateException("Photo is still uploading.")
        val bytes = repository.photoBytes(url)
        val bitmap = withContext(Dispatchers.Default) { decodeScaled(bytes, maxSize) }
            ?: throw IllegalStateException("This photo format can't be shown.")
        return bitmap.asImageBitmap().also { photoCache.put(key, it) }
    }

    private suspend fun reload() {
        val ticket = repository.ticket(ticketId)
        if (ticket == null) {
            _state.update { it.copy(ticket = null, loadError = "This ticket no longer exists.") }
            return
        }
        // Photos are extra detail: if they fail to load, still show the checklist.
        val photos = try {
            repository.ticketPhotos(ticketId).filter { it.status == "verified" }
        } catch (e: Exception) {
            if (e.isLoggedOut()) throw e
            _state.value.photos
        }
        _state.update { it.copy(ticket = ticket, photos = photos, loadError = null) }
    }

    private fun handleLoggedOut(e: Exception): Boolean {
        if (!e.isLoggedOut()) return false
        repository.onSessionExpired()
        return true
    }

    companion object {
        const val ARG_TICKET_ID = "ticketId"

        /** Decoded photos, shared across screens. ~24 thumbnails plus a few full-size images. */
        private val photoCache = object : LruCache<String, ImageBitmap>(48 * 1024 * 1024) {
            override fun sizeOf(key: String, value: ImageBitmap) = value.width * value.height * 4
        }

        /** Decodes JPEG/PNG/WebP/HEIC, applying EXIF rotation, downsampled toward [maxSize]. */
        private fun decodeScaled(bytes: ByteArray, maxSize: Int): Bitmap? = runCatching {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(ByteBuffer.wrap(bytes))) { decoder, info, _ ->
                var sample = 1
                while (maxOf(info.size.width, info.size.height) / (sample * 2) >= maxSize) sample *= 2
                decoder.setTargetSampleSize(sample)
            }
        }.getOrNull()
    }
}
