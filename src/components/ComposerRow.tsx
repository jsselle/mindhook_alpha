import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    StyleSheet,
    Text,
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
    recordingDurationMs?: number;
    attachmentCount?: number;
    isSending: boolean;
    disabled?: boolean;
    draftText?: string | null;
}

export const ComposerRow: React.FC<ComposerRowProps> = ({
    onSend,
    onPhotoPress,
    onVoiceStart,
    onVoiceStop,
    isRecording,
    recordingDurationMs = 0,
    attachmentCount = 0,
    isSending,
    disabled = false,
    draftText = null,
}) => {
    const [text, setText] = useState('');
    const lastAppliedDraftRef = useRef<string | null>(null);

    useEffect(() => {
        if (draftText == null) return;
        if (lastAppliedDraftRef.current === draftText) return;
        lastAppliedDraftRef.current = draftText;
        setText(draftText);
    }, [draftText]);

    const handleSend = useCallback(() => {
        const trimmed = text.trim();
        if (trimmed || attachmentCount > 0) {
            onSend(trimmed);
            setText('');
        }
    }, [text, onSend, attachmentCount]);

    const handleVoicePress = useCallback(() => {
        if (isRecording) {
            onVoiceStop();
        } else {
            onVoiceStart();
        }
    }, [isRecording, onVoiceStart, onVoiceStop]);

    const formatDuration = useCallback((durationMs: number): string => {
        const totalSeconds = Math.floor(durationMs / 1000);
        const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');
        return `${minutes}:${seconds}`;
    }, []);

    return (
        <View style={styles.wrapper}>
            {isRecording && (
                <View style={styles.recordingIndicator}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingText}>
                        Recording {formatDuration(recordingDurationMs)} - tap mic to stop
                    </Text>
                </View>
            )}

            <View style={styles.container}>
                {/* Photo Button */}
                <TouchableOpacity
                    style={styles.iconButton}
                    onPress={onPhotoPress}
                    disabled={disabled}
                    accessibilityLabel="Add photo"
                >
                    <Ionicons name="camera-outline" size={24} color={disabled ? colors.text.tertiary : colors.accent.primary} />
                    {attachmentCount > 0 && (
                        <View style={styles.attachmentCountBadge}>
                            <Text style={styles.attachmentCountText}>
                                {attachmentCount > 9 ? '9+' : attachmentCount}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>

                {/* Voice Button */}
                <TouchableOpacity
                    style={[styles.iconButton, isRecording && styles.recordingButton]}
                    onPress={handleVoicePress}
                    disabled={disabled}
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
                    editable={!disabled && !isRecording}
                />

                {/* Send Button */}
                <TouchableOpacity
                    style={styles.sendButton}
                    onPress={handleSend}
                    disabled={disabled || (!text.trim() && attachmentCount === 0)}
                    accessibilityLabel="Send message"
                    accessibilityHint={isSending ? 'Message will be queued while the assistant is responding' : undefined}
                >
                    <Ionicons
                        name="send"
                        size={24}
                        color={text.trim() || attachmentCount > 0 ? colors.accent.primary : colors.text.tertiary}
                    />
                </TouchableOpacity>
            </View>

        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        borderTopWidth: 1,
        borderTopColor: colors.border.primary,
        backgroundColor: colors.background.secondary,
    },
    container: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        minHeight: layout.composerMinHeight,
    },
    recordingIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: spacing.sm,
        marginTop: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: radii.full,
        backgroundColor: colors.surface.recording,
    },
    recordingDot: {
        width: 8,
        height: 8,
        borderRadius: radii.full,
        marginRight: spacing.sm,
        backgroundColor: colors.semantic.error,
    },
    recordingText: {
        flex: 1,
        color: colors.text.primary,
        fontSize: typography.fontSize.sm,
        padding: 0,
    },
    iconButton: {
        width: layout.iconButtonSize,
        height: layout.iconButtonSize,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    attachmentCountBadge: {
        position: 'absolute',
        top: 2,
        right: 2,
        minWidth: 14,
        height: 14,
        paddingHorizontal: 3,
        borderRadius: radii.full,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.semantic.error,
    },
    attachmentCountText: {
        color: colors.background.primary,
        fontSize: 9,
        fontWeight: typography.fontWeight.bold,
        lineHeight: 10,
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
