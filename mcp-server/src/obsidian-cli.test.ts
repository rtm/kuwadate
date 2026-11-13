import { describe, it, expect, beforeEach, vi } from 'vitest';

const execFileCalls: Array<{ cmd: string; args: string[] }> = [];
let nextStdout = '';
let nextStderr = '';

vi.mock('child_process', () => ({
    execFile: (cmd: string, args: string[], _opts: unknown, cb: (err: null, res: { stdout: string; stderr: string }) => void) => {
        execFileCalls.push({ cmd, args });
        cb(null, { stdout: nextStdout, stderr: nextStderr });
    },
}));

// Import after mock is registered.
const cli = await import('./obsidian-cli.js');

beforeEach(() => {
    execFileCalls.length = 0;
    nextStdout = '';
    nextStderr = '';
});

function lastArgs(): string[] {
    return execFileCalls.at(-1)!.args;
}

describe('obsidian-cli argv shape', () => {
    it('readFile uses `read path=...`', async () => {
        nextStdout = 'file body';
        await cli.readFile('Tasks/foo.md');
        expect(lastArgs()).toEqual(['read', 'path=Tasks/foo.md']);
    });

    it('writeFile uses `create path=... content=... overwrite` with escaped newlines', async () => {
        await cli.writeFile('Tasks/foo.md', 'line1\nline2\twith tab');
        expect(lastArgs()).toEqual([
            'create',
            'path=Tasks/foo.md',
            'content=line1\\nline2\\twith tab',
            'overwrite',
        ]);
    });

    it('readFile throws when the CLI reports an error on stdout', async () => {
        nextStdout = 'Error: File "Tasks/foo.md" not found.';
        await expect(cli.readFile('Tasks/foo.md')).rejects.toThrow('could not read Tasks/foo.md: File "Tasks/foo.md" not found.');
    });

    it('readFile returns a note whose first line merely starts with Error:', async () => {
        nextStdout = 'Error: handling\n\nA note about error handling.\n';
        await expect(cli.readFile('Tasks/foo.md')).resolves.toBe(nextStdout);
    });

    it('readFile throws when nothing came back but stderr did', async () => {
        nextStderr = 'Obsidian is not running';
        await expect(cli.readFile('Tasks/foo.md')).rejects.toThrow('could not read Tasks/foo.md: Obsidian is not running');
    });

    it('writeFile throws when the CLI reports an error on stdout', async () => {
        nextStdout = 'Error: Folder "Nope" does not exist.';
        await expect(cli.writeFile('Nope/foo.md', 'x')).rejects.toThrow('could not write Nope/foo.md: Folder "Nope" does not exist.');
    });

    it('readProperty uses `property:read name=... path=...`', async () => {
        nextStdout = 'value';
        await cli.readProperty('Tasks/foo.md', 'kd_status');
        expect(lastArgs()).toEqual(['property:read', 'name=kd_status', 'path=Tasks/foo.md']);
    });

    it('setProperty uses `property:set name=... value=... path=...`', async () => {
        await cli.setProperty('Tasks/foo.md', 'kd_status', 'done');
        expect(lastArgs()).toEqual([
            'property:set',
            'name=kd_status',
            'value=done',
            'path=Tasks/foo.md',
        ]);
    });

    it('evaluate uses `eval code=...` and strips `=> ` prefix', async () => {
        nextStdout = '=> {"a":1}';
        const result = await cli.evaluate('JSON.stringify({a:1})');
        expect(lastArgs()).toEqual(['eval', 'code=JSON.stringify({a:1})']);
        expect(result).toBe('{"a":1}');
    });

    it('evaluate throws an actionable error when stdout is empty', async () => {
        nextStdout = '';
        nextStderr = 'The CLI is unable to find Obsidian';
        await expect(cli.evaluate('1+1')).rejects.toThrow(/empty output/);
        await expect(cli.evaluate('1+1')).rejects.toThrow(/unable to find Obsidian/);
    });

    it('searchContent uses `search query=...`', async () => {
        nextStdout = 'hits';
        await cli.searchContent('kuwadate');
        expect(lastArgs()).toEqual(['search', 'query=kuwadate']);
    });

    it('listFiles uses `files`', async () => {
        nextStdout = 'a.md\nb.md';
        await cli.listFiles();
        expect(lastArgs()).toEqual(['files']);
    });

    it('prepends `vault=...` when OBSIDIAN_VAULT is set', async () => {
        // OBSIDIAN_VAULT is read at module load, so we need a fresh import.
        vi.resetModules();
        process.env.OBSIDIAN_VAULT = '/path/to/vault';
        const fresh = await import('./obsidian-cli.js?v=1');
        nextStdout = 'x';
        await fresh.readFile('foo.md');
        expect(lastArgs()).toEqual(['vault=/path/to/vault', 'read', 'path=foo.md']);
        delete process.env.OBSIDIAN_VAULT;
    });
});
