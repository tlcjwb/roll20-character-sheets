#!/usr/bin/env node
// build-equipment.mjs — emit chargen/equipment.json (PUBLIC) from the 4001 CORE
// Combat 3 (Weapon Data) + Combat 4 (Armour Data) + Combat 5 (Armour Protective Values) tables.
//
// This is FUNCTIONAL game data (item names, weights, prices, protection values, weapon classes) —
// uncopyrightable mechanics, same status as skill names/OMLs — so it ships PUBLIC and is inlined
// into the built generator (unlike the CC-licensed equipment.lythia.json, which is owner-loaded).
// Transcribed by hand from the owner's 4001 PDF (v3.5.2); prose/descriptions are NOT included.
//
// Schema matches equipment.lythia.json (`_meta.harnequip` + vendors[].items[]) so the picker
// merges both. Weapon items add weapon-specific fields (class/oml/wq/ad/hm/impact) for future
// repeating_weapon routing; the picker itself only needs name/d/wt.
//
// Run:  node chargen/tools/build-equipment.mjs

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'equipment.json');

// ── Combat 3 — Weapon Data Table ───────────────────────────────────────────
// Row: [name, class, oml, wt(lb), wq, ad, hm, B, E, P, price]. "•"/"-" = none(0); price "n/a"=null;
// price prefixes M/W/H (craftsman code in the price list) are preserved in `pr`, numeric pence → d.
const W = '•';
const WEAPONS = [
  // Sword (SB×3)
  ['Longknife', 'Sword', 'SB×3', 1, 12, '10/15', W, 1, 3, 5, '96d'],
  ['Shortsword', 'Sword', 'SB×3', 2, 12, '10/5', W, 2, 4, 4, '90d'],
  ['Mankar', 'Sword', 'SB×3', 2, 11, '10/5', W, 2, 5, 0, '84d'],
  ['Mang', 'Sword', 'SB×3', 3, 11, '15/10', '–5', 3, 6, 0, '110d'],
  ['Broadsword', 'Sword', 'SB×3', 3, 12, '15/10', W, 3, 5, 3, '150d'],
  ['Estoc', 'Sword', 'SB×3', 3, 11, '15/10', W, 3, 0, 6, '150d'],
  ['Falchion', 'Sword', 'SB×3', 4, 12, '15/5', W, 4, 6, 1, '120d'],
  ['Bastard Sword', 'Sword', 'SB×3', 5, 12, '20/10', '–10', 4, 7, 4, '180d'],
  ['Battlesword', 'Sword', 'SB×3', 8, 13, '25/10', '–20', 5, 8, 4, '230d'],
  // Dagger (SB×3)
  ['Knife', 'Dagger', 'SB×3', 1, 10, '5/0', W, 0, 1, 4, 'M/6d'],
  ['Dagger', 'Dagger', 'SB×3', 1, 11, '5/5', W, 1, 2, 5, '24d'],
  ['Taburi', 'Dagger', 'SB×3', 1, 10, '5/0', W, 0, W, 4, '20d'],
  ['Keltan', 'Dagger', 'SB×3', 2, 12, '5/10', W, 2, 0, 3, '36d'],
  // Club (SB×4)
  ['Stick (2ft)', 'Club', 'SB×4', 2, 9, '5/5', W, 2, W, 2, 'n/a'],
  ['Club', 'Club', 'SB×4', 3, 9, '15/5', W, 4, W, 3, 'W/12d'],
  ['Mace', 'Club', 'SB×4', 4, 11, '15/5', W, 6, W, W, '84d'],
  ['Morningstar', 'Club', 'SB×4', 5, 11, '20/5', '–10', 0, W, 5, '48d'],
  ['Maul', 'Club', 'SB×4', 7, 9, '20/5', '–20', 7, W, W, 'W/24d'],
  // Axe (SB×3)
  ['Sickle', 'Axe', 'SB×3', 1, 9, '5/5', W, 1, 4, 3, 'M/10d'],
  ['Shorkana', 'Axe', 'SB×3', 2, 10, '5/5', W, 3, 5, W, '48d'],
  ['Hatchet', 'Axe', 'SB×3', 2, 9, '5/5', W, 3, 4, W, 'M/12d'],
  ['Handaxe', 'Axe', 'SB×3', 3, 11, '10/5', W, 4, 6, 4, '72d'],
  ['Warhammer', 'Axe', 'SB×3', 5, 11, '15/5', '–5', 6, W, 5, '90d'],
  ['Battleaxe', 'Axe', 'SB×3', 6, 12, '20/10', '–15', 6, 9, 6, '100d'],
  // Flail (SB×1)
  ['Nachakas', 'Flail', 'SB×1', 1, 10, '15/10', W, 4, W, W, '12d'],
  ['Grainflail', 'Flail', 'SB×1', 2, 9, '20/5', W, 5, W, W, 'W/12d'],
  ['Ball & Chain', 'Flail', 'SB×1', 4, 12, '20/10', W, 8, W, 6, '60d'],
  ['Warflail', 'Flail', 'SB×1', 5, 11, '25/10', '–20', 9, W, 6, '60d'],
  // Spear
  ['Staff', 'Spear', 'SB×3', 4, 11, '20/15', '–10', 4, W, W, 'W/36d'],
  ['Javelin', 'Spear', 'SB×3', 3, 10, '15/5', '–10', 2, W, 6, '48d'],
  ['Spear (6ft)', 'Spear', 'SB×3', 5, 11, '20/10', '–10', 4, W, 7, '60d'],
  ['Trident', 'Spear', 'SB×3', 6, 12, '20/15', '–10', 4, W, 5, '72d'],
  ['Lance (10ft)', 'Spear', 'SB×2', 8, 11, '25/5', '–15', 4, W, 8, '120d'],
  ['Jousting Pole', 'Spear', 'SB×2', 8, 8, '25/5', '–25', 3, W, W, '40d'],
  // Polearm (SB×2)
  ['Glaive/Bill', 'Polearm', 'SB×2', 8, 11, '25/10', '–20', 6, 7, 6, '84d'],
  ['Poleaxe (10ft)', 'Polearm', 'SB×2', 8, 11, '25/5', '–15', 6, 9, 6, '96d'],
  ['Pike (12ft)', 'Polearm', 'SB×2', 12, 12, '25/5', '–25', 4, W, 8, '96d'],
  // Net / Whip
  ['Net', 'Net', 'SB×1', 4, 9, '20/0', W, 2, W, 1, '48d'],
  ['Whip', 'Whip', 'SB×1', 2, 9, '25/5', W, 2, 1, W, 'H/12d'],
  ['Isagra', 'Whip', 'SB×1', 4, 11, '25/5', W, 3, 3, W, 'H/20d'],
  // Bow (SB×2) — the missile launchers
  ['Crossbow', 'Bow', 'SB×2', 5, 10, '5/5', 'n/a', 3, W, W, '60d'],
  ['Shortbow', 'Bow', 'SB×2', 2, 10, '5/5', 'n/a', 1, W, W, '24d'],
  ['Longbow', 'Bow', 'SB×2', 3, 11, '5/5', 'n/a', 2, W, W, '36d'],
  ['Hartbow', 'Bow', 'SB×2', 2, 13, '5/5', 'n/a', 1, W, W, '96d'],
  // Blowgun / Sling
  ['Blowgun', 'Blowgun', 'SB×4', 1, 8, '5/5', 'n/a', 1, W, W, '12d'],
  ['Sling', 'Sling', 'SB×1', 0, 9, 'n/a', W, W, W, W, 'H/6d'],
  ['Staff Sling', 'Sling', 'SB×1', 1, 10, '5/0', '–10', 1, W, W, 'W/12d'],
];

