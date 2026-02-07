import * as FileSystem from 'expo-file-system';
import {
    deleteAttachment,
    ensureDirectoriesExist,
    getAttachmentPath,
    getAttachmentsDirectory,
    getAttachmentTypeFromMime,
    getExtensionFromMime,
    getTypedDirectory,
    saveAttachment,
} from '../fileManager';

describe('File Manager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getAttachmentsDirectory', () => {
        it('returns correct base path', () => {
            const dir = getAttachmentsDirectory();
            expect(dir).toBe('file:///mock/documents/attachments/');
        });
    });

    describe('getTypedDirectory', () => {
        it('returns correct path for each type', () => {
            expect(getTypedDirectory('image')).toContain('/images/');
            expect(getTypedDirectory('audio')).toContain('/audio/');
            expect(getTypedDirectory('video')).toContain('/video/');
            expect(getTypedDirectory('file')).toContain('/files/');
        });
    });

    describe('getAttachmentPath', () => {
        it('constructs correct file path', () => {
            const path = getAttachmentPath('image', 'abc-123', 'jpg');
            expect(path).toContain('/images/abc-123.jpg');
        });

        it('handles extension with dot prefix', () => {
            const path = getAttachmentPath('audio', 'xyz-789', '.m4a');
            expect(path).toContain('/audio/xyz-789.m4a');
        });
    });

    describe('getExtensionFromMime', () => {
        it('maps common mime types', () => {
            expect(getExtensionFromMime('image/jpeg')).toBe('jpg');
            expect(getExtensionFromMime('image/png')).toBe('png');
            expect(getExtensionFromMime('audio/mp4')).toBe('m4a');
            expect(getExtensionFromMime('video/mp4')).toBe('mp4');
        });

        it('returns bin for unknown types', () => {
            expect(getExtensionFromMime('application/octet-stream')).toBe('bin');
        });
    });

    describe('getAttachmentTypeFromMime', () => {
        it('categorizes correctly', () => {
            expect(getAttachmentTypeFromMime('image/jpeg')).toBe('image');
            expect(getAttachmentTypeFromMime('audio/webm')).toBe('audio');
            expect(getAttachmentTypeFromMime('video/mp4')).toBe('video');
            expect(getAttachmentTypeFromMime('application/pdf')).toBe('file');
        });
    });

    describe('ensureDirectoriesExist', () => {
        it('creates all type directories', async () => {
            (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

            await ensureDirectoriesExist();

            expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledTimes(4);
        });

        it('skips existing directories', async () => {
            (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

            await ensureDirectoriesExist();

            expect(FileSystem.makeDirectoryAsync).not.toHaveBeenCalled();
        });
    });

    describe('saveAttachment', () => {
        it('copies file and returns path and size', async () => {
            (FileSystem.getInfoAsync as jest.Mock)
                .mockResolvedValueOnce({ exists: true }) // dir check
                .mockResolvedValueOnce({ exists: true }) // dir check
                .mockResolvedValueOnce({ exists: true }) // dir check
                .mockResolvedValueOnce({ exists: true }) // dir check
                .mockResolvedValueOnce({ exists: true, size: 12345 }); // file info

            const result = await saveAttachment('image', 'test-id', 'jpg', 'file:///temp/photo.jpg');

            expect(FileSystem.copyAsync).toHaveBeenCalled();
            expect(result.localPath).toContain('test-id.jpg');
            expect(result.sizeBytes).toBe(12345);
        });
    });

    describe('deleteAttachment', () => {
        it('deletes existing file', async () => {
            (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

            await deleteAttachment('file:///some/path.jpg');

            expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///some/path.jpg', { idempotent: true });
        });

        it('does nothing for non-existent file', async () => {
            (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

            await deleteAttachment('file:///some/path.jpg');

            expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
        });
    });
});
