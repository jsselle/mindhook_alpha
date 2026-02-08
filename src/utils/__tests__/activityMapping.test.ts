import {
    ACTIVITY_LABELS,
    getActivityLabel,
    getToolLabel,
    TOOL_LABELS,
} from '../activityMapping';

describe('activityMapping', () => {
    describe('ACTIVITY_LABELS', () => {
        it('should have all expected stage mappings', () => {
            expect(ACTIVITY_LABELS.connecting).toBe('Preparing...');
            expect(ACTIVITY_LABELS.preparing_model).toBe('Preparing...');
            expect(ACTIVITY_LABELS.generating).toBe('Thinking...');
            expect(ACTIVITY_LABELS.transcribing_audio).toBe('Transcribing audio...');
            expect(ACTIVITY_LABELS.analyzing_image).toBe('Analyzing image...');
            expect(ACTIVITY_LABELS.searching_memory).toBe('Searching memory...');
            expect(ACTIVITY_LABELS.storing_metadata).toBe('Storing information...');
            expect(ACTIVITY_LABELS.indexing_entities).toBe('Indexing...');
            expect(ACTIVITY_LABELS.finalizing).toBe('Finalizing response...');
        });
    });

    describe('getActivityLabel', () => {
        it('should return mapped label for known stages', () => {
            expect(getActivityLabel('connecting')).toBe('Preparing...');
            expect(getActivityLabel('generating')).toBe('Thinking...');
            expect(getActivityLabel('searching_memory')).toBe('Searching memory...');
        });

        it('should return stage name for unknown stages', () => {
            expect(getActivityLabel('unknown_stage')).toBe('unknown_stage');
            expect(getActivityLabel('custom_process')).toBe('custom_process');
        });
    });

    describe('TOOL_LABELS', () => {
        it('should have all expected tool mappings', () => {
            expect(TOOL_LABELS.store_attachment_metadata).toBe('Storing metadata...');
            expect(TOOL_LABELS.store_memory_item).toBe('Saving to memory...');
            expect(TOOL_LABELS.index_entity).toBe('Indexing entities...');
            expect(TOOL_LABELS.search_memory).toBe('Searching memory...');
            expect(TOOL_LABELS.search_attachments).toBe('Searching attachments...');
            expect(TOOL_LABELS.get_attachment_bundle).toBe('Loading attachment...');
            expect(TOOL_LABELS.get_message_with_attachments).toBe('Loading message...');
            expect(TOOL_LABELS.recent_messages).toBe('Loading context...');
        });
    });

    describe('getToolLabel', () => {
        it('should return mapped label for known tools', () => {
            expect(getToolLabel('search_memory')).toBe('Searching memory...');
            expect(getToolLabel('store_memory_item')).toBe('Saving to memory...');
            expect(getToolLabel('get_attachment_bundle')).toBe('Loading attachment...');
        });

        it('should return tool name for unknown tools', () => {
            expect(getToolLabel('unknown_tool')).toBe('unknown_tool');
            expect(getToolLabel('custom_tool')).toBe('custom_tool');
        });
    });
});
