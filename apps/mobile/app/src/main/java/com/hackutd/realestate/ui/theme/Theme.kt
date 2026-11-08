package com.hackutd.realestate.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em

/**
 * Colors Material doesn't have: hairline borders, muted text and status accents.
 * Modeled on Vercel's Geist palette: neutral grays with a few bright accents.
 */
@Immutable
data class AppColors(
    val background: Color,
    val foreground: Color,
    val muted: Color,
    val subtle: Color,
    val border: Color,
    val borderStrong: Color,
    val blue: Color,
    val green: Color,
    val amber: Color,
    val red: Color,
    val dark: Boolean,
)

private val LightColors = AppColors(
    background = Color(0xFFFFFFFF),
    foreground = Color(0xFF171717),
    muted = Color(0xFF666666),
    subtle = Color(0xFFF5F5F5),
    border = Color(0xFFEAEAEA),
    borderStrong = Color(0xFFD4D4D4),
    blue = Color(0xFF0070F3),
    green = Color(0xFF168F47),
    amber = Color(0xFFC97A00),
    red = Color(0xFFE5484D),
    dark = false,
)

private val DarkColors = AppColors(
    background = Color(0xFF0A0A0A),
    foreground = Color(0xFFEDEDED),
    muted = Color(0xFFA1A1A1),
    subtle = Color(0xFF1A1A1A),
    border = Color(0xFF262626),
    borderStrong = Color(0xFF3D3D3D),
    blue = Color(0xFF3291FF),
    green = Color(0xFF3FCF8E),
    amber = Color(0xFFF5A623),
    red = Color(0xFFFF6166),
    dark = true,
)

private val LocalAppColors = staticCompositionLocalOf { LightColors }

object AppTheme {
    val colors: AppColors
        @Composable @ReadOnlyComposable get() = LocalAppColors.current
}

private fun AppColors.toMaterial() = if (dark) {
    darkColorScheme(
        primary = foreground, onPrimary = background,
        primaryContainer = subtle, onPrimaryContainer = foreground,
        secondary = muted, onSecondary = background,
        secondaryContainer = subtle, onSecondaryContainer = foreground,
        tertiary = blue, onTertiary = Color.White,
        tertiaryContainer = subtle, onTertiaryContainer = foreground,
        background = background, onBackground = foreground,
        surface = background, onSurface = foreground,
        surfaceVariant = subtle, onSurfaceVariant = muted,
        surfaceTint = Color.Transparent,
        surfaceContainerLowest = background,
        surfaceContainerLow = Color(0xFF111111),
        surfaceContainer = Color(0xFF141414),
        surfaceContainerHigh = Color(0xFF1A1A1A),
        surfaceContainerHighest = Color(0xFF1F1F1F),
        inverseSurface = foreground, inverseOnSurface = background,
        outline = borderStrong, outlineVariant = border,
        error = red, onError = Color.White,
        errorContainer = red.copy(alpha = 0.14f), onErrorContainer = red,
    )
} else {
    lightColorScheme(
        primary = foreground, onPrimary = background,
        primaryContainer = subtle, onPrimaryContainer = foreground,
        secondary = muted, onSecondary = background,
        secondaryContainer = subtle, onSecondaryContainer = foreground,
        tertiary = blue, onTertiary = Color.White,
        tertiaryContainer = subtle, onTertiaryContainer = foreground,
        background = background, onBackground = foreground,
        surface = background, onSurface = foreground,
        surfaceVariant = subtle, onSurfaceVariant = muted,
        surfaceTint = Color.Transparent,
        surfaceContainerLowest = background,
        surfaceContainerLow = background,
        surfaceContainer = background,
        surfaceContainerHigh = background,
        surfaceContainerHighest = subtle,
        inverseSurface = foreground, inverseOnSurface = background,
        outline = borderStrong, outlineVariant = border,
        error = red, onError = Color.White,
        errorContainer = red.copy(alpha = 0.1f), onErrorContainer = red,
    )
}

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(6.dp),
    medium = RoundedCornerShape(8.dp),
    large = RoundedCornerShape(12.dp),
    extraLarge = RoundedCornerShape(16.dp),
)

// Tighter, bolder headings like Geist; body text stays default.
private val AppTypography = Typography().run {
    fun TextStyle.heading() = copy(fontWeight = FontWeight.SemiBold, letterSpacing = (-0.02).em)
    copy(
        displaySmall = displaySmall.heading(),
        headlineLarge = headlineLarge.heading(),
        headlineMedium = headlineMedium.heading(),
        headlineSmall = headlineSmall.heading(),
        titleLarge = titleLarge.heading(),
        titleMedium = titleMedium.copy(fontWeight = FontWeight.SemiBold, letterSpacing = (-0.01).em),
        titleSmall = titleSmall.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.em),
        labelLarge = labelLarge.copy(fontWeight = FontWeight.Medium, letterSpacing = 0.em),
        labelMedium = labelMedium.copy(fontWeight = FontWeight.Medium, letterSpacing = 0.em),
        labelSmall = labelSmall.copy(fontWeight = FontWeight.Medium, letterSpacing = 0.02.em),
    )
}

@Composable
fun RealEstateTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColors else LightColors
    CompositionLocalProvider(LocalAppColors provides colors) {
        MaterialTheme(
            colorScheme = colors.toMaterial(),
            shapes = AppShapes,
            typography = AppTypography,
            content = content,
        )
    }
}
