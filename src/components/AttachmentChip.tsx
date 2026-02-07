import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, layout, radii, spacing, typography } from '../../theme/tokens';
import { AttachmentType } from '../types/domain';

interface AttachmentChipProps {
    id: string;
    type: AttachmentType;
    localPath?: string;
    durationMs?: number;
    onRemove: (id: string) => void;
}

const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const AttachmentChip: React.FC<AttachmentChipProps> = ({
    id,
    type,
    localPath,
    durationMs,
    onRemove,
}) => {
    const iconName = type === 'image' ? 'image-outline' : type === 'audio' ? 'mic-outline' : 'document-outline';

    return (
        <View style={styles.container}>
            {type === 'image' && localPath ? (
                <Image source={{ uri: localPath }} style={styles.thumbnail} />
            ) : (
                <View style={styles.iconContainer}>
                    <Ionicons name={iconName} size={20} color={colors.accent.primary} />
                </View>
            )}

            <View style={styles.info}>
                <Text style={styles.typeLabel}>{type.toUpperCase()}</Text>
                {durationMs && (
                    <Text style={styles.duration}>{formatDuration(durationMs)}</Text>
                )}
            </View>

            <TouchableOpacity
                style={styles.removeButton}
                onPress={() => onRemove(id)}
                accessibilityLabel={`Remove ${type}`}
            >
                <Ionicons name="close-circle" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.background.tertiary,
        borderRadius: radii.md,
        padding: spacing.sm,
        marginRight: spacing.sm,
        marginBottom: spacing.sm,
        height: layout.attachmentChipHeight,
    },
    thumbnail: {
        width: 40,
        height: 40,
        borderRadius: radii.sm,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: radii.sm,
        backgroundColor: colors.background.elevated,
        justifyContent: 'center',
        alignItems: 'center',
    },
    info: {
        marginLeft: spacing.sm,
        flex: 1,
    },
    typeLabel: {
        fontSize: typography.fontSize.xs,
        fontWeight: typography.fontWeight.semibold,
        color: colors.text.primary,
    },
    duration: {
        fontSize: typography.fontSize.xs,
        color: colors.text.secondary,
    },
    removeButton: {
        padding: spacing.xs,
    },
});
