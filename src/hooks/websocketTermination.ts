export type TerminalOutcome = 'none' | 'complete' | 'error';

export type CloseClassification =
    | 'ignore'
    | 'run_error'
    | 'protocol_error'
    | 'unexpected_close';

interface ClassifyCloseParams {
    settled: boolean;
    terminalOutcome: TerminalOutcome;
    closeReason?: string;
}

export const classifySocketClose = ({
    settled,
    terminalOutcome,
    closeReason,
}: ClassifyCloseParams): CloseClassification => {
    if (settled || terminalOutcome !== 'none') {
        return 'ignore';
    }

    if (closeReason === 'run_error') {
        return 'run_error';
    }

    if (closeReason === 'run_complete') {
        return 'protocol_error';
    }

    if (closeReason === 'user_cancelled') {
        return 'ignore';
    }

    return 'unexpected_close';
};
