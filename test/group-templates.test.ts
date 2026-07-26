import { describe, it, expect } from 'vitest';
import {
  bundleBBox, offsetBundle, withFreshBundleIds,
  listGroupTemplates, findGroupTemplate, saveGroupTemplate, readGroupTemplate,
  GROUP_TEMPLATES_FOLDER, type CardBundle,
} from '../src/group-templates';
import { listTemplates, TEMPLATES_FOLDER } from '../src/file-io';
import { visualNotesToCanvas } from '../src/canvas-format';
import { FakeVault } from './fake-vault';
import type { StickyCard, Connection, DrawingStroke, VisualNotesFile } from '../src/file-types';

function sticky(id: string, x: number, y: number): StickyCard {
  return { id, kind: 'sticky', text: id, color: '#fff', x, y, w: 100, h: 80 };
}

function bundle(over: Partial<CardBundle> = {}): CardBundle {
  return { cards: [], connections: [], drawings: [], ...over };
}

describe('bundleBBox', () => {
  it('spans every card in the bundle', () => {
    const b = bundle({ cards: [sticky('a', 100, 200), sticky('b', 400, 50)] });
    expect(bundleBBox(b)).toEqual({ minX: 100, minY: 50, maxX: 500, maxY: 280 });
  });

  it('includes ink points and free-floating connection endpoints', () => {
    const stroke: DrawingStroke = {
      id: 'd1', groupId: 'g1', color: '#000', width: 2,
      points: [{ x: -40, y: 10 }, { x: 20, y: 900 }],
    };
    const conn: Connection = {
      id: 'c1', routing: 'straight', color: '#000',
      fromPoint: { x: 1000, y: 5 }, toPoint: { x: 10, y: 10 },
    };
    const b = bundle({ cards: [sticky('a', 0, 20)], drawings: [stroke], connections: [conn] });
    expect(bundleBBox(b)).toEqual({ minX: -40, minY: 5, maxX: 1000, maxY: 900 });
  });

  it('is null for an empty bundle', () => {
    expect(bundleBBox(bundle())).toBeNull();
  });
});

describe('offsetBundle', () => {
  it('translates cards, ink points, and free connection endpoints together', () => {
    const b = bundle({
      cards: [sticky('a', 10, 20)],
      drawings: [{ id: 'd1', groupId: 'g1', color: '#000', width: 2, points: [{ x: 0, y: 0 }] }],
      connections: [{ id: 'c1', routing: 'straight', color: '#000', fromPoint: { x: 5, y: 5 }, toCardId: 'a' }],
    });
    offsetBundle(b, 100, -10);

    expect(b.cards[0]).toMatchObject({ x: 110, y: 10 });
    expect(b.drawings[0].points[0]).toEqual({ x: 100, y: -10 });
    expect(b.connections[0].fromPoint).toEqual({ x: 105, y: -5 });
  });

  it('treats a missing x/y as the origin rather than producing NaN', () => {
    const card = { id: 'a', kind: 'sticky', text: '', color: '#fff' } as StickyCard;
    const b = bundle({ cards: [card] });
    offsetBundle(b, 30, 40);
    expect(b.cards[0]).toMatchObject({ x: 30, y: 40 });
  });
});

describe('withFreshBundleIds', () => {
  it('regenerates ids and rewires connections to the new cards', () => {
    const b = bundle({
      cards: [sticky('a', 0, 0), sticky('b', 200, 0)],
      connections: [{ id: 'c1', routing: 'straight', color: '#000', fromCardId: 'a', toCardId: 'b' }],
    });

    const fresh = withFreshBundleIds(b);

    expect(fresh.cards[0].id).not.toBe('a');
    expect(fresh.cards[1].id).not.toBe('b');
    expect(fresh.connections[0].fromCardId).toBe(fresh.cards[0].id);
    expect(fresh.connections[0].toCardId).toBe(fresh.cards[1].id);
  });

  it('keeps strokes drawn in one session grouped under a single new groupId', () => {
    const mk = (id: string, groupId: string): DrawingStroke =>
      ({ id, groupId, color: '#000', width: 2, points: [{ x: 0, y: 0 }] });
    const b = bundle({ drawings: [mk('d1', 'g1'), mk('d2', 'g1'), mk('d3', 'g2')] });

    const fresh = withFreshBundleIds(b);

    expect(fresh.drawings[0].groupId).toBe(fresh.drawings[1].groupId);
    expect(fresh.drawings[0].groupId).not.toBe(fresh.drawings[2].groupId);
    expect(fresh.drawings[0].groupId).not.toBe('g1');
  });

  it('leaves the source bundle untouched, so one bundle can be pasted repeatedly', () => {
    const b = bundle({ cards: [sticky('a', 0, 0)] });
    const first = withFreshBundleIds(b);
    const second = withFreshBundleIds(b);

    expect(b.cards[0].id).toBe('a');
    expect(first.cards[0].id).not.toBe(second.cards[0].id);
  });
});

