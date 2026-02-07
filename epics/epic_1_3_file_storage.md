# Epic 1.3: File Storage System

| Field | Value |
|-------|-------|
| **Epic** | 1.3 |
| **Name** | File Storage System |
| **Effort** | 0.5 days |
| **Dependencies** | Epic 1.1, 1.2 |
| **Predecessors** | Type definitions, database layer |

---

## Overview

Implement the on-device file storage system for media attachments. Files are stored as raw files (never SQLite blobs), with metadata tracked in the database.

---

## Directory Layout Specification

```
FileSystem.documentDirectory/
├── attachments/
│   ├── images/     # .jpg, .png, .webp
│   ├── audio/      # .m4a, .mp4, .aac, .webm
│   ├── video/      # .mp4, .webm
│   └── files/      # other file types
```

---

## File Naming Convention

- `attachment_id` = UUID v4
- Filename: `{attachment_id}.{ext}`
- Full path stored as `file://` URI in database

---

## Implementation

**File: `src/storage/fileManager.ts`**

```typescript
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
  return `${FileSystem.documentDirectory}${ATTACHMENTS_ROOT}/`;
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
  return await FileSystem.readAsStringAsync(localPath, {
    encoding: FileSystem.EncodingType.Base64,
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
```

**File: `src/storage/index.ts`**

```typescript
export * from './fileManager';
```

---

## Test Specifications

**File: `src/storage/__tests__/fileManager.test.ts`**

```typescript
import {
  getAttachmentsDirectory,
  getTypedDirectory,
  getAttachmentPath,
  getExtensionFromMime,
  getAttachmentTypeFromMime,
  ensureDirectoriesExist,
  saveAttachment,
  deleteAttachment,
} from '../fileManager';
import * as FileSystem from 'expo-file-system';

jest.mock('expo-file-system');

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
```

---

## Acceptance Criteria

- [ ] All 4 type directories created on first use
- [ ] Files saved with correct `{uuid}.{ext}` naming
- [ ] Full `file://` URI stored as local_path
- [ ] saveAttachment is idempotent (overwrites safely)
- [ ] deleteAttachment is idempotent (no error on missing file)
- [ ] All tests pass without device/emulator

---

## Report Template

Create `reports/epic_1_3_report.md`:

```markdown
# Epic 1.3 Completion Report

## Summary
[Description of file storage implementation]

## Directory Structure Verified
- [ ] attachments/images/
- [ ] attachments/audio/
- [ ] attachments/video/
- [ ] attachments/files/

## Test Results
[Jest output]

## Next Steps
Proceed to Epic 1.4: Device APIs
```
