import { describe, it, expect } from 'vitest';
import { newTaskNote, renderFrontmatter, taskScaffold } from './task-note.js';

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
