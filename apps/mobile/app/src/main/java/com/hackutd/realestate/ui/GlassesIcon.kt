package com.hackutd.realestate.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/** Outline glasses icon (not in the core Material icon set). Tinted by Icon like any other. */
val GlassesIcon: ImageVector by lazy {
    ImageVector.Builder(
        name = "Glasses",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).path(
        stroke = SolidColor(Color.Black),
        strokeLineWidth = 1.8f,
        strokeLineCap = StrokeCap.Round,
        strokeLineJoin = StrokeJoin.Round,
    ) {
        // Left lens
        moveTo(2.5f, 14f)
        arcTo(3.75f, 3.75f, 0f, isMoreThanHalf = true, isPositiveArc = true, 10f, 14f)
        arcTo(3.75f, 3.75f, 0f, isMoreThanHalf = true, isPositiveArc = true, 2.5f, 14f)
        close()
        // Right lens
        moveTo(14f, 14f)
        arcTo(3.75f, 3.75f, 0f, isMoreThanHalf = true, isPositiveArc = true, 21.5f, 14f)
        arcTo(3.75f, 3.75f, 0f, isMoreThanHalf = true, isPositiveArc = true, 14f, 14f)
        close()
        // Bridge
        moveTo(10f, 13.2f)
        curveTo(11f, 12f, 13f, 12f, 14f, 13.2f)
        // Temples
        moveTo(2.8f, 12.6f)
        lineTo(4.8f, 7f)
        moveTo(21.2f, 12.6f)
        lineTo(19.2f, 7f)
    }.build()
}
