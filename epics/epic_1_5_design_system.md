# Epic 1.5: Design System & UI Specifications

| Field | Value |
|-------|-------|
| **Epic** | 1.5 |
| **Name** | Design System & UI Specifications |
| **Effort** | 0.25 days |
| **Dependencies** | Epic 1.1 |
| **Predecessors** | Project setup |

---

## Overview

Define the visual design system for the app: colors, typography, spacing, and component specifications. This establishes the **source of truth** for all UI implementation in Epics 2.x.

**Aesthetic**: Sleek, modern, dark theme following platform conventions and accessibility standards.

---

## Design Tokens

**File: `theme/tokens.ts`**

```typescript
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
```

---

## Component Specifications

### Message Bubble

| Property | User | Assistant | System |
|----------|------|-----------|--------|
| Background | `colors.surface.userBubble` | `colors.surface.assistantBubble` | `colors.surface.systemBubble` |
| Text Color | `colors.text.primary` | `colors.text.primary` | `colors.text.secondary` |
| Border Radius | `radii.xl` | `radii.xl` | `radii.lg` |
| Padding | `spacing.md` horiz, `spacing.sm` vert | Same | Same |
| Alignment | Right | Left | Center |
| Max Width | 80% | 80% | 90% |
| Timestamp | `typography.fontSize.xs`, `colors.text.secondary` | Same | Same |

```typescript
// File: theme/components/messageBubble.ts

import { colors, typography, spacing, radii } from '../tokens';

export const messageBubbleStyles = {
  user: {
    container: {
      alignSelf: 'flex-end',
      maxWidth: '80%',
      marginLeft: '20%',
    },
    bubble: {
      backgroundColor: colors.surface.userBubble,
      borderRadius: radii.xl,
      borderBottomRightRadius: radii.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    text: {
      color: colors.text.primary,
      fontSize: typography.fontSize.base,
      lineHeight: typography.fontSize.base * typography.lineHeight.normal,
    },
  },
  assistant: {
    container: {
      alignSelf: 'flex-start',
      maxWidth: '80%',
      marginRight: '20%',
    },
    bubble: {
      backgroundColor: colors.surface.assistantBubble,
      borderRadius: radii.xl,
      borderBottomLeftRadius: radii.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    text: {
      color: colors.text.primary,
      fontSize: typography.fontSize.base,
      lineHeight: typography.fontSize.base * typography.lineHeight.normal,
    },
  },
  timestamp: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
};
```

### Composer Row

| Property | Value |
|----------|-------|
| Background | `colors.background.secondary` |
| Border Top | 1px `colors.border.primary` |
| Min Height | `layout.composerMinHeight` |
| Padding | `spacing.sm` |
| Input Background | `colors.background.tertiary` |
| Input Border Radius | `radii.2xl` |
| Button Size | `layout.iconButtonSize` |
| Button Touch Target | 44×44 minimum |

```typescript
// File: theme/components/composer.ts

import { colors, spacing, radii, layout } from '../tokens';

export const composerStyles = {
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.background.secondary,
    borderTopWidth: 1,
    borderTopColor: colors.border.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: layout.composerMinHeight,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background.tertiary,
    borderRadius: radii['2xl'],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.sm,
    color: colors.text.primary,
    fontSize: 16,
    maxHeight: layout.composerMaxHeight,
  },
  iconButton: {
    width: layout.iconButtonSize,
    height: layout.iconButtonSize,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii.full,
  },
  iconButtonActive: {
    backgroundColor: colors.surface.recording,
  },
  sendButton: {
    backgroundColor: colors.accent.primary,
    borderRadius: radii.full,
  },
  sendButtonDisabled: {
    backgroundColor: colors.background.tertiary,
  },
};
```

### Activity Strip

| Property | Value |
|----------|-------|
| Background | `colors.background.secondary` |
| Height | 36px |
| Text | `typography.fontSize.sm`, `colors.text.secondary` |
| Spinner | `colors.accent.primary` |

### Attachment Chip

| Property | Value |
|----------|-------|
| Background | `colors.background.tertiary` |
| Height | `layout.attachmentChipHeight` |
| Border Radius | `radii.lg` |
| Thumbnail Size | 44×44 |
| Remove Button | 24×24, `colors.text.tertiary` |

### Evidence Pill

| Property | Value |
|----------|-------|
| Background | `colors.overlay.medium` |
| Border Radius | `radii.full` |
| Padding | `spacing.xs` horiz, `spacing.sm` vert |
| Text | `typography.fontSize.xs`, `colors.accent.primary` |
| Icon Size | 14 |

### Audio Player

| Property | Value |
|----------|-------|
| Background | `colors.background.tertiary` |
| Border Radius | `radii.lg` |
| Play Button | 40×40, `colors.background.elevated` |
| Progress Bar BG | `colors.border.primary` |
| Progress Bar Fill | `colors.accent.primary` |
| Time Text | `typography.fontSize.xs`, `colors.text.secondary` |

