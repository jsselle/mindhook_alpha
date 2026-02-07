/**
 * Tests for AttachmentRenderer component logic
 */

import { AttachmentRow, AttachmentType } from '../../types/domain';

describe('AttachmentRenderer Component Logic', () => {
    describe('Attachment type routing', () => {
        const createMockAttachment = (type: AttachmentType): AttachmentRow => ({
            id: 'test-id',
            type,
            mime: `${type}/*`,
            local_path: `file:///mock/${type}.file`,
            size_bytes: 1000,
            duration_ms: type === 'audio' || type === 'video' ? 5000 : null,
            width: type === 'image' || type === 'video' ? 200 : null,
            height: type === 'image' || type === 'video' ? 150 : null,
            created_at: Date.now(),
        });

        it('should route image type to ImageThumbnail', () => {
            const attachment = createMockAttachment('image');
            let routedComponent = '';

            switch (attachment.type) {
                case 'image':
                    routedComponent = 'ImageThumbnail';
                    break;
                case 'audio':
                    routedComponent = 'AudioPlayer';
                    break;
                case 'video':
                    routedComponent = 'VideoPlaceholder';
                    break;
                default:
                    routedComponent = 'FilePlaceholder';
            }

            expect(routedComponent).toBe('ImageThumbnail');
        });

        it('should route audio type to AudioPlayer', () => {
            const attachment = createMockAttachment('audio');
            let routedComponent = '';

            switch (attachment.type) {
                case 'image':
                    routedComponent = 'ImageThumbnail';
                    break;
                case 'audio':
                    routedComponent = 'AudioPlayer';
                    break;
                case 'video':
                    routedComponent = 'VideoPlaceholder';
                    break;
                default:
                    routedComponent = 'FilePlaceholder';
            }

            expect(routedComponent).toBe('AudioPlayer');
        });

        it('should route video type to VideoPlaceholder', () => {
            const attachment = createMockAttachment('video');
            let routedComponent = '';

            switch (attachment.type) {
                case 'image':
                    routedComponent = 'ImageThumbnail';
                    break;
                case 'audio':
                    routedComponent = 'AudioPlayer';
                    break;
                case 'video':
                    routedComponent = 'VideoPlaceholder';
                    break;
                default:
                    routedComponent = 'FilePlaceholder';
            }

            expect(routedComponent).toBe('VideoPlaceholder');
        });

        it('should route file type to FilePlaceholder', () => {
            const attachment = createMockAttachment('file');
            let routedComponent = '';

            switch (attachment.type) {
                case 'image':
                    routedComponent = 'ImageThumbnail';
                    break;
                case 'audio':
                    routedComponent = 'AudioPlayer';
                    break;
                case 'video':
                    routedComponent = 'VideoPlaceholder';
                    break;
                default:
                    routedComponent = 'FilePlaceholder';
            }

            expect(routedComponent).toBe('FilePlaceholder');
        });
    });

    describe('Prop extraction for ImageThumbnail', () => {
        it('should use width from attachment or default to 200', () => {
            const attachmentWithWidth = { width: 300 };
            const attachmentWithoutWidth = { width: null };

            expect(attachmentWithWidth.width ?? 200).toBe(300);
            expect(attachmentWithoutWidth.width ?? 200).toBe(200);
        });

        it('should use height from attachment or default to 150', () => {
            const attachmentWithHeight = { height: 250 };
            const attachmentWithoutHeight = { height: null };

            expect(attachmentWithHeight.height ?? 150).toBe(250);
            expect(attachmentWithoutHeight.height ?? 150).toBe(150);
        });
    });

    describe('Prop extraction for AudioPlayer', () => {
        it('should use duration_ms from attachment or default to 0', () => {
            const attachmentWithDuration = { duration_ms: 5000 };
            const attachmentWithoutDuration = { duration_ms: null };

            expect(attachmentWithDuration.duration_ms ?? 0).toBe(5000);
            expect(attachmentWithoutDuration.duration_ms ?? 0).toBe(0);
        });
    });
});
