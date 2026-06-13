# HarnMaster3 Roll20 Character Sheet — Design & Code Review

Review of the [HarnMaster3](https://github.com/Roll20/roll20-character-sheets/tree/master/HarnMaster3)
Roll20 character sheet (current author: Olaf van Tol, building on wing-it / Scott Turnbull's
original). Focus: **functionality and usability** — not layout/CSS.

Files reviewed:
- `harnsheet.html` (2,645 lines — markup, roll template, and all sheetworker JS)
- `harnstyle.css` (1,791 lines — layout only; not the focus of this review)

Algorithmic verdicts are checked against the **HârnMaster v3.5.2** core rulebook
(Columbia Games). Citations use the book's internal section names (e.g. "Skills 6" = page 6
of the Skills article, "Combat 14", "Physician 3").

Severity legend: 🔴 high · 🟠 medium · 🟡 low

---

## 1. Confirmed code bugs (provable from the code alone)

### 🔴 A. Migration chain stalls for any pre-v2 character with no weapons
`harnsheet.html:2087-2091`

`migrateTo20210801` has two async branches; the weapon-recalc branch is the **only** one that
calls `callNextMigration(migrationChain)` (in its `setAttrs` callback). It returns early when
there are no weapons:

```js
getSectionIDs('weapon', ids => {
    if (ids.length === 0) {
        console.log("Migration: No weapons found, nothing to migrate.");
        return;                       // <- never calls callNextMigration()
    }
    ...
    setAttrs(update, {}, function() {callNextMigration(migrationChain);} );
});
```

When it returns early, `setCurrentVersion` (the last link in the chain) never runs, so
`data_version` is never written. On the **next** open, `oldName !== 0 && isNaN(dataVersion)`
is true again (`:1988`), so the full migration re-fires **every time the sheet is opened** —
repeatedly rewriting `character_name`, recomputing condition, and re-flashing the upgrade notice.

