package com.hackutd.realestate.ui.resolution

import androidx.compose.foundation.AndroidExternalSurface
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.unit.IntSize
import com.hackutd.realestate.glasses.GlassesCamera

/** Preserves the glasses aspect ratio while cropping the video to fill the phone screen. */
@Composable
fun GlassesVideo(camera: GlassesCamera, width: Int, height: Int, modifier: Modifier = Modifier) {
    BoxWithConstraints(modifier.clipToBounds(), contentAlignment = Alignment.Center) {
        val aspect = width.toFloat() / height.coerceAtLeast(1)
        val wideVideo = aspect > maxWidth / maxHeight
        val displayWidth = if (wideVideo) maxHeight * aspect else maxWidth
        val displayHeight = if (wideVideo) maxHeight else maxWidth / aspect
        AndroidExternalSurface(
            modifier = Modifier.requiredSize(displayWidth, displayHeight),
            surfaceSize = IntSize(width, height),
        ) {
            onSurface { surface, _, _ ->
                camera.attachSurface(surface)
                surface.onDestroyed { camera.detachSurface(surface) }
            }
        }
    }
}
