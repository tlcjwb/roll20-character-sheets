# chargen data tools

Reusable pipelines that turn HarnMaster rulebook tables into the chargen data files. The tools
contain **no IP** — they read the owner's licensed extracted text (git-ignored under `../PDF/`). Run
everything from `HarnMaster3/`; on WSL use `cmd.exe /c "node …"`.

Two datasets, same shape: tri-state files (`*.json` public · `*.homebrew.json` shareable ·
`*.private.json` owner-only/git-ignored), merged by the engines via the shared
`chargen/merge-util.mjs`. **One merge rule for both:** same id across layers ⇒ **per-field
deep-merge** (precedence `public → homebrew → private` for bestiary; `public → private → homebrew`
for occupations) with an accumulated **`sources`** array; **distinct id ⇒ a separate selectable
entry**. Each node carries a **`source`** provenance tag (e.g. `"4001"`, `"4611"`, `"homebrew"`),
orthogonal to its distribution tier.

---

# Bestiary tools

Turns rulebook creature tables into `chargen/bestiary.json` (public) + `bestiary.private.json` (harn).

## Pipeline

1. **Extract** the PDF to text (one-value-per-line) with `pdfx/extract.js` (pdf-parse). Find the
   line span covering the creature tables.
2. **Parse** → structured nodes, split public/harn by classification:
   ```
   node chargen/tools/parse-bestiary.mjs [srcTxt] [startLine] [endLine] [outJson]
   # default: ../PDF/4001-Harnmaster.txt 17134 23800 chargen/bestiary.parsed.json
   ```
   `bestiary.parsed.json` is a build intermediate that holds **both** the public and the **private
   (harn IP)** creature arrays — so it's **git-ignored** (`*.parsed.json`) and regenerated from the
   owner's PDF; never commit it.
   Count-agnostic: locates the `B# E# P# F#` armour block positionally, so it tolerates the format
   variants (no-armour Gargun, no-GAC Ivashu, missing-DGE, `*` footnote-marked cells). Flags any
   block it can't map (cellCount/preArmour) — those are the compressed `•×7` collapsed-physical
   creatures (Ethereals/Ghosts/Umbath), hand-coded in `assemble-bestiary.mjs`.
3. **Assemble** → the two shipped files (merges one or more parsed outputs + the hand-coded
   compressed creatures + Morvrin note + genus container nodes; reuses the `components` in
   `bestiary.json`):
   ```
   node chargen/tools/assemble-bestiary.mjs [parsed1.json parsed2.json ...]
   ```
4. **Lint/verify** (gates on errors):
   ```
   node chargen/tools/lint-bestiary.mjs
   ```
   Plus `node --test test/bestiary.test.mjs` for the engine itself.

## Adding a new source (e.g. 4601-Bestiary, 4611-Ivashu)

The architecture already absorbs growth — new creatures just append; ids dedup; the tri-state
split + composition (`extends`/components) are unchanged. Steps:

1. Extract the new PDF to `../PDF/<name>.txt` (owner-only, git-ignored).
2. In `parse-bestiary.mjs`, extend **`KNOWN_GENERA`**, **`PRIVATE_GENERA`**, **`PRIVATE_SPECIES`**,
   and **`GENUS_ARCHETYPE`** if it introduces new genera / coined species; set the node `source`.
3. Parse it to its own json: `parse-bestiary.mjs ../PDF/4601-Bestiary.txt <start> <end> chargen/bestiary.4601.parsed.json`.
4. Assemble all sources together:
   `assemble-bestiary.mjs chargen/bestiary.parsed.json chargen/bestiary.4601.parsed.json …`.
5. `lint-bestiary.mjs` + tests.

**Likely tweak:** the full supplements use in-depth **article** stat blocks (and per-creature
strike-location tables), not just the summary-table layout these tools handle — expect to adjust the
parser for that format. A 4611 article augments a 4001 summary creature **by the same id** (it states
only the new fields; `sources` ends up `["4001","4611"]`). The tools are designed to be edited + re-run.

---

# Occupation tools

Turns the rulebook Occupational-Skills table into `chargen/occupations.json` (public). Supplement
expansions (owner-only) are **hand-authored** into `occupations.private.json` (4823 has no clean
SB×N bundles — see below); `occupations.homebrew.json` is the shareable user layer.

## Pipeline

