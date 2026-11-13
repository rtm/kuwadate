/** The frontmatter and body every task note starts with. */

export interface ScaffoldOptions {
    status?: string;
    priority?: number;
    urgency?: number;
    parent?: string;
    /** YYYY-MM-DD */
    created: string;
}

export type FrontmatterValue = string | number | null | string[];

/**
 * Today as YYYY-MM-DD in the local time zone. toISOString() would give the
 * UTC date, which is already tomorrow every evening in the Americas.
 */
export function localDate(now = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The kd_ properties every task carries, in file order. Blank values are null; lists start empty. */
export function taskScaffold(opts: ScaffoldOptions): Record<string, FrontmatterValue> {
    return {
        kuwadate: 1,
        kd_type: 'task',
        kd_status: opts.status || 'todo',
        kd_priority: opts.priority || null,
        kd_urgency: opts.urgency || null,
        kd_parent: opts.parent ? `[[${opts.parent}]]` : null,
        kd_depends_on: [],
        kd_duration: null,
        kd_start: null,
        kd_due: null,
        kd_owner: null,
        kd_collaborators: [],
        kd_cover: null,
        kd_cost: null,
        kd_created: opts.created,
    };
}

/** Render properties as YAML lines in the style of the plugin's task template. */
export function renderFrontmatter(props: Record<string, FrontmatterValue>): string[] {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(props)) {
        if (Array.isArray(value)) {
            lines.push(`${key}:`);
            // An empty list renders as one blank item, as the plugin's template writes it.
            if (value.length === 0) lines.push('  -');
            for (const item of value) lines.push(`  - ${yamlScalar(item)}`);
        } else if (value === null) {
            lines.push(`${key}:`);
        } else {
            lines.push(`${key}: ${yamlScalar(value)}`);
        }
    }
    return lines;
}

function yamlScalar(value: string | number): string {
    if (typeof value === 'number') return String(value);
    // Wikilinks and dates are quoted so YAML keeps them as strings; so is anything holding a quote or backslash.
    if (!/^\[\[|^\d{4}-\d{2}-\d{2}$|["\\]/.test(value)) return value;
    return `"${value.replace(/["\\]/g, '\\$&')}"`;
}

/** The Bases embeds that show a task's children and ancestors. */
export const TASK_SECTIONS = '## Subtasks\n![[Kuwadate Descendants.base#Children]]\n\n## Other Tasks\n![[Kuwadate.base#Ancestors]]\n';

/** The full content of a brand-new task note. */
export function newTaskNote(opts: ScaffoldOptions & { description?: string }): string {
    const frontmatter = renderFrontmatter(taskScaffold(opts)).join('\n');
    return `---\n${frontmatter}\n---\n\n## Description\n${opts.description || ''}\n\n## Notes\n\n\n${TASK_SECTIONS}`;
}

const FRONTMATTER = /^---\r?\n(?:([\s\S]*?)\r?\n)?---(?=\r?\n|$)/;

/**
 * Turn an existing note into a task: scaffold properties the frontmatter
 * lacks are added to it (or a frontmatter block is created), existing
 * properties and content stay as they are, and the task sections are
 * appended unless the note already embeds its children. New lines use the
 * note's own line ending.
 */
export function adaptNote(content: string, opts: ScaffoldOptions): string {
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const scaffold = taskScaffold(opts);
    const match = content.match(FRONTMATTER);
    let result: string;
    if (match) {
        const existing = match[1] ?? '';
        const missing = Object.fromEntries(
            Object.entries(scaffold).filter(([key]) => !new RegExp(`^${key}:`, 'm').test(existing)),
        );
        const block = [...(existing ? [existing] : []), ...renderFrontmatter(missing)].join(eol);
        result = `---${eol}${block}${eol}---${content.slice(match[0].length)}`;
    } else {
        result = `---${eol}${renderFrontmatter(scaffold).join(eol)}${eol}---${eol}${eol}${content}`;
    }
    if (!result.includes('Kuwadate Descendants.base#Children')) {
        result = `${result.trimEnd()}${eol}${eol}${TASK_SECTIONS.replaceAll('\n', eol)}`;
    }
    return result;
}
