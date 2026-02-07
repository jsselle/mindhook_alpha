// ===== COLORS =====
// Dark theme based on modern design standards (similar to iOS/Material Dark)

export const colors = {
    // Backgrounds (darkest to lightest)
    background: {
        primary: '#0D0D0D',      // Main app background
        secondary: '#1A1A1A',    // Cards, elevated surfaces
        tertiary: '#262626',     // Input fields, wells
        elevated: '#2C2C2C',     // Modals, sheets
    },

    // Text (lightest to darkest)
    text: {
        primary: '#FFFFFF',      // Main text
        secondary: '#A0A0A0',    // Muted text, timestamps
        tertiary: '#666666',     // Placeholder, disabled
        inverse: '#0D0D0D',      // Text on light backgrounds
    },

    // Accent (primary brand color)
    accent: {
        primary: '#0A84FF',      // iOS blue - buttons, links
        secondary: '#5E5CE6',    // Purple - secondary actions
        tertiary: '#30D158',     // Green - success states
    },

    // Semantic
    semantic: {
        success: '#30D158',
        warning: '#FFD60A',
        error: '#FF453A',
        info: '#0A84FF',
    },

    // Surfaces
    surface: {
        userBubble: '#0A84FF',        // User message background
        assistantBubble: '#262626',   // Assistant message background
        systemBubble: '#1A1A1A',      // System message background
        recording: 'rgba(255, 69, 58, 0.15)', // Recording state
    },

    // Borders & Dividers
    border: {
        primary: '#333333',      // Dividers, separators
        secondary: '#222222',    // Subtle borders
        focus: '#0A84FF',        // Focus rings
    },

    // Overlays
    overlay: {
        light: 'rgba(255, 255, 255, 0.05)',
        medium: 'rgba(255, 255, 255, 0.1)',
        dark: 'rgba(0, 0, 0, 0.5)',
        scrim: 'rgba(0, 0, 0, 0.7)',
    },
} as const;

// ===== TYPOGRAPHY =====
// Using system fonts for optimal readability and platform feel

export const typography = {
    // Font families
    fontFamily: {
        regular: 'System',       // San Francisco on iOS, Roboto on Android
        medium: 'System',
        semibold: 'System',
        bold: 'System',
        mono: 'Menlo',          // For code/technical text
    },

    // Font sizes (rem-like scale, base 16)
    fontSize: {
        xs: 11,
        sm: 13,
        base: 15,
        md: 17,
        lg: 20,
        xl: 24,
        '2xl': 28,
        '3xl': 34,
    },

    // Line heights
    lineHeight: {
        tight: 1.2,
        normal: 1.4,
        relaxed: 1.6,
    },

    // Font weights
    fontWeight: {
        regular: '400' as const,
        medium: '500' as const,
        semibold: '600' as const,
        bold: '700' as const,
    },

    // Letter spacing
    letterSpacing: {
        tight: -0.5,
        normal: 0,
        wide: 0.5,
    },
} as const;

// ===== SPACING =====
// 4px base unit (consistent with iOS/Material)

export const spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
    '4xl': 40,
    '5xl': 48,
} as const;

// ===== RADII =====

export const radii = {
    none: 0,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    '2xl': 20,
    full: 9999,
} as const;

// ===== SHADOWS =====
// Subtle shadows for dark theme

export const shadows = {
    none: {},
    sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
        elevation: 2,
    },
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
        elevation: 4,
    },
    lg: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 8,
    },
} as const;

// ===== ANIMATION =====

export const animation = {
    duration: {
        fast: 150,
        normal: 250,
        slow: 400,
    },
    easing: {
        default: 'ease-out',
        spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    },
} as const;

// ===== LAYOUT =====

export const layout = {
    maxContentWidth: 600,
    headerHeight: 56,
    composerMinHeight: 52,
    composerMaxHeight: 120,
    attachmentChipHeight: 56,
    messageBubbleMaxWidth: '80%',
    iconButtonSize: 44,        // Minimum touch target
    inputHeight: 40,
} as const;
