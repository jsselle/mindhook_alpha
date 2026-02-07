export * from './components/composer';
export * from './components/messageBubble';
export * from './tokens';

import { animation, colors, layout, radii, shadows, spacing, typography } from './tokens';

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
