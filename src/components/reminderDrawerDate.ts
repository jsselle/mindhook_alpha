export const parseLocalDueAt = (dateText: string, timeText: string): number | null => {
    const normalizedDate = dateText.trim();
    const normalizedTime = timeText.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
        return null;
    }
    if (!/^\d{2}:\d{2}$/.test(normalizedTime)) {
        return null;
    }

    const [year, month, day] = normalizedDate.split('-').map((part) => Number(part));
    const [hours, minutes] = normalizedTime.split(':').map((part) => Number(part));
    if (!Number.isInteger(year) || year < 1970) return null;
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    if (!Number.isInteger(hours) || hours < 0 || hours > 23) return null;
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;

    const asDate = new Date(`${normalizedDate}T${normalizedTime}:00`);
    const dueAt = asDate.getTime();
    return Number.isFinite(dueAt) ? dueAt : null;
};
