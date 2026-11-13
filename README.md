# Kuwadate

Task and project management plugin for [Obsidian](https://obsidian.md). Tasks are plain markdown notes with `kd_`-prefixed frontmatter properties, organized into parent-child hierarchies.

## Features

- **Task hierarchy** — tasks have parents, subtasks, and dependencies via frontmatter wikilinks
- **Tree view** — sidebar panel showing the full task tree
- **Automation** — blocked status detection, completion propagation, date rollup from children to parents, auto-fill of missing fields
- **Adapt existing notes** — convert any note into a kuwadate task while preserving its content
- **Code block processors** — embed descendant trees, progress bars, and Mermaid dependency graphs in notes

## Commands

| Command | Description |
|---------|-------------|
| New task | Create a new task note |
| New subtask | Create a subtask under the current task |
| New sister task | Create a sibling task with the same parent |
| Adapt current note | Add kuwadate frontmatter to an existing note |
| Insert parent above | Create a new parent task between current task and its parent |
| Delete parent | Remove a parent task and reparent its children to the grandparent |
| Open task tree | Show the tree view sidebar |

## Task Properties

Tasks use YAML frontmatter with these properties:

| Property | Type | Description |
|----------|------|-------------|
| `kuwadate` | number | Marker (`1`) identifying the note as a kuwadate task |
| `kd_type` | text | Task type (e.g. `task`) |
| `kd_status` | text | `todo`, `in-progress`, `maintenance`, `blocked`, `waiting`, `done`, `cancelled` |
| `kd_priority` | number | 1-4 (1 = highest) |
| `kd_urgency` | number | 1-4 (1 = most urgent) |
| `kd_parent` | text | Wikilink to parent task (e.g. `[[Parent Task]]`) |
| `kd_depends_on` | list | Wikilinks to tasks that must complete first |
| `kd_duration` | text | Duration estimate |
| `kd_start` | date | Start date |
| `kd_due` | date | Due date |
| `kd_owner` | text | Task owner |
| `kd_collaborators` | list | Collaborators |
| `kd_cover` | text | Cover/topic |
| `kd_cost` | number | Cost estimate |
| `kd_created` | date | Creation date |
| `kd_closed_reason` | text | Why the task was closed |

## Settings

**New task location** — where new task files are created:
- **Current folder** — same folder as the active note (default)
- **Kuwadate folder** — a dedicated `Kuwadate/` folder
- **Custom folder** — a user-specified path

## MCP Server

The `mcp-server/` directory contains a [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes kuwadate operations to LLM tools. It communicates with Obsidian via the [Obsidian CLI](https://obsidian.md/cli).

### Available tools

| Tool | Description |
|------|-------------|
| `kuwadate_list_tasks` | List tasks, optionally filtered by status or parent |
| `kuwadate_get_task` | Get full properties and content of a task |
| `kuwadate_create_task` | Create a new task |
| `kuwadate_update_task` | Update task properties |
| `kuwadate_get_tree` | Get the task hierarchy as a tree |
| `kuwadate_move_task` | Move a task to a new parent |
| `kuwadate_complete_task` | Mark a task as done |
| `kuwadate_adapt_task` | Convert an existing note into a kuwadate task |
| `kuwadate_delete_task` | Delete a task's note; refuses while the task has child tasks |

### Setup

```bash
cd mcp-server
npm install
npm run build
```

The server runs on stdio. Configure it in your MCP client with:

```json
{
  "command": "node",
  "args": ["mcp-server/dist/index.js"],
  "env": {
    "OBSIDIAN_CMD": "obsidian",
    "KD_FOLDER": "Kuwadate"
  }
}
```

On Windows, set `OBSIDIAN_CMD` to the console shim `Obsidian.com` (not `Obsidian.exe`, which is the GUI launcher and doesn't pipe stdout). The most robust form is an absolute path, which avoids PATH-inheritance surprises depending on how the MCP client is launched:

```json
"OBSIDIAN_CMD": "C:\\Program Files\\Obsidian\\Obsidian.com"
```

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # production build
npm run deploy   # build and deploy to vault
```
