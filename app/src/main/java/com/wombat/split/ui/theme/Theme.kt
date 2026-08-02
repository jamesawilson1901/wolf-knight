package com.wombat.split.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

// Wombat is dark-first: the dark scheme is the brand reference, matching the
// launcher icon (silver line-art on near-black) on every device. There is
// deliberately NO dynamicColor/Material You path here — the palette is fixed.

private val WombatDarkColorScheme = darkColorScheme(
    primary = Silver,
    onPrimary = NearBlack,
    primaryContainer = GraphiteHigh,
    onPrimaryContainer = SilverBright,
    secondary = SilverDim,
    onSecondary = NearBlack,
    secondaryContainer = Graphite,
    onSecondaryContainer = Silver,
    tertiary = Silver,
    onTertiary = NearBlack,
    tertiaryContainer = GraphiteHigh,
    onTertiaryContainer = SilverBright,
    background = NearBlack,
    onBackground = SilverBright,
    surface = NearBlack,
    onSurface = SilverBright,
    surfaceVariant = Graphite,
    onSurfaceVariant = SilverDim,
    surfaceContainerLowest = NearBlack,
    surfaceContainerLow = Graphite,
    surfaceContainer = Graphite,
    surfaceContainerHigh = GraphiteHigh,
    surfaceContainerHighest = GraphiteHigh,
    outline = OutlineDark,
    outlineVariant = OutlineVariantDark,
    error = ErrorDark,
    onError = OnErrorDark,
    errorContainer = ErrorContainerDark,
    onErrorContainer = OnErrorContainerDark,
)

// Light theme keeps the same silver-on-neutral character: warm-free greys,
// graphite accents, no hue injected anywhere.
private val WombatLightColorScheme = lightColorScheme(
    primary = GraphiteMid,
    onPrimary = PorcelainHigh,
    primaryContainer = SilverContainerLight,
    onPrimaryContainer = InkGrey,
    secondary = OutlineLight,
    onSecondary = PorcelainHigh,
    secondaryContainer = SilverContainerLight,
    onSecondaryContainer = InkGrey,
    tertiary = GraphiteMid,
    onTertiary = PorcelainHigh,
    tertiaryContainer = SilverContainerLight,
    onTertiaryContainer = InkGrey,
    background = Porcelain,
    onBackground = InkGrey,
    surface = Porcelain,
    onSurface = InkGrey,
    surfaceVariant = SilverContainerLight,
    onSurfaceVariant = GraphiteMid,
    surfaceContainerLowest = PorcelainHigh,
    surfaceContainerLow = PorcelainHigh,
    surfaceContainer = PorcelainHigh,
    surfaceContainerHigh = SilverContainerLight,
    surfaceContainerHighest = SilverContainerLight,
    outline = OutlineLight,
    outlineVariant = OutlineVariantLight,
    error = ErrorLight,
    onError = OnErrorLight,
    errorContainer = ErrorContainerLight,
    onErrorContainer = OnErrorContainerLight,
)

@Composable
fun WombatTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) WombatDarkColorScheme else WombatLightColorScheme,
        typography = Typography,
        content = content,
    )
}
