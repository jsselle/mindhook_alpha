import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';
import { ReminderRow } from '../types/domain';

interface ReminderListItemProps {
    reminder: ReminderRow;
    onEditDate: (reminder: ReminderRow) => void;
    onDelete: (reminder: ReminderRow) => void;
}

const formatLocalDueAt = (dueAt: number): string => {
    return new Date(dueAt).toLocaleString();
};

export const ReminderListItem: React.FC<ReminderListItemProps> = ({
    reminder,
    onEditDate,
    onDelete,
}) => {
    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <Text style={styles.title}>{reminder.title}</Text>
                <View style={styles.statusPill}>
                    <Text style={styles.statusText}>{reminder.status}</Text>
                </View>
            </View>
            <Text style={styles.dueText}>{formatLocalDueAt(reminder.due_at)}</Text>
            <View style={styles.actionsRow}>
                <Pressable
                    style={styles.actionButton}
                    onPress={() => onEditDate(reminder)}
                    accessibilityLabel="Edit reminder date"
                >
                    <Text style={styles.editText}>Edit date</Text>
                </Pressable>
                <Pressable
                    style={styles.actionButton}
                    onPress={() => onDelete(reminder)}
                    accessibilityLabel="Delete reminder"
                >
                    <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.background.tertiary,
        borderWidth: 1,
        borderColor: colors.border.primary,
        borderRadius: 12,
        padding: spacing.sm,
        gap: spacing.xs,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
    },
    title: {
        color: colors.text.primary,
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.semibold,
        flex: 1,
    },
    dueText: {
        color: colors.text.secondary,
        fontSize: typography.fontSize.xs,
    },
    statusPill: {
        borderRadius: 999,
        paddingHorizontal: spacing.xs,
        paddingVertical: 2,
        backgroundColor: colors.surface.systemBubble,
        borderWidth: 1,
        borderColor: colors.border.secondary,
    },
    statusText: {
        color: colors.text.secondary,
        fontSize: typography.fontSize.xs,
        textTransform: 'capitalize',
    },
    actionsRow: {
        marginTop: spacing.xs,
        flexDirection: 'row',
        gap: spacing.sm,
    },
    actionButton: {
        borderRadius: 8,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        backgroundColor: colors.background.secondary,
        borderWidth: 1,
        borderColor: colors.border.primary,
    },
    editText: {
        color: colors.accent.primary,
        fontSize: typography.fontSize.xs,
        fontWeight: typography.fontWeight.medium,
    },
    deleteText: {
        color: colors.semantic.error,
        fontSize: typography.fontSize.xs,
        fontWeight: typography.fontWeight.medium,
    },
});
