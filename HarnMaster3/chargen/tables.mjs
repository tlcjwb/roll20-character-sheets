// HarnMaster3 chargen — generic roll/lookup table engine for the simple chargen tables
// (species, social class, sibling rank, parent, estrangement, clanhead, sunsign…). Same layered
// tri-state model as the bestiary/occupation engines, via the shared merge-util.
import { deepMerge, clone } from './merge-util.mjs';

export const TABLE_LAYERS = ['public', 'private', 'homebrew'];

// files: ordered [public, private, homebrew] (falsy skipped). Each file = { _meta:{layer}, tables:{id:{…}} }.
// Same table id across layers is deep-merged (a layer overrides only the fields it states) with an
// accumulated `sources` array — consistent with the other engines.
export function mergeTables(files) {
  const tables = new Map();
  const sources = new Map();
  const warnings = [];
  for (const f of files || []) {
    if (!f) continue;
    const layer = f._meta && f._meta.layer;
    for (const [id, t] of Object.entries(f.tables || {})) {
      tables.set(id, deepMerge(tables.get(id) || {}, clone(t)));
      if (!sources.has(id)) sources.set(id, new Set());
      sources.get(id).add((t && t.source) || layer);
    }
  }
  for (const [id, set] of sources) tables.get(id).sources = [...set].filter(Boolean);
  return { tables, warnings };
}

// Find the d100 (or dN) range entry containing value v.
export function lookupByValue(table, v) {
  return (table.entries || []).find((e) => v >= e.lo && v <= e.hi) || null;
}

// Roll on a range table. `rng` returns [0,1). `mod` shifts the roll (e.g. eldest +5). Clamped to die.
export function rollOnTable(table, rng, mod = 0) {
  const sides = table.die ? parseInt(String(table.die).replace(/^d/i, ''), 10) || 100 : 100;
  const roll = 1 + Math.floor((rng || Math.random)() * sides);
  let value = roll + (mod || 0);
  if (value < 1) value = 1; if (value > sides) value = sides;
  return { roll, value, entry: lookupByValue(table, value) };
}

// ---- sunsign (date-based, not a d100 roll) ----
export const TUZYN_MONTHS = ['Nuzyael', 'Peonu', 'Kelen', 'Nolus', 'Larane', 'Agrazhar', 'Azura', 'Halane', 'Savor', 'Ilvin', 'Navek', 'Morgat'];
export const dayOfYear = (month, day) => (month - 1) * 30 + day; // month 1-12, day 1-30 → 1..360

// signs: [{ sign, symbol, fromDoy, toDoy }] (toDoy may wrap < fromDoy, e.g. Lado). Returns
// { sign, symbol, cusp } where cusp is the adjacent sign name when within 2 days of a boundary.
export function sunsignFor(month, day, signs) {
  const doy = dayOfYear(month, day);
  for (let i = 0; i < signs.length; i++) {
    const s = signs[i];
    const within = s.fromDoy <= s.toDoy ? (doy >= s.fromDoy && doy <= s.toDoy) : (doy >= s.fromDoy || doy <= s.toDoy);
    if (!within) continue;
    const distFrom = ((doy - s.fromDoy) + 360) % 360;
    const distTo = ((s.toDoy - doy) + 360) % 360;
    let cusp = null;
    if (distFrom < 2) cusp = signs[(i + signs.length - 1) % signs.length].sign;
    else if (distTo < 2) cusp = signs[(i + 1) % signs.length].sign;
    return { sign: s.sign, symbol: s.symbol, cusp };
  }
  return null;
}