---

## Screen Layout Specifications

### Chat Screen Structure

```
┌─────────────────────────────────────────────┐
│  Status Bar (system)                        │
├─────────────────────────────────────────────┤
│  Activity Strip (conditional)         36px  │
├─────────────────────────────────────────────┤
│                                             │
│                                             │
│  Message List (scrollable)            flex  │
│                                             │
│    ┌────────────────────┐                   │
│    │ Assistant bubble   │                   │
│    └────────────────────┘                   │
│                                             │
│                 ┌───────────────────┐       │
│                 │      User bubble  │       │
│                 └───────────────────┘       │
│                                             │
├─────────────────────────────────────────────┤
│  Pending Attachments Row (conditional) 64px │
├─────────────────────────────────────────────┤
│  Composer Row                         52px+ │
│  [📷] [🎤]  [____input____]      [send]     │
├─────────────────────────────────────────────┤
│  Safe Area Bottom (system)                  │
└─────────────────────────────────────────────┘
```

---

## Icon Specifications

Use **Ionicons** (already included via `@expo/vector-icons`):

| Use Case | Icon Name | Size |
|----------|-----------|------|
| Camera/Photo | `camera-outline` | 24 |
| Microphone | `mic-outline` | 24 |
| Stop Recording | `stop-circle` | 24 |
| Send | `send` | 24 |
| Play Audio | `play` | 24 |
| Pause Audio | `pause` | 24 |
| Remove Attachment | `close-circle` | 20 |
| Attachment (generic) | `attach-outline` | 20 |
| Image Evidence | `image-outline` | 14 |
| Audio Evidence | `volume-medium-outline` | 14 |
| Memory Evidence | `bulb-outline` | 14 |
| Expand Image | `expand-outline` | 24 |
| Close Modal | `close` | 32 |

---

## Accessibility Requirements

| Requirement | Implementation |
|-------------|----------------|
| Minimum touch target | 44×44 points |
| Color contrast ratio | 4.5:1 minimum for text |
| Font scaling | Support Dynamic Type up to 200% |
| Screen reader | All interactive elements have `accessibilityLabel` |
| Reduce motion | Respect `prefers-reduced-motion` |

---

## Theme Export

**File: `theme/index.ts`**

```typescript
export * from './tokens';
export * from './components/messageBubble';
export * from './components/composer';

import { colors, typography, spacing, radii, shadows, animation, layout } from './tokens';

export const theme = {
  colors,
  typography,
  spacing,
  radii,
  shadows,
  animation,
  layout,
} as const;

export type Theme = typeof theme;
```

---

## Test Specifications

**File: `theme/__tests__/tokens.test.ts`**

```typescript
import { colors, typography, spacing, layout } from '../tokens';

describe('Design Tokens', () => {
  describe('colors', () => {
    it('has all required background colors', () => {
      expect(colors.background.primary).toBeDefined();
      expect(colors.background.secondary).toBeDefined();
      expect(colors.background.tertiary).toBeDefined();
    });

    it('has semantic colors', () => {
      expect(colors.semantic.success).toBeDefined();
      expect(colors.semantic.error).toBeDefined();
    });
  });

  describe('typography', () => {
    it('has font size scale', () => {
      expect(typography.fontSize.base).toBe(15);
      expect(typography.fontSize.sm).toBeLessThan(typography.fontSize.base);
      expect(typography.fontSize.lg).toBeGreaterThan(typography.fontSize.base);
    });
  });

  describe('spacing', () => {
    it('follows 4px base unit', () => {
      expect(spacing.xs).toBe(4);
      expect(spacing.sm).toBe(8);
      expect(spacing.md).toBe(12);
    });
  });

  describe('layout', () => {
    it('has minimum touch target size', () => {
      expect(layout.iconButtonSize).toBeGreaterThanOrEqual(44);
    });
  });
});
```

---

## Acceptance Criteria

- [ ] All design tokens defined in `theme/tokens.ts`
- [ ] Component styles reference tokens, not hardcoded values
- [ ] Dark theme applied consistently
- [ ] Minimum 44pt touch targets for interactive elements
- [ ] Color contrast meets WCAG AA (4.5:1)
- [ ] All tests pass

---

## Dependency Update for Epic 2.x

> **Note**: Epics 2.1, 2.2, and 2.3 should import styles from `theme/` rather than defining inline colors. Update component implementations to use design tokens.

---

## Report Template

Create `reports/epic_1_5_report.md`:

```markdown
# Epic 1.5 Completion Report

## Summary
Design system tokens and component specifications implemented.

## Files Created
- [ ] theme/tokens.ts
- [ ] theme/components/messageBubble.ts
- [ ] theme/components/composer.ts
- [ ] theme/index.ts

## Token Categories
- Colors: [count] values
- Typography: [count] values
- Spacing: [count] values

## Test Results
[Jest output]

## Next Steps
Proceed to Epic 2.1, using design tokens for all styling.
```
