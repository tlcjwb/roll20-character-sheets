# HarnMaster3 Sheet — Design & Architecture Critique + Implementation Plan

Companion to `REVIEW.md` (which covers correctness bugs, fixed in v3.1.0 / `20260612`).
This document is the **design-level** critique and a **concrete, phased implementation plan** for
the larger structural changes. **Status: planned, not yet started** — changes will be made later.

Reviewed sheet: `harnsheet.html` (single file: markup + one roll template + ~750 lines of
sheetworker JS) and `harnstyle.css`. Algorithm references verified against **HârnMaster v3.5.2**
(extracted text in `../PDF/4001-Harnmaster.txt`, `../PDF/4401-HarnMaster-Religion.txt` — both
git-ignored; section names like "Skills 6" map to page markers in those files).

---

## Part 1 — Design & architecture critique

### Architecture in one paragraph
Roll20's model: attribute-backed inputs, a reactive `on('change:…')` cascade that recomputes
derived attributes, repeating sections for lists, and **CSS-only conditional visibility** driven by
hidden mirror inputs. Layout is CSS Grid (named areas) with a light/dark custom-property theme.
The approach fits the platform; the issues are consistency, duplication, and where the automation
line was drawn — not the fundamental design.

### Strengths (preserve these)
- **Single source of truth for gear** — `repeating_weapon` / `repeating_armoritems` authored once,
  rendered twice (editable on Inventory, read-only on Character via `iscarried`). Excellent.
- **Theming** — two-tier custom properties (`--bgs-light`/`--bgs-dark` → semantic
  `--background-sheet`), switches with `sheet-darkmode`; only 11 `!important`s / 1,035 selectors.
- **Unified roll template** — one `sheet-rolltemplate-custom` handles all roll types via flags
  (`skilldevroll`, `nocrit`, `infected`) + computed helpers (`rollWasCrit`, `rollGreater`).
- **Versioned migration framework** — chained, ordered (`versionsWithMigrations` → `migrateToX`).

### Critiques (by impact)

**C1 — Asymmetric automation (biggest product gap).** The sheet auto-calcs the peripheral derived
values (encumbrance, penalties, armor-by-location, mounted init/move) but leaves the *core skill
engine* — every **SB** and **ML** — fully manual. Per the rules, **SB is computable**: average of
three named attributes + a sunsign modifier (Skills 1/3). So the most error-prone, most-repeated
data entry is the only thing left manual — backwards from the user's view.

**C2 — Roll-macro duplication (biggest maintainability problem).** The full target math — penalty
term + 5/95 clamp — is inlined in **60–80 buttons**:
`{{rolltarget=[[{[[{[[@{X_ml} - [[(@{physical_penalty})*5]] + ?{Target Modifier?|0}]],5}kh1]],95}kl1]]}}`.
A change to the clamp, penalty model, or crit dice string means editing dozens of near-identical
strings — exactly how subtle divergences appear.

**C3 — Derived-state fragility.**
- `physical_penalty = encumbrance + universal_penalty` is computed in the penalty worker but
  *re-derived inline* (`enc + UP`) in the move, initiative, and riding-EML handlers — the PP formula
  lives in ~4 places.
- Mounted halving writes the halved value back into the `encumbrance` attribute itself, so
  `encumbrance` is both a pure total and a context-dependent value — anything downstream silently
  reads the mounted-adjusted number.
- No explicit dependency ordering; correctness relies on every handler subscribing to exactly the
  right triggers (same class as the migration race fixed in v3.1.0).

**C4 — Data-model inconsistencies.**
- **Fixed vs. repeating skills is arbitrary** — a curated set are hardcoded rows; the rest are
  generic `repeating_*skill`. The split doesn't map to the rules' "automatic skills." Two code paths
  for one concept; adding a standard skill means editing HTML.
- **Visibility via hidden mirror inputs** — settings (`hrhorseonsheet`, `hrconsolidatedpiety`,
  `is_mounted`) replicated ~6× as hidden inputs so CSS sibling selectors can show/hide. Platform
  idiom, but spreads one setting across distant lines.
