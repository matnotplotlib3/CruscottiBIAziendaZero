import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadData, buildView, buildDetail, buildWorkspace, parseCsv } from '../lib/data.mjs';

const data = loadData(fileURLToPath(new URL('../data/', import.meta.url)));

test('CSV quoted fields retain commas and escaped quotes', () => {
  assert.deepEqual(parseCsv('a,b\n"test, one","a ""quote"""\n'), [{ a:'test, one', b:'a "quote"' }]);
});

test('territorial filter changes totals and every row stays in that ULSS', () => {
  const all = buildView(data, 'control-tower');
  const filtered = buildView(data, 'control-tower', { ulss:'ULSS 6 Euganea' });
  assert.ok(filtered.rows.length < all.rows.length);
  assert.equal(filtered.kpis[0][1], filtered.rows.length);
  const ids = new Set(data.structures.filter(row => row.ulss === 'ULSS 6 Euganea').map(row => row.struttura_id));
  assert.ok(filtered.rows.every(row => ids.has(row.struttura_id)));
});

test('structure KPI counts unique structures instead of titles or units', () => {
  const view = buildView(data, 'strutture');
  assert.equal(view.kpis[0][1], new Set(data.structures.map(row => row.struttura_id)).size);
  assert.ok(view.kpis[2][1] > view.kpis[0][1]);
});

test('drill-down follows declared keys without multiplying parent records', () => {
  const id = data.procedures[0].procedimento_id;
  const detail = buildDetail(data, 'control-tower', id);
  assert.equal(detail.record.procedimento_id, id);
  assert.ok(detail.sections[0].rows.every(row => row.procedimento_id === id));
  assert.ok(detail.sections[1].rows.every(row => row.procedimento_id === id));
});

test('personal workspace returns one action per deadline for the selected demo assignee', () => {
  const assignee = 'S. Ferri';
  const workspace = buildWorkspace(data, assignee);
  const source = data.deadlines.filter(row => row.responsabile_azione === assignee);
  assert.equal(workspace.actions.length, source.length);
  assert.equal(new Set(workspace.actions.map(row => row.id)).size, source.length);
  assert.ok(workspace.actions.every(row => source.some(item => item.scadenza_id === row.id)));
  assert.equal(workspace.summary.open + workspace.summary.completed, workspace.actions.length);
});

test('domain-specific summaries respect the selected territory', () => {
  const view = buildView(data, 'strutture', { ulss: 'ULSS 6 Euganea' });
  assert.ok(view.focus.territories.every(row => row.label === 'ULSS 6 Euganea'));
  assert.equal(view.focus.horizon.reduce((sum, [, count]) => sum + count, 0), data.titles.filter(row => view.rows.some(structure => structure.struttura_id === row.struttura_id)).length);
});

test('geographic demo has one valid Veneto pin per site', () => {
  const csv = readFileSync(new URL('../data/vw_bi_strutture_sedi_geografia_mock_20261125.csv', import.meta.url), 'utf8');
  const sites = parseCsv(csv);
  assert.equal(sites.length, 72);
  assert.equal(new Set(sites.map(site => site.sede_id)).size, sites.length);
  assert.equal(new Set(sites.map(site => site.provincia)).size, 7);
  assert.equal(new Set(sites.map(site => site.ulss_nome)).size, 9);
  assert.ok(sites.every(site => Number(site.numero_sedi) === 1));
  assert.ok(sites.every(site => Number(site.latitudine) >= 44 && Number(site.latitudine) <= 47.5));
  assert.ok(sites.every(site => Number(site.longitudine) >= 10 && Number(site.longitudine) <= 14.5));
});
