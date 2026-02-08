import React, { useMemo, useRef } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, spacing, typography } from "../../theme/tokens";
import { ReminderRow } from "../types/domain";

interface ReminderListItemProps {
  reminder: ReminderRow;
  onEditDate: (reminder: ReminderRow) => void;
  onDelete: (reminder: ReminderRow) => void;
  onSwipeDelete?: (reminder: ReminderRow) => void;
}

const formatLocalDueAt = (dueAt: number): string => {
  return new Date(dueAt).toLocaleString();
};

const SWIPE_THRESHOLD = 100;
const DELETE_ACTION_WIDTH = 80;

export const ReminderListItem: React.FC<ReminderListItemProps> = ({
  reminder,
  onEditDate,
  onDelete,
  onSwipeDelete,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          // Capture horizontal swipe left gestures
          return (
            gestureState.dx < -10 &&
            Math.abs(gestureState.dy) < Math.abs(gestureState.dx)
          );
        },
        // Capture during move phase before parent can claim
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
          return (
            gestureState.dx < -15 &&
            Math.abs(gestureState.dy) < Math.abs(gestureState.dx) * 0.5
          );
        },
        onPanResponderMove: (_, gestureState) => {
          // Only allow negative (left) translation, clamped
          const nextX = Math.max(
            -DELETE_ACTION_WIDTH,
            Math.min(0, gestureState.dx),
          );
          translateX.setValue(nextX);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -SWIPE_THRESHOLD) {
            // Swipe past threshold: delete the item
            Animated.timing(translateX, {
              toValue: -DELETE_ACTION_WIDTH * 2,
              duration: 150,
              useNativeDriver: true,
            }).start(() => {
              if (onSwipeDelete) {
                onSwipeDelete(reminder);
              } else {
                onDelete(reminder);
              }
            });
          } else if (gestureState.dx < -DELETE_ACTION_WIDTH / 2) {
            // Reveal delete button
            Animated.timing(translateX, {
              toValue: -DELETE_ACTION_WIDTH,
              duration: 150,
              useNativeDriver: true,
            }).start();
          } else {
            // Snap back
            Animated.timing(translateX, {
              toValue: 0,
              duration: 150,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [translateX, reminder, onDelete, onSwipeDelete],
  );

  const handleDeletePress = () => {
    Animated.timing(translateX, {
      toValue: -DELETE_ACTION_WIDTH * 2,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      if (onSwipeDelete) {
        onSwipeDelete(reminder);
      } else {
        onDelete(reminder);
      }
    });
  };

  return (
    <View style={styles.container}>
      {/* Delete action behind */}
      <View style={styles.deleteAction}>
        <Pressable onPress={handleDeletePress} style={styles.deleteButton}>
          <Text style={styles.deleteActionText}>Delete</Text>
        </Pressable>
      </View>
      {/* Swipeable card content */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.card, { transform: [{ translateX }] }]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{reminder.title}</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{reminder.status}</Text>
          </View>
        </View>
        <Text style={styles.dueText}>{formatLocalDueAt(reminder.due_at)}</Text>
        <View style={styles.actionsRow}>
          <Pressable
            style={styles.actionButton}
            onPress={() => onEditDate(reminder)}
            accessibilityLabel="Edit reminder date"
          >
            <Text style={styles.editText}>Edit date</Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => onDelete(reminder)}
            accessibilityLabel="Delete reminder"
          >
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 12,
  },
  deleteAction: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: DELETE_ACTION_WIDTH,
    backgroundColor: colors.semantic.error,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButton: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  deleteActionText: {
    color: colors.text.inverse,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  card: {
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: 12,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    flex: 1,
  },
  dueText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    backgroundColor: colors.surface.systemBubble,
    borderWidth: 1,
    borderColor: colors.border.secondary,
  },
  statusText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
    textTransform: "capitalize",
  },
  actionsRow: {
    marginTop: spacing.xs,
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  editText: {
    color: colors.accent.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  deleteText: {
    color: colors.semantic.error,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
});
