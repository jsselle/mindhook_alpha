import { Audio } from 'expo-av';
import { useCallback, useRef, useState } from 'react';
import { insertAttachment } from '../api/deviceWriteApi';
import { saveAttachment } from '../storage/fileManager';
import { AttachmentRow } from '../types/domain';
import { nowMs } from '../utils/time';
import { generateUUID } from '../utils/uuid';

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
