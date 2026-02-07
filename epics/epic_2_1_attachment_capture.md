# Epic 2.1: Attachment Capture (Photo & Audio)

| Field | Value |
|-------|-------|
| **Epic** | 2.1 |
| **Name** | Attachment Capture (Photo & Audio) |
| **Effort** | 0.5 days |
| **Dependencies** | Epic 1.1-1.5 |
| **Predecessors** | Device APIs, file storage, design system |

---

## Overview

Implement photo capture (camera/library) and audio recording functionality using Expo APIs. Create reusable hooks for media capture workflows.

---

## Required Dependencies (already installed)

- `expo-image-picker` - Photo/video from camera or library
- `expo-av` - Audio recording/playback

---

## Implementation

### Image Picker Hook

**File: `src/hooks/useImagePicker.ts`**

```typescript
import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { generateUUID } from '../utils/uuid';
import { nowMs } from '../utils/time';
import { saveAttachment, getExtensionFromMime } from '../storage/fileManager';
import { insertAttachment } from '../api/deviceWriteApi';
import { AttachmentRow } from '../types/domain';

interface PendingAttachment {
  id: string;
  type: 'image';
  mime: string;
  localPath: string;
  width: number;
  height: number;
  sizeBytes: number;
}

interface UseImagePickerResult {
  pickFromLibrary: () => Promise<PendingAttachment | null>;
  pickFromCamera: () => Promise<PendingAttachment | null>;
  saveToDatabase: (attachment: PendingAttachment, messageId: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export const useImagePicker = (): UseImagePickerResult => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processResult = useCallback(async (
    result: ImagePicker.ImagePickerResult
  ): Promise<PendingAttachment | null> => {
    if (result.canceled || !result.assets?.[0]) {
      return null;
    }

    const asset = result.assets[0];
    const attachmentId = generateUUID();
    const mime = asset.mimeType || 'image/jpeg';
    const ext = getExtensionFromMime(mime);

    const { localPath, sizeBytes } = await saveAttachment(
      'image',
      attachmentId,
      ext,
      asset.uri
    );

    return {
      id: attachmentId,
      type: 'image',
      mime,
      localPath,
      width: asset.width,
      height: asset.height,
      sizeBytes,
    };
  }, []);

  const pickFromLibrary = useCallback(async (): Promise<PendingAttachment | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Media library permission denied');
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
      });

      return await processResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to pick image');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [processResult]);

  const pickFromCamera = useCallback(async (): Promise<PendingAttachment | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('Camera permission denied');
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
      });

      return await processResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to capture image');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [processResult]);

  const saveToDatabase = useCallback(async (
    attachment: PendingAttachment,
    messageId: string
  ): Promise<void> => {
    // Note: This saves the attachment record only.
    // Caller is responsible for calling linkMessageAttachment()
    // to link the attachment to a message.
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
  }, []);

  return { pickFromLibrary, pickFromCamera, saveToDatabase, isLoading, error };
};
```

### Audio Recorder Hook

**File: `src/hooks/useAudioRecorder.ts`**

```typescript
import { useState, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import { generateUUID } from '../utils/uuid';
import { nowMs } from '../utils/time';
import { saveAttachment } from '../storage/fileManager';
import { insertAttachment } from '../api/deviceWriteApi';
import { AttachmentRow } from '../types/domain';

interface RecordingState {
  isRecording: boolean;
  durationMs: number;
}

interface PendingAudioAttachment {
  id: string;
  type: 'audio';
  mime: string;
  localPath: string;
  durationMs: number;
  sizeBytes: number;
}

interface UseAudioRecorderResult {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<PendingAudioAttachment | null>;
  cancelRecording: () => Promise<void>;
  saveToDatabase: (attachment: PendingAudioAttachment) => Promise<void>;
  state: RecordingState;
  error: string | null;
}

const RECORDING_OPTIONS = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

export const useAudioRecorder = (): UseAudioRecorderResult => {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    durationMs: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = useCallback(async (): Promise<void> => {
    setError(null);

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setError('Audio recording permission denied');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(RECORDING_OPTIONS);
      await recording.startAsync();

      recordingRef.current = recording;
      startTimeRef.current = nowMs();
      setState({ isRecording: true, durationMs: 0 });

      // Update duration periodically
      const interval = setInterval(async () => {
        if (recordingRef.current) {
          const status = await recordingRef.current.getStatusAsync();
          if (status.isRecording) {
            setState(s => ({ ...s, durationMs: status.durationMillis }));
          }
        }
      }, 100);

      // Store interval for cleanup
      (recording as any)._durationInterval = interval;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start recording');
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<PendingAudioAttachment | null> => {
    if (!recordingRef.current) return null;

    try {
      const recording = recordingRef.current;
      clearInterval((recording as any)._durationInterval);

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      const status = await recording.getStatusAsync();

      if (!uri) {
        setError('No recording URI available');
        return null;
      }

      const attachmentId = generateUUID();
      const mime = 'audio/mp4';
      const ext = 'm4a';

      const { localPath, sizeBytes } = await saveAttachment(
        'audio',
        attachmentId,
        ext,
        uri
      );

      recordingRef.current = null;
      setState({ isRecording: false, durationMs: 0 });

      return {
        id: attachmentId,
        type: 'audio',
        mime,
        localPath,
        durationMs: status.durationMillis,
        sizeBytes,
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to stop recording');
      return null;
    }
  }, []);

  const cancelRecording = useCallback(async (): Promise<void> => {
    if (recordingRef.current) {
      clearInterval((recordingRef.current as any)._durationInterval);
      await recordingRef.current.stopAndUnloadAsync();
      recordingRef.current = null;
    }
    setState({ isRecording: false, durationMs: 0 });
  }, []);

  const saveToDatabase = useCallback(async (
    attachment: PendingAudioAttachment
  ): Promise<void> => {
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
  }, []);

  return {
    startRecording,
    stopRecording,
    cancelRecording,
    saveToDatabase,
    state,
    error,
  };
};
```

