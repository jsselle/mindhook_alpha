import { getToolDefinitions } from '../definitions';

describe('tool definitions', () => {
    it('includes reminder tool contracts', () => {
        const definitions = getToolDefinitions();
        const names = definitions.map((tool) => tool.name);

        expect(names).toContain('create_reminder');
        expect(names).toContain('update_reminder');
        expect(names).toContain('cancel_reminder');
        expect(names).toContain('list_reminders');
    });

    it('requires schema_version=1 for all reminder tools', () => {
        const definitionsByName = new Map(
            getToolDefinitions().map((tool) => [tool.name, tool])
        );

        for (const name of ['create_reminder', 'update_reminder', 'cancel_reminder', 'list_reminders']) {
            const tool = definitionsByName.get(name);
            expect(tool).toBeDefined();
            expect(tool?.parameters?.properties?.schema_version).toMatchObject({
                enum: ['1'],
            });
            expect(tool?.parameters?.required).toContain('schema_version');
        }
    });
});
