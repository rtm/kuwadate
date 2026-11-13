import { describe, it, expect } from 'vitest';
import { adaptNote, newTaskNote, renderFrontmatter, taskScaffold } from './task-note.js';

const CREATED = '2026-01-02';

describe('taskScaffold', () => {
    it('lists every kd_ property a task carries, in file order', () => {
        expect(Object.keys(taskScaffold({ created: CREATED }))).toEqual([
            'kuwadate', 'kd_type', 'kd_status', 'kd_priority', 'kd_urgency',
            'kd_parent', 'kd_depends_on', 'kd_duration', 'kd_start', 'kd_due',
            'kd_owner', 'kd_collaborators', 'kd_cover', 'kd_cost', 'kd_created',
        ]);
    });

    it('defaults status to todo and wraps the parent in a wikilink', () => {
        const fm = taskScaffold({ parent: 'Parent Task', created: CREATED });
        expect(fm.kd_status).toBe('todo');
        expect(fm.kd_parent).toBe('[[Parent Task]]');
        expect(fm.kd_priority).toBeNull();
    });
});

describe('renderFrontmatter', () => {
    it('renders blanks, lists, numbers and quoted strings like the plugin template', () => {
        expect(renderFrontmatter({
            kuwadate: 1,
            kd_status: 'todo',
            kd_priority: null,
            kd_parent: '[[Parent]]',
            kd_depends_on: [],
            kd_collaborators: ['[[Alice]]', 'Carol'],
            kd_created: CREATED,
        })).toEqual([
            'kuwadate: 1',
            'kd_status: todo',
            'kd_priority:',
            'kd_parent: "[[Parent]]"',
            'kd_depends_on:',
            '  -',
            'kd_collaborators:',
            '  - "[[Alice]]"',
            '  - Carol',
            `kd_created: "${CREATED}"`,
        ]);
    });
});

describe('newTaskNote', () => {
    it('writes the full scaffold and the standard sections', () => {
        expect(newTaskNote({ parent: 'Parent', priority: 2, description: 'Do it', created: CREATED })).toBe(`---
kuwadate: 1
kd_type: task
kd_status: todo
kd_priority: 2
kd_urgency:
kd_parent: "[[Parent]]"
kd_depends_on:
  -
kd_duration:
kd_start:
kd_due:
kd_owner:
kd_collaborators:
  -
kd_cover:
kd_cost:
kd_created: "${CREATED}"
---

## Description
Do it

## Notes


## Subtasks
![[Kuwadate Descendants.base#Children]]

## Other Tasks
![[Kuwadate.base#Ancestors]]
`);
    });
});

describe('adaptNote', () => {
    it('adds the missing scaffold to existing frontmatter and keeps what is there', () => {
        const note = `---
title: Living Room Beams
kd_due: 2026-03-01
---

Some body text.
`;
        expect(adaptNote(note, { parent: 'Interior', created: CREATED })).toBe(`---
title: Living Room Beams
kd_due: 2026-03-01
kuwadate: 1
kd_type: task
kd_status: todo
kd_priority:
kd_urgency:
kd_parent: "[[Interior]]"
kd_depends_on:
  -
kd_duration:
kd_start:
kd_owner:
kd_collaborators:
  -
kd_cover:
kd_cost:
kd_created: "${CREATED}"
---

Some body text.

## Subtasks
![[Kuwadate Descendants.base#Children]]

## Other Tasks
![[Kuwadate.base#Ancestors]]
`);
    });

    it('creates a frontmatter block when the note has none', () => {
        const result = adaptNote('Just a paragraph.\n', { created: CREATED });
        expect(result.startsWith('---\nkuwadate: 1\nkd_type: task\n')).toBe(true);
        expect(result).toContain(`kd_cost:\nkd_created: "${CREATED}"\n---\n\nJust a paragraph.\n\n## Subtasks\n`);
        expect(result.split('\n').filter(l => l.startsWith('kd_'))).toHaveLength(14);
    });

    it('writes the same property set as a new task', () => {
        const keys = (note: string) => note.split('\n---')[0].split('\n').filter(l => /^[a-z]/.test(l)).map(l => l.split(':')[0]);
        expect(keys(adaptNote('body\n', { parent: 'P', created: CREATED })))
            .toEqual(keys(newTaskNote({ parent: 'P', created: CREATED })));
    });

    it('does not duplicate the sections when the note already embeds its children', () => {
        const note = '---\nfoo: 1\n---\n\n## Subtasks\n![[Kuwadate Descendants.base#Children]]\n';
        const result = adaptNote(note, { created: CREATED });
        expect(result.match(/## Subtasks/g)).toHaveLength(1);
        expect(result.endsWith('## Subtasks\n![[Kuwadate Descendants.base#Children]]\n')).toBe(true);
    });

    it('handles CRLF notes and an empty frontmatter block', () => {
        expect(adaptNote('---\r\n---\r\nbody', { created: CREATED })).toMatch(/^---\nkuwadate: 1\n/);
        expect(adaptNote('---\r\nfoo: 1\r\n---\r\n\r\nbody', { created: CREATED })).toMatch(/^---\nfoo: 1\nkuwadate: 1\n/);
    });
});
