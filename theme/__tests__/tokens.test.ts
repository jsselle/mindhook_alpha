import { colors, layout, spacing, typography } from '../tokens';

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

        it('has all text colors', () => {
            expect(colors.text.primary).toBeDefined();
            expect(colors.text.secondary).toBeDefined();
            expect(colors.text.tertiary).toBeDefined();
            expect(colors.text.inverse).toBeDefined();
        });

        it('has all accent colors', () => {
            expect(colors.accent.primary).toBeDefined();
            expect(colors.accent.secondary).toBeDefined();
            expect(colors.accent.tertiary).toBeDefined();
        });

        it('has all surface colors', () => {
            expect(colors.surface.userBubble).toBeDefined();
            expect(colors.surface.assistantBubble).toBeDefined();
            expect(colors.surface.systemBubble).toBeDefined();
            expect(colors.surface.recording).toBeDefined();
        });

        it('has all border colors', () => {
            expect(colors.border.primary).toBeDefined();
            expect(colors.border.secondary).toBeDefined();
            expect(colors.border.focus).toBeDefined();
        });

        it('has all overlay colors', () => {
            expect(colors.overlay.light).toBeDefined();
            expect(colors.overlay.medium).toBeDefined();
            expect(colors.overlay.dark).toBeDefined();
            expect(colors.overlay.scrim).toBeDefined();
        });
    });

    describe('typography', () => {
        it('has font size scale', () => {
            expect(typography.fontSize.base).toBe(15);
            expect(typography.fontSize.sm).toBeLessThan(typography.fontSize.base);
            expect(typography.fontSize.lg).toBeGreaterThan(typography.fontSize.base);
        });

        it('has all font sizes', () => {
            expect(typography.fontSize.xs).toBe(11);
            expect(typography.fontSize.sm).toBe(13);
            expect(typography.fontSize.md).toBe(17);
            expect(typography.fontSize.lg).toBe(20);
            expect(typography.fontSize.xl).toBe(24);
            expect(typography.fontSize['2xl']).toBe(28);
            expect(typography.fontSize['3xl']).toBe(34);
        });

        it('has font weights', () => {
            expect(typography.fontWeight.regular).toBe('400');
            expect(typography.fontWeight.medium).toBe('500');
            expect(typography.fontWeight.semibold).toBe('600');
            expect(typography.fontWeight.bold).toBe('700');
        });

        it('has line heights', () => {
            expect(typography.lineHeight.tight).toBe(1.2);
            expect(typography.lineHeight.normal).toBe(1.4);
            expect(typography.lineHeight.relaxed).toBe(1.6);
        });

        it('has letter spacing', () => {
            expect(typography.letterSpacing.tight).toBe(-0.5);
            expect(typography.letterSpacing.normal).toBe(0);
            expect(typography.letterSpacing.wide).toBe(0.5);
        });
    });

    describe('spacing', () => {
        it('follows 4px base unit', () => {
            expect(spacing.xs).toBe(4);
            expect(spacing.sm).toBe(8);
            expect(spacing.md).toBe(12);
        });

        it('has all spacing values', () => {
            expect(spacing.lg).toBe(16);
            expect(spacing.xl).toBe(20);
            expect(spacing['2xl']).toBe(24);
            expect(spacing['3xl']).toBe(32);
            expect(spacing['4xl']).toBe(40);
            expect(spacing['5xl']).toBe(48);
        });
    });

    describe('layout', () => {
        it('has minimum touch target size', () => {
            expect(layout.iconButtonSize).toBeGreaterThanOrEqual(44);
        });

        it('has all layout values', () => {
            expect(layout.maxContentWidth).toBe(600);
            expect(layout.headerHeight).toBe(56);
            expect(layout.composerMinHeight).toBe(52);
            expect(layout.composerMaxHeight).toBe(120);
            expect(layout.attachmentChipHeight).toBe(56);
            expect(layout.messageBubbleMaxWidth).toBe('80%');
            expect(layout.inputHeight).toBe(40);
        });
    });
});
