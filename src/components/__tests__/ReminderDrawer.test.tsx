import { parseLocalDueAt } from '../reminderDrawerDate';

describe('ReminderDrawer date parsing', () => {
    it('parses local date+time input into timestamp', () => {
        const parsed = parseLocalDueAt('2026-02-10', '09:30');
        expect(typeof parsed).toBe('number');
        expect(parsed).not.toBeNull();
        expect(Number.isFinite(parsed as number)).toBe(true);
    });

    it('returns null for invalid inputs', () => {
        const parsed = parseLocalDueAt('invalid', 'time');
        expect(parsed).toBeNull();
    });
});
