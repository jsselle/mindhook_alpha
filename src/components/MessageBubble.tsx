import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import { Role } from '../types/domain';

interface MessageBubbleProps {
    id: string;
    role: Role;
    text: string | null;
    createdAt: number;
    children?: React.ReactNode; // For attachment previews
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
    role,
    text,
    createdAt,
    children,
}) => {
    const isUser = role === 'user';
    const isSystem = role === 'system';

    return (
        <View style={[
            styles.container,
            isUser && styles.userContainer,
            isSystem && styles.systemContainer,
        ]}>
            <View style={[
                styles.bubble,
                isUser && styles.userBubble,
                isSystem && styles.systemBubble,
            ]}>
                {text && <Text style={[styles.text, isUser && styles.userText]}>{text}</Text>}
                {children}
                <Text style={styles.timestamp}>
                    {new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        flexDirection: 'row',
        justifyContent: 'flex-start',
    },
    userContainer: {
        justifyContent: 'flex-end',
    },
    systemContainer: {
        justifyContent: 'center',
    },
    bubble: {
        maxWidth: '80%',
        padding: spacing.md,
        borderRadius: radii.xl,
        backgroundColor: colors.surface.assistantBubble,
    },
    userBubble: {
        backgroundColor: colors.surface.userBubble,
        borderBottomRightRadius: radii.sm,
    },
    systemBubble: {
        backgroundColor: colors.surface.systemBubble,
        maxWidth: '90%',
    },
    text: {
        fontSize: typography.fontSize.base,
        color: colors.text.primary,
    },
    userText: {
        color: colors.text.primary,
    },
    timestamp: {
        fontSize: typography.fontSize.xs,
        color: colors.text.secondary,
        marginTop: spacing.xs,
        alignSelf: 'flex-end',
    },
});
