import * as client from '../src/gemini/client';
import * as toolDefs from '../src/tools/definitions';
import { attachmentToPart, buildContents } from '../src/gemini/client';

const createAsyncStream = (chunks: unknown[]) => ({
    async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) {
            yield chunk;
        }
    },
});

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
            expect((contents[2].parts![1] as { text?: string }).text).toContain(
                'No attachments were provided in this run.'
            );
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
            expect(userParts).toHaveLength(3);
            expect((userParts[1] as { text?: string }).text).toContain('attachment_id=img1');
            expect(userParts[2]).toHaveProperty('inlineData');
        });

        it('includes user time context when provided', () => {
            const contents = buildContents(
                'System',
                'What should I do today?',
                [],
                [],
                {
                    epoch_ms: 1700000000000,
                    timezone: 'America/Los_Angeles',
                    utc_offset_minutes: -480,
                    local_iso: '2026-02-08T09:10:11.123-08:00',
                },
            );

            const userParts = contents[2].parts!;
            expect(userParts).toHaveLength(3);
            expect((userParts[1] as { text?: string }).text).toContain(
                'User device current time context for this run',
            );
            expect((userParts[1] as { text?: string }).text).toContain('timezone: America/Los_Angeles');
        });
    });

    describe('streamGeneration', () => {
        it('continues after tool call and then completes without looping', async () => {
            const generateContentStream = jest
                .fn()
                .mockResolvedValueOnce(
                    createAsyncStream([
                        {
                            functionCalls: [{ name: 'search_memory', args: { q: 'brain' } }],
                        },
                    ]),
                )
                .mockResolvedValueOnce(
                    createAsyncStream([
                        { text: 'Final answer' },
                    ]),
                );

            jest.spyOn(client, 'getGenAI').mockReturnValue({
                models: { generateContentStream },
            } as never);
            jest.spyOn(toolDefs, 'getToolDefinitions').mockReturnValue([
                {
                    name: 'search_memory',
                    description: 'mock tool',
                    parameters: { type: 'OBJECT', properties: {} },
                },
            ] as never);

            const onToken = jest.fn();
            const onToolCall = jest.fn().mockResolvedValue({ items: [] });
            const onComplete = jest.fn();
            const onError = jest.fn();

            await client.streamGeneration(
                buildContents('sys', 'hello', []),
                { onToken, onToolCall, onComplete, onError },
            );

            expect(generateContentStream).toHaveBeenCalledTimes(2);
            expect(onToolCall).toHaveBeenCalledTimes(1);
            expect(onToolCall).toHaveBeenCalledWith('search_memory', { q: 'brain' });
            expect(onToken).toHaveBeenCalledWith('Final answer');
            expect(onComplete).toHaveBeenCalledWith('Final answer');
            expect(onError).not.toHaveBeenCalled();
        });
    });
});
