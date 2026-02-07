import { generateUUID } from '../uuid';

describe('UUID Generation', () => {
    it('generates valid UUID v4 format', () => {
        const id = generateUUID();
        const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(id).toMatch(uuidV4Regex);
    });

    it('generates unique IDs', () => {
        const ids = new Set(Array.from({ length: 100 }, () => generateUUID()));
        expect(ids.size).toBe(100);
    });
});