---

## Mock Files for Testing

**File: `src/__mocks__/expo-image-picker.ts`**

```typescript
export const MediaTypeOptions = {
  Images: 'images',
  Videos: 'videos',
  All: 'all',
};

export const requestMediaLibraryPermissionsAsync = jest.fn().mockResolvedValue({ granted: true });
export const requestCameraPermissionsAsync = jest.fn().mockResolvedValue({ granted: true });

export const launchImageLibraryAsync = jest.fn().mockResolvedValue({
  canceled: false,
  assets: [{
    uri: 'file:///mock/photo.jpg',
    width: 1024,
    height: 768,
    mimeType: 'image/jpeg',
  }],
});

export const launchCameraAsync = jest.fn().mockResolvedValue({
  canceled: false,
  assets: [{
    uri: 'file:///mock/camera.jpg',
    width: 1920,
    height: 1080,
    mimeType: 'image/jpeg',
  }],
});
```

**File: `src/__mocks__/expo-av.ts`**

```typescript
export const Audio = {
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  Recording: jest.fn().mockImplementation(() => ({
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    startAsync: jest.fn().mockResolvedValue(undefined),
    stopAndUnloadAsync: jest.fn().mockResolvedValue(undefined),
    getURI: jest.fn().mockReturnValue('file:///mock/recording.m4a'),
    getStatusAsync: jest.fn().mockResolvedValue({ isRecording: false, durationMillis: 5000 }),
  })),
  IOSOutputFormat: { MPEG4AAC: 'aac' },
  IOSAudioQuality: { HIGH: 'high' },
  AndroidOutputFormat: { MPEG_4: 'mp4' },
  AndroidAudioEncoder: { AAC: 'aac' },
};
```

---

## Test Specifications

**File: `src/hooks/__tests__/useImagePicker.test.ts`**

```typescript
import { renderHook, act } from '@testing-library/react-native';
import { useImagePicker } from '../useImagePicker';
import * as ImagePicker from 'expo-image-picker';

jest.mock('expo-image-picker');
jest.mock('expo-file-system');
jest.mock('expo-sqlite');

describe('useImagePicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('picks image from library', async () => {
    const { result } = renderHook(() => useImagePicker());

    let attachment: any;
    await act(async () => {
      attachment = await result.current.pickFromLibrary();
    });

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
    expect(attachment).toBeTruthy();
    expect(attachment.type).toBe('image');
  });

  it('handles permission denied', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock)
      .mockResolvedValueOnce({ granted: false });

    const { result } = renderHook(() => useImagePicker());

    await act(async () => {
      await result.current.pickFromLibrary();
    });

    expect(result.current.error).toBe('Media library permission denied');
  });

  it('handles user cancellation', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock)
      .mockResolvedValueOnce({ canceled: true });

    const { result } = renderHook(() => useImagePicker());

    let attachment: any;
    await act(async () => {
      attachment = await result.current.pickFromLibrary();
    });

    expect(attachment).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
```

---

## Acceptance Criteria

- [ ] Image picker requests permissions before access
- [ ] Images saved to `attachments/images/` with UUID filename
- [ ] Audio recorder handles start/stop/cancel lifecycle
- [ ] Audio saved to `attachments/audio/` with UUID filename
- [ ] Duration tracked during recording
- [ ] Cancellation cleans up resources
- [ ] All tests pass without device/emulator

---

## Report Template

Create `reports/epic_2_1_report.md` after completion.
