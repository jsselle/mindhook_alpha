import React, { useEffect, useRef } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { AttachmentRow, Citation, MessageRow } from '../types/domain';
import { MessageBubble } from './MessageBubble';

export interface DisplayMessage extends MessageRow {
    attachments?: AttachmentRow[];
    citations?: Citation[];
}

interface MessageListProps {
    messages: DisplayMessage[];
    renderAttachment?: (attachment: AttachmentRow) => React.ReactNode;
    renderCitations?: (citations: Citation[]) => React.ReactNode;
}

export const MessageList: React.FC<MessageListProps> = ({
    messages,
    renderAttachment,
    renderCitations,
}) => {
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        // Scroll to bottom on new messages
        if (messages.length > 0) {
            flatListRef.current?.scrollToEnd({ animated: true });
        }
    }, [messages.length]);

    const renderItem = ({ item }: { item: DisplayMessage }) => (
        <MessageBubble
            id={item.id}
            role={item.role}
            text={item.text}
            createdAt={item.created_at}
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
        </MessageBubble>
    );

    return (
        <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
        />
    );
};

const styles = StyleSheet.create({
    listContent: {
        paddingVertical: 16,
    },
    attachmentWrapper: {
        marginTop: 8,
    },
});
