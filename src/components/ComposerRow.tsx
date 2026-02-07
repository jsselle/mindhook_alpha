import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    TextInput, TouchableOpacity,
    View,
} from 'react-native';
import { colors, layout, radii, spacing, typography } from '../../theme/tokens';

interface ComposerRowProps {
    onSend: (text: string) => void;
    onPhotoPress: () => void;
    onVoiceStart: () => void;
    onVoiceStop: () => void;
    isRecording: boolean;
    isSending: boolean;
    disabled?: boolean;
}

export const ComposerRow: React.FC<ComposerRowProps> = ({
    onSend,
    onPhotoPress,
    onVoiceStart,
    onVoiceStop,
    isRecording,
    isSending,
    disabled = false,
}) => {
    const [text, setText] = useState('');

    const handleSend = useCallback(() => {
        const trimmed = text.trim();
        if (trimmed) {
            onSend(trimmed);
            setText('');
        }
    }, [text, onSend]);

    const handleVoicePress = useCallback(() => {
        if (isRecording) {
            onVoiceStop();
        } else {
            onVoiceStart();
        }
    }, [isRecording, onVoiceStart, onVoiceStop]);

    return (
        <View style={styles.container}>
            {/* Photo Button */}
            <TouchableOpacity
                style={styles.iconButton}
                onPress={onPhotoPress}
                disabled={disabled || isSending}
                accessibilityLabel="Add photo"
            >
                <Ionicons name="camera-outline" size={24} color={disabled ? colors.text.tertiary : colors.accent.primary} />
            </TouchableOpacity>

            {/* Voice Button */}
            <TouchableOpacity
                style={[styles.iconButton, isRecording && styles.recordingButton]}
                onPress={handleVoicePress}
                disabled={disabled || isSending}
                accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
            >
                <Ionicons
                    name={isRecording ? 'stop-circle' : 'mic-outline'}
                    size={24}
                    color={isRecording ? colors.semantic.error : colors.accent.primary}
                />
            </TouchableOpacity>

            {/* Text Input */}
            <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder="Message..."
                placeholderTextColor={colors.text.tertiary}
                multiline
                editable={!disabled && !isSending && !isRecording}
            />

            {/* Send Button */}
            <TouchableOpacity
                style={styles.sendButton}
                onPress={handleSend}
                disabled={disabled || isSending || !text.trim()}
                accessibilityLabel="Send message"
            >
                {isSending ? (
                    <ActivityIndicator size="small" color={colors.accent.primary} />
                ) : (
                    <Ionicons
                        name="send"
                        size={24}
                        color={text.trim() ? colors.accent.primary : colors.text.tertiary}
                    />
                )}
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: colors.border.primary,
        backgroundColor: colors.background.secondary,
        minHeight: layout.composerMinHeight,
    },
    iconButton: {
        width: layout.iconButtonSize,
        height: layout.iconButtonSize,
        justifyContent: 'center',
        alignItems: 'center',
    },
    recordingButton: {
        backgroundColor: colors.surface.recording,
        borderRadius: radii.full,
    },
    input: {
        flex: 1,
        minHeight: layout.inputHeight,
        maxHeight: layout.composerMaxHeight,
        marginHorizontal: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        backgroundColor: colors.background.tertiary,
        borderRadius: radii['2xl'],
        fontSize: typography.fontSize.base,
        color: colors.text.primary,
    },
    sendButton: {
        width: layout.iconButtonSize,
        height: layout.iconButtonSize,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
