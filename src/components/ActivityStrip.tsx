import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';

interface ActivityStripProps {
    status: string | null;
    isVisible: boolean;
}

export const ActivityStrip: React.FC<ActivityStripProps> = ({
    status,
    isVisible,
}) => {
    if (!isVisible || !status) return null;

    return (
        <View style={styles.container}>
            <ActivityIndicator size="small" color={colors.accent.primary} style={styles.spinner} />
            <Text style={styles.text}>{status}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        backgroundColor: colors.background.secondary,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.primary,
    },
    spinner: {
        marginRight: spacing.sm,
    },
    text: {
        fontSize: typography.fontSize.sm,
        color: colors.text.secondary,
    },
});
