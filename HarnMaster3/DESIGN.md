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
HârnMaster religion actually works — **and this contradicts the core book 4001 itself**, not merely
the supplement. 4001's Character/Clerics section (pp. 22–24) already defines the whole structural
model: "Clerics open *ritual* to SB×4" = **RML**; "a separate Piety Point total **and Ritual
Skill**… for each deity"; Piety = 5d6 / Will×5; and **invocations learned by Circle** (1 Ritual
Option point per Circle, Common Circle-II free). The **Religion supplement (4401)** only adds the
per-deity *invocation catalog* and detailed effects — it does not introduce the model. The actual
structure (stated in 4001, detailed in 4401):
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
Pairs naturally with Phase 3 (same theme: model the rules, don't just record them). Today the
"Rituals" section is a Shek-Pvar magic clone — each ritual carries its own SB/SI/ML — which
contradicts **4001 itself** (Character/Clerics pp. 22–24): there is *one* Ritual skill per deity
(**RML**), and invocations are *known abilities tagged by Circle* cast off that single RML.

**Two paths, selected by one setting `hr_hm_religion` ("HM Religion", default OFF).** The setting
chooses how much of the religion rules the sheet models; both paths share a common 4001 foundation.

#### Shared foundation (built in BOTH paths)
1. **RML as the single per-deity skill.** Treat the per-deity Ritual skill as the source of truth:
   a row in `repeating_ritualskill` *is* RML (opens at SB×4; never practice-improved — label it
   "learning/tomes/adverse only"). Per-deity **Piety** already exists (`repeating_piety`).
2. **Invocations = a hand-entered list, keyed by Circle, cast off RML.** Rework `repeating_rituals`:
   **drop the per-ritual SB/SI/ML**; keep name + deity selector + CT/Dur/Range/notes; **add
   `ritual_circle` (II–VII)** and an **editable `ritual_circle_mod`**. Cast target =
   **RML − 5×UP − Circle Modifier**, clamped 5/95 (validated by the 4001 worked example: Peoni
   RML 78, UP 2 → −10, Circle Mod −20 ⇒ 48). This is correct *without* any catalog — the user types
   the invocation and its Circle, and the modifier defaults editable.
   *(Note: 4001 contains only invocation **examples**, never a catalog — so the foundation must not
   try to generate or hard-code invocations.)*

#### Path A — setting OFF (default): 4001-conformant, catalog-free
Ship only the Shared foundation. Each invocation is user-entered; `ritual_circle_mod` is a plain
editable field (GM/player fills it). No deity catalog, no Divine-Intervention tables. This is the
complete, self-contained, supplement-independent model — and the default so no table is forced into
supplement detail it doesn't use.

#### Path B — setting ON ("HM Religion"): adds the 4401 supplement layer
Everything in Path A, **plus** modifications to be 4401-compatible (extra fields/UI revealed by the
setting via the existing CSS-toggle pattern):
1. **Invocation catalog (4401).** Per-deity known-invocation pick-lists (datalists keyed by deity)
   sourced from the Religion supplement; selecting an invocation **auto-fills its Circle, the Circle
   Modifier, CT/Dur/Range,** and effect notes. Manual entry still allowed for homebrew.
2. **Circle-Modifier table (4401).** Derive `ritual_circle_mod` from `ritual_circle` automatically
   per the supplement's table instead of hand-entry.
3. **Divine Grace.** Read-only flag when a deity's Piety ≥ its RML (Religion 4); apply its bonus
   (e.g. +10 to healing/curing invocations) to the relevant cast targets.
4. **Piety economy.** "Spend piety" control for **Divine Intervention** (per-deity base-chance table
   + ±20 worthiness + 1%/PP to 95%) and a **prayer-boost** helper (1 PP → +1 to a chosen roll,
   max 20). GM-adjudicated ⇒ convenience roll buttons, not enforced state.
5. **RSI uses (stretch).** RSI = ⌊RML/10⌋ with Counseling (Rhetoric+RSI) and Sermon (Oratory+RSI)
   roll buttons.

#### Migration & gating
Changing `repeating_rituals` is a data-shape change ⇒ bump `versionsWithMigrations`. One-time
convert: preserve each legacy row's `ritual_eml`/SB/SI into notes (or seed the chosen deity's RML
from `ritual_eml` if no RML exists), then map the row to the new fields. The `hr_hm_religion` toggle
gates Path B's extra UI; Path A remains fully functional with the toggle off so existing free-form
trackers aren't stranded. Both paths share the same underlying attrs — toggling only reveals/derives
the 4401 extras, it does not migrate data again.

