#!/usr/bin/env node
// build-equipment-lythia.mjs — condense the HM3 Comprehensive Price List (CPL)
// Foundry module (toastygm/hm3-cpl, derived from the lythia.com CPL by Scythen)
// into a single chargen data file: chargen/equipment.lythia.json.
//
// We keep ONLY functional fields (item name, price in d, weight, and the
// mechanical armor/container stats). Descriptive prose (system.notes /
// system.description) is intentionally DROPPED — chargen never needs it and it
// keeps the copyrighted expression out of the file. The underlying compilation
// is CC BY-NC-SA 3.0, so the _meta block carries the required attribution and
// the file is git-ignored + loaded at runtime by choice (never inlined).
//
// Usage:  node chargen/tools/build-equipment-lythia.mjs <path-to-hm3-cpl-checkout>
// e.g.    node chargen/tools/build-equipment-lythia.mjs /tmp/hm3-cpl-main
//
// Re-fetch the source with:
//   curl -sL https://github.com/toastygm/hm3-cpl/archive/refs/heads/main.tar.gz | tar xz -C /tmp

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'equipment.lythia.json');

const src = process.argv[2];
if (!src || !existsSync(join(src, 'module.json'))) {
  console.error('Usage: node build-equipment-lythia.mjs <path-to-hm3-cpl-checkout>');
  console.error('  (the directory must contain module.json and packs/)');
  process.exit(1);
}

const mod = JSON.parse(readFileSync(join(src, 'module.json'), 'utf8'));
const labelOf = {};
for (const p of mod.packs || []) labelOf[p.name] = p.label || p.name;

const round = (n) => (typeof n === 'number' ? Math.round(n * 1000) / 1000 : n);

// Pull a single item record down to the chargen-relevant, functional fields.
function condense(raw) {
  const s = raw.system || {};
  const item = { name: String(raw.name || '').trim(), d: round(s.value), wt: round(s.weight) };
  if (raw.type === 'armorgear') {
    item.kind = 'armor';
    if (s.material) item.material = s.material;
    if (Array.isArray(s.locations) && s.locations.length) item.locations = s.locations;
    if (s.protection) {
      const p = s.protection;
      item.protection = { b: p.blunt | 0, e: p.edged | 0, p: p.piercing | 0, f: p.fire | 0 };
    }
  } else if (raw.type === 'containergear') {
    item.kind = 'container';
    if (s.capacity && s.capacity.max != null) item.capacity = round(s.capacity.max);
  } else {
    item.kind = 'item';
  }
  return item;
}

const packsDir = join(src, 'packs');
const vendors = [];
let total = 0;

for (const packName of readdirSync(packsDir).sort()) {
  const srcDir = join(packsDir, packName, '_source');
  if (!existsSync(srcDir)) continue; // skip the compiled .db blobs
  const items = readdirSync(srcDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => condense(JSON.parse(readFileSync(join(srcDir, f), 'utf8'))))
    .filter((it) => it.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!items.length) continue;
  total += items.length;
  vendors.push({ id: packName.replace(/^cpl-/, ''), label: labelOf[packName] || packName, items });
}

vendors.sort((a, b) => a.label.localeCompare(b.label));

const out = {
  _meta: {
    harnequip: 1,
    build: 'lythia',
    note:
      'OPTIONAL, runtime-loaded price catalog — NOT inlined into the generator and NOT part of ' +
      'the distributed sheet. Load it via the Equipment file picker only if you accept the license. ' +
      'Functional data only (item / price-in-d / weight / armor+container stats); descriptive prose dropped.',
    units: 'Prices are in d (pennies/deniers). Weight in pounds. Names may encode a unit (e.g. "per oz", "ea").',
    source: 'Comprehensive Price List (lythia.com)',
    upstream: 'https://github.com/toastygm/hm3-cpl',
    compiledBy: 'Scythen',
    license: 'CC BY-NC-SA 3.0 (Attribution-NonCommercial-ShareAlike)',
    licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/3.0/',
    vendorCount: vendors.length,
    itemCount: total,
  },
  vendors,
};

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`equipment.lythia.json: ${vendors.length} vendors, ${total} items → ${OUT}`);
