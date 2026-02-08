import {
    canOpenReminderDrawerFromButton,
    LEFT_EDGE_THRESHOLD_PX,
    shouldCaptureReminderEdgeGesture,
    shouldOpenReminderDrawerFromSwipe,
} from '../reminderDrawerGesture';

describe('reminder drawer gesture contract', () => {
    it('button path opens only when db is ready', () => {
        expect(canOpenReminderDrawerFromButton(true)).toBe(true);
        expect(canOpenReminderDrawerFromButton(false)).toBe(false);
    });

    it('captures edge pan only when started from left edge and horizontal dominant', () => {
        expect(shouldCaptureReminderEdgeGesture({
            dbReady: true,
            drawerVisible: false,
            startX: LEFT_EDGE_THRESHOLD_PX,
            dx: 20,
            dy: 5,
        })).toBe(true);

        expect(shouldCaptureReminderEdgeGesture({
            dbReady: true,
            drawerVisible: false,
            startX: LEFT_EDGE_THRESHOLD_PX + 1,
            dx: 20,
            dy: 5,
        })).toBe(false);

        expect(shouldCaptureReminderEdgeGesture({
            dbReady: true,
            drawerVisible: false,
            startX: LEFT_EDGE_THRESHOLD_PX,
            dx: 8,
            dy: 2,
        })).toBe(false);
    });

    it('opens drawer when left-edge swipe exceeds dx threshold', () => {
        expect(shouldOpenReminderDrawerFromSwipe({
            dbReady: true,
            drawerVisible: false,
            startedAtLeftEdge: true,
            dx: 57,
            dy: 2,
        })).toBe(true);

        expect(shouldOpenReminderDrawerFromSwipe({
            dbReady: true,
            drawerVisible: false,
            startedAtLeftEdge: true,
            dx: 56,
            dy: 2,
        })).toBe(false);

        expect(shouldOpenReminderDrawerFromSwipe({
            dbReady: true,
            drawerVisible: false,
            startedAtLeftEdge: false,
            dx: 120,
            dy: 1,
        })).toBe(false);
    });
});
