// Loads the REAL sheetworker code out of harnsheet.html and executes it against a
// Roll20 mock — so tests exercise the shipped worker, with no separate copy to drift.
//
// harnsheet.html stays the single source of truth: we extract the
// <script type="text/worker"> ... </script> block verbatim and run it in a function
// scope with the mock's on/getAttrs/setAttrs/getSectionIDs (plus stub window/console).

import fs from 'node:fs';
import { createMock } from './roll20-mock.mjs';

const SHEET_URL = new URL('../harnsheet.html', import.meta.url);

export function extractWorkerSource() {
  const html = fs.readFileSync(SHEET_URL, 'utf8');
  const m = html.match(/<script type="text\/worker">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('harness: <script type="text/worker"> block not found in harnsheet.html');
  return m[1];
}

// Build a mock, load the worker into it, and return the mock.
// `initial` seeds attribute values before the worker runs (optional).
// `loud` = true surfaces the worker's console.log output (default: silenced).
export function loadWorker({ initial = {}, loud = false } = {}) {
  const mock = createMock();
  const src = extractWorkerSource();
  const win = {}; // worker only touches window inside migration fns; not at load time
  const cons = loud ? console : { log() {}, warn() {}, error() {}, info() {} };

  // Capture Custom Roll Parsing calls (startRoll/finishRoll) so action-button handlers
  // can be tested: each startRoll pushes {template} to mock.rolls and its callback is
  // invoked with a stub result; finishRoll is a no-op.
  const rolls = [];
  const startRoll = (template, cb) => {
    rolls.push({ template });
    if (typeof cb === 'function') cb({ rollId: 'roll-' + rolls.length, results: {} });
  };
  const finishRoll = () => {};

  const factory = new Function(
    'on', 'getAttrs', 'setAttrs', 'getSectionIDs', 'window', 'console', 'startRoll', 'finishRoll',
    src + '\n//# sourceURL=harnsheet-worker.js'
  );
  factory(mock.on, mock.getAttrs, mock.setAttrs, mock.getSectionIDs, win, cons, startRoll, finishRoll);

  mock.rolls = rolls;
  mock.setAll(initial);
  return mock;
}