- **Armor has two representations** — new per-item model + legacy per-location fields write the
  *same* attributes; editing a legacy field silently mutates live armor. v2 shipped 2021; legacy
  block is overdue for sunset.
- **Ad-hoc naming** — `hr`-houserule prefix, `h`-horse prefix, cryptic names, `spell_eml` actually
  holds ML.

**C5 — No build/test seam.** One 2,645-line file mixing HTML + template + JS; no build, lint, or
tests. Workers bind Roll20 globals at top level, so they can't be unit-tested as-is. Largely a
platform reality, but it's why the migration stall and wrong-section infection handler shipped.

**C6 — Portability / a11y / i18n.**
- Campaign-specific defaults baked in: currency `akçe/para/kuruş`, custom horse breeds
  (`Asil`/`Goklan`). A shared-repo sheet should default to rules-canonical with customization.
- No internationalization (`data-i18n` unused; all strings hardcoded English).
- Weak accessibility: most roll buttons are empty, background-image-styled, **no `aria-label`**;
  success/failure conveyed by color alone; tab buttons use cryptic icon-font letters. Labels
  (`<label for>`) are used well — the bright spot.

**C7 — CSS (strongest layer).** Only minor: thin responsive coverage (2 narrow `@media` blocks;
mobile admittedly partial) and a self-noted `TODO rename variable` (`--background-dark`).

**C8 — Religion is a magic-clone, not a religion implementation.** The "Rituals" section is a
near-verbatim copy of the Shek-Pvar **Spells** section, and its data model contradicts how
HârnMaster religion actually works. The deep religion rules live in the **Religion supplement
(4401)**, not the core book — the core book only provides the ten Ritual *skills* (skill table) and
cleric char-gen hooks (open Ritual to SB×4, Piety = 5d6 / Will×5, learn invocations by Circle) and
defers the rest to the supplement. The actual structure:
- **One Ritual skill per deity** → its ML is **RML**. Improved *only* by learning invocations,
  reading holy tomes, or adverse-situation use — **never by practice** (Religion 7).
- **Invocations** are *known abilities tagged by Circle (II–VII)*, **cast off the single RML** —
  exactly analogous to a mage casting many spells off one Convocation ML. The book records them
  "in the spell section… along with their Circle" (Religion 10).
- **Piety Points** are a **per-deity resource with an economy**: gained via the Piety Gain table,
  spent on Divine Intervention, on *learning* invocations (5 PP/Circle), and on prayer-boosts
  (1 PP = +1 EML, max 20). **Divine Grace** = Piety ≥ RML, which unlocks bonuses (Religion 4–6, 9).

What the sheet does instead: each ritual gets its **own SB / SI / ML / Lvl / CT / Dur / Range** and
rolls against that per-ritual ML — i.e. the *magic* paradigm, specifically the **optional
"Individual Spell Skills"** variant. Religion has no per-invocation skill. The irony: the sheet
copied the *wrong half* of the magic system — the **default** convocation-and-spells model (one
skill, many abilities keyed by level/index) is the correct analog for religion (one RML, many
invocations keyed by Circle). Per-deity Piety tracking (`repeating_piety`) and the Universal-Penalty
choice for the ritual roll are the parts that are right. Missing entirely: Circles, Divine Grace
(Piety ≥ RML), Divine Intervention, prayer-boost, and the RSI-derived uses (counseling, sermons).
**Verdict:** serviceable as a record sheet, but not a rules implementation, and the SB/SI/Lvl
per-ritual fields imply a mechanic that doesn't exist.

---

## Part 2 — Implementation plan (phased)

Ordering is chosen so low-risk groundwork lands first and each phase is independently shippable.
Effort: S < ½ day · M ½–2 days · L > 2 days (solo, incl. in-VTT testing).

