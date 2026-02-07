import * as FileSystem from 'expo-file-system';
import { AttachmentType } from '../types/domain';

const ATTACHMENTS_ROOT = 'attachments';

const TYPE_FOLDERS: Record<AttachmentType, string> = {
    image: 'images',
    audio: 'audio',
    video: 'video',
    file: 'files',
};

export const getAttachmentsDirectory = (): string => {
    const documentDirectory = (FileSystem as unknown as { documentDirectory?: string }).documentDirectory || '';
    return `${documentDirectory}${ATTACHMENTS_ROOT}/`;
};

export const getTypedDirectory = (type: AttachmentType): string => {
    return `${getAttachmentsDirectory()}${TYPE_FOLDERS[type]}/`;
};

export const getAttachmentPath = (type: AttachmentType, attachmentId: string, extension: string): string => {
    const filename = `${attachmentId}.${extension.replace(/^\./, '')}`;
    return `${getTypedDirectory(type)}${filename}`;
};

export const ensureDirectoriesExist = async (): Promise<void> => {
    const types: AttachmentType[] = ['image', 'audio', 'video', 'file'];

    for (const type of types) {
        const dir = getTypedDirectory(type);
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) {
            await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        }
    }
};

export const saveAttachment = async (
    type: AttachmentType,
    attachmentId: string,
    extension: string,
    sourceUri: string
): Promise<{ localPath: string; sizeBytes: number }> => {
    await ensureDirectoriesExist();

    const destPath = getAttachmentPath(type, attachmentId, extension);

    // Copy from source (camera roll, temp file, etc.) to our storage
    await FileSystem.copyAsync({
        from: sourceUri,
        to: destPath,
    });

    const info = await FileSystem.getInfoAsync(destPath);
    const sizeBytes = info.exists && 'size' in info ? info.size : 0;

    return {
        localPath: destPath,
        sizeBytes,
    };
};

export const deleteAttachment = async (localPath: string): Promise<void> => {
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists) {
        await FileSystem.deleteAsync(localPath, { idempotent: true });
    }
};

export const readAttachmentAsBase64 = async (localPath: string): Promise<string> => {
    const encodingType = (
        FileSystem as unknown as { EncodingType?: { Base64: 'base64' } }
    ).EncodingType;
    return await FileSystem.readAsStringAsync(localPath, {
        encoding: encodingType ? encodingType.Base64 : 'base64',
    });
};

export const getExtensionFromMime = (mime: string): string => {
    const mimeToExt: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'audio/mp4': 'm4a',
        'audio/m4a': 'm4a',
        'audio/aac': 'aac',
        'audio/webm': 'webm',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
    };
    return mimeToExt[mime] || 'bin';
};

export const getAttachmentTypeFromMime = (mime: string): AttachmentType => {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'video';
    return 'file';
};
