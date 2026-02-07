import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';

interface EvidencePillProps {
    kind: 'attachment' | 'message' | 'memory';
    label: string;
    metadataKind?: string;
    onPress: () => void;
}

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
    attachment: 'attach-outline',
    message: 'chatbubble-outline',
    memory: 'bulb-outline',
    transcript: 'document-text-outline',
    scene: 'image-outline',
};

export const EvidencePill: React.FC<EvidencePillProps> = ({
    kind,
    label,
    metadataKind,
    onPress,
}) => {
    const iconName = metadataKind ? ICONS[metadataKind] : ICONS[kind];

    return (
        <TouchableOpacity style={styles.pill} onPress={onPress}>
            <Ionicons name={iconName || 'document-outline'} size={14} color={colors.accent.primary} />
            <Text style={styles.label}>{label}</Text>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.overlay.medium,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radii.xl,
        marginRight: spacing.xs,
        marginTop: spacing.xs,
    },
    label: {
        fontSize: typography.fontSize.xs,
        color: colors.accent.primary,
        marginLeft: spacing.xs,
    },
});
