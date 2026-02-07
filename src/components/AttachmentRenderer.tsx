import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import { AttachmentRow } from '../types/domain';
import { AudioPlayer } from './AudioPlayer';
import { ImageThumbnail } from './ImageThumbnail';

interface AttachmentRendererProps {
    attachment: AttachmentRow;
}

export const AttachmentRenderer: React.FC<AttachmentRendererProps> = ({
    attachment,
}) => {
    switch (attachment.type) {
        case 'image':
            return (
                <ImageThumbnail
                    localPath={attachment.local_path}
                    width={attachment.width ?? 200}
                    height={attachment.height ?? 150}
                />
            );

        case 'audio':
            return (
                <AudioPlayer
                    localPath={attachment.local_path}
                    durationMs={attachment.duration_ms ?? 0}
                />
            );

        case 'video':
            // Fallback until video player implemented
            return (
                <View style={styles.placeholder}>
                    <Text style={styles.placeholderText}>Video: {attachment.id}</Text>
                </View>
            );

        default:
            return (
                <View style={styles.placeholder}>
                    <Text style={styles.placeholderText}>File: {attachment.mime}</Text>
                </View>
            );
    }
};

const styles = StyleSheet.create({
    placeholder: {
        padding: spacing.md,
        backgroundColor: colors.background.tertiary,
        borderRadius: radii.md,
    },
    placeholderText: {
        fontSize: typography.fontSize.sm,
        color: colors.text.secondary,
    },
});
