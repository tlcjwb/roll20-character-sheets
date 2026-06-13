// Regression tests for the data-migration trigger (the bug that re-showed the
// "sheet has been updated" notice on every open). These exercise the paths that do
// NOT run an actual migration (so they don't touch the worker's window[...] call):
// a brand-new character, and an already-current character with no legacy HWILL.
//
// Pre-fix, the HWILL branch fired every open for any character lacking HWILL
// (parseInt(undefined) !== 0 === true) and set notifyupgrade=1. The fix gates every
// heuristic branch on isNaN(dataVersion); these tests guard that.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from '../testkit/harness.mjs';

const CURRENT = '20240917'; // last entry in versionsWithMigrations

test('new character: stamped current, no upgrade notice', () => {
  const m = loadWorker({ initial: { character_name: 'Test' } }); // no data_version, no HWILL
  m.fire('sheet:opened');
  assert.equal(m.get('data_version'), CURRENT, 'data_version should be stamped to current');
  assert.notEqual(m.get('notifyupgrade'), '1', 'new character must not raise the upgrade notice');
});

test('already-current character without HWILL does NOT re-migrate or re-notify (the bug)', () => {
  const m = loadWorker({ initial: { character_name: 'Test', data_version: CURRENT } }); // no HWILL
  m.fire('sheet:opened');
  assert.equal(m.get('data_version'), CURRENT, 'data_version unchanged');
  assert.notEqual(m.get('notifyupgrade'), '1', 'must not raise the upgrade notice on a current sheet');
});

test('reopening repeatedly stays quiet (no notice accrues)', () => {
  const m = loadWorker({ initial: { character_name: 'Test', data_version: CURRENT } });
  m.fire('sheet:opened');
  m.fire('sheet:opened');
  m.fire('sheet:opened');
  assert.notEqual(m.get('notifyupgrade'), '1');
});
