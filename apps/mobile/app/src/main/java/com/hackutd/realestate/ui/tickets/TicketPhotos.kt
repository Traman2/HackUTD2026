package com.hackutd.realestate.ui.tickets

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.hackutd.realestate.data.TicketPhoto
import com.hackutd.realestate.ui.theme.AppTheme
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/** Downloads and decodes a photo at most `maxSize` px on its longer side. */
typealias PhotoLoader = suspend (photo: TicketPhoto, maxSize: Int) -> ImageBitmap

private sealed interface PhotoState {
    data object Loading : PhotoState
    data class Ready(val image: ImageBitmap) : PhotoState
    data object Failed : PhotoState
}

@Composable
private fun rememberPhoto(photo: TicketPhoto, maxSize: Int, load: PhotoLoader, attempt: Int): PhotoState {
    val state by produceState<PhotoState>(PhotoState.Loading, photo.id, photo.url, maxSize, attempt) {
        value = PhotoState.Loading
        value = try { PhotoState.Ready(load(photo, maxSize)) } catch (e: Exception) { PhotoState.Failed }
    }
    return state
}

/** Horizontal strip of square thumbnails; tap one to open it full screen. */
@Composable
fun PhotoStrip(
    photos: List<TicketPhoto>,
    load: PhotoLoader,
    onOpen: (TicketPhoto) -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 76.dp,
) {
    Row(
        modifier = modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        photos.forEach { photo ->
            PhotoThumbnail(photo, load, onClick = { onOpen(photo) }, modifier = Modifier.size(size))
        }
    }
}

/** Photos attached to the ticket as a whole (not a step), in a two-column grid. */
@Composable
fun TicketPhotoGrid(photos: List<TicketPhoto>, load: PhotoLoader, onOpen: (TicketPhoto) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        photos.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { photo ->
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        PhotoThumbnail(photo, load, onClick = { onOpen(photo) }, modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f))
                        PhotoMeta(photo)
                    }
                }
                if (row.size == 1) Box(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun PhotoThumbnail(photo: TicketPhoto, load: PhotoLoader, onClick: () -> Unit, modifier: Modifier) {
    var attempt by remember(photo.id) { mutableIntStateOf(0) }
    val state = rememberPhoto(photo, maxSize = 400, load = load, attempt = attempt)
    val colors = AppTheme.colors
    Surface(
        onClick = { if (state is PhotoState.Failed) attempt++ else onClick() },
        shape = MaterialTheme.shapes.medium,
        color = colors.subtle,
        border = BorderStroke(1.dp, colors.border),
        modifier = modifier,
    ) {
        Box(contentAlignment = Alignment.Center) {
            when (state) {
                PhotoState.Loading -> CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = colors.muted)
                PhotoState.Failed -> Icon(Icons.Default.Refresh, contentDescription = "Retry loading photo", tint = colors.muted, modifier = Modifier.size(20.dp))
                is PhotoState.Ready -> Image(
                    bitmap = state.image,
                    contentDescription = photo.caption.ifBlank { "Ticket photo" },
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
}

@Composable
private fun PhotoMeta(photo: TicketPhoto, color: Color = AppTheme.colors.muted) {
    val parts = listOfNotNull(
        photo.caption.takeIf { it.isNotBlank() },
        sourceLabel(photo.source),
        formatTaken(photo.createdAt),
    )
    if (parts.isNotEmpty()) {
        Text(parts.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = color, maxLines = 2)
    }
}

/** Full-screen photo on black, with caption and source underneath. */
@Composable
fun PhotoViewer(photo: TicketPhoto, title: String, load: PhotoLoader, onDismiss: () -> Unit) {
    var attempt by remember(photo.id) { mutableIntStateOf(0) }
    val state = rememberPhoto(photo, maxSize = 2048, load = load, attempt = attempt)
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            when (state) {
                PhotoState.Loading -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = Color.White)
                PhotoState.Failed -> Column(
                    Modifier.align(Alignment.Center).clickable { attempt++ }.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = null, tint = Color.White)
                    Text("Couldn't load the photo. Tap to retry.", color = Color.White, style = MaterialTheme.typography.bodyMedium)
                }
                is PhotoState.Ready -> Image(
                    bitmap = state.image,
                    contentDescription = photo.caption.ifBlank { "Ticket photo" },
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            Row(
                Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(title, color = Color.White, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f).padding(start = 8.dp))
                IconButton(onClick = onDismiss, modifier = Modifier.clip(CircleShape).background(Color.White.copy(alpha = 0.12f))) {
                    Icon(Icons.Default.Close, contentDescription = "Close photo", tint = Color.White)
                }
            }
            Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().background(Color.Black.copy(alpha = 0.6f)).padding(16.dp)) {
                PhotoMeta(photo, color = Color.White.copy(alpha = 0.85f))
            }
        }
    }
}

private fun sourceLabel(source: String): String? = when (source) {
    "glasses" -> "Meta glasses"
    "phone" -> "Phone"
    "" -> null
    else -> source.replaceFirstChar { it.uppercase() }
}

private val takenFormat = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT)

private fun formatTaken(iso: String): String? =
    runCatching { takenFormat.format(Instant.parse(iso).atZone(ZoneId.systemDefault())) }.getOrNull()