// ── Combat 5 — Armour Protective Values (per material: Blunt/Edge/Point/Fire) ──
const MATERIAL_PROT = {
  Cloth: { b: 1, e: 1, p: 1, f: 1 },
  Quilt: { b: 5, e: 3, p: 2, f: 4 },
  Leather: { b: 2, e: 4, p: 3, f: 3 },
  Kurbul: { b: 4, e: 5, p: 4, f: 3 },
  Ring: { b: 3, e: 6, p: 4, f: 3 },
  Mail: { b: 2, e: 8, p: 5, f: 1 },
  Scale: { b: 5, e: 9, p: 4, f: 5 },
  Plate: { b: 6, e: 10, p: 6, f: 2 },
};

// ── Combat 4 — Armour Data (pieces by material): [piece, wt, price, coverage-codes] ──
const LOC = {
  Ab: 'Abdomen', Bk: 'Back', Ca: 'Calves', Ch: 'Chest', El: 'Elbow', Fa: 'Face', Fo: 'Forearms',
  Ft: 'Feet', Gr: 'Groin', Ha: 'Hands', Hp: 'Hips', Kn: 'Knees', Nk: 'Neck', Sh: 'Shoulders',
  Sk: 'Skull', Th: 'Thighs', Tx: 'Thorax', Ua: 'Upper Arms',
};
const ARMOUR = {
  Cloth: [
    ['Cap', 0.4, '8d', 'Sk'], ['Hood', 0.8, '16d', 'Sk Nk'], ['Vest', 2.8, '56d', 'Sh Tx Ab'],
    ['Tunic', 4.4, '88d', 'Ua Sh Tx Ab Hp Gr'], ['Surcoat', 5.3, '106d', 'Sh Tx Ab Hp Gr Th'],
    ['Robe', 7.9, '158d', 'Ua Sh Tx Ab Hp Gr Fo El Th Kn Ca'], ['Leggings', 4.4, '88d', 'Hp Gr Th Kn Ca Ft'],
  ],
  Leather: [
    ['Cap', 0.8, '16d', 'Sk'], ['Cowl', 1.6, '32d', 'Sk Nk'], ['Vest', 5.6, '112d', 'Sh Tx Ab'],
    ['Tunic', 8.8, '176d', 'Ua Sh Tx Ab Hp Gr'], ['Surcoat', 10.6, '212d', 'Sh Tx Ab Hp Gr Th'],
    ['Leggings', 8.8, '176d', 'Hp Gr Th Kn Ca Ft'], ['Shoes/2', 1.2, '24d', 'Ft'],
    ['Calf Boots/2', 3.2, '64d', 'Ca Ft'], ['Knee Boots/2', 3.8, '76d', 'Kn Ca Ft'], ['Gauntlets/2', 0.8, '16d', 'Ha'],
  ],
  Quilt: [
    ['Cap', 1.2, '16d', 'Sk'], ['Cowl', 2.4, '32d', 'Sk Nk'], ['Tunic', 13.2, '176d', 'Ua Sh Tx Ab Hp Gr'],
    ['Gambeson', 19.8, '264d', 'Fo El Ua Sh Tx Ab Hp Gr Th'], ['Leggings', 13.2, '176d', 'Hp Gr Th Kn Ca Ft'],
  ],
  Ring: [
    ['Halfhelm', 1.6, '28d', 'Sk'], ['Vest', 11.2, '196d', 'Sh Tx Ab'], ['Byrnie', 17.6, '308d', 'Ua Sh Tx Ab Hp Gr'],
    ['Hauberk', 26.4, '462d', 'Fo El Ua Sh Tx Ab Hp Gr Th'], ['Leggings', 17.6, '308d', 'Hp Gr Th Kn Ca Ft'], ['Gauntlets/2', 1.6, '28d', 'Ha'],
  ],
  Mail: [
    ['Cowl', 4.0, '120d', 'Sk Nk'], ['Byrnie', 22.0, '660d', 'Ua Sh Tx Ab Hp Gr'], ['Hauberk', 33.0, '990d', 'Fo El Ua Sh Tx Ab Hp Gr Th'],
    ['Leggings', 22.0, '660d', 'Hp Gr Th Kn Ca Ft'], ['Mittens/2', 2.0, '60d', 'Ha'],
  ],
  Scale: [
    ['Vest', 19.6, '280d', 'Sh Tx Ab'], ['Byrnie', 30.8, '440d', 'Ua Sh Tx Ab Hp Gr'], ['Hauberk', 46.2, '660d', 'Fo El Ua Sh Tx Ab Hp Gr Th'],
  ],
  Kurbul: [
    ['Halfhelm', 1.0, '20d', 'Sk'], ['Breastplate', 3.0, '60d', 'Ch'], ['Backplate', 3.0, '60d', 'Bk'],
    ['Ailettes/2', 1.0, '20d', 'Sh'], ['Rerebraces/2', 1.5, '30d', 'Ua'], ['Coudes/2', 0.5, '10d', 'El'],
    ['Vambraces/2', 1.3, '25d', 'Fo'], ['Kneecops/2', 0.8, '15d', 'Kn'], ['Greaves/2', 2.5, '50d', 'Ca'],
  ],
  Plate: [
    ['Halfhelm', 3.2, '100d', 'Sk'], ['3/4 Helm', 5.6, '175d', 'Sk Fa'], ['Great Helm', 8.8, '275d', 'Sk Fa Nk'],
    ['Breastplate', 9.6, '300d', 'Ch'], ['Backplate', 9.6, '300d', 'Bk'], ['Ailettes/2', 3.2, '100d', 'Sh'],
    ['Rerebraces/2', 4.8, '150d', 'Ua'], ['Coudes/2', 1.6, '50d', 'El'], ['Vambraces/2', 4.0, '125d', 'Fo'],
    ['Kneecops/2', 2.4, '75d', 'Kn'], ['Greaves/2', 8.0, '250d', 'Ca'],
  ],
};

