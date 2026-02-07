import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';
import {
    deleteAttachmentById,
    insertAttachment,
    insertMessage,
    linkMessageAttachment,
} from '../api/deviceWriteApi';
import { ActivityStrip } from '../components/ActivityStrip';
import { AttachmentChip } from '../components/AttachmentChip';
import { AttachmentRenderer } from '../components/AttachmentRenderer';
import { CitationList } from '../components/CitationList';
import { ComposerRow } from '../components/ComposerRow';
import { DisplayMessage, MessageList } from '../components/MessageList';
import { initializeDatabase } from '../db/connection';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useImagePicker } from '../hooks/useImagePicker';
import { ToolCallPayload, useWebSocket } from '../hooks/useWebSocket';
import { deleteAttachment as deleteAttachmentFile } from '../storage/fileManager';
import { executeToolCall } from '../tools/dispatcher';
import { AttachmentRow, Citation } from '../types/domain';
import { nowMs } from '../utils/time';
import { generateUUID } from '../utils/uuid';

export const ChatScreen: React.FC = () => {
    const [messages, setMessages] = useState<DisplayMessage[]>([]);
    const [pendingAttachments, setPendingAttachments] = useState<AttachmentRow[]>([]);
    const [dbReady, setDbReady] = useState(false);
    const [initError, setInitError] = useState<string | null>(null);
    const [retryPayload, setRetryPayload] = useState<{ text: string; attachments: AttachmentRow[] } | null>(null);

    const { status, activityMessage, assistantDraft, error, sendMessage } = useWebSocket();
    const imagePicker = useImagePicker();
    const audioRecorder = useAudioRecorder();

    useEffect(() => {
        let mounted = true;
        const init = async () => {
            try {
                await initializeDatabase();
                if (mounted) {
                    setDbReady(true);
                }
            } catch (e) {
                if (mounted) {
                    setInitError((e as Error).message);
                }
            }
        };
        init();
        return () => {
            mounted = false;
        };
    }, []);

    const handleToolCall = useCallback(async (payload: ToolCallPayload): Promise<unknown> => {
        return executeToolCall(payload.tool, payload.args);
    }, []);

    const runBackend = useCallback(async (text: string, attachments: AttachmentRow[]) => {
        setRetryPayload({ text, attachments });
        const response = await sendMessage(text, attachments, handleToolCall);

        if (response) {
            await insertMessage({
                id: response.message.message_id,
                role: 'assistant',
                text: response.message.text,
                created_at: response.message.created_at,
            });

            setMessages((prev) => [...prev, {
                id: response.message.message_id,
                role: 'assistant',
                text: response.message.text,
                created_at: response.message.created_at,
                citations: response.citations,
            }]);
        }
    }, [sendMessage, handleToolCall]);

    const handleSend = useCallback(async (text: string) => {
        if (!dbReady) return;

        const messageId = generateUUID();
        const createdAt = nowMs();

        await insertMessage({ id: messageId, role: 'user', text, created_at: createdAt });

        const attachmentsToSend = [...pendingAttachments];
        for (let i = 0; i < attachmentsToSend.length; i++) {
            await linkMessageAttachment({
                message_id: messageId,
                attachment_id: attachmentsToSend[i].id,
                position: i,
            });
        }

        setMessages((prev) => [...prev, {
            id: messageId,
            role: 'user',
            text,
            created_at: createdAt,
            attachments: attachmentsToSend,
        }]);
        setPendingAttachments([]);

        try {
            await runBackend(text, attachmentsToSend);
        } catch (e) {
            console.error('Send failed:', e);
        }
    }, [dbReady, pendingAttachments, runBackend]);

    const handlePhotoPress = useCallback(async () => {
        try {
            const attachment = await imagePicker.pickFromLibrary();
            if (attachment) {
                const row: AttachmentRow = {
                    id: attachment.id,
                    type: 'image',
                    mime: attachment.mime,
                    local_path: attachment.localPath,
                    size_bytes: attachment.sizeBytes,
                    duration_ms: null,
                    width: attachment.width,
                    height: attachment.height,
                    created_at: nowMs(),
                };
                await insertAttachment(row);
                setPendingAttachments((prev) => [...prev, row]);
            }
        } catch (e) {
            console.error('Failed to add image attachment:', e);
        }
    }, [imagePicker]);

    const handleVoiceStart = useCallback(() => {
        audioRecorder.startRecording();
    }, [audioRecorder]);

    const handleVoiceStop = useCallback(async () => {
        try {
            const attachment = await audioRecorder.stopRecording();
            if (attachment) {
                const row: AttachmentRow = {
                    id: attachment.id,
                    type: 'audio',
                    mime: attachment.mime,
                    local_path: attachment.localPath,
                    size_bytes: attachment.sizeBytes,
                    duration_ms: attachment.durationMs,
                    width: null,
                    height: null,
                    created_at: nowMs(),
                };
                await insertAttachment(row);
                setPendingAttachments((prev) => [...prev, row]);
            }
        } catch (e) {
            console.error('Failed to add audio attachment:', e);
        }
    }, [audioRecorder]);

    const handleRemoveAttachment = useCallback(async (id: string) => {
        const toRemove = pendingAttachments.find((a) => a.id === id);
        setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
        if (!toRemove) return;

        try {
            await deleteAttachmentFile(toRemove.local_path);
            await deleteAttachmentById(toRemove.id);
        } catch (e) {
            console.error('Failed to remove attachment:', e);
        }
    }, [pendingAttachments]);

    const handleCitationPress = useCallback((citation: Citation) => {
        const source = citation.attachment_id || citation.message_id || citation.memory_item_id || 'unknown';
        Alert.alert('Citation', `Source: ${source}`);
    }, []);

    const displayedMessages = useMemo(() => {
        if (!assistantDraft || status !== 'running') {
            return messages;
        }
        return [
            ...messages,
            {
                id: `draft-${messages.length}`,
                role: 'assistant' as const,
                text: assistantDraft,
                created_at: nowMs(),
            },
        ];
    }, [assistantDraft, messages, status]);

    if (!dbReady && !initError) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="small" color={colors.accent.primary} />
                <Text style={styles.helperText}>Initializing local database...</Text>
            </View>
        );
    }

    if (initError) {
        return (
            <View style={styles.centered}>
                <Text style={styles.errorText}>Database initialization failed: {initError}</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ActivityStrip
                status={activityMessage}
                isVisible={status === 'running' || status === 'connecting'}
            />

            {error && (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorBannerText}>{error}</Text>
                    {retryPayload && (
                        <TouchableOpacity
                            onPress={async () => {
                                try {
                                    await runBackend(retryPayload.text, retryPayload.attachments);
                                } catch (e) {
                                    console.error('Retry failed:', e);
                                }
                            }}
                            accessibilityLabel="Retry message"
                        >
                            <Text style={styles.retryText}>Retry</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            <MessageList
                messages={displayedMessages}
                renderAttachment={(att) => <AttachmentRenderer attachment={att} />}
                renderCitations={(citations) => (
                    <CitationList citations={citations} onCitationPress={handleCitationPress} />
                )}
            />

            {pendingAttachments.length > 0 && (
                <View style={styles.pendingRow}>
                    {pendingAttachments.map((att) => (
                        <AttachmentChip
                            key={att.id}
                            id={att.id}
                            type={att.type}
                            localPath={att.local_path}
                            durationMs={att.duration_ms ?? undefined}
                            onRemove={handleRemoveAttachment}
                        />
                    ))}
                </View>
            )}

            <ComposerRow
                onSend={handleSend}
                onPhotoPress={handlePhotoPress}
                onVoiceStart={handleVoiceStart}
                onVoiceStop={handleVoiceStop}
                isRecording={audioRecorder.state.isRecording}
                isSending={status === 'running'}
                disabled={status === 'connecting' || !dbReady}
            />
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background.primary },
    pendingRow: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.sm },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background.primary,
        gap: spacing.sm,
    },
    helperText: {
        color: colors.text.secondary,
        fontSize: typography.fontSize.sm,
    },
    errorText: {
        color: colors.semantic.error,
        fontSize: typography.fontSize.sm,
        paddingHorizontal: spacing.lg,
    },
    errorBanner: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        backgroundColor: colors.surface.systemBubble,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.primary,
    },
    errorBannerText: {
        color: colors.semantic.error,
        flex: 1,
        marginRight: spacing.sm,
    },
    retryText: {
        color: colors.accent.primary,
        fontWeight: typography.fontWeight.semibold,
    },
});
