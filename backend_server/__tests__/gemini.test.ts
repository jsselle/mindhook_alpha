import { attachmentToPart, buildContents } from '../src/gemini/client';

describe('Gemini Client', () => {
    describe('attachmentToPart', () => {
        it('converts attachment to inline data part', () => {
            const att = {
                attachment_id: 'a1',
                type: 'image' as const,
                mime: 'image/jpeg',
                base64: 'abc123==',
                byte_length: 1000,
            };

            const part = attachmentToPart(att);

            expect(part.inlineData).toEqual({
                mimeType: 'image/jpeg',
                data: 'abc123==',
            });
        });
    });

    describe('buildContents', () => {
        it('builds content array with system prompt', () => {
            const contents = buildContents(
                'You are a helpful assistant',
                'Hello',
                []
            );

            expect(contents).toHaveLength(3);
            expect(contents[0].role).toBe('user');
            expect(contents[2].parts![0]).toEqual({ text: 'Hello' });
        });

        it('includes attachment parts', () => {
            const contents = buildContents(
                'System',
                'Check this image',
                [{
                    attachment_id: 'img1',
                    type: 'image',
                    mime: 'image/png',
                    base64: 'data==',
                    byte_length: 500,
                }]
            );

            const userParts = contents[2].parts!;
            expect(userParts).toHaveLength(2);
            expect(userParts[1]).toHaveProperty('inlineData');
        });
    });
});
