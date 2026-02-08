import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import { insertAttachment } from '../api/deviceWriteApi';
import { getExtensionFromMime, saveAttachment } from '../storage/fileManager';
import { AttachmentRow } from '../types/domain';
import { nowMs } from '../utils/time';
import { generateUUID } from '../utils/uuid';

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
                mediaTypes: ['images'],
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
                mediaTypes: ['images'],
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
