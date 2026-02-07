// DeviceWriteAPI exports
export {
    insertAttachment, insertAttachmentMetadata, insertEntityIndex, insertMemoryItem, insertMessage, linkMessageAttachment
} from './deviceWriteApi';

// DeviceReadAPI exports
export {
    getAttachmentBundle,
    getMessageWithAttachments,
    getRecentMessages, searchAttachments, searchMemory
} from './deviceReadApi';

// Types
export type { AttachmentBundle } from './deviceReadApi';

