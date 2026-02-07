import { daysAgoMs, nowMs } from '../time';

describe('Time Utilities', () => {
    it('nowMs returns current timestamp', () => {
        const before = Date.now();
        const result = nowMs();
        const after = Date.now();
        expect(result).toBeGreaterThanOrEqual(before);
        expect(result).toBeLessThanOrEqual(after);
    });

    it('daysAgoMs calculates correctly', () => {
        const now = nowMs();
        const sevenDaysAgo = daysAgoMs(7);
        expect(now - sevenDaysAgo).toBe(7 * 86400000);
    });
});
