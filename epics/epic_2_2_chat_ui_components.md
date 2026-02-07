# Epic 2.2: Chat UI Components

| Field | Value |
|-------|-------|
| **Epic** | 2.2 |
| **Name** | Chat UI Components |
| **Effort** | 0.5 days |
| **Dependencies** | Epic 1.4, 1.5, 2.1 |
| **Predecessors** | Device APIs, design system, media capture hooks |

---

## Overview

Build the core chat screen: scrollable message list, composer row with text input and action buttons. Components **must use design tokens** from `theme/tokens.ts`.

---

## Component Architecture

```
ChatScreen
├── MessageList
│   └── MessageBubble (user | assistant | system)
├── ActivityStrip (status indicator)
└── ComposerRow
    ├── TextInput
    ├── PhotoButton
    ├── VoiceButton
    └── SendButton
```

---

## Implementation

### Message Bubble Component

**File: `src/components/MessageBubble.tsx`**

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Role } from '../types/domain';
import { colors, typography, spacing, radii } from '../theme/tokens';

interface MessageBubbleProps {
  id: string;
  role: Role;
  text: string | null;
  createdAt: number;
  children?: React.ReactNode; // For attachment previews
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  role,
  text,
  createdAt,
  children,
}) => {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  return (
    <View style={[
      styles.container,
      isUser && styles.userContainer,
      isSystem && styles.systemContainer,
    ]}>
      <View style={[
        styles.bubble,
        isUser && styles.userBubble,
        isSystem && styles.systemBubble,
      ]}>
        {text && <Text style={[styles.text, isUser && styles.userText]}>{text}</Text>}
        {children}
        <Text style={styles.timestamp}>
          {new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  systemContainer: {
    justifyContent: 'center',
  },
  bubble: {
    maxWidth: '80%',
    padding: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.surface.assistantBubble,
  },
  userBubble: {
    backgroundColor: colors.surface.userBubble,
    borderBottomRightRadius: radii.sm,
  },
  systemBubble: {
    backgroundColor: colors.surface.systemBubble,
    maxWidth: '90%',
  },
  text: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
  userText: {
    color: colors.text.primary,
  },
  timestamp: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    alignSelf: 'flex-end',
  },
});
```

### Message List Component

**File: `src/components/MessageList.tsx`**

```typescript
import React, { useRef, useEffect } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { MessageBubble } from './MessageBubble';
import { MessageRow, AttachmentRow } from '../types/domain';

export interface DisplayMessage extends MessageRow {
  attachments?: AttachmentRow[];
}

interface MessageListProps {
  messages: DisplayMessage[];
  renderAttachment?: (attachment: AttachmentRow) => React.ReactNode;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  renderAttachment,
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
```

### Composer Row Component

**File: `src/components/ComposerRow.tsx`**

```typescript
import React, { useState, useCallback } from 'react';
import {
  View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, layout, typography } from '../theme/tokens';

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
```

### Activity Strip Component

**File: `src/components/ActivityStrip.tsx`**

```typescript
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

interface ActivityStripProps {
  status: string | null;
  isVisible: boolean;
}

export const ActivityStrip: React.FC<ActivityStripProps> = ({
  status,
  isVisible,
}) => {
  if (!isVisible || !status) return null;

  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color={colors.accent.primary} style={styles.spinner} />
      <Text style={styles.text}>{status}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  spinner: {
    marginRight: spacing.sm,
  },
  text: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
});
```

---

## Test Specifications

**File: `src/components/__tests__/MessageBubble.test.tsx`**

```typescript
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MessageBubble } from '../MessageBubble';

describe('MessageBubble', () => {
  it('renders user message text', () => {
    render(
      <MessageBubble
        id="msg-1"
        role="user"
        text="Hello world"
        createdAt={Date.now()}
      />
    );
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('renders assistant message', () => {
    render(
      <MessageBubble
        id="msg-2"
        role="assistant"
        text="I can help with that"
        createdAt={Date.now()}
      />
    );
    expect(screen.getByText('I can help with that')).toBeTruthy();
  });

  it('renders children (attachments)', () => {
    render(
      <MessageBubble id="msg-3" role="user" text={null} createdAt={Date.now()}>
        <Text>Attachment</Text>
      </MessageBubble>
    );
    expect(screen.getByText('Attachment')).toBeTruthy();
  });
});
```

**File: `src/components/__tests__/ComposerRow.test.tsx`**

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ComposerRow } from '../ComposerRow';

describe('ComposerRow', () => {
  const mockProps = {
    onSend: jest.fn(),
    onPhotoPress: jest.fn(),
    onVoiceStart: jest.fn(),
    onVoiceStop: jest.fn(),
    isRecording: false,
    isSending: false,
  };

  beforeEach(() => jest.clearAllMocks());

  it('calls onSend with text', () => {
    render(<ComposerRow {...mockProps} />);
    
    const input = screen.getByPlaceholderText('Message...');
    fireEvent.changeText(input, 'Test message');
    
    const sendButton = screen.getByLabelText('Send message');
    fireEvent.press(sendButton);
    
    expect(mockProps.onSend).toHaveBeenCalledWith('Test message');
  });

  it('calls onPhotoPress on camera button', () => {
    render(<ComposerRow {...mockProps} />);
    
    const photoButton = screen.getByLabelText('Add photo');
    fireEvent.press(photoButton);
    
    expect(mockProps.onPhotoPress).toHaveBeenCalled();
  });

  it('toggles recording state', () => {
    const { rerender } = render(<ComposerRow {...mockProps} />);
    
    const voiceButton = screen.getByLabelText('Start recording');
    fireEvent.press(voiceButton);
    expect(mockProps.onVoiceStart).toHaveBeenCalled();
    
    rerender(<ComposerRow {...mockProps} isRecording={true} />);
    const stopButton = screen.getByLabelText('Stop recording');
    fireEvent.press(stopButton);
    expect(mockProps.onVoiceStop).toHaveBeenCalled();
  });
});
```

---

## Acceptance Criteria

- [ ] MessageBubble renders user/assistant/system styles
- [ ] MessageList scrolls to bottom on new messages
- [ ] ComposerRow text input clears after send
- [ ] Photo button triggers onPhotoPress
- [ ] Voice button toggles start/stop
- [ ] Send button disabled when empty/sending
- [ ] All tests pass without device

---

## Report Template

Create `reports/epic_2_2_report.md` after completion.
