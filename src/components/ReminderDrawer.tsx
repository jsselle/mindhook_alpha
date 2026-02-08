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
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { colors, spacing, typography } from "../../theme/tokens";
import { ReminderRow } from "../types/domain";
import { ReminderListItem } from "./ReminderListItem";

interface ReminderDrawerProps {
  visible: boolean;
  reminders: ReminderRow[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onEditDate: (args: { reminder: ReminderRow; dueAt: number }) => Promise<void>;
  onDelete: (reminder: ReminderRow) => Promise<void>;
}

interface EditState {
  reminder: ReminderRow;
  dueAt: Date;
}

const DRAWER_WIDTH_RATIO = 0.86;
const DRAWER_MAX_WIDTH = 420;
const SWIPE_CLOSE_THRESHOLD = 80;

const pad2 = (value: number): string => String(value).padStart(2, "0");

const toDateText = (value: Date): string => {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
};

const toTimeText = (value: Date): string => {
  return `${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
};

const buildEditState = (reminder: ReminderRow): EditState => {
  return {
    reminder,
    dueAt: new Date(reminder.due_at),
  };
};

let DateTimePickerComponent: React.ComponentType<{
  value: Date;
  mode: "date" | "time";
  display?: "default" | "spinner" | "inline" | "compact" | "clock" | "calendar";
  is24Hour?: boolean;
  onChange: (
    event: { type?: "set" | "dismissed" | "neutralButtonPressed" },
    value?: Date,
  ) => void;
}> | null = null;

try {
  // Optional dependency in this workspace due offline npm cache restrictions.
  DateTimePickerComponent =
    require("@react-native-community/datetimepicker").default;
} catch {
  DateTimePickerComponent = null;
}

export const ReminderDrawer: React.FC<ReminderDrawerProps> = ({
  visible,
  reminders,
  loading,
  error,
  onClose,
  onEditDate,
  onDelete,
}) => {
  const { width: screenWidth } = useWindowDimensions();
  const drawerWidth = Math.min(
    screenWidth * DRAWER_WIDTH_RATIO,
    DRAWER_MAX_WIDTH,
  );
  const translateX = useRef(new Animated.Value(-drawerWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [editState, setEditState] = useState<EditState | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [androidPickerMode, setAndroidPickerMode] = useState<
    "date" | "time" | null
  >(null);

  const emptyLabel = useMemo(() => {
    if (loading) return "Loading reminders...";
    return "No active reminders.";
  }, [loading]);

  // Animate drawer in/out based on visible prop
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -drawerWidth,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, drawerWidth, translateX, backdropOpacity]);

  // PanResponder for drag-to-close gesture on drawer
  const drawerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          // Only capture horizontal left-swipe gestures
          return (
            gestureState.dx < -10 &&
            Math.abs(gestureState.dy) < Math.abs(gestureState.dx)
          );
        },
        onPanResponderMove: (_, gestureState) => {
          // Clamp translation: can only drag left (negative), max to -drawerWidth
          const nextX = Math.max(-drawerWidth, Math.min(0, gestureState.dx));
          translateX.setValue(nextX);
          // Fade backdrop as drawer moves out
          const progress = 1 + nextX / drawerWidth;
          backdropOpacity.setValue(progress);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -SWIPE_CLOSE_THRESHOLD) {
            // Close drawer
            Animated.parallel([
              Animated.timing(translateX, {
                toValue: -drawerWidth,
                duration: 150,
                useNativeDriver: true,
              }),
              Animated.timing(backdropOpacity, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
              }),
            ]).start(() => onClose());
          } else {
            // Snap back open
            Animated.parallel([
              Animated.timing(translateX, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
              }),
              Animated.timing(backdropOpacity, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true,
              }),
            ]).start();
          }
        },
      }),
    [drawerWidth, translateX, backdropOpacity, onClose],
  );

  const handleDelete = useCallback(
    (reminder: ReminderRow) => {
      Alert.alert(
        "Delete reminder?",
        "This will cancel local notifications and keep a deleted record in local history.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              void (async () => {
                setPendingId(reminder.id);
                try {
                  await onDelete(reminder);
                } catch {
                  Alert.alert(
                    "Delete failed",
                    "Could not delete this reminder.",
                  );
                } finally {
                  setPendingId(null);
                }
              })();
            },
          },
        ],
      );
    },
    [onDelete],
  );

  const handleSwipeDelete = useCallback(
    (reminder: ReminderRow) => {
      void (async () => {
        setPendingId(reminder.id);
        try {
          await onDelete(reminder);
        } catch {
          Alert.alert("Delete failed", "Could not delete this reminder.");
        } finally {
          setPendingId(null);
        }
      })();
    },
    [onDelete],
  );

  const handleSaveDate = () => {
    if (!editState) return;
    const dueAt = editState.dueAt.getTime();

    void (async () => {
      setPendingId(editState.reminder.id);
      try {
        await onEditDate({ reminder: editState.reminder, dueAt });
        setEditState(null);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Could not update reminder date.";
        Alert.alert("Update failed", message);
      } finally {
        setPendingId(null);
      }
    })();
  };

  if (!visible) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents={visible ? "auto" : "none"}
      >
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityLabel="Close reminders drawer"
        />
      </Animated.View>

      {/* Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          {
            width: drawerWidth,
            transform: [{ translateX }],
          },
        ]}
      >
        {/* Header with drag gesture */}
        <View {...drawerPanResponder.panHandlers} style={styles.header}>
          <Text style={styles.title}>Reminders</Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityLabel="Close reminders drawer"
          >
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
        {error && <Text style={styles.errorText}>{error}</Text>}
        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.accent.primary} />
          </View>
        )}
        {/* Content area - no drawer gesture, allows item swipes */}
        <ScrollView contentContainerStyle={styles.content}>
          {reminders.length === 0 && (
            <Text style={styles.emptyText}>{emptyLabel}</Text>
          )}
          {reminders.map((reminder) => (
            <View
              key={reminder.id}
              style={pendingId === reminder.id ? styles.pendingCard : undefined}
            >
              <ReminderListItem
                reminder={reminder}
                onEditDate={() => {
                  setEditState(buildEditState(reminder));
                }}
                onDelete={handleDelete}
                onSwipeDelete={handleSwipeDelete}
              />
            </View>
          ))}
        </ScrollView>
        {/* Right edge drag handle for closing drawer */}
        <View
          {...drawerPanResponder.panHandlers}
          style={styles.rightEdgeDragHandle}
        />
      </Animated.View>

      {/* Edit Date Modal */}
      <Modal
        visible={editState !== null}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setAndroidPickerMode(null);
          setEditState(null);
        }}
      >
        <View style={styles.editBackdrop}>
          <View style={styles.editCard}>
            <Text style={styles.editTitle}>Edit reminder date</Text>
            <Text style={styles.pickerSummary}>
              {editState
                ? `${toDateText(editState.dueAt)} ${toTimeText(editState.dueAt)}`
                : ""}
            </Text>
            {DateTimePickerComponent ? (
              <>
                {Platform.OS === "ios" && editState && (
                  <View style={styles.iosPickers}>
                    <DateTimePickerComponent
                      value={editState.dueAt}
                      mode="date"
                      display="inline"
                      onChange={(_, selectedDate) => {
                        if (!selectedDate) return;
                        setEditState((prev) => {
                          if (!prev) return prev;
                          const next = new Date(prev.dueAt);
                          next.setFullYear(
                            selectedDate.getFullYear(),
                            selectedDate.getMonth(),
                            selectedDate.getDate(),
                          );
                          return { ...prev, dueAt: next };
                        });
                      }}
                    />
                    <DateTimePickerComponent
                      value={editState.dueAt}
                      mode="time"
                      display="spinner"
                      is24Hour
                      onChange={(_, selectedTime) => {
                        if (!selectedTime) return;
                        setEditState((prev) => {
                          if (!prev) return prev;
                          const next = new Date(prev.dueAt);
                          next.setHours(
                            selectedTime.getHours(),
                            selectedTime.getMinutes(),
                            0,
                            0,
                          );
                          return { ...prev, dueAt: next };
                        });
                      }}
                    />
                  </View>
                )}
                {Platform.OS !== "ios" && (
                  <View style={styles.androidPickerActions}>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => setAndroidPickerMode("date")}
                    >
                      <Text style={styles.editButtonText}>Pick date</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => setAndroidPickerMode("time")}
                    >
                      <Text style={styles.editButtonText}>Pick time</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {Platform.OS !== "ios" && androidPickerMode && editState && (
                  <DateTimePickerComponent
                    value={editState.dueAt}
                    mode={androidPickerMode}
                    display="default"
                    is24Hour
                    onChange={(event, selectedValue) => {
                      setAndroidPickerMode(null);
                      if (event.type !== "set" || !selectedValue) return;
                      setEditState((prev) => {
                        if (!prev) return prev;
                        const next = new Date(prev.dueAt);
                        if (androidPickerMode === "date") {
                          next.setFullYear(
                            selectedValue.getFullYear(),
                            selectedValue.getMonth(),
                            selectedValue.getDate(),
                          );
                        } else {
                          next.setHours(
                            selectedValue.getHours(),
                            selectedValue.getMinutes(),
                            0,
                            0,
                          );
                        }
                        return { ...prev, dueAt: next };
                      });
                    }}
                  />
                )}
              </>
            ) : (
              <Text style={styles.fallbackText}>
                Native date/time picker package is not installed in this
                workspace yet.
              </Text>
            )}
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => {
                  setAndroidPickerMode(null);
                  setEditState(null);
                }}
              >
                <Text style={styles.editButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editButton}
                onPress={handleSaveDate}
              >
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    zIndex: 100,
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.background.secondary,
    borderRightWidth: 1,
    borderRightColor: colors.border.primary,
    paddingTop: spacing.xl,
    zIndex: 101,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: colors.text.primary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
  },
  closeText: {
    color: colors.accent.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  content: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  loadingRow: {
    paddingTop: spacing.md,
    alignItems: "center",
  },
  emptyText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
  },
  errorText: {
    color: colors.semantic.error,
    fontSize: typography.fontSize.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  pendingCard: {
    opacity: 0.55,
  },
  editBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  editCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.background.secondary,
    padding: spacing.md,
    gap: spacing.sm,
  },
  editTitle: {
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  pickerSummary: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
  },
  iosPickers: {
    borderRadius: 10,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.primary,
    overflow: "hidden",
  },
  androidPickerActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  fallbackText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
  },
  editActions: {
    marginTop: spacing.sm,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  editButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  editButtonText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
  },
  saveText: {
    color: colors.accent.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  rightEdgeDragHandle: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 20,
    backgroundColor: "transparent",
  },
});
