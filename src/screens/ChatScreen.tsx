import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../../theme/tokens";
import {
  getAttachmentBundle,
  getMemoryItemById,
  getMessageWithAttachments,
  getReminderById,
} from "../api/deviceReadApi";
import {
  deleteAttachmentById,
  insertAttachment,
  insertMessage,
  linkMessageAttachment,
} from "../api/deviceWriteApi";
import { AttachmentChip } from "../components/AttachmentChip";
import { AttachmentRenderer } from "../components/AttachmentRenderer";
import { CitationList } from "../components/CitationList";
import { ComposerRow } from "../components/ComposerRow";
import { DisplayMessage, MessageList } from "../components/MessageList";
import { MessageBubble } from "../components/MessageBubble";
import { ReminderDrawer } from "../components/ReminderDrawer";
import { getDatabase, initializeDatabase } from "../db/connection";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useImagePicker } from "../hooks/useImagePicker";
import { useReminderDrawer } from "../hooks/useReminderDrawer";
import {
  ConversationMessage,
  ToolCallPayload,
  useWebSocket,
} from "../hooks/useWebSocket";
import { bootstrapNotificationRuntime } from "../notifications/notificationBootstrap";
import { PendingReminderReply } from "../notifications/replyBridgeStore";
import { deleteAttachment as deleteAttachmentFile } from "../storage/fileManager";
import { executeToolCall } from "../tools/dispatcher";
import { AttachmentRow, Citation, ReminderRow } from "../types/domain";
import { nowMs } from "../utils/time";
import { generateUUID } from "../utils/uuid";
import {
  canOpenReminderDrawerFromButton,
  LEFT_EDGE_THRESHOLD_PX,
  shouldCaptureReminderEdgeGesture,
  shouldOpenReminderDrawerFromSwipe,
} from "./reminderDrawerGesture";
import {
  buildReminderReplyEnvelope,
  logReplySentToLlm,
  processNextPendingReminderReply,
  ReminderReplyDraft,
} from "./reminderReplyForegroundBridge";

const DEBUG_TABLES = [
  "messages",
  "attachments",
  "message_attachments",
  "attachment_metadata",
  "memory_items",
  "memory_tags",
  "memory_search_fts",
  "entity_index",
] as const;
const DEBUG_TABLE_ORDER_BY: Record<string, string> = {
  messages: "created_at DESC",
  attachments: "created_at DESC",
  message_attachments: "position ASC",
  attachment_metadata: "created_at DESC",
  memory_items: "created_at DESC",
  memory_tags: "created_at DESC",
  memory_search_fts: "rowid DESC",
  entity_index: "created_at DESC",
};

