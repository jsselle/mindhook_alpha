const DEFAULT_THUMBNAIL_WIDTH = 200;
const DEFAULT_THUMBNAIL_HEIGHT = 150;
const MAX_THUMBNAIL_WIDTH = 220;
const MAX_THUMBNAIL_HEIGHT = 280;

const sanitizeDimension = (value: number | undefined, fallback: number): number => {
    if (!value || !Number.isFinite(value) || value <= 0) {
        return fallback;
    }
    return value;
};

export const getThumbnailDimensions = (
    sourceWidth: number | undefined,
    sourceHeight: number | undefined,
): { width: number; height: number } => {
    const width = sanitizeDimension(sourceWidth, DEFAULT_THUMBNAIL_WIDTH);
    const height = sanitizeDimension(sourceHeight, DEFAULT_THUMBNAIL_HEIGHT);

    const scale = Math.min(
        MAX_THUMBNAIL_WIDTH / width,
        MAX_THUMBNAIL_HEIGHT / height,
        1,
    );

    return {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
    };
};
