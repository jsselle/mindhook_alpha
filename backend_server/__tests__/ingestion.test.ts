import { INGESTION_PROMPT_SECTION } from '../src/gemini/ingestionPrompt';

describe('Ingestion Prompt', () => {
    it('includes audio processing instructions', () => {
        expect(INGESTION_PROMPT_SECTION).toContain('Audio Processing');
        expect(INGESTION_PROMPT_SECTION).toContain('transcript');
    });

    it('includes image processing instructions', () => {
        expect(INGESTION_PROMPT_SECTION).toContain('Image Processing');
        expect(INGESTION_PROMPT_SECTION).toContain('scene');
    });

    it('specifies confidence threshold', () => {
        expect(INGESTION_PROMPT_SECTION).toContain('0.7');
    });

    it('lists memory types', () => {
        expect(INGESTION_PROMPT_SECTION).toContain('object_location');
        expect(INGESTION_PROMPT_SECTION).toContain('habit');
        expect(INGESTION_PROMPT_SECTION).toContain('event');
    });

    it('includes store_attachment_metadata instruction', () => {
        expect(INGESTION_PROMPT_SECTION).toContain('store_attachment_metadata');
    });

    it('includes index_entity instruction', () => {
        expect(INGESTION_PROMPT_SECTION).toContain('index_entity');
    });

    it('mentions source_attachment_id requirement', () => {
        expect(INGESTION_PROMPT_SECTION).toContain('source_attachment_id');
    });
});