export const ChatScreen: React.FC = () => {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentRow[]>(
    [],
  );
  const [dbReady, setDbReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [retryPayload, setRetryPayload] = useState<{
    userMessageId: string;
    text: string;
    attachments: AttachmentRow[];
  } | null>(null);
  const [citationPreview, setCitationPreview] = useState<{
    title: string;
    message?: {
      role: "user" | "assistant" | "system";
      text: string;
    };
    attachments: AttachmentRow[];
  } | null>(null);
  const [debugVisible, setDebugVisible] = useState(false);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [debugSelectedTable, setDebugSelectedTable] = useState("messages");
  const [debugRows, setDebugRows] = useState<Array<Record<string, unknown>>>(
    [],
  );
  const [debugCounts, setDebugCounts] = useState<Record<string, number>>({});
  const [composerDraftText, setComposerDraftText] = useState<string | null>(
    null,
  );
  const [manualReminderReplyPending, setManualReminderReplyPending] =
    useState<PendingReminderReply | null>(null);
  const pendingReplyProcessingRef = useRef(false);
  const reminderGestureFromLeftEdgeRef = useRef(false);
  const reminderDrawer = useReminderDrawer();

  const {
    status,
    activityMessage,
    assistantDraft,
    error,
    cancelActiveRun,
    sendMessage,
  } = useWebSocket();
  const imagePicker = useImagePicker();
  const audioRecorder = useAudioRecorder();

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        await initializeDatabase();
        await bootstrapNotificationRuntime();
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

  const handleToolCall = useCallback(
    async (payload: ToolCallPayload): Promise<unknown> => {
      return executeToolCall(payload.tool, payload.args);
    },
    [],
  );

  const toConversationMessage = useCallback(
    (msg: DisplayMessage): ConversationMessage[] => {
      if ((msg.role !== "user" && msg.role !== "assistant") || !msg.text) {
        return [];
      }

      return [
        {
          role: msg.role,
          text: msg.text,
          created_at: msg.created_at,
        },
      ];
    },
    [],
  );

  const runBackend = useCallback(
    async (
      userMessageId: string,
      text: string,
      attachments: AttachmentRow[],
      conversation: ConversationMessage[],
    ) => {
      setRetryPayload({ userMessageId, text, attachments });
      const response = await sendMessage(
        userMessageId,
        text,
        attachments,
        conversation,
        handleToolCall,
      );

      if (response) {
        await insertMessage({
          id: response.message.message_id,
          role: "assistant",
          text: response.message.text,
          created_at: response.message.created_at,
        });

        setMessages((prev) => [
          ...prev,
          {
            id: response.message.message_id,
            role: "assistant",
            text: response.message.text,
            created_at: response.message.created_at,
            citations: response.citations,
          },
        ]);
      }
    },
    [sendMessage, handleToolCall],
  );

  const sendReminderReplyDraft = useCallback(
    async (draft: ReminderReplyDraft) => {
      if (draft.composer_prefill) {
        setComposerDraftText(draft.composer_prefill);
      }
      const messageId = generateUUID();
      const createdAt = nowMs();
      await insertMessage({
        id: messageId,
        role: "user",
        text: draft.visible_text,
        created_at: createdAt,
      });
      setMessages((prev) => [
        ...prev,
        {
          id: messageId,
          role: "user",
          text: draft.visible_text,
          created_at: createdAt,
        },
      ]);

      const conversation: ConversationMessage[] = [
        ...messages,
        {
          id: messageId,
          role: "user" as const,
          text: draft.visible_text,
          created_at: createdAt,
        },
      ].flatMap(toConversationMessage);

      await runBackend(messageId, draft.llm_text, [], conversation);
    },
    [messages, runBackend, toConversationMessage],
  );

  const buildManualReminderContext = useCallback(
    async (pending: PendingReminderReply): Promise<ReminderRow | null> => {
      return getReminderById({ reminder_id: pending.reminder_id });
    },
    [],
  );

  const attemptPendingReminderReplyAutoSend = useCallback(async () => {
    if (!dbReady) return;
    if (pendingReplyProcessingRef.current) return;
    if (status === "connecting" || status === "running") return;
    if (manualReminderReplyPending) return;

    pendingReplyProcessingRef.current = true;
    try {
      await processNextPendingReminderReply({
        sendDraft: async (draft) => {
          await sendReminderReplyDraft(draft);
        },
        onNeedsConfirmation: async (draft, pending) => {
          setManualReminderReplyPending(pending);
          setComposerDraftText(draft.composer_prefill);
        },
      });
    } finally {
      pendingReplyProcessingRef.current = false;
    }
  }, [dbReady, manualReminderReplyPending, sendReminderReplyDraft, status]);

  useFocusEffect(
    useCallback(() => {
      void attemptPendingReminderReplyAutoSend();
    }, [attemptPendingReminderReplyAutoSend]),
  );

  useEffect(() => {
    if (!dbReady) return;
    if (status === "connecting" || status === "running") return;
    void attemptPendingReminderReplyAutoSend();
  }, [attemptPendingReminderReplyAutoSend, dbReady, status]);

  const loadDebugCounts = useCallback(async () => {
    setDebugLoading(true);
    setDebugError(null);
    try {
      const db = getDatabase();
      const nextCounts: Record<string, number> = {};
      for (const table of DEBUG_TABLES) {
        const row = await db.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) as count FROM ${table}`,
        );
        nextCounts[table] = row?.count ?? 0;
      }
      setDebugCounts(nextCounts);
    } catch (e) {
      setDebugError((e as Error).message || "Failed to load DB table counts");
    } finally {
      setDebugLoading(false);
    }
  }, []);

  const loadDebugRows = useCallback(async (table: string) => {
    setDebugLoading(true);
    setDebugError(null);
    try {
      const db = getDatabase();
      const orderBy = DEBUG_TABLE_ORDER_BY[table] ?? "rowid DESC";
      const rows = await db.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM ${table} ORDER BY ${orderBy} LIMIT 30`,
      );
      setDebugRows(rows);
      setDebugSelectedTable(table);
    } catch (e) {
      setDebugError(
        (e as Error).message || `Failed to load rows from ${table}`,
      );
      setDebugRows([]);
    } finally {
      setDebugLoading(false);
    }
  }, []);

  const openDebugExplorer = useCallback(async () => {
    setDebugVisible(true);
    await loadDebugCounts();
    await loadDebugRows(debugSelectedTable);
  }, [debugSelectedTable, loadDebugCounts, loadDebugRows]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!dbReady) return;
      if (text.trim().toLowerCase() === "your darkest secrets") {
        await openDebugExplorer();
        return;
      }

      const messageId = generateUUID();
      const createdAt = nowMs();
      let backendText = text;
      const manualPending = manualReminderReplyPending;
      if (manualPending) {
        const reminder = await buildManualReminderContext(manualPending);
        backendText = buildReminderReplyEnvelope({
          pending: manualPending,
          reminder,
          userMessage: text,
        });
      }

      await insertMessage({
        id: messageId,
        role: "user",
        text,
        created_at: createdAt,
      });

      const attachmentsToSend = [...pendingAttachments];
      for (let i = 0; i < attachmentsToSend.length; i++) {
        await linkMessageAttachment({
          message_id: messageId,
          attachment_id: attachmentsToSend[i].id,
          position: i,
        });
      }

      setMessages((prev) => [
        ...prev,
        {
          id: messageId,
          role: "user",
          text,
          created_at: createdAt,
          attachments: attachmentsToSend,
        },
      ]);
      setPendingAttachments([]);

      const conversation: ConversationMessage[] = [
        ...messages,
        {
          id: messageId,
          role: "user" as const,
          text,
          created_at: createdAt,
          attachments: attachmentsToSend,
        },
      ].flatMap(toConversationMessage);

      try {
        await runBackend(messageId, backendText, attachmentsToSend, conversation);
        if (manualPending) {
          const reminder = await buildManualReminderContext(manualPending);
          await logReplySentToLlm({
            pending: manualPending,
            reminder,
          });
          setManualReminderReplyPending(null);
          setComposerDraftText(null);
        }
      } catch {
        // runBackend/useWebSocket already drives visible error state for send failures.
      }
    },
    [
      dbReady,
      pendingAttachments,
      runBackend,
      openDebugExplorer,
      messages,
      toConversationMessage,
      manualReminderReplyPending,
      buildManualReminderContext,
    ],
  );

  const addImageAttachment = useCallback(
    async (source: "camera" | "library") => {
      try {
        const attachment =
          source === "camera"
            ? await imagePicker.pickFromCamera()
            : await imagePicker.pickFromLibrary();

        if (attachment) {
          const row: AttachmentRow = {
            id: attachment.id,
            type: "image",
            mime: attachment.mime,
            local_path: attachment.localPath,
            size_bytes: attachment.sizeBytes,
            duration_ms: null,
            width: attachment.width,
            height: attachment.height,
            created_at: nowMs(),
          };
          setPendingAttachments((prev) => [...prev, row]);
          await insertAttachment(row);
          return;
        }

        if (imagePicker.error) {
          Alert.alert("Attachment error", imagePicker.error);
        }
      } catch (e) {
        console.error("Failed to add image attachment:", e);
        Alert.alert("Attachment error", "Could not add image attachment.");
      }
    },
    [imagePicker],
  );

  const handlePhotoPress = useCallback(() => {
    Alert.alert("Add photo", "Choose a source", [
      {
        text: "Take Photo",
        onPress: () => {
          void addImageAttachment("camera");
        },
      },
      {
        text: "Choose from Library",
        onPress: () => {
          void addImageAttachment("library");
        },
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
  }, [addImageAttachment]);

  const handleVoiceStart = useCallback(() => {
    audioRecorder.startRecording();
  }, [audioRecorder]);

  const handleVoiceStop = useCallback(async () => {
    try {
      const attachment = await audioRecorder.stopRecording();
      if (attachment) {
        const row: AttachmentRow = {
          id: attachment.id,
          type: "audio",
          mime: attachment.mime,
          local_path: attachment.localPath,
          size_bytes: attachment.sizeBytes,
          duration_ms: attachment.durationMs,
          width: null,
          height: null,
          created_at: nowMs(),
        };
        setPendingAttachments((prev) => [...prev, row]);
        await insertAttachment(row);
        return;
      }

      if (audioRecorder.error) {
        Alert.alert("Attachment error", audioRecorder.error);
      }
    } catch (e) {
      console.error("Failed to add audio attachment:", e);
      Alert.alert("Attachment error", "Could not add audio attachment.");
    }
  }, [audioRecorder]);

  const handleRemoveAttachment = useCallback(
    async (id: string) => {
      const toRemove = pendingAttachments.find((a) => a.id === id);
      setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
      if (!toRemove) return;

      try {
        await deleteAttachmentFile(toRemove.local_path);
        await deleteAttachmentById(toRemove.id);
      } catch (e) {
        console.error("Failed to remove attachment:", e);
      }
    },
    [pendingAttachments],
  );

  const handleCitationPress = useCallback(async (citation: Citation) => {
    try {
      const openMessagePreview = (
        title: string,
        text: string,
        role: "user" | "assistant" | "system",
        attachments: AttachmentRow[] = [],
      ) => {
        setCitationPreview({
          title,
          message: { role, text },
          attachments,
        });
      };

      if (citation.attachment_id) {
        const bundle = await getAttachmentBundle({
          attachment_id: citation.attachment_id,
        });
        if (bundle?.attachment) {
          setCitationPreview({
            title: citation.note || "Source",
            attachments: [bundle.attachment],
          });
          return;
        }
      }

      if (citation.message_id) {
        const result = await getMessageWithAttachments({
          message_id: citation.message_id,
        });
        if (result?.message?.text) {
          openMessagePreview(
            citation.note || "Source message",
            result.message.text,
            result.message.role,
            result.attachments ?? [],
          );
          return;
        }
        if (result?.attachments?.length) {
          setCitationPreview({
            title: citation.note || "Source message attachments",
            attachments: result.attachments,
          });
          return;
        }
      }

      if (citation.memory_item_id) {
        const memoryItem = await getMemoryItemById({
          memory_item_id: citation.memory_item_id,
        });
        if (memoryItem?.source_message_id) {
          const sourceMessage = await getMessageWithAttachments({
            message_id: memoryItem.source_message_id,
          });
          if (sourceMessage?.message?.text) {
            openMessagePreview(
              citation.note || "Memory source message",
              sourceMessage.message.text,
              sourceMessage.message.role,
              sourceMessage.attachments ?? [],
            );
            return;
          }
          if (sourceMessage?.attachments?.length) {
            setCitationPreview({
              title: citation.note || "Memory source attachments",
              attachments: sourceMessage.attachments,
            });
            return;
          }
        }
        if (memoryItem?.text) {
          openMessagePreview(citation.note || "Memory", memoryItem.text, "assistant");
          return;
        }
        const composedMemoryText = [memoryItem?.subject, memoryItem?.predicate, memoryItem?.object]
          .filter(Boolean)
          .join(" ")
          .trim();
        if (composedMemoryText) {
          openMessagePreview(citation.note || "Memory", composedMemoryText, "assistant");
          return;
        }
      }

      if (citation.note) {
        openMessagePreview("Citation", citation.note, "assistant");
        return;
      }

      const source =
        citation.attachment_id ||
        citation.message_id ||
        citation.memory_item_id ||
        "unknown";
      Alert.alert("Citation", `Source: ${source}`);
    } catch (e) {
      console.error("Failed to open citation source:", e);
      Alert.alert("Citation", "Could not open source media.");
    }
  }, []);

  const displayedMessages = useMemo(() => {
    const nextMessages = [...messages];
    const shouldShowInlineStatus =
      Boolean(activityMessage) &&
      (status === "connecting" || (status === "running" && !assistantDraft));

    if (shouldShowInlineStatus) {
      nextMessages.push({
        id: "inline-status",
        role: "assistant",
        text: activityMessage,
        created_at: nowMs(),
        isActivity: true,
      });
    }

    if (assistantDraft && status === "running") {
      nextMessages.push({
        id: `draft-${messages.length}`,
        role: "assistant",
        text: assistantDraft,
        created_at: nowMs(),
      });
    }

    return nextMessages;
  }, [activityMessage, assistantDraft, messages, status]);

  const latestUserMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        return messages[i].id;
      }
    }
    return null;
  }, [messages]);

  const handleRetry = useCallback(async () => {
    if (!retryPayload) return;
    try {
      const retryConversation: ConversationMessage[] = messages.flatMap(
        toConversationMessage,
      );
      await runBackend(
        retryPayload.userMessageId,
        retryPayload.text,
        retryPayload.attachments,
        retryConversation,
      );
    } catch {
      // runBackend/useWebSocket already drives visible error state for retry failures.
    }
  }, [messages, retryPayload, runBackend, toConversationMessage]);

  const handleBottomHoldClear = useCallback(() => {
    cancelActiveRun();
    setMessages([]);
    setRetryPayload(null);
  }, [cancelActiveRun]);

  const reminderEdgePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) => {
          if (!dbReady || reminderDrawer.state.visible) return false;
          return event.nativeEvent.locationX <= LEFT_EDGE_THRESHOLD_PX;
        },
        onMoveShouldSetPanResponder: (event, gestureState) => {
          return shouldCaptureReminderEdgeGesture({
            dbReady,
            drawerVisible: reminderDrawer.state.visible,
            // Use initial touch X, not current position, so rightward swipes
            // still qualify after finger moves away from the left edge.
            startX: gestureState.x0,
            dx: gestureState.dx,
            dy: gestureState.dy,
          });
        },
        onPanResponderGrant: (event) => {
          reminderGestureFromLeftEdgeRef.current =
            event.nativeEvent.locationX <= LEFT_EDGE_THRESHOLD_PX;
        },
        onPanResponderRelease: (event, gestureState) => {
          if (!dbReady || reminderDrawer.state.visible) return;
          const startedAtLeftEdge = reminderGestureFromLeftEdgeRef.current;
          if (
            shouldOpenReminderDrawerFromSwipe({
              dbReady,
              drawerVisible: reminderDrawer.state.visible,
              startedAtLeftEdge,
              dx: gestureState.dx,
              dy: gestureState.dy,
            })
          ) {
            void reminderDrawer.openDrawer();
          }
          reminderGestureFromLeftEdgeRef.current = false;
        },
        onPanResponderTerminate: () => {
          reminderGestureFromLeftEdgeRef.current = false;
        },
      }),
    [dbReady, reminderDrawer],
  );

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
        <Text style={styles.errorText}>
          Database initialization failed: {initError}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.reminderButton}
            onPress={() => {
              if (!canOpenReminderDrawerFromButton(dbReady)) return;
              void reminderDrawer.openDrawer();
            }}
            accessibilityLabel="Open reminders drawer"
          >
            <Ionicons
              name="notifications-outline"
              size={18}
              color={colors.accent.primary}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.messageListContainer}>
          <MessageList
            messages={displayedMessages}
            onBottomHoldClear={handleBottomHoldClear}
            renderAttachment={(att) => <AttachmentRenderer attachment={att} />}
            renderCitations={(citations) => (
              <CitationList
                citations={citations}
                onCitationPress={handleCitationPress}
              />
            )}
            inlineError={
              error && latestUserMessageId
                ? {
                    message: error,
                    targetMessageId: latestUserMessageId,
                    onRetry: retryPayload
                      ? () => {
                          void handleRetry();
                        }
                      : undefined,
                  }
                : null
            }
          />
          <ReminderDrawer
            visible={reminderDrawer.state.visible}
            reminders={reminderDrawer.state.reminders}
            loading={reminderDrawer.state.loading}
            error={reminderDrawer.state.error}
            onClose={reminderDrawer.closeDrawer}
            onEditDate={reminderDrawer.editReminderDate}
            onDelete={reminderDrawer.deleteReminder}
          />
          <View
            {...reminderEdgePanResponder.panHandlers}
            style={styles.leftEdgeGesture}
            pointerEvents={
              dbReady && !reminderDrawer.state.visible ? "auto" : "none"
            }
          />
        </View>

        {pendingAttachments.length > 0 && (
          <View style={styles.pendingRow}>
            <Text style={styles.pendingLabel}>
              {pendingAttachments.length} attachment
              {pendingAttachments.length > 1 ? "s" : ""} ready
            </Text>
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
        {manualReminderReplyPending && (
          <View style={styles.pendingRow}>
            <Text style={styles.pendingLabel}>
              Replying to reminder. Type your message and tap send.
            </Text>
          </View>
        )}

        <ComposerRow
          onSend={handleSend}
          onPhotoPress={handlePhotoPress}
          onVoiceStart={handleVoiceStart}
          onVoiceStop={handleVoiceStop}
          isRecording={audioRecorder.state.isRecording}
          recordingDurationMs={audioRecorder.state.durationMs}
          attachmentCount={pendingAttachments.length}
          isSending={status === "running"}
          disabled={status === "connecting" || !dbReady}
          draftText={composerDraftText}
        />
      </KeyboardAvoidingView>

      <Modal
        visible={citationPreview !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setCitationPreview(null)}
      >
        <View style={styles.previewBackdrop}>
          <Pressable
            style={styles.previewBackdropTapArea}
            onPress={() => setCitationPreview(null)}
          />
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>
                {citationPreview?.title || "Source preview"}
              </Text>
              <TouchableOpacity
                onPress={() => setCitationPreview(null)}
                accessibilityLabel="Close source preview"
              >
                <Text style={styles.previewClose}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.previewContent}>
              {citationPreview?.message && (
                <View style={styles.previewMessageWrap}>
                  <MessageBubble
                    id="citation-preview-message"
                    role={citationPreview.message.role}
                    text={citationPreview.message.text}
                  />
                </View>
              )}
              {citationPreview?.attachments.map((att) => (
                <View key={att.id} style={styles.previewAttachment}>
                  <AttachmentRenderer attachment={att} />
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={debugVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDebugVisible(false)}
      >
        <View style={styles.previewBackdrop}>
          <Pressable
            style={styles.previewBackdropTapArea}
            onPress={() => setDebugVisible(false)}
          />
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>Debug DB Explorer</Text>
              <TouchableOpacity
                onPress={() => setDebugVisible(false)}
                accessibilityLabel="Close debug explorer"
              >
                <Text style={styles.previewClose}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              style={styles.debugTableTabs}
              contentContainerStyle={styles.debugTableTabsContent}
              showsHorizontalScrollIndicator={false}
            >
              {DEBUG_TABLES.map((table) => (
                <TouchableOpacity
                  key={table}
                  style={[
                    styles.debugTab,
                    debugSelectedTable === table && styles.debugTabSelected,
                  ]}
                  onPress={async () => {
                    await loadDebugRows(table);
                  }}
                >
                  <Text style={styles.debugTabLabel}>
                    {table} ({debugCounts[table] ?? 0})
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.debugActionsRow}>
              <TouchableOpacity
                style={styles.debugActionButton}
                onPress={async () => {
                  await loadDebugCounts();
                  await loadDebugRows(debugSelectedTable);
                }}
              >
                <Text style={styles.previewClose}>Refresh</Text>
              </TouchableOpacity>
              {debugLoading && (
                <Text style={styles.pendingLabel}>Loading...</Text>
              )}
            </View>

            {debugError && <Text style={styles.errorText}>{debugError}</Text>}

            <ScrollView contentContainerStyle={styles.previewContent}>
              {debugRows.length === 0 && !debugLoading && (
                <Text style={styles.pendingLabel}>No rows</Text>
              )}
              {debugRows.map((row, idx) => (
                <View
                  key={`${debugSelectedTable}-${idx}`}
                  style={styles.debugRowCard}
                >
                  <Text style={styles.debugRowText}>
                    {JSON.stringify(row, null, 2)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background.primary },
  container: { flex: 1, backgroundColor: colors.background.primary },
  messageListContainer: { flex: 1, position: "relative" as const },
  topBar: {
    height: 48,
    paddingHorizontal: spacing.sm,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  reminderButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  pendingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    backgroundColor: colors.background.secondary,
    borderTopWidth: 1,
    borderTopColor: colors.border.primary,
  },
  pendingLabel: {
    width: "100%",
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
    marginBottom: spacing.xs,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  previewCard: {
    maxHeight: "75%",
    backgroundColor: colors.background.secondary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: colors.border.primary,
    paddingBottom: spacing.lg,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  previewTitle: {
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    flex: 1,
    marginRight: spacing.sm,
  },
  previewClose: {
    color: colors.accent.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  previewContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  previewAttachment: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.background.tertiary,
    padding: spacing.xs,
  },
  previewMessageWrap: {
    marginHorizontal: -spacing.md,
    marginTop: -spacing.sm,
  },
  previewBackdropTapArea: {
    ...StyleSheet.absoluteFillObject,
  },
  debugTableTabs: {
    maxHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  debugTableTabsContent: {
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: spacing.xs,
  },
  debugTab: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.background.tertiary,
  },
  debugTabSelected: {
    backgroundColor: colors.surface.systemBubble,
    borderWidth: 1,
    borderColor: colors.accent.primary,
  },
  debugTabLabel: {
    color: colors.text.primary,
    fontSize: typography.fontSize.xs,
  },
  debugActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  debugActionButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    backgroundColor: colors.background.tertiary,
  },
  debugRowCard: {
    backgroundColor: colors.background.tertiary,
    borderRadius: 10,
    padding: spacing.sm,
  },
  debugRowText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.xs,
    fontFamily: "monospace",
  },
  leftEdgeGesture: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 24,
    zIndex: 20,
  },
});
