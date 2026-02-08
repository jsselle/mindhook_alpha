// DeviceWriteAPI exports
export {
    insertAttachment,
    insertAttachmentMetadata,
    insertEntityIndex,
    insertMemoryItem,
    insertMessage,
    insertReminder,
    insertReminderEvent,
    linkMessageAttachment,
    logicalDeleteReminder,
    updateReminder,
} from './deviceWriteApi';

// DeviceReadAPI exports
export {
    getAttachmentBundle,
    getReminderById,
    getMessageWithAttachments,
    getRecentMessages,
    listReminderEvents,
    listReminders,
    listUpcomingReminders,
    searchAttachments,
    searchMemory,
} from './deviceReadApi';

// Types
export type { AttachmentBundle } from './deviceReadApi';

