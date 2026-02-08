type Listener<T> = (event: T) => void;

const receivedListeners: Listener<Notification>[] = [];
const responseListeners: Listener<NotificationResponse>[] = [];
let scheduledCounter = 0;
let scheduledNotifications: Array<{ identifier: string; content: unknown; trigger: unknown }> = [];

export const AndroidImportance = {
    DEFAULT: 3,
    HIGH: 4,
};

export const AndroidNotificationVisibility = {
    PUBLIC: 1,
};

export const SchedulableTriggerInputTypes = {
    DATE: 'date',
};

export interface Notification {
    request: {
        content: {
            data?: unknown;
        };
    };
}

export interface NotificationResponse {
    actionIdentifier: string;
    notification: Notification;
    userText?: string;
}

export interface NotificationAction {
    identifier: string;
    buttonTitle: string;
    options?: {
        isDestructive?: boolean;
        opensAppToForeground?: boolean;
    };
    textInput?: {
        submitButtonTitle?: string;
        placeholder?: string;
    };
}

export const requestPermissionsAsync = jest.fn(async () => ({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
}));

export const setNotificationHandler = jest.fn();
export const setNotificationChannelAsync = jest.fn(async () => undefined);
export const setNotificationCategoryAsync = jest.fn(async () => undefined);
export const cancelScheduledNotificationAsync = jest.fn(async () => undefined);
export const scheduleNotificationAsync = jest.fn(async (request?: { content?: unknown; trigger?: unknown }) => {
    scheduledCounter += 1;
    const id = `notif-${scheduledCounter}`;
    scheduledNotifications.push({
        identifier: id,
        content: request?.content,
        trigger: request?.trigger,
    });
    return id;
});

export const getAllScheduledNotificationsAsync = jest.fn(async () => {
    return [...scheduledNotifications];
});

cancelScheduledNotificationAsync.mockImplementation(async (identifier: string) => {
    scheduledNotifications = scheduledNotifications.filter((item) => item.identifier !== identifier);
});

export const addNotificationReceivedListener = jest.fn((listener: Listener<Notification>) => {
    receivedListeners.push(listener);
    return {
        remove: jest.fn(() => {
            const idx = receivedListeners.indexOf(listener);
            if (idx >= 0) receivedListeners.splice(idx, 1);
        }),
    };
});

export const addNotificationResponseReceivedListener = jest.fn((listener: Listener<NotificationResponse>) => {
    responseListeners.push(listener);
    return {
        remove: jest.fn(() => {
            const idx = responseListeners.indexOf(listener);
            if (idx >= 0) responseListeners.splice(idx, 1);
        }),
    };
});

export const __emitNotificationReceived = (notification: Notification): void => {
    for (const listener of receivedListeners) listener(notification);
};

export const __emitNotificationResponse = (response: NotificationResponse): void => {
    for (const listener of responseListeners) listener(response);
};

export const __resetNotificationsMock = (): void => {
    receivedListeners.splice(0, receivedListeners.length);
    responseListeners.splice(0, responseListeners.length);
    scheduledCounter = 0;
    scheduledNotifications = [];
    requestPermissionsAsync.mockClear();
    setNotificationHandler.mockClear();
    setNotificationChannelAsync.mockClear();
    setNotificationCategoryAsync.mockClear();
    cancelScheduledNotificationAsync.mockClear();
    scheduleNotificationAsync.mockClear();
    getAllScheduledNotificationsAsync.mockClear();
    addNotificationReceivedListener.mockClear();
    addNotificationResponseReceivedListener.mockClear();
};