// ── helpers ─────────────────────────────────────────────────────────────────
const priceD = (pr) => { const m = /(\d+)\s*d/.exec(pr); return m ? Number(m[1]) : null; };
const num = (x) => (x === W || x === '-' || x == null ? 0 : Number(x));
const cell = (x) => (x === W || x === 'n/a' ? null : x);

const weaponItems = WEAPONS.map(([name, cls, oml, wt, wq, ad, hm, b, e, p, pr]) => {
  const it = { name, kind: 'weapon', class: cls, oml, wt, d: priceD(pr) };
  if (priceD(pr) == null || /^[MWH]\//.test(pr)) it.pr = pr; // preserve n/a + craftsman-prefixed prices
  it.wq = wq; it.ad = ad;
  if (cell(hm) != null) it.hm = hm;
  it.impact = { b: num(b), e: num(e), p: num(p) };
  return it;
});

const armourItems = [];
for (const [material, pieces] of Object.entries(ARMOUR)) {
  const prot = MATERIAL_PROT[material];
  for (const [piece, wt, pr, cov] of pieces) {
    armourItems.push({
      name: `${material} ${piece}`, kind: 'armor', material, d: priceD(pr), wt,
      locations: cov.split(/\s+/).map((c) => LOC[c] || c), protection: prot,
    });
  }
}

const out = {
  _meta: {
    harnequip: 1,
    build: 'public',
    distribution: 'public',
    note:
      'PUBLIC core 4001 equipment — functional game data (names/weights/prices/protection/weapon class), ' +
      'inlined into the generator. No prose. Weapons = Combat 3 Weapon Data; armour = Combat 4 Armour Data + ' +
      'Combat 5 Armour Protective Values. Prices in d (pennies); M/W/H price prefixes are craftsman codes.',
    source: 'HarnMaster Third Edition core (4001), Combat 3-5',
    edition: 'v3.5.2',
    vendorCount: 2,
    itemCount: weaponItems.length + armourItems.length,
  },
  vendors: [
    { id: 'weapons-4001', label: 'Weapons (4001)', items: weaponItems.sort((a, b) => a.class.localeCompare(b.class) || a.name.localeCompare(b.name)) },
    { id: 'armour-4001', label: 'Armour (4001)', items: armourItems.sort((a, b) => a.name.localeCompare(b.name)) },
  ],
};

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`equipment.json: ${out.vendors.length} vendors, ${out._meta.itemCount} items (${weaponItems.length} weapons + ${armourItems.length} armour) → ${OUT}`);
