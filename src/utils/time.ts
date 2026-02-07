export const nowMs = (): number => Date.now();

export const daysAgoMs = (days: number): number => {
    return nowMs() - days * 86400000;
};