### Phase 0 — Build/test seam (enables everything else) · M · addresses C5
**Goal:** make the worker JS lint-able and unit-testable without changing sheet behavior.
1. Extract the `<script type="text/worker">` body into `src/worker.js` (plain module).
2. Add `test/roll20-mock.js` — a stub `on`/`getAttrs`/`setAttrs`/`getSectionIDs`/`getAttrs`
   recorder so handlers can be invoked and asserted (the existing `dbmock`-style pattern).
3. Add a tiny Node build (`build.js`) that inlines `src/worker.js` back between the
   `<script type="text/worker">` tags in `harnsheet.html` for release. Single source = `src/worker.js`.
4. Add `npm test` (node:test) covering: endurance, condition cap, encumbrance floor+guard, penalty
   stack, missile falloff, SI, migration chain completion.
**Risk:** low (no behavior change). **Verify:** `node --check`; release inline byte-identical to a
hand-edit baseline. **Note:** keeps the "one HTML + one CSS" Roll20 deliverable; source is split.

### Phase 1 — De-duplicate derived state · S–M · addresses C3
1. Replace inline `enc + UP` re-derivations (move, initiative, riding-EML handlers) with reads of
   `physical_penalty`.
2. Keep `encumbrance` **pure** (full value); add `encumbrance_effective` for the mounted/halved
   case; update consumers (move, penalty, riding) to read the right one.
3. Add a single `recalcAll()` invoked on `sheet:opened` that fires the derived-value chain in
   dependency order (endurance → condition → loads → encumbrance → penalties → move/init/riding),
   so opening an old character self-heals.
**Risk:** medium (touches the recalc graph). **Verify:** unit tests from Phase 0 + in-VTT mounted
toggle, weight entry before/after attributes.

### Phase 2 — Centralize EML math out of roll macros · M–L · addresses C2
1. Define a JS registry of every check: `{key, mlAttr, penalty: 'physical'|'universal', section?}`.
2. Worker computes a per-check `X_eml = clamp_lowonly(ML − 5×penalty)` (un-clamped-high; store raw)
   on change of the ML attr **and** of `physical_penalty`/`universal_penalty`. For repeating
   sections, on penalty change iterate `getSectionIDs` and recompute each row's `_eml`.
