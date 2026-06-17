# Phase 10 — Character-Generation JSON Contract (`harnchar` v1)

The load-bearing piece that spans all three programs:

```
local HTML generator  ──emit──►  harnchar JSON  ──consume──►  !harnimport Mod  ──setAttrs/createObj──►  sheet
                                       │
                                       └── (non-Pro) hand-entry: user reads the JSON / printed summary and types it in
```

This file is the single source of truth for that JSON. The generator builds **to** it,
the importer reads **from** it, and every field maps to a **real sheet attribute name**
(verified against `harnsheet.html`, 2026-06-14).

---

## Principles

1. **Emit inputs, not derived values.** The sheet auto-calculates SB (when auto-calc is
   on), endurance, move, initiative, penalties, armor coverage, comeliness effects, etc.
   The contract carries only what a human would *enter*: attributes, bio, skill rows
   (name + ML, and SB only when auto-calc is off), starting gear. The sheet recomputes
   the rest on import. (This is why getting attribute names right matters more than
   getting formulas right — the sheet owns the formulas.)
2. **Attribute names are authoritative.** Keys below are the exact `attr_<name>` from the
   sheet. The importer writes `setAttrs({ <name>: <value> })`; repeating rows are created
   with `createObj` + `generateRowID()` (sheet workers *cannot* create rows — only the Mod).
