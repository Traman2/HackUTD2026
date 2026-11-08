package com.hackutd.realestate.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldColors
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.hackutd.realestate.ui.theme.AppTheme

// Vercel-style building blocks: flat surfaces, 1dp hairline borders, high-contrast buttons.

enum class ButtonVariant { Primary, Secondary, Ghost, Danger }

/** The one button used across the app. Primary is solid black (white in dark mode). */
@Composable
fun AppButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: ButtonVariant = ButtonVariant.Primary,
    enabled: Boolean = true,
    loading: Boolean = false,
    large: Boolean = false,
    icon: ImageVector? = null,
) {
    val c = AppTheme.colors
    val (container, content, border) = when (variant) {
        ButtonVariant.Primary -> Triple(c.foreground, c.background, null)
        ButtonVariant.Secondary -> Triple(c.background, c.foreground, BorderStroke(1.dp, c.border))
        ButtonVariant.Ghost -> Triple(Color.Transparent, c.foreground, null)
        ButtonVariant.Danger -> Triple(c.background, c.red, BorderStroke(1.dp, c.border))
    }
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.height(if (large) 48.dp else 40.dp),
        shape = MaterialTheme.shapes.medium,
        border = border,
        elevation = null,
        contentPadding = PaddingValues(horizontal = 16.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = container,
            contentColor = content,
            disabledContainerColor = if (variant == ButtonVariant.Primary) c.subtle else container,
            disabledContentColor = c.muted.copy(alpha = 0.7f),
        ),
    ) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = c.muted)
        } else {
            if (icon != null) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
            }
            Text(text, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Flat card with a hairline border. [highlighted] gives it a strong border (e.g. the current step). */
@Composable
fun AppCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    highlighted: Boolean = false,
    contentPadding: PaddingValues = PaddingValues(16.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = AppTheme.colors
    val border = BorderStroke(1.dp, if (highlighted) c.foreground else c.border)
    val shape = MaterialTheme.shapes.large
    val body: @Composable () -> Unit = {
        Column(Modifier.padding(contentPadding), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
    }
    if (onClick != null) {
        Surface(onClick = onClick, modifier = modifier, shape = shape, color = c.background, border = border, content = body)
    } else {
        Surface(modifier = modifier, shape = shape, color = c.background, border = border, content = body)
    }
}

enum class BadgeTone { Gray, Blue, Green, Amber, Red }

@Composable
private fun BadgeTone.color(): Color {
    val c = AppTheme.colors
    return when (this) {
        BadgeTone.Gray -> c.muted
        BadgeTone.Blue -> c.blue
        BadgeTone.Green -> c.green
        BadgeTone.Amber -> c.amber
        BadgeTone.Red -> c.red
    }
}

/** Small pill label with a tinted background. */
@Composable
fun Badge(
    text: String,
    modifier: Modifier = Modifier,
    tone: BadgeTone = BadgeTone.Gray,
    icon: ImageVector? = null,
    dot: Boolean = false,
) {
    val color = tone.color()
    val container = if (tone == BadgeTone.Gray) AppTheme.colors.subtle else color.copy(alpha = 0.12f)
    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(container)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (dot) StatusDot(color, size = 6)
        if (icon != null) Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(14.dp))
        Text(text, color = color, style = MaterialTheme.typography.labelMedium, maxLines = 1)
    }
}

@Composable
fun StatusDot(color: Color, size: Int = 8) {
    Box(Modifier.size(size.dp).background(color, CircleShape))
}

/** Pill toggle for filter rows: solid when selected, outlined otherwise. */
@Composable
fun FilterPill(text: String, selected: Boolean, onClick: () -> Unit) {
    val c = AppTheme.colors
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = if (selected) c.foreground else c.background,
        contentColor = if (selected) c.background else c.muted,
        border = if (selected) null else BorderStroke(1.dp, c.border),
    ) {
        Text(
            text,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
        )
    }
}

/** Thin rounded progress bar. */
@Composable
fun ProgressBar(progress: Float, modifier: Modifier = Modifier, color: Color = AppTheme.colors.foreground) {
    Box(
        modifier
            .fillMaxWidth()
            .height(4.dp)
            .clip(CircleShape)
            .background(AppTheme.colors.subtle),
    ) {
        Box(
            Modifier
                .fillMaxWidth(progress.coerceIn(0f, 1f))
                .fillMaxHeight()
                .clip(CircleShape)
                .background(color),
        )
    }
}

/** Flat top bar with a hairline divider under it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppTopBar(
    title: String,
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    val c = AppTheme.colors
    Column {
        TopAppBar(
            title = {
                Column {
                    Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (subtitle != null) {
                        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = c.muted, maxLines = 1)
                    }
                }
            },
            navigationIcon = {
                if (onBack != null) {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                }
            },
            actions = actions,
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = c.background,
                scrolledContainerColor = c.background,
            ),
        )
        HorizontalDivider(thickness = 1.dp, color = c.border)
    }
}

/** Small uppercase section label, e.g. "STEPS". */
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier, trailing: String? = null) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = AppTheme.colors.muted,
            modifier = Modifier.weight(1f),
        )
        if (trailing != null) {
            Text(trailing, style = MaterialTheme.typography.labelSmall, color = AppTheme.colors.muted)
        }
    }
}

@Composable
fun appTextFieldColors(): TextFieldColors {
    val c = AppTheme.colors
    return OutlinedTextFieldDefaults.colors(
        focusedBorderColor = c.foreground,
        unfocusedBorderColor = c.border,
        disabledBorderColor = c.border,
        focusedLabelColor = c.foreground,
        unfocusedLabelColor = c.muted,
        cursorColor = c.foreground,
    )
}