3. Rewrite buttons to: `{{rolltarget=[[{[[{[[@{X_eml} + ?{Target Modifier?|0}]],5}kh1]],95}kl1]]}}`
   (runtime query + clamp must stay in-macro — that's the irreducible remainder).
4. Do **fixed** skills first (simpler), then repeating sections, then weapons/missiles.
**Risk:** medium-high (every roll button touched). **Verify:** snapshot each button's effective
target before/after for a fixed test character; in-VTT roll spot-checks per section.
**Win:** removes the penalty term from ~70 macros; one place to change the penalty rule.

### Phase 3 — SB / OML auto-calculation · L · addresses C1 (biggest user win)
1. Encode the Skills 3 table as data: `{skill: {attrs:[a,b,c], sunsign:{ula:+2,...}, omlMult:N}}`
   (source rows already extracted in `../PDF/4001-Harnmaster.txt`).
2. Worker: on change of component attrs or `sunsign`, compute `SB = round(mean(attrs)) + sunsignMod`.
   **Scope = all known skills** (decided 2026-06-13): the **fixed rows** by their known label, AND
   **repeating rows** by the name the user types (case-insensitive, trimmed). Specialties match their
   base skill ("Sword (Broadsword)" → Sword's triplet). **Unrecognized/custom names → SB stays
   manual** (no clobber, graceful). Repeating-row auto-SB recomputes on name change + attr/sunsign
   change (iterate `getSectionIDs`).
3. ML stays user-controlled (improves in play). Default ML to OML (`SB × omlMult`) **only when ML is
   0/unset** — never clobber an improved ML. Enforce max ML = 100 + SB.
4. Gate behind a setting (`hr_autocalc_sb`, default on for new sheets) so existing manual trackers
   aren't surprised; on existing characters, only fill when SB is empty.
5. Sunsign handling: map `attr_sunsign` (datalist value) → 3-letter code and apply the per-skill
   `+1/+2` modifier.
**Risk:** medium (must not clobber existing data — gate + only-when-empty; name-matching for
repeating rows). **Verify:** unit tests per skill against the rulebook worked examples (e.g. Dancing
(DEX+AGL+AGL)/3 +Hir = 14, OML SB×2 = 28).

### Phase 3b — Reshape the religion subsystem to the rules · M–L · addresses C8
Pairs naturally with Phase 3 (same theme: model the rules, don't just record them). Scope creep
risk is real — keep it optional/additive so existing characters' data isn't stranded.
1. **RML as a first-class skill.** Treat the per-deity Ritual skill as the single source: a row in
   the existing `repeating_ritualskill` section *is* RML. (Optionally auto-compute Ritual SB from
   VOI+INT+deity-attr + deity sunsign, using the table in `../PDF/4401-…txt` Religion 7 — same
   mechanism as Phase 3.) Remove the "develop by practice" affordance for Ritual, or label it
   "(learning/tomes/adverse only)", since RML can't be practice-improved.
2. **Invocations keyed by Circle, cast off RML.** Rework the "Rituals" repeating section: replace
   the per-ritual SB/SI/ML with **Circle (II–VII)** + a deity selector that points at the relevant
   RML; the cast roll targets **RML − 5×UP + modifiers** (clamped 5/95), not a per-ritual ML. Keep
   name/CT/Dur/Range/notes as free reference fields. (Migration: existing `ritual_eml` values can
   seed the chosen deity's RML, or be left as a notes field — decide at build time.)
3. **Divine Grace flag.** Compute a read-only indicator when a deity's Piety ≥ its RML (Religion 4);
   surface it next to the piety row and, if present, apply the +10 to healing/curing invocations.
4. **Piety economy helpers (optional, additive).** A "spend piety" control for Divine Intervention
   (per-deity base chance table + ±20 worthiness + 1%/PP to 95%), and a prayer-boost helper
   (1 PP → +1 to a chosen roll, max 20). These are GM-adjudicated, so keep them as convenience roll
   buttons, not enforced state.
5. **RSI uses (stretch).** Expose RSI = floor(RML/10) and offer Counseling (Rhetoric+RSI) and Sermon
   (Oratory+RSI) roll buttons.
**Risk:** medium-high (reworks a repeating section's schema + migration of existing ritual data).
**Verify:** unit tests for SB-from-attrs and the Divine-Grace threshold; in-VTT check that an
invocation rolls off the chosen deity's RML and that piety spends behave. **Gate** the new model
behind a setting so tables using the current free-form tracker can opt out.

### Phase 4 — Model & legacy cleanup · M · addresses C4
1. Document the fixed-vs-repeating rationale in a comment block (or, ambitious: make fixed skills a
   pre-seeded repeating section — larger, defer).
2. Sunset the legacy armor grid: add a migration that copies any populated legacy per-location values
   into a `repeating_armoritems` row (best-effort) and sets a flag; then remove the legacy block in a
   subsequent version. Keep data in attributes meanwhile.
3. Consolidate/comment the hidden-mirror visibility inputs; centralize each setting's mirrors.
**Risk:** medium (migration + data). **Verify:** dry-run migration on a legacy-armor character.

### Phase 5 — Portability, a11y, i18n · S–M · addresses C6/C7
1. Replace campaign-specific defaults with rules-canonical (currency → blank or copper/silver/gold;
   move `Asil`/`Goklan` out of the canonical breed list or behind a custom-entries note).
2. Add `aria-label` to every roll button (can be generated from its `name`/title in the build step).
3. Add a non-color success/failure cue in the roll template (icon/text already present — ensure not
   color-only).
4. Fix `sheet.json` `instructions`: it points to "the github repository readme" with **no link** —
   add the real repo URL (Markdown is supported in that field) + a fuller GM-facing blurb. Quick win,
   independent of other phases. (Also referenced in Phase 7d.)
5. (Stretch) wire Roll20 `data-i18n` for labels + a translation JSON; rename the `--background-dark`
   variable; broaden responsive `@media` coverage.
**Risk:** low. **Verify:** screen-reader pass on roll buttons; in-VTT dark/light + mobile.

### Phase 6 — Temporary attribute modifiers (magic items / buffs) · M · new feature (LAST)
Explicitly sequenced **after everything else** — it depends on Phase 3's skill→attribute data table
(to know which skills use which attribute) and reads cleanly only once Phase 2 has centralized EML
computation. Rules basis: the *Girdle of Ineffable Power* / *Gloves of Urenalda* pattern (Treasure
19–20) — a buff to an attribute raises **the EML of every skill requiring that attribute by 5 ×
(attribute increase)**, for the buff's duration. This mirrors the penalty system exactly (penalties
subtract 5×; buffs add 5×), so it slots into the same EML pipeline.
1. **Input surface.** A small "Active modifiers" area — simplest is one optional bonus field per
   attribute (`str_mod`, `dex_mod`, …, default 0); or a `repeating_effects` section (name, attribute,
   ±value, note) if multiple stacking items/spells are wanted. Keep it additive and default-off.
2. **EML application.** In the Phase-2 EML worker, when computing each skill's effective level, add
   `5 × (modifier on each of that skill's component attributes)`. Because Phase 3 already encodes
   each skill's attribute triplet, this is a lookup-and-sum — no per-skill bespoke code. (If an
   attribute appears twice in a triplet, the rules' "skill requiring Strength" wording is binary, so
   apply the 5×Δ once per skill, not per occurrence — confirm against intent.)
3. **Direct attribute effects (optional, careful).** A modifier should also flow to values computed
   *directly* from the attribute: raw attribute-test targets (attr×mult), Endurance =
   (STR+STA+WIL)/3 → ripple to encumbrance/shock/healing, Lifting (STR×10), grapple (3d6+STR),
   knockback threshold. Decide scope: applying to the raw attribute everywhere (treat `effective_str
   = str + str_mod` as the value all workers read) is cleanest and most correct, but touches many
   handlers — do it only after Phase 1's derived-state cleanup makes the attribute reads centralized.
4. **Display.** Show the buffed attribute and/or a small "(+N item)" cue so players see why an EML is
   elevated; never overwrite the base attribute value.
**Risk:** medium (touches the EML pipeline and, if step 3 is included, the attribute-read graph).
**Verify:** unit test that +2 STR yields +10 EML on STR-skills and no change on others (the rulebook
worked example: +4 STR → +20); in-VTT toggle on/off restores baseline exactly.
**Note:** this is the clearest payoff of the "smart sheet" direction — a single "STR +2 (item)" input
auto-applies to exactly the right skills, which is impossible in today's all-manual model.

### Phase 7 — Multiple horses for a mounted ostler (separate sheets + companion Mod script) · L · new feature (your-game / Pro)
The largest feature; spans **three artifacts** — the sheet, a companion **Roll20 Mod (API) script**,
and the README. It is **Pro-only and per-campaign** (Mod scripts don't ship with the published
sheet), so it's a "your game" enhancement, not something all sheet users get. Rules basis: HM
intends each steed to have its own profile (Combat 19) and a **per-steed Riding EML** (Combat 20).

**Architecture (approach #1 + hybrid):**
- **Each horse is its own Roll20 character + token** (RAW: "each steed should have its own Character
  Profile").
- The **rider's sheet keeps one embedded "active mount" panel** (the existing `h*` horse section)
  for whichever horse is currently ridden, plus the existing mounted move/initiative integration.
- A **companion Mod script** bridges what sheetworkers can't do (cross-character reads, token edits).

**7a — Steed-mode sheet toggle (sheet-only).** A `sheetmode` setting (`character`/`steed`) that
hides inapplicable sections (Religion, Magic, communication/craft skills, etc.) via the existing
hidden-input + CSS pattern, so a horse's own sheet is decluttered. *Easy* for the hiding; add
horse-correct calc variants (Move × gait, Load = STR×8, natural armour B4/E3/P1/F3) only if you want
the steed sheet's automation fully right (*medium*) — otherwise those few values are entered by hand.

**7b — Companion Mod (API) script, stored in the repo.** Place it at e.g.
`HarnMaster3/mod/harnmaster3-mod.js`; the README documents install (campaign → Settings → Mod (API)
Scripts → paste → Save). It does what the sheet cannot:
- **Import:** select a horse token, run a command/token-action (`!hm-mount`); the script reads that
  horse character's attributes (`getAttrByName`/`findObjs`) and writes them into the rider's `h*`
  active-mount panel. Keep a small per-steed Riding-EML list on the rider.
- **Token image swap:** watch `is_mounted` (`on('change:attribute')`) or a command; set the rider
  token's `imgsrc` between on-foot and mounted art. Caveat: token `imgsrc` must be a **Roll20-library
  URL** (`files.d20.io/...`, `thumb.` variant) — upload the mounted art first. (TokenMod can do this
  part with no custom code.)
- **Presence handshake** (see 7c).
Community scripts **TokenMod** and **ChatSetAttr** may cover parts with little custom code.

**7c — Detecting whether the Mod script is installed (to gate the import UI).** Feasible via a
sheet↔script handshake, because the API can observe sheetworker attribute changes and write back:
1. Sheet `sheet:opened`: set `api_present = 0` (assume absent), then `api_ping = Date.now()` (a
   changing value guarantees a `change:` event).
2. Mod script: `on('change:attribute')` on `api_ping` → set `api_present = <mod version>`.
3. Sheet: `on('change:api_present')` reveals the import button / horse-import UI via the CSS-toggle
   pattern; while `api_present = 0` it stays hidden.
Resetting to `0` each open means **removing the script is also detected** (the UI re-hides).
Trade-offs: brief async flash before the button appears; one tiny ping attribute. The returned
version also enables a Mod/sheet compatibility check.

**7d — Settings help + README + sheet.json (docs).**
- **Settings tab:** today it has only toggles + a changelog and *no actual help*. Add an in-sheet
  **Help/Instructions** block (the sheet's only player-facing doc surface): equipped/carried flow,
  the houserules, the horse/mount workflow, and — **gated on `api_present`** — how to use the
  import/mount features (with a "install the Mod script" note when absent).
- **README.md:** add a **Mod-script install** section + the multiple-horses workflow.
- **sheet.json `instructions`:** currently references "the github repository readme" with **no
  link** — add the real URL (`…/roll20-character-sheets/tree/master/HarnMaster3#readme`; Markdown is
  supported in that field) + a fuller GM-facing blurb. *(Worthwhile standalone quick-win even without
  Phase 7 — also listed under Phase 5.)*

**Risk:** high — spans sheet + API + docs, introduces active-mount/handshake concepts, and the Mod
script is a separate per-campaign artifact to maintain. **Distribution:** Pro-only, per-game; does
not travel with the published sheet. **Verify:** in-VTT with the Mod installed (import fills the
panel; token swaps; button shows) *and* not installed (import UI stays hidden; sheet otherwise
normal).

### Suggested sequence
Phase 0 → 1 → 2 → 3 (and 3b alongside 3), with 4/5 interleaved as convenient, then **6**, then **7 last** (a
your-game/Pro feature spanning sheet + Mod script). 0 and 1 are low-risk and make 2/3 safe to
attempt; 3b reuses 3's SB-from-attrs machinery; 6 reuses 2's EML pipeline and 3's skill→attribute
table; 7 is largely independent (separate sheets + a companion Mod script) and need not block the
others. Each phase is its own version bump + changelog entry (see process notes).

---

## Part 3 — Working conventions (how to edit this sheet safely)

Learned during the v3.1.0 fix pass; follow these to keep edits safe and reviewable:
- **Line endings:** `harnsheet.html` is **LF** (not CRLF — the CRLF note in the sibling Sedra repo
  does not apply here). Preserve LF.
- **Editing method:** the repo is on a OneDrive mount that caused `Edit`-tool write races. The
  reliable method is a **single atomic Node read-modify-write with per-replacement count
  assertions** (refuse to write unless every edit matches its expected count). See the scripts used
  in `C:\Users\jimb\pdfx\` (`fixes.js`, `deferred.js`) as templates.
- **Node:** no `node` on PATH; use the Windows binary via `cmd.exe /c "node …"` and pass **Windows
  paths** (`C:\Users\jimb\OneDrive\Documents\HM3\…`). `pdf-parse` + `extract.js` live in
  `C:\Users\jimb\pdfx\` for (re)extracting any PDFs dropped in `../PDF/`.
- **git:** the dir is a sparse checkout of `Roll20/roll20-character-sheets` (upstream `master`); not
  the user's fork. `git diff` shows changes vs pristine upstream — no commits made unless asked.
- **Ignored:** `../PDF/` (PDFs **and** extracted `.txt`) is git-ignored — copyrighted, never commit.
- **Validation:** after any worker change, `node --check` the extracted worker JS. There is **no
  in-VTT test harness here** — flag changes that need live Roll20 verification (macro rendering,
  repeating-section recompute, show/hide CSS).
- **Releases:** bump `attr_character_sheet_version` (date `YYYYMMDD`) + add a `<details>` changelog
  entry at the top of the Changelog block. Only add to `versionsWithMigrations` when stored data must
  be rewritten (most changes recompute on next interaction and need no migration).

---

## Validation workstream — rulebook examples as golden tests

A standing workstream (rides on the Phase 0 harness; also serves as acceptance criteria for Phases
1–4 and beyond). Goal: turn every worked example in the rulebooks into a regression test.

**Process, per example:** (1) verify the book's own arithmetic is internally correct; (2) feed the
same inputs to the sheet and assert the same result. Three outcomes:
- ✅ **pass** — book correct + sheet matches → a golden test.
- 📕 **errata** — the book is internally inconsistent (e.g. steed encumbrance `40÷21` printed as 2 =
  *round*, while character `33÷14` is "rounds **down** to 2" = *floor*; the book rounds steeds but
  floors characters, and the sheet faithfully mirrors that).
- 📗 **intentional deviation** — book correct, sheet differs by design (e.g. the missile per-range
  impact approximation: the formula matches most weapons but yields 2 vs the table's 3 for Staff
  Sling / Shorkana at extreme range — the item-13 finding; mitigated by the now-editable fields).

**Two test surfaces:**
- **Worker calcs** (derived attributes) → `test/*.test.mjs` via the Phase 0 harness.
- **Roll-*target* values** (healing/shock targets, attribute `attr×mult`, skill `EML − 5×PP`, the
  5/95 clamp) live in roll-button *macros*, not workers → tested via a small Roll20 inline-roll
  **evaluator** (`testkit/roll-eval.mjs`): substitutes `@{attr}`, takes `?{query|default}` (or test
  overrides), and evaluates the deterministic parts (`[[ ]]`, `{a,b}kh1/kl1`, `floor/round`) so the
  macro's *target* can be checked (dice in `rollresult` are random and not evaluated).

Examples needing values the sheet doesn't yet compute (SB/OML — e.g. Juryn's Dancing
`(10+14+14)/3+Hir = 14`, OML SB×2 = 28) become tests once **Phase 3** lands, and double as Phase 3's
acceptance criteria. Track results in three buckets (pass / errata / deviation) so we end with both a
suite and a documented errata-&-deviation list. Files: `test/rulebook-examples.test.mjs` (+ the
evaluator in `testkit/`).