describe('saveGroupTemplate', () => {
  it('normalizes the bundle to the origin so it can be dropped anywhere', async () => {
    const vault = new FakeVault();
    const b = bundle({ cards: [sticky('a', 900, 640), sticky('b', 1100, 640)] });

    const file = await saveGroupTemplate(vault.toApp(), b, 'Header');

    expect(file.path).toBe(`${GROUP_TEMPLATES_FOLDER}/Header.canvas`);
    const saved = await readGroupTemplate(vault.toApp(), file);
    expect(bundleBBox(saved!)).toMatchObject({ minX: 0, minY: 0 });
    // Relative layout within the bundle survives the shift.
    expect(saved!.cards[1].x! - saved!.cards[0].x!).toBe(200);
  });

  it('round-trips cards, connections, and ink', async () => {
    const vault = new FakeVault();
    const b = bundle({
      cards: [sticky('a', 0, 0), sticky('b', 300, 0)],
      connections: [{ id: 'c1', routing: 'straight', color: '#f00', fromCardId: 'a', toCardId: 'b' }],
      drawings: [{ id: 'd1', groupId: 'g1', color: '#00f', width: 3, points: [{ x: 10, y: 10 }, { x: 40, y: 40 }] }],
    });

    const file = await saveGroupTemplate(vault.toApp(), b, 'Cluster');
    const saved = await readGroupTemplate(vault.toApp(), file);

    expect(saved!.cards).toHaveLength(2);
    expect(saved!.drawings[0]).toMatchObject({ color: '#00f', width: 3 });
    // The edge still joins the two saved cards, under their new ids.
    const ids = saved!.cards.map(c => c.id);
    expect(ids).toContain(saved!.connections[0].fromCardId);
    expect(ids).toContain(saved!.connections[0].toCardId);
  });

  it('never clobbers an existing template unless replacing was confirmed', async () => {
    const vault = new FakeVault();
    const app = vault.toApp();
    await saveGroupTemplate(app, bundle({ cards: [sticky('a', 0, 0)] }), 'Header');
    const second = await saveGroupTemplate(app, bundle({ cards: [sticky('b', 0, 0), sticky('c', 0, 0)] }), 'Header');

    expect(second.path).toBe(`${GROUP_TEMPLATES_FOLDER}/Header 1.canvas`);
    expect(listGroupTemplates(app)).toHaveLength(2);
    // The original is still a one-card template.
    const original = await readGroupTemplate(app, findGroupTemplate(app, 'Header')!);
    expect(original!.cards).toHaveLength(1);
  });

  it('overwrites the same file in place when replacing', async () => {
    const vault = new FakeVault();
    const app = vault.toApp();
    await saveGroupTemplate(app, bundle({ cards: [sticky('a', 0, 0)] }), 'Header');
    const replaced = await saveGroupTemplate(app, bundle({ cards: [sticky('b', 0, 0), sticky('c', 0, 0)] }), 'Header', true);

    expect(replaced.path).toBe(`${GROUP_TEMPLATES_FOLDER}/Header.canvas`);
    expect(listGroupTemplates(app)).toHaveLength(1);
    const saved = await readGroupTemplate(app, replaced);
    expect(saved!.cards).toHaveLength(2);
  });
});

describe('readGroupTemplate', () => {
  it('is null for a template holding nothing placeable', async () => {
    const vault = new FakeVault();
    const empty: VisualNotesFile = { version: 3, layout: 'freeform', cards: [], connections: [], drawings: [] };
    const file = vault.putText(`${GROUP_TEMPLATES_FOLDER}/Empty.canvas`, JSON.stringify(visualNotesToCanvas(empty)));

    expect(await readGroupTemplate(vault.toApp(), file)).toBeNull();
  });
});

describe('listing', () => {
  it('sorts group templates by name', async () => {
    const vault = new FakeVault();
    const app = vault.toApp();
    for (const name of ['Zebra', 'Alpha', 'Mango']) {
      await saveGroupTemplate(app, bundle({ cards: [sticky('a', 0, 0)] }), name);
    }
    expect(listGroupTemplates(app).map(f => f.basename)).toEqual(['Alpha', 'Mango', 'Zebra']);
  });

  it('keeps group templates out of the whole-board template picker', async () => {
    const vault = new FakeVault();
    const app = vault.toApp();
    vault.putText(`${TEMPLATES_FOLDER}/Weekly Planner.canvas`, '{}');
    await saveGroupTemplate(app, bundle({ cards: [sticky('a', 0, 0)] }), 'Header');

    expect(listTemplates(app).map(f => f.basename)).toEqual(['Weekly Planner']);
    expect(listGroupTemplates(app).map(f => f.basename)).toEqual(['Header']);
  });
});
