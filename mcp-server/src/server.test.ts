import { describe, it, expect, beforeEach, vi } from 'vitest';

// Each Obsidian CLI call pops the next scripted stdout; the argv of every call is recorded.
const calls: string[][] = [];
const outputs: string[] = [];

vi.mock('child_process', () => ({
    execFile: (_cmd: string, args: string[], _opts: unknown, cb: (err: null, res: { stdout: string; stderr: string }) => void) => {
        calls.push(args);
        cb(null, { stdout: outputs.shift() ?? '', stderr: '' });
    },
}));

const { KuwadateMCPServer } = await import('./server.js');
const server = new KuwadateMCPServer();

beforeEach(() => {
    calls.length = 0;
    outputs.length = 0;
});

function resultText(result: { content: Array<{ text: string }> }): string {
    return result.content[0].text;
}

/** The note content a `create` call wrote, with the CLI's newline escaping undone. */
function writtenContent(call: string[]): string {
    expect(call[0]).toBe('create');
    return call[2].replace(/^content=/, '').replace(/\\n/g, '\n');
}

describe('kuwadate_adapt_task', () => {
    it('rewrites the note with the full scaffold and reports the path', async () => {
        outputs.push('=> {"path":"Notes/Beams.md"}', '---\ntitle: Beams\n---\n\nBody.\n', '');
        const result = await server.callTool('kuwadate_adapt_task', { name: 'Beams', parent: 'Interior' });

        expect(result.isError).toBeUndefined();
        expect(resultText(result)).toBe('Adapted note "Beams" into a kuwadate task.\nPath: Notes/Beams.md');
        expect(calls[1]).toEqual(['read', 'path=Notes/Beams.md']);
        expect(calls[2][1]).toBe('path=Notes/Beams.md');
        const written = writtenContent(calls[2]);
        expect(written).toContain('title: Beams\nkuwadate: 1\nkd_type: task\n');
        for (const key of ['kd_priority', 'kd_urgency', 'kd_depends_on', 'kd_duration', 'kd_start', 'kd_due', 'kd_owner', 'kd_collaborators', 'kd_cover', 'kd_cost']) {
            expect(written).toContain(`\n${key}:`);
        }
        expect(written).toContain('kd_parent: "[[Interior]]"');
        expect(written).toContain('Body.\n\n## Subtasks\n');
    });

    it('refuses a note that is already a task without touching it', async () => {
        outputs.push('=> {"error":"Note is already a kuwadate task"}');
        const result = await server.callTool('kuwadate_adapt_task', { name: 'Beams' });
        expect(result.isError).toBe(true);
        expect(resultText(result)).toBe('Error: Note is already a kuwadate task');
        expect(calls).toHaveLength(1);
    });
});

describe('kuwadate_delete_task', () => {
    it('deletes a childless task in one eval and reports the path', async () => {
        outputs.push('=> {"path":"Tasks/Dup.md"}');
        const result = await server.callTool('kuwadate_delete_task', { name: 'Dup' });
        expect(result.isError).toBeUndefined();
        expect(resultText(result)).toBe('Deleted task: Dup\nPath: Tasks/Dup.md\nThe note was moved to the system trash.');
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toBe('eval');
    });

    it('refuses when the task has children and names them', async () => {
        outputs.push('=> {"children":["Child A","Child B"]}');
        const result = await server.callTool('kuwadate_delete_task', { name: 'Parent' });
        expect(result.isError).toBe(true);
        expect(resultText(result)).toBe('Error: Cannot delete "Parent": it has 2 child task(s): Child A, Child B. Reparent or delete them first.');
    });

    it('passes a lookup error through', async () => {
        outputs.push('=> {"error":"Task not found"}');
        const result = await server.callTool('kuwadate_delete_task', { name: 'Ghost' });
        expect(result.isError).toBe(true);
        expect(resultText(result)).toBe('Error: Task not found');
    });

    it('sends Obsidian a script that finds children by kd_parent and trashes only a childless task', async () => {
        outputs.push('=> {}');
        await server.callTool('kuwadate_delete_task', { name: 'Parent' });
        const script = calls[0][1].replace(/^code=/, '').trim();

        // A stand-in for Obsidian's `app`: notes keyed by path, each with its frontmatter (null for an unindexed file).
        const trashed: string[] = [];
        const fakeApp = (notes: Record<string, Record<string, unknown> | null>) => ({
            vault: {
                getMarkdownFiles: () => Object.keys(notes).map(path => ({ path, basename: path.replace(/.*\//, '').replace(/\.md$/, '') })),
                trash: async (file: { path: string }) => { trashed.push(file.path); },
            },
            metadataCache: {
                getFileCache: (file: { path: string }) => notes[file.path] && { frontmatter: notes[file.path] },
            },
        });
        const run = async (app: unknown) => JSON.parse(await new Function('app', `return ${script}`)(app));

        expect(await run(fakeApp({
            'T/Parent.md': { kuwadate: 1 },
            'T/Kid.md': { kuwadate: 1, kd_parent: '[[Parent]]' },
            'T/Aliased.md': { kuwadate: 1, kd_parent: '[[Parent|the parent]]' },
            'T/Other.md': { kuwadate: 1, kd_parent: '[[Elsewhere]]' },
            'T/Plain note.md': { kd_parent: '[[Parent]]' },
            'Templates/Task Template.md': { kuwadate: 1, kd_parent: '[[Parent]]' },
        }))).toEqual({ children: ['Kid', 'Aliased'] });
        expect(trashed).toEqual([]);

        expect(await run(fakeApp({
            'T/Parent.md': { kuwadate: 1 },
            'T/Other.md': { kuwadate: 1, kd_parent: '[[Elsewhere]]' },
        }))).toEqual({ path: 'T/Parent.md' });
        expect(trashed).toEqual(['T/Parent.md']);

        expect(await run(fakeApp({ 'T/Other.md': null }))).toEqual({ error: 'Task not found' });
        expect(await run(fakeApp({ 'T/Parent.md': { title: 'not a task' } }))).toEqual({ error: 'Note is not a kuwadate task' });
    });
});