1. **Parse** the 4001 table (Character 15) → the public file:
   ```
   node chargen/tools/parse-occupations.mjs [srcTxt] [startLine] [endLine] [outJson]
   # default: ../PDF/4001-Harnmaster.txt 2183 2245 chargen/occupations.json
   ```
   One line per occupation: `<Name> <Yrs> <skill/oml, …>`. `oml` = OML multiplier (ML = SB × oml).
   Non-numeric grants (`Script`, `2nd Language`, `Three weapons at OML+SB×2`, `Depends on deity…`)
   are kept verbatim in `special[]`. Categories: UNGUILDED / GUILDED / NOBLE.
2. **Lint/verify** (gates on errors — checks layer, unique ids, numeric `oml`, and that every
   `specialization.of` resolves):
   ```
   node chargen/tools/lint-occupations.mjs
   ```
   Plus `node --test test/occupations.test.mjs` for the engine.

> There is no `assemble-occupations` step — the parser writes `occupations.json` directly, and the
> private/homebrew layers are small hand-authored files merged at load by `mergeOccupations`.

## Adding a supplement expansion (owner-only, e.g. 4823-Ostlers)

Supplement occupation content ships **only if owned** (owner decision: 4001 ships, incl. the base
Ostler; supplement expansions are owner-only like 4401). It is hand-authored into
`occupations.private.json` because supplements describe specializations **narratively**, not as clean
bundles. Pattern:

- **Augment** an existing 4001 occupation: add a node with the **same id** stating only the new
  fields (e.g. ostler `guilded`, `optionPointOptions`) — its 4001 skill bundle is inherited; merged
  `sources` becomes `["4001","4823"]`.
- **Specialization** (Farrier/Saddler/Stablemaster): a `specializations[]` node `{ of:"ostler", … }`
  — folded into the bundle by `resolveOccupation(merged, id, {specialization})`.
- **A wholly new occupation**: a node with a **distinct id** → its own selectable entry.

If a new source's table parses cleanly (some do), run `parse-occupations.mjs` with that source/range
to its own json and merge in code; otherwise hand-author.

---

# Classification (copyright)

The distribution tier (`setting` for bestiary; `layer` for occupations) gates shipping; a lint keeps
owner-only content out of the public file.
- **public** — core 4001 functional data: real-world / shared-folklore creatures, and the 4001
  occupation table (incl. the base Ostler). Ships with the product.
- **owner-only** (`harn` / `private`) — coined Hârn creatures (names + stats) and any **supplement**
  expansions (4823 Ostlers, and 4401/4601/4611 when added). Git-ignored, never distributed.
- **homebrew** — the user's own additions, shareable.
- **descriptions/prose** are never in these files — they live in `flavor.*.json` (owner-populated).
- **Open call** (same for all supplements): whether a *purchased supplement's* generic/functional
  content could ship publicly vs. stay owner-only — current decision is **owner-only** for supplements.

---

# Generator (single-file HTML)

`chargen/harnchargen.html` is the playable generator — a portable single file (no server, no Pro).
It's **built** from source, not hand-edited:

- **Source:** `chargen/ui.html` (markup + CSS) · `chargen/ui.js` (UI logic) · the engines
  (`merge-util`/`occupations`/`bestiary`/`chargen`.mjs) · `chargen/skills.json` (extracted from the
  sheet via `extract-skills.mjs`).
- **Build:** `node chargen/tools/build-generator.mjs` — strips `import`/`export`, concatenates the
  engines + inlines the **public** data (`occupations.json`, `bestiary.json`, `skills.json`) + `ui.js`
  into one `<script>`, writes `chargen/harnchargen.html`.
- **Owner data is NOT inlined.** Owners load `*.private.json` / `*.homebrew.json` at runtime via the
  file picker (FileReader — no CORS), so the shipped file contains zero IP (verified: 0 harn nodes).
  The "public build" pill flips to "owner build" once owner data is loaded.

What it does: **Character** mode rolls/sets the 13 attributes, picks species/sunsign/occupation(+specialization),
and live-computes each skill's **SB** and **ML = SB × OML** (math identical to the sheet), then emits
`harnchar` JSON + a printable summary. **Creature** mode picks any bestiary creature, shows its resolved
stat block, and emits a `kind:"creature"` `harnchar`. Logic is covered by `test/chargen.test.mjs`.

Rebuild after changing any engine, `ui.*`, or regenerating `skills.json`/`occupations.json`/`bestiary.json`.
