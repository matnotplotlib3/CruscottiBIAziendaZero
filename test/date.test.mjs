import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDisplayDate } from '../web/date.js';

test('display dates use day/month/year without changing source values', () => {
  const source = '2026-09-17';
  assert.equal(formatDisplayDate(source), '17/09/2026');
  assert.equal(source, '2026-09-17');
  assert.equal(formatDisplayDate('2026-11-22 06:00:00'), '22/11/2026 06:00');
  assert.equal(formatDisplayDate('S. Ferri'), 'S. Ferri');
});
