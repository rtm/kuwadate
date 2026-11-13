import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as cli from './obsidian-cli.js';
import { newTaskNote } from './task-note.js';

const VAULT_PATH = process.env.OBSIDIAN_VAULT || '';
const KD_FOLDER = process.env.KD_FOLDER || 'Kuwadate';

const KD_PROPERTIES = [
    'kuwadate', 'kd_type', 'kd_status', 'kd_priority', 'kd_urgency',
    'kd_parent', 'kd_depends_on', 'kd_duration', 'kd_start', 'kd_due',
    'kd_owner', 'kd_collaborators', 'kd_cover', 'kd_cost', 'kd_created',
    'kd_closed_reason',
];

const STATUS_VALUES = ['todo', 'in-progress', 'maintenance', 'blocked', 'waiting', 'done', 'cancelled'];

function text(s: string) {
    return { content: [{ type: 'text' as const, text: s }] };
}

function errorResult(msg: string) {
    return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
}

class KuwadateMCPServer {
    private server: Server;

    constructor() {
        this.server = new Server(
            { name: 'kuwadate-mcp-server', version: '0.1.0' },
            { capabilities: { tools: {} } },
        );
        this.setupHandlers();
    }

    private setupHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'kuwadate_list_tasks',
                    description: 'List kuwadate tasks. Can filter by status, parent, or search term. Returns task names with key properties.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            status: {
                                type: 'string',
                                description: 'Filter by kd_status value (todo, in-progress, maintenance, blocked, waiting, done, cancelled)',
                                enum: STATUS_VALUES,
                            },
                            parent: {
                                type: 'string',
                                description: 'Filter by parent task name',
                            },
                        },
                    },
                },
                {
                    name: 'kuwadate_get_task',
                    description: 'Get full details of a specific kuwadate task including all properties and note content.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                description: 'The task name (note filename without .md)',
                            },
                        },
                        required: ['name'],
                    },
                },
                {
                    name: 'kuwadate_create_task',
                    description: 'Create a new kuwadate task. Creates a note with kuwadate frontmatter and standard sections.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                description: 'Task name (will be the note filename)',
                            },
                            parent: {
                                type: 'string',
                                description: 'Parent task name (optional)',
                            },
                            status: {
                                type: 'string',
                                description: 'Initial status (default: todo)',
                                enum: STATUS_VALUES,
                            },
                            priority: {
                                type: 'number',
                                description: 'Priority 1-4 (1 = highest)',
                            },
                            urgency: {
                                type: 'number',
                                description: 'Urgency 1-4 (1 = most urgent)',
                            },
                            description: {
                                type: 'string',
                                description: 'Task description text',
                            },
                        },
                        required: ['name'],
                    },
                },
                {
                    name: 'kuwadate_update_task',
                    description: 'Update properties of an existing kuwadate task. Can set status, priority, urgency, parent, due date, etc.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                description: 'Task name to update',
                            },
                            properties: {
                                type: 'object',
                                description: 'Properties to update. Keys should be property names without kd_ prefix (e.g. "status", "priority", "parent"). Values are the new values.',
                                additionalProperties: true,
                            },
                        },
                        required: ['name', 'properties'],
                    },
                },
                {
                    name: 'kuwadate_get_tree',
                    description: 'Get the task hierarchy as a tree. Shows parent-child relationships with status and priority.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            root: {
                                type: 'string',
                                description: 'Root task name to start from (default: show all roots)',
                            },
                            depth: {
                                type: 'number',
                                description: 'Maximum depth to display (default: all)',
                            },
                        },
                    },
                },
                {
                    name: 'kuwadate_move_task',
                    description: 'Move a task to a new parent. Updates the kd_parent property.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                description: 'Task name to move',
                            },
                            new_parent: {
                                type: 'string',
                                description: 'New parent task name (empty string to make it a root task)',
                            },
                        },
                        required: ['name', 'new_parent'],
                    },
                },
                {
                    name: 'kuwadate_complete_task',
                    description: 'Mark a task as done and optionally set a closed reason.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                description: 'Task name to complete',
                            },
                            reason: {
                                type: 'string',
                                description: 'Closed reason (default: "done")',
                            },
                        },
                        required: ['name'],
                    },
                },
                {
                    name: 'kuwadate_adapt_task',
                    description: 'Adapt an existing note into a kuwadate task. Adds kuwadate frontmatter properties while preserving existing content and frontmatter.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                description: 'The note name (filename without .md) to adapt into a kuwadate task',
                            },
                            parent: {
                                type: 'string',
                                description: 'Parent task name (optional)',
                            },
                        },
                        required: ['name'],
                    },
                },
            ],
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                switch (name) {
                    case 'kuwadate_list_tasks': return await this.listTasks(args);
                    case 'kuwadate_get_task': return await this.getTask(args);
                    case 'kuwadate_create_task': return await this.createTask(args);
                    case 'kuwadate_update_task': return await this.updateTask(args);
                    case 'kuwadate_get_tree': return await this.getTree(args);
                    case 'kuwadate_move_task': return await this.moveTask(args);
                    case 'kuwadate_complete_task': return await this.completeTask(args);
                    case 'kuwadate_adapt_task': return await this.adaptTask(args);
                    default: return errorResult(`Unknown tool: ${name}`);
                }
            } catch (err: any) {
                return errorResult(err.message || String(err));
            }
        });
    }

    private async listTasks(args: any) {
        // Use eval to get task data from the plugin
        const code = `
            (() => {
                const tasks = [];
                for (const file of app.vault.getMarkdownFiles()) {
                    const meta = app.metadataCache.getFileCache(file);
                    if (!meta?.frontmatter?.kuwadate) continue;
                    if (file.path.includes('Template')) continue;
                    const fm = meta.frontmatter;
                    tasks.push({
                        name: file.basename,
                        path: file.path,
                        status: fm.kd_status || 'todo',
                        priority: fm.kd_priority || null,
                        urgency: fm.kd_urgency || null,
                        parent: fm.kd_parent || null,
                        due: fm.kd_due || null,
                    });
                }
                return JSON.stringify(tasks);
            })()
        `;
        const result = await cli.evaluate(code);
        let tasks = JSON.parse(result);

        if (args?.status) {
            tasks = tasks.filter((t: any) => t.status === args.status);
        }
        if (args?.parent) {
            tasks = tasks.filter((t: any) => {
                const p = t.parent?.replace(/^\[\[/, '').replace(/\]\]$/, '') || '';
                return p === args.parent;
            });
        }

        if (tasks.length === 0) {
            return text('No matching tasks found.');
        }

        const lines = tasks.map((t: any) => {
            const parts = [t.name];
            if (t.status) parts.push(`[${t.status}]`);
            if (t.priority) parts.push(`P${t.priority}`);
            if (t.urgency) parts.push(`U${t.urgency}`);
            if (t.due) parts.push(`due:${t.due}`);
            if (t.parent) parts.push(`← ${t.parent.replace(/[\[\]]/g, '')}`);
            return parts.join(' ');
        });

        return text(`${tasks.length} task(s):\n\n${lines.join('\n')}`);
    }

    private async getTask(args: any) {
        const name = args.name;
        const code = `
            (() => {
                const file = app.vault.getMarkdownFiles().find(f => f.basename === ${JSON.stringify(name)});
                if (!file) return JSON.stringify({ error: 'Task not found' });
                const meta = app.metadataCache.getFileCache(file);
                const fm = meta?.frontmatter || {};
                return JSON.stringify({ path: file.path, frontmatter: fm });
            })()
        `;
        const result = await cli.evaluate(code);
        const data = JSON.parse(result);

        if (data.error) return errorResult(data.error);

        // Also read the file content
        const content = await cli.readFile(data.path);

        return text(`**${name}**\n\nProperties:\n${JSON.stringify(data.frontmatter, null, 2)}\n\nContent:\n${content}`);
    }

    private async createTask(args: any) {
        const { name, parent, status, priority, urgency, description } = args;
        const today = new Date().toISOString().slice(0, 10);
        const content = newTaskNote({ status, priority, urgency, parent, description, created: today });

        // Resolve folder based on plugin settings, matching the plugin's getTaskFolder logic
        const settingsCode = `
            (() => {
                const plugin = app.plugins.plugins['obsidian-kuwadate'];
                if (!plugin || !plugin.settings) return JSON.stringify({ taskFolder: 'current', customFolder: '' });
                return JSON.stringify({ taskFolder: plugin.settings.taskFolder, customFolder: plugin.settings.customFolder });
            })()
        `;
        const { taskFolder, customFolder } = JSON.parse(await cli.evaluate(settingsCode));

        let folder: string;
        if (taskFolder === 'kuwadate') {
            folder = KD_FOLDER;
        } else if (taskFolder === 'custom') {
            folder = customFolder ?? '';
        } else if (parent) {
            // 'current' setting: use the parent task's folder for subtasks
            const parentCode = `
                (() => {
                    const file = app.vault.getMarkdownFiles().find(f => f.basename === ${JSON.stringify(parent)});
                    if (!file) return '';
                    const parts = file.path.split('/');
                    parts.pop();
                    return parts.join('/');
                })()
            `;
            folder = await cli.evaluate(parentCode) ?? KD_FOLDER;
        } else {
            folder = KD_FOLDER;
        }

        const path = folder ? `${folder}/${name}.md` : `${name}.md`;
        await cli.writeFile(path, content);
        return text(`Created task: ${name}\nPath: ${path}`);
    }

    private async updateTask(args: any) {
        const { name, properties } = args;

        // Map short names to kd_ prefixed names
        const updates: Record<string, string> = {};
        for (const [key, value] of Object.entries(properties)) {
            const kdKey = key.startsWith('kd_') ? key : `kd_${key}`;
            // Special handling for parent — wrap in wikilink
            if (kdKey === 'kd_parent' && value && typeof value === 'string' && !String(value).startsWith('[[')) {
                updates[kdKey] = `[[${value}]]`;
            } else {
                updates[kdKey] = String(value);
            }
        }

        // Use eval to update frontmatter via Obsidian API
        const code = `
            (async () => {
                const file = app.vault.getMarkdownFiles().find(f => f.basename === ${JSON.stringify(name)});
                if (!file) return 'Error: Task not found';
                const updates = ${JSON.stringify(updates)};
                await app.fileManager.processFrontMatter(file, (fm) => {
                    for (const [key, value] of Object.entries(updates)) {
                        fm[key] = value;
                    }
                });
                return 'Updated: ${name}';
            })()
        `;
        const result = await cli.evaluate(code);
        return text(result);
    }

    private async getTree(args: any) {
        const code = `
            (() => {
                const nodes = new Map();
                for (const file of app.vault.getMarkdownFiles()) {
                    const meta = app.metadataCache.getFileCache(file);
                    if (!meta?.frontmatter?.kuwadate) continue;
                    if (file.path.includes('Template')) continue;
                    const fm = meta.frontmatter;
                    const parent = fm.kd_parent ? String(fm.kd_parent).replace(/^\\[\\[/, '').replace(/\\]\\]$/, '') : null;
                    nodes.set(file.basename, {
                        name: file.basename,
                        status: fm.kd_status || 'todo',
                        priority: fm.kd_priority || null,
                        parent: parent,
                        children: [],
                    });
                }
                for (const node of nodes.values()) {
                    if (node.parent && nodes.has(node.parent)) {
                        nodes.get(node.parent).children.push(node.name);
                    }
                }
                return JSON.stringify(Array.from(nodes.values()));
            })()
        `;
        const result = await cli.evaluate(code);
        const nodes = JSON.parse(result);
        const nodeMap = new Map(nodes.map((n: any) => [n.name, n]));

        const rootName = args?.root;
        const maxDepth = args?.depth || Infinity;

        function renderTree(name: string, depth: number, indent: string): string {
            if (depth > maxDepth) return '';
            const node: any = nodeMap.get(name);
            if (!node) return '';

            const status = node.status ? `[${node.status}]` : '';
            const pri = node.priority ? ` P${node.priority}` : '';
            let line = `${indent}${name} ${status}${pri}\n`;

            for (const child of node.children) {
                line += renderTree(child, depth + 1, indent + '  ');
            }
            return line;
        }

        let output = '';
        if (rootName) {
            output = renderTree(rootName, 1, '');
        } else {
            // Find roots
            const roots = nodes.filter((n: any) => !n.parent || !nodeMap.has(n.parent));
            for (const root of roots) {
                output += renderTree(root.name, 1, '');
            }
        }

        return text(output || 'No tasks found.');
    }

    private async moveTask(args: any) {
        const { name, new_parent } = args;
        const parentValue = new_parent ? `[[${new_parent}]]` : '';

        const code = `
            (async () => {
                const file = app.vault.getMarkdownFiles().find(f => f.basename === ${JSON.stringify(name)});
                if (!file) return 'Error: Task not found';
                await app.fileManager.processFrontMatter(file, (fm) => {
                    fm.kd_parent = ${JSON.stringify(parentValue)};
                });
                return 'Moved ${name} → ${new_parent || "(root)"}';
            })()
        `;
        const result = await cli.evaluate(code);
        return text(result);
    }

    private async completeTask(args: any) {
        const { name, reason } = args;
        const closedReason = reason || 'done';

        const code = `
            (async () => {
                const file = app.vault.getMarkdownFiles().find(f => f.basename === ${JSON.stringify(name)});
                if (!file) return 'Error: Task not found';
                await app.fileManager.processFrontMatter(file, (fm) => {
                    fm.kd_status = 'done';
                    fm.kd_closed_reason = ${JSON.stringify(closedReason)};
                });
                return 'Completed: ${name} (${closedReason})';
            })()
        `;
        const result = await cli.evaluate(code);
        return text(result);
    }

    private async adaptTask(args: any) {
        const { name, parent } = args;
        const today = new Date().toISOString().slice(0, 10);
        const parentValue = parent ? `[[${parent}]]` : '';

        const code = `
            (async () => {
                const file = app.vault.getMarkdownFiles().find(f => f.basename === ${JSON.stringify(name)});
                if (!file) return JSON.stringify({ error: 'Note not found' });
                const meta = app.metadataCache.getFileCache(file);
                if (meta?.frontmatter?.kuwadate) return JSON.stringify({ error: 'Note is already a kuwadate task' });
                return JSON.stringify({ path: file.path });
            })()
        `;
        const result = JSON.parse(await cli.evaluate(code));
        if (result.error) return errorResult(result.error);

        // Read the existing content
        const content = await cli.readFile(result.path);

        const kuwadateProperties: Record<string, string> = {
            kuwadate: '1',
            kd_type: 'task',
            kd_status: 'todo',
            kd_parent: parentValue,
            kd_created: today,
        };

        // Use processFrontMatter to add properties while preserving existing frontmatter
        const propsJson = JSON.stringify(kuwadateProperties);
        const addPropsCode = `
            (async () => {
                const file = app.vault.getMarkdownFiles().find(f => f.basename === ${JSON.stringify(name)});
                if (!file) return 'Error: Note not found';
                const props = ${propsJson};
                await app.fileManager.processFrontMatter(file, (fm) => {
                    for (const [key, value] of Object.entries(props)) {
                        if (!(key in fm)) fm[key] = value;
                    }
                });
                return 'OK';
            })()
        `;
        const addResult = await cli.evaluate(addPropsCode);
        if (addResult !== 'OK') return errorResult(addResult);

        // Append subtasks sections if not present
        if (!content.includes('Kuwadate Descendants.base#Children')) {
            const updated = await cli.readFile(result.path);
            const appended = updated.trimEnd() + '\n\n## Subtasks\n![[Kuwadate Descendants.base#Children]]\n\n## Other Tasks\n![[Kuwadate.base#Ancestors]]\n';
            await cli.writeFile(result.path, appended);
        }

        return text(`Adapted note "${name}" into a kuwadate task.\nPath: ${result.path}`);
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Kuwadate MCP Server running on stdio');
    }
}

const server = new KuwadateMCPServer();
server.run().catch(console.error);
