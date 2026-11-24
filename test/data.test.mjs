import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadData, buildView, buildDetail, parseCsv } from '../lib/data.mjs';

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
