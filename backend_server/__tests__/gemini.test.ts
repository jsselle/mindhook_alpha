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

        it('sends tool results back as direct response objects', async () => {
            const generateContentStream = jest
                .fn()
                .mockResolvedValueOnce(
                    createAsyncStream([
                        {
                            functionCalls: [{ name: 'create_reminder', args: { title: 'Pick up my food' } }],
                            candidates: [
                                {
                                    content: {
                                        parts: [{
                                            functionCall: {
                                                name: 'create_reminder',
                                                args: { title: 'Pick up my food' },
                                                thought_signature: 'sig-1',
                                            },
                                        }],
                                    },
                                },
                            ],
                        },
                    ]),
                )
                .mockResolvedValueOnce(
                    createAsyncStream([
                        { text: 'Reminder set' },
                    ]),
                );

            jest.spyOn(client, 'getGenAI').mockReturnValue({
                models: { generateContentStream },
            } as never);
            jest.spyOn(toolDefs, 'getToolDefinitions').mockReturnValue([
                {
                    name: 'create_reminder',
                    description: 'mock tool',
                    parameters: { type: 'OBJECT', properties: {} },
                },
            ] as never);

            await client.streamGeneration(
                buildContents('sys', 'hello', []),
                {
                    onToken: jest.fn(),
                    onToolCall: jest.fn().mockResolvedValue({
                        reminder_id: 'r1',
                        status: 'scheduled',
                    }),
                    onComplete: jest.fn(),
                    onError: jest.fn(),
                },
            );

            expect(generateContentStream).toHaveBeenCalledTimes(2);
            const secondCall = generateContentStream.mock.calls[1][0];
            const lastContent = secondCall.contents[secondCall.contents.length - 1];
            const functionResponse = lastContent.parts[0].functionResponse;

            expect(functionResponse.name).toBe('create_reminder');
            expect(functionResponse.response).toEqual({
                reminder_id: 'r1',
                status: 'scheduled',
            });
        });

        it('preserves model tool-call turn in history before next request', async () => {
            const generateContentStream = jest
                .fn()
                .mockResolvedValueOnce(
                    createAsyncStream([
                        {
                            functionCalls: [{ name: 'create_reminder', args: { title: 'Pick up my food' } }],
                        },
                    ]),
                )
                .mockResolvedValueOnce(createAsyncStream([{ text: 'done' }]));

            jest.spyOn(client, 'getGenAI').mockReturnValue({
                models: { generateContentStream },
            } as never);
            jest.spyOn(toolDefs, 'getToolDefinitions').mockReturnValue([
                {
                    name: 'create_reminder',
                    description: 'mock tool',
                    parameters: { type: 'OBJECT', properties: {} },
                },
            ] as never);

            await client.streamGeneration(
                buildContents('sys', 'hello', []),
                {
                    onToken: jest.fn(),
                    onToolCall: jest.fn().mockResolvedValue({ reminder_id: 'r1' }),
                    onComplete: jest.fn(),
                    onError: jest.fn(),
                },
            );

            const secondCall = generateContentStream.mock.calls[1][0];
            const allContents = secondCall.contents;
            const hasModelFunctionCallTurn = allContents.some((entry: {
                role?: string;
                parts?: Array<{ functionCall?: { name?: string }; text?: string }>;
            }) => entry.role === 'model'
                && Array.isArray(entry.parts)
                && entry.parts.some((part) =>
                    part?.functionCall?.name === 'create_reminder'
                    || (typeof part?.text === 'string'
                        && part.text.includes('Model requested tool calls:'))
                ));

            expect(hasModelFunctionCallTurn).toBe(true);
        });

        it('keeps text from chunk that also carries function calls', async () => {
            const generateContentStream = jest
                .fn()
                .mockResolvedValueOnce(
                    createAsyncStream([
                        {
                            text: 'Working on it... ',
                            functionCalls: [{ name: 'search_memory', args: { q: 'brain' } }],
                        },
                    ]),
                )
                .mockResolvedValueOnce(createAsyncStream([{ text: 'Done' }]));

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
            const onComplete = jest.fn();

            await client.streamGeneration(
                buildContents('sys', 'hello', []),
                {
                    onToken,
                    onToolCall: jest.fn().mockResolvedValue({ items: [] }),
                    onComplete,
                    onError: jest.fn(),
                },
            );

            expect(onToken).toHaveBeenCalledWith('Working on it... ');
            expect(onComplete).toHaveBeenCalledWith('Working on it... Done');
        });

        it('stops executing tools after max iterations and asks model for final answer', async () => {
            const generateContentStream = jest
                .fn()
                .mockImplementation((_: unknown, callIndex = generateContentStream.mock.calls.length) => {
                    if (callIndex <= 11) {
                        return Promise.resolve(
                            createAsyncStream([
                                {
                                    functionCalls: [{ name: 'search_memory', args: { q: 'x' } }],
                                },
                            ])
                        );
                    }
                    return Promise.resolve(createAsyncStream([{ text: 'Final answer without more tools' }]));
                });

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

            const onError = jest.fn();
            const onComplete = jest.fn();
            const onToolCall = jest.fn().mockResolvedValue({ items: [] });

            await client.streamGeneration(
                buildContents('sys', 'hello', []),
                {
                    onToken: jest.fn(),
                    onToolCall,
                    onComplete,
                    onError,
                },
            );

            expect(onError).not.toHaveBeenCalled();
            expect(onToolCall).toHaveBeenCalledTimes(10);
            expect(onComplete).toHaveBeenCalledWith('Final answer without more tools');
            expect(generateContentStream).toHaveBeenCalledTimes(12);
            const callAfterLimit = generateContentStream.mock.calls[11][0];
            expect(callAfterLimit.config).toBeUndefined();
        });

        it('streams candidate part text when chunk.text is empty', async () => {
            const generateContentStream = jest.fn().mockResolvedValue(
                createAsyncStream([
                    {
                        candidates: [
                            {
                                content: {
                                    parts: [{ text: 'Recovered text from candidate parts' }],
                                },
                            },
                        ],
                    },
                ]),
            );

            jest.spyOn(client, 'getGenAI').mockReturnValue({
                models: { generateContentStream },
            } as never);
            jest.spyOn(toolDefs, 'getToolDefinitions').mockReturnValue([] as never);

            const onToken = jest.fn();
            const onToolCall = jest.fn();
            const onComplete = jest.fn();
            const onError = jest.fn();

            await client.streamGeneration(
                buildContents('sys', 'hello', []),
                { onToken, onToolCall, onComplete, onError },
            );

            expect(onToken).toHaveBeenCalledWith('Recovered text from candidate parts');
            expect(onComplete).toHaveBeenCalledWith('Recovered text from candidate parts');
            expect(onError).not.toHaveBeenCalled();
        });
    });
});
