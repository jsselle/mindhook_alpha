# Epic 2.3: Attachment Preview Components

| Field | Value |
|-------|-------|
| **Epic** | 2.3 |
| **Name** | Attachment Preview Components |
| **Effort** | 0.5 days |
| **Dependencies** | Epic 1.5, 2.1, 2.2 |
| **Predecessors** | Design system, media capture, chat UI |

---

## Overview

Create UI components for displaying attachment previews: pending attachment chips, inline image thumbnails, and audio mini-player. Components **must use design tokens** from `theme/tokens.ts`.

---

## Component Specifications

### Pending Attachment Chip

Displayed in composer area before message is sent.

**File: `src/components/AttachmentChip.tsx`**

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AttachmentType } from '../types/domain';
import { colors, spacing, radii, typography, layout } from '../theme/tokens';

interface AttachmentChipProps {
  id: string;
  type: AttachmentType;
  localPath?: string;
  durationMs?: number;
  onRemove: (id: string) => void;
}

const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const AttachmentChip: React.FC<AttachmentChipProps> = ({
  id,
  type,
  localPath,
  durationMs,
  onRemove,
}) => {
  const iconName = type === 'image' ? 'image-outline' : type === 'audio' ? 'mic-outline' : 'document-outline';

  return (
    <View style={styles.container}>
      {type === 'image' && localPath ? (
        <Image source={{ uri: localPath }} style={styles.thumbnail} />
      ) : (
        <View style={styles.iconContainer}>
          <Ionicons name={iconName} size={20} color={colors.accent.primary} />
        </View>
      )}
      
      <View style={styles.info}>
        <Text style={styles.typeLabel}>{type.toUpperCase()}</Text>
        {durationMs && (
          <Text style={styles.duration}>{formatDuration(durationMs)}</Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => onRemove(id)}
        accessibilityLabel={`Remove ${type}`}
      >
        <Ionicons name="close-circle" size={20} color={colors.text.secondary} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    height: layout.attachmentChipHeight,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.background.elevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  typeLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  duration: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  removeButton: {
    padding: spacing.xs,
  },
});
```

### Image Thumbnail (Inline in Message)

**File: `src/components/ImageThumbnail.tsx`**

```typescript
import React, { useState } from 'react';
import { Image, TouchableOpacity, StyleSheet, Modal, View, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ImageThumbnailProps {
  localPath: string;
  width?: number;
  height?: number;
}

export const ImageThumbnail: React.FC<ImageThumbnailProps> = ({
  localPath,
  width = 200,
  height = 150,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;

  return (
    <>
      <TouchableOpacity onPress={() => setIsFullscreen(true)}>
        <Image
          source={{ uri: localPath }}
          style={[styles.thumbnail, { width, height }]}
          resizeMode="cover"
        />
      </TouchableOpacity>

      <Modal
        visible={isFullscreen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsFullscreen(false)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setIsFullscreen(false)}
          >
            <Ionicons name="close" size={32} color="#FFF" />
          </TouchableOpacity>
          <Image
            source={{ uri: localPath }}
            style={{ width: screenWidth, height: screenHeight * 0.8 }}
            resizeMode="contain"
          />
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  thumbnail: {
    borderRadius: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
});
```

### Audio Mini-Player (Inline in Message)

**File: `src/components/AudioPlayer.tsx`**

```typescript
import React, { useState, useEffect, useRef } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, typography } from '../theme/tokens';

interface AudioPlayerProps {
  localPath: string;
  durationMs?: number;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  localPath,
  durationMs = 0,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [totalDuration, setTotalDuration] = useState(durationMs);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setPositionMs(status.positionMillis);
      setIsPlaying(status.isPlaying);
      if (status.durationMillis) {
        setTotalDuration(status.durationMillis);
      }
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPositionMs(0);
        soundRef.current?.setPositionAsync(0);
      }
    }
  };

  const togglePlayback = async () => {
    try {
      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync(
          { uri: localPath },
          { shouldPlay: true },
          onPlaybackStatusUpdate
        );
        soundRef.current = sound;
        setIsPlaying(true);
      } else if (isPlaying) {
        await soundRef.current.pauseAsync();
      } else {
        await soundRef.current.playAsync();
      }
    } catch (error) {
      console.error('Playback error:', error);
    }
  };

  const progress = totalDuration > 0 ? (positionMs / totalDuration) * 100 : 0;

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={togglePlayback} style={styles.playButton}>
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={24}
          color={colors.accent.primary}
        />
      </TouchableOpacity>

      <View style={styles.progressContainer}>
        <View style={styles.progressBackground}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.time}>{formatTime(positionMs)}</Text>
          <Text style={styles.time}>{formatTime(totalDuration)}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    borderRadius: radii.md,
    padding: spacing.sm,
    minWidth: 200,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.background.elevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    flex: 1,
    marginLeft: spacing.md,
  },
  progressBackground: {
    height: 4,
    backgroundColor: colors.border.primary,
    borderRadius: radii.xs,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent.primary,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  time: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
});
```

---

## Attachment Renderer Factory

**File: `src/components/AttachmentRenderer.tsx`**

```typescript
import React from 'react';
import { AttachmentRow } from '../types/domain';
import { ImageThumbnail } from './ImageThumbnail';
import { AudioPlayer } from './AudioPlayer';
import { View, Text, StyleSheet } from 'react-native';