**Fix:** call `callNextMigration(migrationChain)` on the early-return path. (Also: the
name/condition branch and the weapon branch run in parallel with no ordering guarantee, so
`setCurrentVersion` can fire before the name migration's `setAttrs` resolves.)

### 🔴 B. Horse injury "infected" feedback is wired to the wrong repeating section
`harnsheet.html:2299-2309`

```js
on('change:repeating_hinjury:hinjury_infected', function() {
   getAttrs([
      'repeating_injury_hinjury_infected',            // <- section "injury", should be "hinjury"
      'repeating_spells_hinjury_infected_feedback'    // <- junk: section "spells"
    ], function(values) {
        var isinfected = (values.repeating_injury_hinjury_infected == 0 ? 0 : 1);
       setAttrs({
            repeating_injury_hinjury_infected_feedback: isinfected   // <- wrong section again
       });
   });
});
```

The event fires on `repeating_hinjury`, but every attribute name says `repeating_injury_…`.
`getAttrs` returns `undefined` (→ `isinfected` always `1`), and `setAttrs` writes to a
non-existent `injury` row instead of the `hinjury` row the healing template reads
(`{{infected=[[@{hinjury_infected_feedback}]]}}`, `:1063`). **Net result: the horse "Infected"
indicator never works.** The character version (`:2286`) is correct except for the same
harmless junk `repeating_spells_…feedback` getAttrs entry (see F).

### 🟠 C. Duplicate attribute name in the horse Trample row
`harnsheet.html:1095-1096`

```html
<input ... name="attr_htrample_ml"  ...>   <!-- ML column -->
<input ... name="attr_htrample_ml"  ...>   <!-- AML column, same name -->
```

Both the "ML" and "AML" columns bind to the same attribute, so they always show identical
values and AML can't hold the attack-modified value. The trample roll button uses
`htrample_ml` (`:1097`). The second should be a distinct attr (e.g. `htrample_aml`).
(There is also no sheetworker computing trample SB/ML/AML — it's all manual.)

### 🟠 D. Division-by-zero produces `Infinity` penalties on partially-filled sheets
`harnsheet.html:2227` and `:2255`

```js
var encumbrance = Math.round(total/carrycapacity)||0;
```

If weight is entered **before** STR/STA/WIL (so Endurance/carry-capacity is 0), this is
`weight/0 = Infinity`, and `Math.round(Infinity)||0 = Infinity`, which flows into
`physical_penalty` → every skill/attack target, move, and initiative. (It stays sane on a
brand-new sheet only because `total = 0` gives `0/0 = NaN → 0`.) Guard `carrycapacity > 0`
before dividing. Same pattern in the horse block.

### 🟠 E. `disabled` skill-name fields may not resolve in macro-bar / Ability rolls
Throughout — e.g. `:158`, `:168`, `:202`.

Fixed skill labels use `disabled="true"` (`<input ... value="Initiative" disabled="true">`)
and are referenced in roll macros via `@{initiative_name}`. Roll20 does not reliably persist
`disabled` inputs as attributes; the standard guidance is `readonly` for fields you still need
to read in macros. The author already uses `readonly` for computed mirrors, so this is
inconsistent. Worth converting the label fields to `readonly`. (Medium because exact behavior
has shifted across Roll20 versions — verify in-VTT.)

### 🟡 F. Dead/copy-pasted attribute reference in character infection handler
`harnsheet.html:2289` — `repeating_spells_injury_infected_feedback` is fetched and never used.
Harmless, but it's the fingerprint of the copy-paste that produced bug B.

### 🟡 G. Armor-weight total is recomputed O(n²)
`harnsheet.html:2598-2605` — the `load_armor_total` accumulation loop sits *inside* the outer
`id_array.forEach(id => …)`, so for N armor rows it recomputes the full weight sum N times
(last write wins, so the value is correct — just wasteful). Move it outside the per-id loop.

---

## 2. Algorithmic verification against the rulebook

### ✅ Confirmed CORRECT

| Formula | Verdict & citation |
|---|---|
| `Endurance = round((STR+STA+WIL)/3)` | Condition SB (= STR STA WIL averaged, round to nearest) "is the same as Endurance" — *Skills 3 & 9*. |
| `effCondition = min(round(condML/5), round(End×1.4))` | "Condition ÷ 5 has the same function as Endurance"; Condition max = SB×7 and SB = Endurance, so the ×1.4 ceiling = SB×7/5 exactly — *Skills 9*. |
| `UP = Injury+Fatigue`; `PP = UP+Encumbrance` | Exact. "Universal Penalty is the sum of Injury and Fatigue penalties"; "Physical Penalty = Universal Penalty plus Encumbrance Penalty" — *Skills 6* (example: IL2+FL1=UP3, +Enc2 = PP5). |
| `Move = AGL − UP − Enc` (min 1) | "effective Move = Agility minus Physical Penalty"; min 1 — *Combat 6*. Identical since PP = UP+Enc. |
| `Initiative = ML − 5×(Enc+UP)` | Initiative is a Combat skill → reduced by 5×Physical Penalty — *Combat 7, Skills 6*. |
| Riding EML = `round((riderEML + steedInitEML)/2)`, each `−5×PP` | "Riding EML is always averaged with the Initiative EML of the steed" — *Combat 20* (example (80+43)/2 = 62). Rider Fatigue/Enc halved when mounted, per rule. |
| Healing target = `HR × Endurance` | "Target Level for a Healing Roll is HR × Endurance" — *Physician 3/4* (example End 11, H4 → 44). |
| Shock = `(UP)d6 ≤ Endurance` | "roll 1d6 for each point of Universal Penalty… if the roll exceeds Endurance, downed" — *Combat 14*. |
| Stumble `3d6 ≤ AGL (+PP)`, Fumble `3d6 ≤ DEX (+PP)` | Stumble = Agility test, Fumble = Dexterity test, both 3d6; "Physical Penalty is added to the roll" — *Skills 21/22 & Skills 6*. |
| **SDR** = `1d100 + SB`, success if `> ML` | Verbatim: "Roll 1d100 + applicable Skill Base. If the sum is greater than current ML, increase ML by one" — *Skills 7*. |
| d100 roll-under, crit on multiples of 5, clamp 5/95 | "roll ≤ EML = success"; "any roll ending in 5 or 0 is critical"; min EML 05, max 95 — *Skills 2 & 5*. The `cs5cs10…cs100` + `{…,5}kh1 / {…,95}kl1` logic is exactly right. |
| Missile EML steps `−0/−20/−40/−80` | Universal across all weapons — *Missile Data, Combat 16*. |
| Mounted **missile** `−10` | "Attacker Moving or Mounted: Subtract 10" — *Combat 16*. |
| Steed load limit = `STR×8` | *Combat 19*. |
| Steed encumbrance = `round(excess ÷ End)` | The book's example rounds `40÷21 → 2` — *Combat 21* — so the horse handler's `Math.round` matches RAW. |
| Steed move = `(Move − PP) × speed`; speeds .5/1/2/3; turns 3/5/10 | *Combat 20*. |
| Steed natural armour B4/E3/P1/F3 | *Combat 19*. |
| Attribute test = `attr × 3–7`, physical→PP / non-physical→UP | Verbatim multiplier; "Physical attributes express physical and sensory abilities" so EYE/HRG/SML correctly use PP — *Skills 21, Character 7*. |

### ⚠️ Confirmed INCORRECT / deviations

| # | Item | Verdict & fix |
|---|---|---|
| **3** | **Character encumbrance uses `Math.round`** | 🟠 RAW rounds **down**: "33/14… rounds down to 2" (*Skills 6*). `Math.round` over-counts when the fraction ≥ .5 (56 lb / End 12 = 4.67 → sheet 5, RAW 4). **Fix: `Math.floor`.** The **horse** version should stay `round` (steed example rounds 40/21→2). This is also where bug §1-D lives. |
| **13** | **Missile impact falloff `−1/−2/−3`** | 🟠 Approximation, not RAW. EML steps are universal & correct, but per-range **impact** comes from the Missile Data table and is **not** flat −1/−2/−3 (Longbow 8/7/6/5, Sling 4/3/2/2, Blowgun 0/0/0/0). The med/long/ext damage fields are **readonly**, so players can't enter table-correct values. **Fix: make the per-range impact fields editable** (auto-fill as a starting guess). Also `mdmg/2` isn't floored (yields x.5). |
| **16** | **Voice (VOI) attribute test** | 🟡 Voice is a **Physical** attribute in the rulebook (*Character 7*), but the sheet applies **Universal** penalty. Low severity (defensible house choice), but not RAW. Should use `physical_penalty`. |
| — | **Healing ignores Fatigue** | 🟡 RAW: "Injury and Encumbrance penalties are ignored on Healing rolls. Fatigue penalty… should be applied" (*Physician 2*). The sheet applies no penalty at all (correct for injury/enc, but omits fatigue). Minor. |
| — | **Shock with UP 0** | 🟡 Clicking Shock at Universal Penalty 0 rolls `0d6` (Roll20 errors/zeroes). Real shock always includes the new injury (UP ≥ 1), so it's an edge case — worth guarding. |
| — | **Spell/Ritual/Psionic SI field name** | 🟡 Naming only. RAW: "SI = one-tenth ML, rounded down… always based on ML, never EML" (*Skills 2*). `floor(value/10)` is mechanically correct; the field just happens to be named `…_eml`. No math error. |

**Net:** the rules engine is substantially accurate — the d100 core, penalty stack, movement,
initiative, shock, fumble/stumble, healing, SDR, mounted averaging, and steed
load/encumbrance/move all match RAW, several confirmed by the book's own worked examples. The
real algorithmic issues are narrow: character-encumbrance rounding (item 3) and the
hard-coded missile impact falloff (item 13).

---

## 3. Usability & design notes

- 🟠 **No SB→ML assistance.** Every SB and ML is a raw manual number (the README states the
  sheet "does not calculate SBs"). Since the sheet already holds the attributes, even an
  optional "compute SB" helper — or defaulting ML to SB×1 when SB is entered — would remove the
  most error-prone manual step. At minimum, surface that caveat near the skill grid.
- 🟠 **Silent clamping hides input errors.** A skill left at ML 0 still rolls at 5% (the 5/95
  clamp), so an unset skill looks like a real roll. Consider a cue when ML/SB is 0.
- 🟡 **Injury severity option casing** differs (character `M/S/G/K` `:460-463` vs horse lowercase
  `m/s/g/k` `:1055-1058`). Cosmetic in chat output.
- 🟡 **Infected checkboxes have no `value`** (`:469`, `:1065`); they work by JS coercion
  (`"" == 0`). Add `value="1"` for robustness.
- 🟡 **Duplicate HTML `id`s** (`id=settingstab` at `:5` and `:18`; reused armor `id`s in the
  legacy block). Invalid HTML; accessibility/`<label>` concern.

---

## 4. Maintainability / dead code

- 🟡 Large **commented-out obsolete armor block** at `:2527-2549` — superseded; safe to delete.
- 🟡 **Per-piece hidden `armor_<loc>_<dmg>value` attributes** are still written (`:2593`) but
  nothing reads them — leftovers from the old per-location approach.
- 🟡 **Duplicated event** `change:hstr … change:hstr` in one trigger list (`:2240`).
- 🟡 The **legacy-armor grid** (`:1335-1475`) reuses the same `attr_<loc>_layers` / `attr_<loc>_b…`
  names as the active Character-tab armor display (`:500-615`) — intentional (migration crutch),
  but editing legacy fields silently writes the character-tab values. Worth a comment/warning.

---

## Fix priority

1. 🔴 A — migration stall (call `callNextMigration` on the no-weapons return).
2. 🔴 B — horse infection section names (`injury` → `hinjury`).
3. 🟠 C — duplicate `htrample_ml` → `htrample_aml`.
4. 🟠 D + item 3 — guard divide-by-zero **and** change character encumbrance to `Math.floor`.
5. 🟠 13 — make missile per-range impact fields editable.
6. 🟠 E — `disabled` → `readonly` on skill-name labels (verify in-VTT).
7. 🟡 — Voice penalty, healing fatigue, shock UP-0 guard, value="1" on infected, dead code, dup id.

---

## Status — fixes applied

The following were applied to `harnsheet.html` (worker JS re-validated with `node --check`;
net diff −96/+79 lines, mostly dead-code removal):

| Item | Change |
|---|---|
| 🔴 A | Migration chain: `callNextMigration(migrationChain)` now called on the no-weapons early return, so `data_version` is written and migrations stop re-firing. |
| 🔴 B | Horse infection handler: section names corrected `repeating_injury_*` → `repeating_hinjury_*` (read + write); junk `repeating_spells_*` entry removed. |
| 🟠 C | Trample: second `htrample_ml` input renamed to `htrample_aml`; attack roll now uses `@{htrample_aml}`; mirror worker keeps `htrample_aml = htrample_ml` (trample has no separate attack bonus). |
| 🟠 D + item 3 | Character encumbrance now `carrycapacity > 0 ? Math.floor(...) : 0` — fixes RAW round-down **and** the `Infinity` divide-by-zero. (Horse keeps `Math.round`, matching the *Combat 21* steed example.) |
| 🟠 E | All 45 `disabled="true"` → `readonly` (no `<select>` affected; CSS already styles `[readonly]`), so label/constant values reliably persist for macros. |
| 🟡 F | Removed dead `repeating_spells_injury_infected_feedback` getAttrs entry. |
| 🟡 G | Armour-weight total moved out of the per-row loop (was O(n²), now O(n)). |
| 🟠 13 | Missile per-range impact fields (medium/long/extreme) made **editable** on the Inventory tab (Character-tab displays stay read-only); recompute trigger scoped to `missileweapon_ml`/`_p` so manual overrides stick; 50% floor now `Math.floor`. |
| 🟡 16 | Voice attribute test switched to **Physical Penalty** (RAW: Voice is a physical attribute). |
| 🟡 | `value="1"` added to both infected checkboxes; removed obsolete commented armour block; removed duplicate `change:hstr` trigger. |

### Previously-deferred items — now addressed

| Item | Change |
|---|---|
| 🟡 Healing-roll fatigue penalty | Character & horse healing rolls now subtract `5×Fatigue` from the target and surface it as `penalty` (RAW *Physician 2*: Injury/Encumbrance ignored on Healing rolls, Fatigue applied). |
| 🟡 Duplicate HTML `id=settingstab` | Removed the `id` from the upgrade-notification button (line 5); the tab button is now the sole `#settingstab`, so the CSS `#settingstab` rules target the correct element. |
| 🟡 Injury severity casing | Horse severity options `m/s/g/k` → `M/S/G/K` to match the character section (consistent chat output). Existing stored horse-injury values keep their old casing until re-selected. |
| 🟡 SI worker | Fixed the misleading "calculate SI from SB" comment (SI = floor(ML/10) per *Skills 2*; the `*_eml` fields hold ML) and hardened the `parseInt` ordering: `Math.floor((parseInt(x)||0)/10)`. No attribute rename (would need data migration for a purely cosmetic name). |

### Intentionally left unchanged

- **Shock at UP 0** (🟡): reviewed — no change. Roll20 evaluates `[[0d6]]` to `0`, which is
  `≤ Endurance` → "not downed", the **correct** no-shock outcome. Real shock always includes the
  triggering injury (UP ≥ 1). Forcing ≥ 1 die would introduce a bug, so the macro is left as-is.