**Risk:** medium-high (reworks a repeating section's schema + migration). Path B additionally needs
the 4401 catalog transcribed (copyright: ship structure/Circle/CT, not prose effects — link/note
instead). **Verify:** unit tests for the RML−5×UP−CircleMod target (Larinda = 48) and the
Divine-Grace threshold; in-VTT, an invocation rolls off the chosen deity's RML in both paths, and in
Path B the catalog pick auto-fills Circle/modifier.

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

**Generalized 2026-06-14: a horse is just one Bestiary creature.** Phase 7's "steed sheet" is now
the **generic creature sheet** (see 7e), and Phase 10's chargen *creature mode* is what builds these
sheets (from `bestiary*.json` or by hand). The mount-import path below is unchanged — it reads a
creature sheet's **live** attrs at runtime — it just now imports *any* creature, not only horses.

**Architecture (approach #1 + hybrid):**
- **Each horse/creature is its own Roll20 character + token** (RAW: "each steed should have its own
  Character Profile").
- The **rider's sheet keeps one embedded "active mount" panel** (the existing `h*` horse section)
  for whichever creature is currently ridden, plus the existing mounted move/initiative integration.
  This panel is **always hidden on a creature's own sheet** (a wolf doesn't ride).
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

**7e — Creature mode + data-driven hit locations (sheet-only; pairs with Phase 10).** Generalizes 7a
from "steed" to "any Bestiary creature." A `kind` (`pc`/`creature`) + `archetype`
(`humanoid`/`quadruped`/`winged`/`custom`) toggle:
- Hides PC/life-path fields **and the active-mount panel** in creature mode (CSS-toggle pattern).
- Reuses the existing attribute keys (`str…wil`) so creatures ride the same sheet.
- **Hit locations become data-driven** — a `repeating_hitlocation` section (name, d100 range, armor
  b/e/p, impact mod) **seeded from the archetype** but **overridable per creature** (the five Ivashu
  each carry their own table; same archetype, different locations). The existing **human + horse fixed
  layouts are left untouched** (additive, no migration); data-driven locations apply to creature mode
  only. This is the one real scope-growth from "switch between fixed grids."
- Built by Phase 10's chargen creature mode (the brains) + this Mod importer (`!harnimport` for
  creatures, same family as `!hm-mount`). Bestiary data lives in `chargen/bestiary*.json`
  (tri-state public/homebrew/harn — see `chargen/CONTRACT.md` §11).

**Risk:** high — spans sheet + API + docs, introduces active-mount/handshake + creature-mode/data-
driven-locations concepts, and the Mod script is a separate per-campaign artifact to maintain.
**Distribution:** Pro-only, per-game; does not travel with the published sheet. **Verify:** in-VTT
with the Mod installed (import fills the panel; token swaps; button shows; a creature sheet renders
its own locations) *and* not installed (import UI stays hidden; sheet otherwise normal).

### Phase 8 — Rules-conformance enhancements (from the v3.2.0 audit) · M · polish / coverage
A conformance sweep of Character / Skills / Combat / Physician / Psionics against the core rules
(4001), done after v3.2.0, found **no deviations in those five areas** — the 90-skill auto-SB table
checked **90/90** against Skills 3–4, and attribute-test penalties, the psionics roll, healing,
shock, fumble/stumble, etc. all conform. (The sweep **excluded Religion**, which is the one major
structural deviation — see **C8 / Phase 3b**; it deviates from 4001 itself, not just the supplement.)
The items below are the optional **conveniences / coverage gaps** the sweep surfaced; none fix
wrong behavior:
1. **Psionic-talent auto-SB.** Talent SB is uniformly **AUR AUR WIL + a per-talent sunsign**
   (Psionics 2). Extend the Phase 3 machinery to `repeating_psionics`: an optional per-talent name
   lookup (Charm / Clairvoyance / Healing / Mental Bolt / Telepathy / … with their sunsign mods)
   that computes SB. Gated by the same `hr_autocalc_sb` toggle. *(S)*
2. **Max-ML validation (ML ≤ 100 + SB).** The roll already clamps EML to 95, but ML itself isn't
   capped; optionally warn or clamp ML at 100 + SB per Skills 2. Cosmetic, low value/risk. *(S)*
3. **HM weapon-field UX.** Today HM is a *signed* modifier added to AML (enter **negative** for a
   penalty), and the chat "penalty" line shows `PP×5 − HM`. Relabel the field (e.g. "HM ±") or flip
   the sign so a positive value reads as a penalty. **NOTE:** flipping the sign changes the meaning
   of any HM values already entered → a deliberate change needing a migration or a one-time note. *(S
   + migration care)*
4. **Physician recovery rolls (optional buttons).** The sheet has the combat Shock roll, the 5-day
   Healing roll, and an infection flag, but not dedicated buttons for **Shock-Recovery** (HR×End per
   watch), **Infection** (HR×End daily + physician SI), **Blood-Regeneration** (End×6 / 5 days), or
   **Disease** (CI×End). All share the HR×End shape, so these are convenience buttons over the
   Physician 3–4 tables, not new math. *(M)*
**Risk:** low except #3 (HM sign flip touches existing data). **Verify:** psionic SB against the
Psionics 2 worked example (Mardisa: Mental Bolt SB 17, Healing 16); recovery-roll targets against
the Physician tables. All four are additive/gated and independent of the other phases.

### Phase 9 — Attacker-side combat helpers + minor coverage gaps · M · coverage
From a full 4001 read (Combat 9–14 Melee/Missile Attack Sequence, plus Skills/Physician/Campaign).
**Scope boundary (owner decision):** the sheet models **only our character's side**. The defender is
another token / GM-controlled, and sheet workers can only see their own character — so the
two-combatant pieces (the Melee Attack results cross-index, and Injury Determination against the
defender's armour) are **out of scope**. Full end-to-end resolution would require a Pro-only
companion Mod script (Tier 3) and is explicitly **not** being pursued. Everything below is pure-sheet
and ships to every user; all sub-features are additive and individually gateable.

#### A. Attacker-side combat-resolution helpers
The sheet already automates the to-hit roll (phase [3]). These add the attacker-side inputs around it
(4001 phases [1] and [5], our half only):
1. **Aim zone + situational modifiers as roll queries** (replace the lone `?{Target Modifier?}` with
   structured options that compute the net EML adjustment, keeping the 5/95 clamp). Per the rules the
   modifier set differs by roll type:
   - **Attack rolls:** Aim (Mid 0 / **High −10 / Low −10**), **target Prone +20**, **Close Mode −10**,
     plus a free GM modifier.
   - **Defense rolls:** **Outnumbered −10 per foe above one**, target/own Prone +20, Close Mode −10,
     plus a free modifier. *(Outnumbering does not apply to attacks; Aim does not apply to defense.)*
2. **Potential Strike-Location roll button.** `1d100` read in the declared **Aim-zone column** (High/
   Mid/Low) of the Strike Location table → a body location. "Potential" because it only matters if the
   attack actually strikes (the defender resolves that). **Data dependency:** the 3-column Strike
   Location table must be transcribed (values only — like the existing Weapon Data table; no prose).
3. **Damage roll button.** `impact(chosen aspect) + ?{Strike multiplier}d6`. The player picks the
   aspect (Blunt/Edge/Point; default = highest impact) and **enters the ×Nd6 multiplier** read off the
   GM's cross-index of our success vs the defender's defense (the result table is the GM's to apply).
   No book data needed — aspect impacts already live on each weapon row.

#### B. Minor / GM-adjudicated coverage gaps (low priority, optional)
Surfaced by the full read; mostly GM-side, so keep light and gated:
4. **Skill Development (Skills 7).** A between-session aid: a per-skill "used this session" flag and an
   **SDR** roll button (`1d100`; SB is added to the development roll, +2 for fast-developing skills).
   Tracker, not a play aid — lowest priority.
5. **Movement helpers.** Combat Move is already derived and Jumping is already a skill (SB×4); at most
   expose running/sprint distances as read-only derived values. Marginal.
6. **Healing-over-time / disease / bloodloss (Physician 3–4).** Injury rows already carry
   day/healing/infected, and the **recovery-roll buttons live in Phase 8** — so here only note that
   disease/allergy/bloodloss remain **GM reference tables** with no sheet automation planned.
7. **Environmental damage.** Falling (>5 ft), fire/ignition (13+ gross Fire Impact, flammable armour),
   drowning, frostbite — all GM-adjudicated and scattered. At most a falling-impact helper; otherwise
   out of scope.

**Risk:** low-medium. A/1 and A/3 are additive query/roll-button changes (no stored-data change). A/2
needs the Strike Location table transcribed and verified. B items are individually optional. **Verify:**
unit tests for the aim/situational net-modifier math and the 5/95 clamp; the Strike-Location button
against the table's aim-zone columns; in-VTT that a Damage roll = aspect impact + entered ×Nd6.
**Gate** B/4 (and any B item built) behind its own setting.

### Phase 10 — Character Generation · XL · biggest coverage gap
The sheet is purely a **play** sheet — it has no character generation, yet 4001's whole ~58-page
Character section *is* the generation pipeline. This phase adds a guided chargen system on its own
tab that produces a playable character and **propagates** into the existing attribute/skill fields.

#### The 4001 pipeline to model (Character 2–24)
1. **Birth attributes:** Species [1d100/choice] → Birthdate [1d12 mo + 1d30 day] → **Sunsign**
   [derived from birthdate] → Birthplace→Culture → Social Class [1d100/choice] → **Sibling Rank**
   [1d100] + Family Size [1d6−1+rank] → **Parent** [1d100: Offspring / Fostered / Adopted / Bastard
   sub-tables] → **Estrangement** [1d100].
2. **Appearance / Medical:** Frame [3d6] → Height → Weight [derived from height+frame] →
   Comeliness [3d6 ± frame] → medical traits/disorders (some carry skill penalties).
3. **Attributes:** Physical (STR/STA/DEX/AGL/EYE/HRG/SML/VOI) and Personality (INT/AUR/WIL) by the
   species dice; **Morality** [3d6/choice]; **Psyche** [1d100 personality traits]; **Honor**.
4. **Occupation:** **Parent Occupation** (sets social options; may be accepted as your own) → your
   **Occupation** → **Skills**: Automatic (all chars, e.g. Initiative/4) + Occupational (open to
   SB×mult) + parent's primary skill (OML+SB) + **5 Option Points** to open/improve (veterans +3
   OP/yr). ML = SB × multiplier.
5. **Equipment & Funds → Contacts.**

#### Design
**Architecture (decided 2026-06-14): a local single-file HTML generator + a light Mod importer —
NOT in the character sheet.** A one-time generator in a play tab would risk clobbering live data and
can't create skill rows anyway (sheet workers can't add repeating rows). A pure chat-driven Mod was
rejected too: it's request/response, so it can't cleanly do the live "change occupation → repopulate
skills + OMLs" recompute that chargen needs.
- **Local HTML generator = the brains.** An offline HTML+JS file with the full interactive pipeline
  and **live recompute** (pick an occupation → its skills + OMLs repopulate; re-roll a stat → SBs/OMLs
  update; a running option-point budget). Roll or override any field. No hosting, no Pro,
  **unit-testable in Node** like the sheet, reusable outside Roll20, and **fast to build — no Roll20
  round-trip until the importer.**
- **Light Mod (API) importer = the on-ramp (Pro).** The generator emits a small JSON blob; a thin
  `!harnimport` Mod (paste, or read from a handout) creates a **new** Character, writes its attributes,
  and **creates the skill rows** — the one thing the sheet can't. The Mod holds **no rules logic**;
  all smarts stay in the HTML file. Rides on the Phase 7 Mod groundwork.
- **Non-Pro fallback:** the generator shows a clean summary; hand-enter attributes + skill names and
  the sheet's Phase 3/3.2 auto-fill SB/ML (light, since the generator did the hard part).
- **Random or manual per field.** Every rollable field gets a **roll button** (a worker generates
  the value from the table) *and* stays editable, so a player can roll, accept, or type a chosen
  result. Re-rolling a step is allowed until the character is locked.
- **Propagation (the point of it).** Generated values flow into the live sheet, reusing existing
  machinery wherever possible:
  - Birthdate → **sunsign** (existing `attr_sunsign`); attributes → the existing attribute fields.
  - Attributes + sunsign → **Skill Bases** via Phase 3's `SKILL_DATA` (already built).
  - Occupation → open its skill list into the correct repeating sections (Phase 3's skill→section
    routing) with **ML = SB × the listed multiplier**; an **Option-Point budget** tracker (start 5,
    +3/veteran-yr) that decrements as skills are opened/improved.
  - Psyche/medical traits → a **traits section** whose mechanical entries feed the penalty math
    (this is the *psyche & honor* hole noted separately — folded in here).
- **No lock needed.** The importer always creates a **fresh** Character, so there's nothing to lock
  on the play sheet — the old in-sheet `character_finalized` idea is moot now that chargen lives
  outside the sheet.
- **Copyright line (decided 2026-06-14): functional mechanics are public; only prose is gated.**
  Game rules/data are uncopyrightable methods (§102(b); the retroclone principle) — that includes the
  numeric tables AND the **occupation→skill bundles** (functional selection, not a creative
  compilation; no more protected than SB or OML). So the generator embeds all of it: dice, SB/OML,
  the skill list, occupation→skill bundles, and every table's partitions + result **labels** +
  mechanical **effects**.
- **Flavor file (owner-populated):** the only protected layer is descriptive **prose** (psyche/medical
  descriptions, species/culture/occupation flavor, setting lore). Ship an **empty `flavor.json`
  schema** (keys only, no text); the generator loads it if present; an **owner transcribes their own
  book's text into it**. We never distribute the prose — public users get labels + mechanics, owners
  add descriptions from the book they own.
- **Data to transcribe (functional):** Species, Social Class, Sibling Rank, Parent, Estrangement,
  Frame/Weight/Comeliness, Psyche/medical (labels + effects), Honor, occupations + skill bundles.

**JSON contract + flow + scope (decided 2026-06-14) — see `chargen/CONTRACT.md`.**
- **Contract (`harnchar` v1):** the schema the generator emits → `!harnimport` consumes → sheet
  expects, every field mapped to a **real `attr_` name** (verified against `harnsheet.html`).
  Principle: **emit inputs, not derived** (attributes, bio, skill rows name+ML, SB only when
  auto-calc is off) — the sheet recomputes endurance/move/SB/penalties on import. Repeating rows are
  created by the Mod (`createObj` + `generateRowID()`); SB omitted per row so the sheet's Phase 3/3.2
  fills it.
- **Flow:** a **step wizard** (species/culture → sunsign/birth → class & family → attributes →
  frame/comeliness → occupation → skills → psyche → honor) that ends in a **single fully-editable
  long form** — change occupation there and the skill bundle re-populates/re-OMLs live (the thing a
  chat-Mod can't do). Export = "Copy JSON" + "Print summary".
- **Scope: full pipeline EXCEPT HM Magic** (not owned in PDF). The `magic` block is **fully specified
  now** and maps to the sheet's existing `magicskill`/`spells`/`spell_convocation`, so it stays
  forward-compatible and a hand-built magic block would import today — generator just leaves it empty.
- **Two flavor files built:** `chargen/flavor.dist.json` (distribution template, all values empty —
  no protected text) and `chargen/flavor.private.json` (owner-populated, **git-ignored**). Same schema;
  generator loads the private one when present.
- **⚠ Sheet gaps found:** the sheet has **no `occupation`, psyche, or honor field** (magic is fine).
  Until added, the importer parks those three in `various_notes`. Promoting them to real fields is an
  additive **patch** (no migration) — do core pipeline now, wire the fields in a follow-up.

**Creature mode + bestiary (decided 2026-06-14) — generator gains a second mode.**
- **PC mode** = the life-path pipeline above. **Creature mode** = stat-block driven (hides occupation/
  parent/sunsign/social/psyche/honor); builds a **standalone creature character sheet** (Phase 7 7e).
  A horse is just creature #1. `kind:"pc"|"creature"` on the contract envelope.
- **Bestiary data** (`chargen/bestiary*.json`, tri-state): `public` ships, `homebrew` shareable,
  `harn` git-ignored. **Composition** — `extends` (single inheritance) + referenced components
  (`archetype`→default hit-locations, `sizeClass`→movement); `rank` (species/breed) is a soft label.
  Per-node `setting` flag is authoritative; a lint keeps `harn` out of the public file.
- **Copyright:** functional stat blocks are public (ship all **non-IP** 4001 table creatures — Lion,
  Killer Whale, …); **coined Hârn creatures + lore + their unique location tables** (Gargun/Ivashu/
  Yelgri articles, Hârn genera/species/breeds) → private. Even a *public* creature's prose description
  is owner-populated flavor.
- **Implementation started 2026-06-14:** `chargen/CONTRACT.md` §10–11 + `chargen/bestiary*.json` stubs
  + `chargen/bestiary.mjs` engine (merge → resolve `extends`/components → lint) with Node tests. UI
  wizard + the Phase-7 sheet creature-mode are the next pieces.

**Risk:** high — largest feature in the plan; many tables. But the clobber risk is **gone**: the
importer always creates a **fresh** Character, so there's no play-sheet lock to manage. **Dependencies:**
builds on Phase 3 (SB-from-attrs + skill routing) and the existing sunsign mapping; pairs with Phase 3b
if clerical chargen (RML = SB×4, opening Piety = Will×5) is included; the importer rides on Phase 7 Mod
groundwork. **Verify:** unit tests that each table roll lands in-range, that occupation→skill
propagation opens the right skills at SB×mult (against a worked example, e.g. Takar the Peoni cleric,
Character 23–24), and that emitted JSON validates against `harnchar` v1; in-VTT that `!harnimport`
creates a character with the right attrs + skill rows.

### Phase 11 — Skill specialties · S–M · setting-gated
Adds structured **skill specialties** (4001 Skills 7), toggled by a setting `hr_specialties`
(default OFF). The rules: a specialty may be declared once its base skill reaches **ML 40**; it
**opens at the base skill's current ML**, is then a **separate skill** with its own ML developed
independently, and **develops at +2 per development roll** (vs +1); the base skill improves
separately and is used outside the specialty.

The sheet already half-supports this: parenthetical names (`Sword (Broadsword)`) work as free-text
rows, and Phase 3's `SKILL_DATA` lookup already strips the parenthetical so the specialty row gets
the **base skill's SB** (same attribute triplet). This phase makes the relationship explicit.

**When OFF (default):** unchanged — specialties remain free-text `Base (Specialty)` rows; SB still
auto-derives from the base. No migration, nothing stranded.

**When ON:**
1. **Specialty link.** Add a per-row marker (e.g. `*_specialty_of` naming the base skill) so a row is
   recognized as a specialty of an existing skill — kept in the *same* repeating section as the base
   (combatskill/physicalskill/loreskill/…), so the Phase 2 per-row EML pipeline and roll button work
   unchanged.
2. **SB shared from base.** Reuse Phase 3's lookup: specialty SB = base skill's SB (same triplet +
   sunsign). Already true for parenthetical names; make it explicit for the linked row.
3. **Open-at-base-ML + ML 40 gate.** An "add specialty" affordance on a base skill row that seeds the
   new specialty's ML to the base skill's **current ML**, with a validation warning if base ML < 40
   (warn, don't hard-block — house rules vary). After creation the specialty ML is independent.
4. **Faster development (+2/SDR).** Only meaningful if the Phase 9 B/4 SDR tracker exists — when both
   are on, a specialty's development roll advances +2. **Dependency note:** standalone, this is just a
   label; the +2 behavior needs Phase 9's SDR.
5. **Grouped display (nice-to-have).** Visually group specialties under their base skill.

**Risk:** low–medium — mostly additive per-row fields + a small seeding/gating worker + optional
display grouping; reuses Phase 2 (EML) and Phase 3 (SB). **Dependencies:** Phase 3 (built); the +2
development advantage depends on Phase 9 B/4. **Verify:** unit tests that a linked specialty inherits
the base SB and seeds ML from the base, and that the ML-40 gate warns correctly; in-VTT that a
specialty rolls off its own ML via the existing pipeline and that toggling the setting off leaves
existing rows working.

**Built (v3.2.2):** option (a), parenthetical naming — `Sword (Broadsword)` is detected as a Sword
specialty (no new per-row field); the `hr_specialties` worker inherits the base SB and seeds ML from
the base. **Also added (owner request): develop buttons auto-increment ML** — the 20 develop buttons
became action buttons whose worker rolls the standard SDR (1d100+SB), and on `> ML` raises ML by 1
(**specialty +2**, capped at 100+SB), keeping the skilldevroll template's Success/Failure display.
This makes the +2 specialty advantage real (it no longer depends on a separate SDR tracker).
GM-discretion limits (weapon ML70/combat-experience, Ritual/RML develops by learning) are *not*
auto-enforced. Icon CSS generalized from `button[type=roll].skilldev-button` to `button.skilldev-button`.

### Phase 12 — Print / PDF stylesheet · S · quick win
Roll20 has **no native print or PDF export** for character sheets; the only built-in path is the
browser's Print (→ "Save as PDF"), and out of the box it captures the whole VTT and only the active
tab is visible. But this sheet keeps **all tabs in the DOM** (inactive ones hidden via CSS off the
`sheetTab` attribute), so a print stylesheet can produce a clean full-sheet printout with no Roll20
feature or Pro needed.
1. **Add an `@media print` block** that: isolates the sheet (hide everything outside `.charsheet` /
   the sheet dialog — Roll20 wraps it in a jQuery-UI dialog), **reveals all tabs** (override the
   `sheetTab` show/hide so Character + Inventory + Settings all render), and **hides interactive
   chrome** (roll buttons, action buttons, the Settings/Help/Changelog blocks, datalists' arrows).
2. **Lay out for paper:** force light colors (ignore dark mode), single-column/section flow, avoid
   awkward page breaks (`break-inside: avoid` on grids/sections), readable font sizes.
3. **Optional:** a small "Print" affordance/note, or rely on Ctrl/Cmd-P.
**Risk:** low — pure CSS, additive, no worker/markup logic. **Caveats:** isolating the sheet from
Roll20's surrounding dialog/VTT chrome is trial-and-error and can only be confirmed **in-VTT**
(iterate like the combat work); Roll20 DOM/classes may shift over time. **Verify:** in-VTT Ctrl-P →
Save as PDF yields a clean, full (all-tab) sheet in both light and dark mode; no VTT chrome; sensible
page breaks.

### Suggested sequence
**Shipped in v3.2.0 (20260614):** Phases 0, 5, 1, 2, 3. **Deferred:** Phase 4 legacy-armor sunset
(owner decision) and Phase 3.2 ML→OML auto-seed.
**Remaining, each its own version:** Phase 3b (religion), Phase 6 (attribute buffs), Phase 7
(multiple horses + Mod script), Phase 8 (conformance-audit polish), Phase 9 (attacker-side combat
helpers + minor gaps), Phase 10 (character generation). 3b reuses 3's SB-from-attrs machinery; 6
reuses 2's EML pipeline and 3's skill→attribute table; 7 is largely independent (separate sheets + a
companion Mod script); 8 and 9 are independent/additive coverage that can land any time (9 reuses
Phase 2's roll-query + clamp pattern); **10 is the largest** — it depends on Phase 3 (SB-from-attrs +
skill routing) and pairs with 3b for clerical chargen, so sequence it after those. Phase 11 (skill
specialties) reuses Phase 2/3 and is small; its +2-development advantage depends on Phase 9 B/4.
Each is its own version bump + changelog entry (see process notes).

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
  be rewritten (most changes recompute on next interaction and need no migration). **Version policy
  (agreed 2026-06-13):** additive phases that need no data migration are **patch** bumps (3.2.1,
  3.2.2, …); a phase that needs a migration is a **minor** bump (3.3, 3.4, …) and touches
  `versionsWithMigrations`.
- **Tests + test plan per phase (standing rule):** every phase ships (1) **automated tests** wherever
  the harness can reach the logic — worker calcs via `testkit/harness.mjs`, roll-button target math
  and macro structure via `testkit/roll-eval.mjs` (`node --test` from `HarnMaster3/`) — and (2) an
  **in-VTT test plan** (`TESTPLAN-phase<N>.md`) for what only live Roll20 can exercise (query UX, dice
  rolls, macro rendering, CSS show/hide). Add a **copyright-guard test** for any feature that touches
  rulebook tables, asserting the protected content is *not* embedded (see `phase9.test.mjs`).

### Backlog / deferred items
Smaller deferred features and polish carried over from **shipped** phases (the named, not-yet-built
phases — 3b, 4, 6, 7, 8, 10, 12 — are tracked above). Keep this list current so every recap is complete.

- **3.2 — ML→OML auto-seed** *(BUILT v3.2.3, pending in-VTT)*: sets an unset ML to `SB × OML` for
  recognised skills. **Ungated — base canon.** Skips specialty rows (they open at the base's current
  ML via Phase 11); only-when-ML-0 (never clobbers an improved ML). `SKILL_OML` map attaches an OML
  multiplier to each `SKILL_DATA` entry; Language/Script omitted (non-SB×N openings).
- **Phase 5 — i18n stretch:** wire Roll20 `data-i18n` on labels + a translation JSON (only the locale
  files exist now); rename the confusing `--background-dark` CSS variable.
- **Phase 9 — movement helpers:** running/sprint distances. Marginal.
- **Phase 9 — environmental damage:** falling / fire / drowning / frostbite. Mostly GM-adjudicated;
  at most a falling-impact helper.
- **Phase 9 — "skills used this session" tracker:** mark-used + batch develop. (The *auto-increment
  on develop* half shipped in Phase 11.)
- **Phase 11 — grouped specialty display:** visually group specialties under their base skill.
  Skipped because Roll20 can't reorder repeating rows.
- **HM weapon-field UX:** the HM attack field must be entered as a *negative*; relabel or flip the
  sign (needs migration care). Also listed inside Phase 8.
- **max-ML manual validation:** warn if a *manually-entered* ML exceeds 100 + SB. (Phase 11's develop
  already caps at 100+SB; this is the manual-entry warning, a Phase 8 item.)
- **Attribute-panel row height (cosmetic, low priority):** character & horse panels now match (both
  `33px`, fixed v3.2.1) but feel tight — revisit for a roomier fit, same value on both panels.
- **Phase 4 sub-idea:** make the fixed skills a pre-seeded repeating section (larger; part of the
  legacy/model cleanup).

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
