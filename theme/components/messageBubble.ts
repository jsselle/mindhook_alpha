import { colors, radii, spacing, typography } from '../tokens';

export const messageBubbleStyles = {
    user: {
        container: {
            alignSelf: 'flex-end' as const,
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
            alignSelf: 'flex-start' as const,
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
