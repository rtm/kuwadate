import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const OBSIDIAN_CMD = process.env.OBSIDIAN_CMD || 'obsidian';
const OBSIDIAN_VAULT = process.env.OBSIDIAN_VAULT || '';

const VAULT_ARG = OBSIDIAN_VAULT ? [`vault=${OBSIDIAN_VAULT}`] : [];

interface ExecResult {
    stdout: string;
    stderr: string;
}

async function run(args: string[]): Promise<ExecResult> {
    try {
        return await execFileAsync(OBSIDIAN_CMD, [...VAULT_ARG, ...args], {
            timeout: 15000,
            maxBuffer: 1024 * 1024,
        });
    } catch (err: any) {
        if (err.stdout || err.stderr) {
            return { stdout: err.stdout || '', stderr: err.stderr || '' };
        }
        throw new Error(`Obsidian CLI error: ${err.message}`);
    }
}

/**
 * The CLI exits 0 even when a command fails and reports the failure as a
 * single `Error: ...` line on stdout. Surface that as a thrown error so a
 * caller never mistakes it for file content or for a successful write.
 */
function throwIfCliError(result: ExecResult, what: string): void {
    const out = result.stdout.trim();
    if (/^Error: [^\n]*$/.test(out)) {
        throw new Error(`Obsidian CLI could not ${what}: ${out.slice('Error: '.length)}`);
    }
    if (!out && result.stderr.trim()) {
        throw new Error(`Obsidian CLI could not ${what}: ${result.stderr.trim()}`);
    }
}

/** Read a file's content from the vault. */
export async function readFile(path: string): Promise<string> {
    const result = await run(['read', `path=${path}`]);
    throwIfCliError(result, `read ${path}`);
    return result.stdout;
}

/** Write content to a file in the vault (creates or overwrites). */
export async function writeFile(path: string, content: string): Promise<void> {
    const escaped = content.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
    const result = await run(['create', `path=${path}`, `content=${escaped}`, 'overwrite']);
    throwIfCliError(result, `write ${path}`);
}

/** Read a frontmatter property from a file. */
export async function readProperty(path: string, key: string): Promise<string> {
    const { stdout } = await run(['property:read', `name=${key}`, `path=${path}`]);
    return stdout.trim();
}

/** Set a frontmatter property on a file. */
export async function setProperty(path: string, key: string, value: string): Promise<void> {
    await run(['property:set', `name=${key}`, `value=${value}`, `path=${path}`]);
}

/** Evaluate JavaScript in Obsidian's runtime. */
export async function evaluate(code: string): Promise<string> {
    const { stdout, stderr } = await run(['eval', `code=${code}`]);
    const out = stdout.trim().replace(/^=> /, '');
    if (!out) {
        throw new Error(
            `Obsidian CLI returned empty output for eval. Check that Obsidian is running ` +
            `and OBSIDIAN_CMD points to Obsidian.com (not Obsidian.exe, and not the Linux ` +
            `obsidian-cli binary when running under WSL against a Windows Obsidian). ` +
            `stderr: ${stderr.trim() || '(empty)'}`
        );
    }
    return out;
}

/** Search vault content. */
export async function searchContent(query: string): Promise<string> {
    const { stdout } = await run(['search', `query=${query}`]);
    return stdout;
}

/** List files in the vault. */
export async function listFiles(): Promise<string> {
    const { stdout } = await run(['files']);
    return stdout;
}
