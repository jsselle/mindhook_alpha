import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    FlatList,
    NativeSyntheticEvent,
    NativeScrollEvent,
    PanResponder,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';
import { AttachmentRow, Citation, MessageRow } from '../types/domain';
import { MessageBubble } from './MessageBubble';

export interface DisplayMessage extends MessageRow {
    attachments?: AttachmentRow[];
    citations?: Citation[];
    isActivity?: boolean;
}

interface MessageListProps {
    messages: DisplayMessage[];
    renderAttachment?: (attachment: AttachmentRow) => React.ReactNode;
    renderCitations?: (citations: Citation[]) => React.ReactNode;
    onBottomHoldClear?: () => void;
    inlineError?: {
        message: string;
        targetMessageId: string;
        onRetry?: () => void;
    } | null;
}

export const MessageList: React.FC<MessageListProps> = ({
    messages,
    renderAttachment,
    renderCitations,
    onBottomHoldClear,
    inlineError = null,
}) => {
    const flatListRef = useRef<FlatList>(null);
    const isDraggingRef = useRef(false);
    const isPanActiveRef = useRef(false);
    const contentHeightRef = useRef(0);
    const containerHeightRef = useRef(0);
    const isScrollableRef = useRef(false);
    const isAtBottomRef = useRef(false);
    const panStartPullRef = useRef(0);
    const pullDistanceRef = useRef(0);
    const isClearArmedRef = useRef(false);
    const [pullDistance, setPullDistance] = useState(0);
    const [isClearArmed, setIsClearArmed] = useState(false);

    const AT_BOTTOM_EPSILON_PX = 12;
    const CLEAR_TRIGGER_PX = 72;
    const CLEAR_DISARM_PX = 52;
    const NON_SCROLLABLE_PULL_TRIGGER_PX = 6;
    const CHIP_MAX_TRAVEL_PX = 72;
    const allowClearGesture = Boolean(onBottomHoldClear) && messages.length > 0;

    const resetPullState = () => {
        pullDistanceRef.current = 0;
        isClearArmedRef.current = false;
        setPullDistance(0);
        setIsClearArmed(false);
    };
    const updatePullState = useCallback((nextPullDistance: number) => {
        const clamped = Math.max(0, nextPullDistance);
        pullDistanceRef.current = clamped;
        const nextArmed = isClearArmedRef.current
            ? clamped >= CLEAR_DISARM_PX
            : clamped >= CLEAR_TRIGGER_PX;
        isClearArmedRef.current = nextArmed;
        setPullDistance(clamped);
        setIsClearArmed(nextArmed);
    }, []);
    const triggerClearIfArmed = useCallback(() => {
        if (allowClearGesture && isClearArmedRef.current) {
            onBottomHoldClear?.();
        }
        resetPullState();
    }, [allowClearGesture, onBottomHoldClear]);
    const updateScrollableState = () => {
        isScrollableRef.current = contentHeightRef.current > (containerHeightRef.current + 2);
    };

    useEffect(() => {
        // Scroll to bottom on new messages
        if (messages.length > 0) {
            flatListRef.current?.scrollToEnd({ animated: true });
        }
    }, [messages.length]);

    useEffect(() => {
        if (!allowClearGesture) {
            resetPullState();
        }
    }, [allowClearGesture]);

    const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (!allowClearGesture || !isDraggingRef.current || isPanActiveRef.current) {
            return;
        }

        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        contentHeightRef.current = contentSize.height;
        containerHeightRef.current = layoutMeasurement.height;
        updateScrollableState();

        const maxOffsetY = Math.max(contentSize.height - layoutMeasurement.height, 0);
        const isAtBottom = contentOffset.y >= (maxOffsetY - AT_BOTTOM_EPSILON_PX);
        isAtBottomRef.current = isAtBottom;
        const overscrollPull = Math.max(0, contentOffset.y - maxOffsetY);

        if (isAtBottom && overscrollPull > 0) {
            updatePullState(overscrollPull);
            return;
        }

        resetPullState();
    };

    const handleScrollBeginDrag = () => {
        isDraggingRef.current = true;
        isPanActiveRef.current = false;
        resetPullState();
    };

    const handleScrollEndDrag = () => {
        if (isPanActiveRef.current) {
            return;
        }
        isDraggingRef.current = false;
        triggerClearIfArmed();
    };

    const panResponder = useMemo(() => PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
            if (!allowClearGesture) {
                return false;
            }

            const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
            const canCapture = !isScrollableRef.current || isAtBottomRef.current || pullDistanceRef.current > 0;
            const isUpwardPull = gestureState.dy < 0;
            return canCapture && isVertical && isUpwardPull && Math.abs(gestureState.dy) > NON_SCROLLABLE_PULL_TRIGGER_PX;
        },
        onPanResponderGrant: () => {
            isPanActiveRef.current = true;
            isDraggingRef.current = true;
            panStartPullRef.current = pullDistanceRef.current;
        },
        onPanResponderMove: (_, gestureState) => {
            const nextPull = Math.max(0, panStartPullRef.current - gestureState.dy);
            if (nextPull > 0) {
                updatePullState(nextPull);
                return;
            }
            resetPullState();
        },
        onPanResponderRelease: () => {
            isPanActiveRef.current = false;
            isDraggingRef.current = false;
            triggerClearIfArmed();
        },
        onPanResponderTerminate: () => {
            isPanActiveRef.current = false;
            isDraggingRef.current = false;
            resetPullState();
        },
    }), [allowClearGesture, triggerClearIfArmed, updatePullState]);

    const renderItem = ({ item }: { item: DisplayMessage }) => {
        const shouldRenderInlineError = inlineError?.targetMessageId === item.id;

        return (
            <View>
                <MessageBubble
                    id={item.id}
                    role={item.role}
                    text={item.text}
                    isActivity={item.isActivity}
                >
                    {item.attachments?.map(att => (
                        <View key={att.id} style={styles.attachmentWrapper}>
                            {renderAttachment?.(att)}
                        </View>
                    ))}
                    {item.citations && item.citations.length > 0 && (
                        <View style={styles.attachmentWrapper}>
                            {renderCitations?.(item.citations)}
                        </View>
                    )}
                    {shouldRenderInlineError && (
                        <View style={styles.inlineErrorRow}>
                            <Text style={styles.inlineErrorText}>{inlineError.message}</Text>
                            {inlineError.onRetry && (
                                <Pressable
                                    style={styles.inlineRetryButton}
                                    onPress={inlineError.onRetry}
                                    accessibilityLabel="Retry message"
                                    hitSlop={8}
                                >
                                    <Text style={styles.inlineRetryText}>Retry</Text>
                                </Pressable>
                            )}
                        </View>
                    )}
                </MessageBubble>
            </View>
        );
    };

    return (
        <View
            style={styles.container}
            {...(allowClearGesture ? panResponder.panHandlers : undefined)}
        >
            <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                onScroll={handleScroll}
                onScrollBeginDrag={handleScrollBeginDrag}
                onScrollEndDrag={handleScrollEndDrag}
                overScrollMode="always"
                bounces
                alwaysBounceVertical
                scrollEventThrottle={16}
                onContentSizeChange={(_, height) => {
                    contentHeightRef.current = height;
                    updateScrollableState();
                }}
                onLayout={(event) => {
                    containerHeightRef.current = event.nativeEvent.layout.height;
                    updateScrollableState();
                }}
            />
            {allowClearGesture && pullDistance > 0 && (
                <View
                    pointerEvents="none"
                    style={[
                        styles.bottomHoldChip,
                        {
                            bottom: spacing.md + Math.min(pullDistance, CHIP_MAX_TRAVEL_PX),
                        },
                        isClearArmed && styles.bottomHoldChipArmed,
                    ]}
                >
                    <Text style={[styles.bottomHoldChipText, isClearArmed && styles.bottomHoldChipTextArmed]}>
                        {isClearArmed ? 'Release to clear' : 'Scroll to clear'}
                    </Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    listContent: {
        paddingVertical: 16,
    },
    attachmentWrapper: {
        marginTop: 8,
    },
    inlineErrorRow: {
        marginTop: spacing.sm,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.18)',
        flexDirection: 'row',
        alignItems: 'center',
    },
    inlineErrorText: {
        flex: 1,
        color: colors.semantic.error,
        fontSize: typography.fontSize.sm,
        marginRight: spacing.sm,
    },
    inlineRetryText: {
        color: colors.text.secondary,
        fontWeight: typography.fontWeight.medium,
        fontSize: typography.fontSize.sm,
    },
    inlineRetryButton: {
        minHeight: 34,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: 999,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background.tertiary,
        borderWidth: 1,
        borderColor: colors.border.secondary,
    },
    bottomHoldChip: {
        position: 'absolute',
        alignSelf: 'center',
        backgroundColor: colors.background.tertiary,
        borderWidth: 1,
        borderColor: colors.border.secondary,
        borderRadius: 999,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
    },
    bottomHoldChipText: {
        color: colors.text.secondary,
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium,
    },
    bottomHoldChipArmed: {
        backgroundColor: colors.surface.systemBubble,
        borderColor: colors.accent.primary,
    },
    bottomHoldChipTextArmed: {
        color: colors.accent.primary,
        fontWeight: typography.fontWeight.semibold,
    },
});
