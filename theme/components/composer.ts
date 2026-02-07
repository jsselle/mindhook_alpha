import { colors, layout, radii, spacing, typography } from '../tokens';

export const composerStyles = {
    container: {
        flexDirection: 'row' as const,
        alignItems: 'flex-end' as const,
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
        fontSize: typography.fontSize.base,
        maxHeight: layout.composerMaxHeight,
    },
    iconButton: {
        width: layout.iconButtonSize,
        height: layout.iconButtonSize,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
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