3. **Versioned envelope.** `"harnchar": 1` gates the importer. Bump on any breaking change.
4. **Forward-compatible magic.** The `magic` block is fully specified now (it maps to the
   sheet's existing `magicskill`/`spells`/`spell_convocation`) but the generator leaves it
   empty until HM Magic is owned in PDF. Nothing about the schema changes when we turn it on.

---

## Envelope

```json
{
  "harnchar": 1,
  "kind": "pc",               // "pc" | "creature" — selects the mode + which sections apply
  "generator": "harnchargen",
  "generatorVersion": "0.1.0",
  "build": "full",            // "full" = owner build (loads *.private.json); "dist" = public
  "createdNote": "stamped by the importer, not the generator (no Date.now in generator output)",
  "character": { /* sections below */ }
}
```

**`kind="pc"`** `character` sections: `identity`, `attributes`, `skills`, `combat`, `psyche`,
`honor`, `religion`, `magic`, `gear`. **`kind="creature"`** uses `identity` (reduced),
`attributes`, `archetype`, `size`, `movement`, `attacks`, `armor`, `skills`, `specialQualities`
(see §10). Each maps to sheet attrs as follows.

---

## 1. identity  →  bio attrs

| JSON `identity.*` | sheet attr | notes |
|---|---|---|
| `name` | `character_name` | |
| `species` | `species` | |
| `culture` | `culture` | |
| `socialClass` | `social_class` | |
| `sunsign` | `sunsign` | drives skill-SB sunsign mod on the sheet |
| `gender` | `gender` | |
| `age` | `age` | |
| `birthdate` | `birthdate` | |
| `birthplace` | `birthplace` | |
| `siblingRank` | `sibling_rank` | |
| `parentOccupation` | `parent` | sheet's "Parent" field |
| `clanHead` | `clanhead` | |
| `estrangement` | `estrangement` | |
| `frame` | `frame` | |
| `height` | `height` | |
| `weight` | `weight` | |
| `comeliness` | `cml` | |
| `complexion` | `complexion` | |
| `eyeColor` | `eye_color` | |
| `hairColor` | `hair_colors` | |
| `occupation` | **— NO SHEET ATTR —** | ⚠ see Gaps. Generator emits it; importer parks it in `various_notes` until a real field exists. |

## 2. attributes  →  attr scores (the sheet derives group rollups + SBs)

| JSON `attributes.*` | sheet attr |
|---|---|
| `str` `sta` `dex` `agl` `eye` `hrg` `sml` `voi` | `str` `sta` `dex` `agl` `eye` `hrg` `sml` `voi` |
| `int` `aur` `wil` | `int` `aur` `wil` |
| `morality` | `moral` |

(`comeliness` lives in identity → `cml`. `mental`/`physical`/`moral` group fields on the
sheet are computed; don't write them.)

## 3. skills  →  fixed skills + repeating skill sections

**Fixed skills** (one set of attrs each: `<key>_name`, `<key>_sb`, `<key>_ml`; sheet computes `_eml_eff`):
`awareness climbing condition dodge initiative intrigue jumping oratory rhetoric
ridingpersonal singing stealth throwing unarmed`

```json
"skills": {
  "fixed": { "climbing": { "ml": 36 }, "awareness": { "ml": 40 }, ... },
  "combat":        [ { "name": "Sword", "ml": 36 }, { "name": "Sword (Broadsword)", "ml": 36 } ],
  "physical":      [ { "name": "Acrobatics", "ml": 20 } ],
  "communication": [ { "name": "Lovecraft? no — Awareness is fixed; e.g. Mentation", "ml": 30 } ],
  "lore":          [ { "name": "Agriculture", "ml": 18 } ],
  "ritual":        [ ],
  "magic":         [ ]   // see magic block
}
```

Repeating-section attr names (row fields the importer sets per `createObj` row):

| JSON list | sheet section | per-row attrs |
|---|---|---|
| `skills.combat[]` | `repeating_combatskill` | `combatskill_name`, `combatskill_sb`, `combatskill_ml` |
| `skills.physical[]` | `repeating_physicalskill` | `physicalskill_name`, `physicalskill_sb`, `physicalskill_ml` |
| `skills.communication[]` | `repeating_communicationskill` | `communicationskill_name/_sb/_ml` |
| `skills.lore[]` | `repeating_loreskill` | `loreskill_name/_sb/_ml` |
| `skills.ritual[]` | `repeating_ritualskill` | `ritualskill_name/_sb/_ml` |
| `skills.magic[]` | `repeating_magicskill` | `magicskill_name/_sb/_ml` |

**SB rule:** if `attributes` are present and the sheet's auto-calc-SB is on (default), omit
`sb` per row and let the sheet compute it from name+attributes+sunsign. Only emit `sb` when
the generator knows auto-calc will be off. **ML rule:** the generator computes OML (SB×mult)
and emits it as `ml`; specialties (`Base (Specialty)`) inherit/open per the sheet's Phase 11
logic, so emit them at the same `ml` and let the sheet keep them linked.

## 4. combat  →  weapons (repeating)

```json
"combat": {
  "weapons":  [ { "name": "Broadsword", "ml": 36, "wq": "...", ... } ],   // repeating_weapon: weapon_name/_ml/_wq/_b/_e/_p/_atk/_def/_wgt/_note ...
  "missiles": [ ]                                                          // repeating_missileweapon: missileweapon_name/_ml/_short/_medium/_long/_extreme/_dmg ...
}
```
(Starting weapons are optional in v1 — chargen mainly produces skills; gear can come later.)

## 5. psyche  →  ⚠ NO SHEET HOME

The generator rolls psyche traits (labels + mechanical effects from the mechanics tables;
descriptions from the flavor file). The sheet has **no psyche field/section**. Until one
exists, the importer writes a formatted summary into `various_notes`. See Gaps.

```json
"psyche": [ { "trait": "phobia", "intensity": 3, "subject": "heights", "effect": "..." } ]
```

## 6. honor  →  ⚠ NO SHEET HOME

No `honor` attr on the sheet. Park in `various_notes` until a field is added. See Gaps.

```json
"honor": { "value": 12 }
```

## 7. religion  →  piety (Phase 3b territory)

Maps to the existing `repeating_piety` (`piety_name`, `piety_points`) + `ritual_religion`.
Generator may emit a deity; importer can seed a piety row. (Formal religion UX is Phase 3b.)

```json
"religion": { "deity": "Larani", "piety": 0 }
```

## 8. magic  →  spells / convocations (schema fixed now; generator leaves empty)

Maps to the sheet's existing magic UI: `repeating_magicskill` (the convocation skills),
`repeating_spells` (`spell_name`, `spell_convocation`, `spell_level`, `spell_ct`,
`spell_range`, `spell_duration`, `spell_eml`, `spell_note`), and `spell_convocation`.

```json
"magic": {
  "convocations": [ { "name": "Lyahvi", "ml": 30 } ],   // → repeating_magicskill rows
  "spells":       [ { "name": "...", "convocation": "Lyahvi", "level": 1, "ct": "...", "range": "...", "duration": "...", "eml": 30, "note": "" } ]
}
```

**Not generated until HM Magic is owned in PDF.** The block stays valid and empty
(`"convocations": [], "spells": []`) in the meantime. Because the sheet's magic section
already exists, a *hand-built* magic block would import today — so we likely do **not** need
to revisit the sheet for core magic. (Revisit is only needed for the **occupation/psyche/
honor** gaps below, not for magic.)

## 9. gear  →  inventory / money (optional, post-core)

`repeating_inventoryitems` (`inventory_name`, `inventory_wgt`, `inventory_iscarried`),
`repeating_armoritems`, and the `money_*` fields. Out of scope for the first core pipeline;
schema reserved.

---

## Repeating-row creation (importer responsibility)

```js
// Mod (!harnimport): for each skills.combat[] entry
const rowId = generateRowID();
createObj('attribute', { characterid: id, name: `repeating_combatskill_${rowId}_combatskill_name`, current: e.name });
createObj('attribute', { characterid: id, name: `repeating_combatskill_${rowId}_combatskill_ml`,   current: e.ml });
// SB omitted → sheet worker computes it on open
```

Non-Pro fallback: the generator also renders a **printable summary** (and shows the raw
JSON) so a user can hand-enter into the sheet.

---

## Gaps that may require sheet changes BEFORE import is complete

| Gap | Impact | Resolution |
|---|---|---|
| **No `occupation` attr** | Can't store the character's own occupation | Add `attr_occupation` (bio area). Until then → `various_notes`. |
| **No psyche section** | Rolled psyche traits have no structured home | Add a small `repeating_psyche` (or a notes block). Until then → `various_notes`. |
| **No honor attr** | Honor has no home | Add `attr_honor`. Until then → `various_notes`. |
| **Magic** | none | Sheet already supports it — no change needed. |

These are additive sheet edits (new fields) → **patch bumps**, no migration. We can do the
core pipeline now (parking the three into `various_notes`) and promote them to real fields in
a follow-up sheet patch when we wire the importer for real.

---

## Flow (Phase 10 #1) — wizard → editable long form

The generator is a **step wizard** that ends in a **single fully-editable long form**:

1. **Wizard stages** (each re-rollable, each overridable):
   `Species/Culture → Sunsign/Birth → Social class & family (sib rank, parent, clan,
   estrangement) → Attributes (roll 3d6/ as rules; re-roll or hand-set each) → Frame/
   Comeliness → Occupation (drives the skill bundle) → Skills (OMLs computed) → Psyche →
   Honor → (Magic: skipped/empty for now)`.
2. **Result = the long form.** After the last stage everything lands in one form where
   **any field can be tweaked** — change occupation and the skill bundle re-populates/
   re-OMLs live (this is the thing a chat-driven Mod *couldn't* do, and the reason the
   brains live in local HTML).
3. **Export.** "Copy JSON" (for `!harnimport`) + "Print summary" (for hand-entry). The
   generator never writes to a sheet directly.

---

## Flavor files (built in conjunction with this contract)

Prose is the only copyrighted layer. It is **not embedded** in the generator. Two files,
same schema (`chargen/flavor.dist.json`, `chargen/flavor.private.json`):

- **`flavor.dist.json`** — DISTRIBUTION template: every key present, **all values empty**.
  Ships publicly. Contains no protected text.
- **`flavor.private.json`** — OWNER file: same keys, populated by someone who owns the
  rulebook, from their own copy. **git-ignored**, never distributed.

The generator loads `flavor.private.json` if present (owner build → rich descriptions),
else falls back to labels only (dist build). Flavor keys mirror the generator's **mechanics
data IDs** (e.g. psyche trait `phobia`, occupation `mercenary`, creature `lion`) so a
description attaches to its mechanical result by key. Keys are finalized alongside the
mechanics-data transcription. **Creature descriptions live here too** — even a *public*
creature's 4001 prose is Columbia's expression, so a Lion's stat block is public but its
description is owner-populated flavor.

---

## 10. Creature mode (`kind="creature"`)

A creature is its **own standalone character sheet** (not part of a PC). It reuses the sheet's
attribute keys (`str sta dex agl eye hrg sml voi int aur wil` — irrelevant ones left blank) so
it rides the same `harnsheet.html` in **creature mode** (`kind=creature` + an `archetype`
toggle that hides PC/life-path fields **and the mount section**, and switches the hit-location
set). Phase 7's mount-import is a *separate* path that reads a creature sheet's **live** attrs
at runtime — it does NOT consume this JSON; the only thing shared is the creature attribute
layout.

```json
"character": {
  "identity": { "name": "Lion", "species": "Lion" },   // reduced: name/species only
  "archetype": "quadruped",                              // default hit-location set (overridable below)
  "size": "large",
  "attributes": { "str": 18, "sta": 16, "agl": 16, "dex": 12, "eye": 14, "hrg": 14, "sml": 16, "int": 5, "wil": 12 },
  "movement": { "walk": 0, "run": 0, "notes": "" },      // rates per mounted/movement rules
  "attacks":  [ { "name": "Bite", "ml": 80, "impact": 8, "aspect": "p" },
                { "name": "Claw", "ml": 75, "impact": 6, "aspect": "e" } ],
  "armor":    { "natural": "Hide", "byLocation": { /* loc → b/e/p */ } },
  "hitLocations": [ /* OPTIONAL per-creature override; omit to use the archetype default.
                       Each: { "name", "lo", "hi" (d100 range), "armor": {b,e,p}, "impactMod" } */ ],
  "skills":   [ { "name": "Awareness", "ml": 70 }, { "name": "Dodge", "ml": 60 } ],
  "specialQualities": [ "Pounce", "Night vision" ]
}
```

**Sheet target (Phase 7 work):** creature-mode hit locations are **data-driven** — a
`repeating_hitlocation`-style section (name, d100 range, armor b/e/p, impact mod) seeded from
the `archetype` component but overridable per creature (the five Ivashu each ship their own
table). PC + horse layouts are **left untouched** (additive, no migration); the data-driven
location set is creature-mode only.

---

## 11. Bestiary data model (`chargen/bestiary*.json`)

Creature stat blocks are functional mechanics (public by the §102(b) principle, like the
weapon/armour/occupation tables); only copyrightable **prose/lore** is protected (it lives in
`flavor.*.json`), and coined **names** aren't copyright (we already ship deities/convocations/
sunsigns). **DECISION 2026-06-17:** all **4001-core** creature stat blocks ship **public** in
`bestiary.json` — there is no `bestiary.private.json` today. The bestiary is still **tri-state**
(per-node `setting` is the source of truth) so that a future **UNOWNED supplement** (4601-Bestiary /
4611-Ivashu) can be added as a `harn` layer if/when needed:

| File | `setting` | Ships? | git |
|---|---|---|---|
| `bestiary.json` | `public` | yes (public build) | committed |
| `bestiary.homebrew.json` | `homebrew` | shareable (your creations) | committed |
| `bestiary.private.json` | `harn` | **never** | **git-ignored** (only created for unowned-supplement content) |

A "share my bestiary" export = public + homebrew, never private. A lint asserts no
`setting:"harn"` node sits in `bestiary.json`, and that `setting` matches the file.

### Composition over rigid levels

The taxonomy is **Genus → … → leaf** (arbitrary depth) for browsing + IP tagging, but the
*mechanics* come from **composition**, not the level:

- **`extends`** (single inheritance): a node may extend a parent by id and override deltas. A
  breed = `extends: <baseline>` + a few overrides + its name. (Lion = a leaf, no parent;
  `chelni` = `extends: horse-baseline, setting: harn`.)
- **Components** (referenced by id, defined once, reused): `archetype` (→ default hit-location
  set), `sizeClass` (→ movement/carry from the mounted-rules table), etc. The cross-cutting
  axes (the stuff "spread through combat") live once and are referenced everywhere.
- **`rank`** (`genus|species|breed`) is a **soft label** — UI grouping + an IP heuristic (the
  coined/private part is usually the breed/sub-type) — it does **not** drive mechanics.

### Node shape

```json
{
  "id": "chelni",                 // stable; private nodes attach under a public genus by parent id
  "name": "Chelni",
  "rank": "breed",                // soft label
  "setting": "public|homebrew|harn",
  "genus": "horse",               // taxonomy parent (a node, may be public even if this node is harn)
  "extends": "horse-baseline",    // optional single-inheritance source
  "selectable": true,             // a complete creature you can import (vs. an abstract baseline)
  "archetype": "quadruped",       // component ref → default hitLocations
  "sizeClass": "medium",          // component ref → movement/carry
  "attributes": { "str": 14 },    // overrides merged onto the resolved parent
  "attacks": [ ... ], "armor": { ... }, "hitLocations": [ ... ],
  "skills": [ ... ], "specialQualities": [ ... ],
  "flavorKey": "chelni"           // → flavor.*.json description (always owner-populated)
}
```

### Resolution + lint (the engine, `chargen/bestiary.mjs`)

- **merge:** load whichever of the three files exist (precedence `public → homebrew → private`) →
  one node map. Same id across layers is **per-field deep-merged** (a later layer overrides only the
  fields it states; the rest inherits) and the node gets an accumulated **`sources`** array — same
  model as the occupation engine (§12), via the shared `chargen/merge-util.mjs`. Each node carries a
  **`source`** tag (provenance, e.g. `"4001"`, `"4611"`, `"homebrew"`), orthogonal to `setting`
  (distribution tier). Distinct id ⇒ a separate selectable entry instead of an override.
- **resolve(id):** walk the `extends` chain (baseline → … → leaf), deep-merge overrides, then
  expand component refs (`archetype` → default `hitLocations` unless the node overrides them;
  `sizeClass` → movement/carry) into one complete, importable block.
- **lint:** `setting` matches the file; no `harn` in the public file; every `selectable` node
  resolves (parent + components present); ids unique within a file.

### What ships in `bestiary.json` v1

All **non-IP** creatures from the 4001 bestiary tables (p.3–8) — generic name + functional
stats = public (Lion, Killer Whale, Werewolf, …) — plus the component definitions (archetypes,
size classes) and generic genus nodes. The **three articles (Gargun/Ivashu/Yelgri) and any
Hârn-coined genus/species/breed — including their unique hit-location tables — go to
`bestiary.private.json`.** Per-entry coined-vs-generic classification is done during the
transcription pass (not pre-listed here).

---

## 12. Occupation data model (`chargen/occupations*.json`) — engine `chargen/occupations.mjs`

The occupation→skill bundle that drives PC chargen (`identity.occupation` + `skills`). Functional
data (uncopyrightable mechanics), but split by **source**: core 4001 ships; purchased supplements are
owner-only (owner decision 2026-06-14).

| File | layer | Ships? | git |
|---|---|---|---|
| `occupations.json` | `public` | yes — the 4001 Occupational Skills table (Character 15) | committed (generated) |
| `occupations.private.json` | `private` | **no** — supplement expansions (4823 Ostlers, etc.) | **git-ignored** |
| `occupations.homebrew.json` | `homebrew` | shareable | committed |

### Layering (the override question, decided 2026-06-14)
Files merge in **precedence order `public → private → homebrew`**, **per-field deep-merge by id**
(not wholesale replace): a later layer overrides only the fields it specifies; everything else
inherits. So 4823 augments the 4001 Ostler with a `guilded` flag + specializations **without
restating its skill bundle**. `mergeOccupations` accumulates a **`sources`** array (e.g.
`["4001","4823"]`) shown in the UI.
- **Same id ⇒ merge/override** (with that precedence).
- **Distinct id ⇒ a separate selectable entry** — this is how you "list a variant and let the user
  pick" (give it its own id) rather than overriding.

### Shapes
```json
// occupation
{ "id":"ostler", "name":"Ostler", "category":"unguilded|guilded|noble", "years":5, "source":"4001",
  "skills":[{ "name":"Horsecraft", "oml":4 }, …],   // oml = OML multiplier; ML = SB × oml
  "special":["Three weapons at OML+SB×2", "Script", …],   // verbatim non-numeric grants
  "guilded":"Mangai", "optionPointOptions":[…], "selectable":true, "flavorKey":"ostler" }
// specialization (a child of an occupation, like a breed extends a baseline)
{ "id":"farrier", "of":"ostler", "name":"Farrier", "source":"4823",
  "skills":[{ "name":"Metalcraft", "oml":3 }], "skillEmphasis":["Horsecraft","Physician"] }
```
`resolveOccupation(merged, id, {specialization})` returns the occupation + `availableSpecializations`,
and (when a specialization is chosen) folds its skills into the bundle. `lintOccupations` checks
layer, unique ids, numeric `oml`, and that every `specialization.of` resolves.

### Tools
`chargen/tools/parse-occupations.mjs` generates `occupations.json` from 4001 Character 15
(`[srcTxt startLine endLine outJson]`). `chargen/tools/lint-occupations.mjs` validates + resolves.
Supplement expansions are hand-authored into `occupations.private.json` (owner-only).
