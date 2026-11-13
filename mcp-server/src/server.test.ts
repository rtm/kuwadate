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