interface AttachmentRendererProps {
  attachment: AttachmentRow;
}

export const AttachmentRenderer: React.FC<AttachmentRendererProps> = ({
  attachment,
}) => {
  switch (attachment.type) {
    case 'image':
      return (
        <ImageThumbnail
          localPath={attachment.local_path}
          width={attachment.width ?? 200}
          height={attachment.height ?? 150}
        />
      );

    case 'audio':
      return (
        <AudioPlayer
          localPath={attachment.local_path}
          durationMs={attachment.duration_ms ?? 0}
        />
      );

    case 'video':
      // Fallback until video player implemented
      return (
        <View style={styles.placeholder}>
          <Text>Video: {attachment.id}</Text>
        </View>
      );

    default:
      return (
        <View style={styles.placeholder}>
          <Text>File: {attachment.mime}</Text>
        </View>
      );
  }
};

const styles = StyleSheet.create({
  placeholder: {
    padding: 12,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
  },
});
```

---

## Test Specifications

**File: `src/components/__tests__/AttachmentChip.test.tsx`**

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { AttachmentChip } from '../AttachmentChip';

describe('AttachmentChip', () => {
  it('displays type label', () => {
    render(
      <AttachmentChip id="a1" type="audio" onRemove={jest.fn()} />
    );
    expect(screen.getByText('AUDIO')).toBeTruthy();
  });

  it('displays duration for audio', () => {
    render(
      <AttachmentChip id="a1" type="audio" durationMs={65000} onRemove={jest.fn()} />
    );
    expect(screen.getByText('1:05')).toBeTruthy();
  });

  it('calls onRemove with id', () => {
    const onRemove = jest.fn();
    render(
      <AttachmentChip id="att-123" type="image" onRemove={onRemove} />
    );
    
    fireEvent.press(screen.getByLabelText('Remove image'));
    expect(onRemove).toHaveBeenCalledWith('att-123');
  });
});
```

---

## Acceptance Criteria

- [ ] AttachmentChip shows type icon and optional duration
- [ ] AttachmentChip remove button calls callback with ID
- [ ] ImageThumbnail shows preview and expands to fullscreen
- [ ] AudioPlayer plays/pauses audio with progress bar
- [ ] AttachmentRenderer routes to correct component by type
- [ ] All tests pass without device

---

## Report Template

Create `reports/epic_2_3_report.md` after completion.
