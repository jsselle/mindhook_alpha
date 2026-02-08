import { classifySocketClose } from '../websocketTermination';

describe('websocketTermination', () => {
    it('ignores close events after terminal state is already reached', () => {
        expect(classifySocketClose({
            settled: true,
            terminalOutcome: 'none',
            closeReason: '',
        })).toBe('ignore');

        expect(classifySocketClose({
            settled: false,
            terminalOutcome: 'complete',
            closeReason: '',
        })).toBe('ignore');
    });

    it('classifies backend run_error close reason explicitly', () => {
        expect(classifySocketClose({
            settled: false,
            terminalOutcome: 'none',
            closeReason: 'run_error',
        })).toBe('run_error');
    });

    it('flags run_complete close before final_response as protocol_error', () => {
        expect(classifySocketClose({
            settled: false,
            terminalOutcome: 'none',
            closeReason: 'run_complete',
        })).toBe('protocol_error');
    });

    it('classifies unknown close reasons as unexpected_close', () => {
        expect(classifySocketClose({
            settled: false,
            terminalOutcome: 'none',
            closeReason: '',
        })).toBe('unexpected_close');
    });
});
