# 4001 Chargen Coverage Matrix

The completeness backbone for the **character generator** (`chargen/harnchargen.html`).
Every chargen rule in 4001 Character pages **1–17 and 21–27** gets a row; **18–20 and 28–30
are out of scope**. The north star: each rule's test ultimately asserts what lands in the
emitted **`harnchar` JSON**. Every rule runs **public (4001)** and, where a private extension
exists, **public + private (owner build, e.g. 4823)**. Homebrew is ignored for now.

**Status legend:** ✅ implemented+tested · 🟡 implemented, test pending · 🔲 gap (not built —
see `memory/occupation-audit.md` patterns) · ⛔ out of scope.

**Unit-test architecture (Option A — done):** the pure rule layer (`chargen.mjs` / `tables.mjs` /
`occupations.mjs`) is unit-tested directly. The occupation→bundle **assembly was extracted into a
pure `chargen.mjs` `occBundle(occId, sel, data)`** that both the UI and the tests call — so the
soldier/knight/cleric/mage/parent resolution is unit-tested (`test/chargen-4001.test.mjs`). Remaining
`ui.js`-only behavior (show/hide of pickers, optional-skill point-spend, funds field, JSON copy) is
walked in **TESTPLAN-4001.md** (browser). Tests are organized page → section → rule.

| Page | Rule | Generator behavior | Unit test | TESTPLAN § | Status |
|---|---|---|---|---|---|
| Char 1 | (overview / creation-order — no mechanics) | — | — | — | — |
| Char 2 | Species, Sex | dropdowns/🎲 → `identity` | chargen/tables | §2 | ✅ |
| Char 3 | Birthdate → Sunsign (day-of-year, cusp) | derived `identity.sunsign` | `tables §sunsign` | §3.1 | ✅ |
| Char 3 | Birthplace→Culture, Social class (1d100) | dropdown/🎲; refilters occupations | `tables §occupationGen` | §3.2–3.3 | ✅ |
| Char 4–5 | Sibling rank, Parent (+sub), Estrangement, Clanhead | 🎲 → `identity.*` | `tables (1..100 tiling)` | §4–5 | ✅ |
| Char 6–8 | Attributes 3d6 + species/sex/weight/frame mods; Key Attributes 4d6dl | roll → `attributes` | `chargen §Char6/7/8` | §6–8 | ✅ |
| Char 3/8 | Frame, Height, Weight (derived), Comeliness, Morality | Appearance fieldset | `chargen §Appearance` | §8 | ✅ |
| Char 9 | Medical (sex-specific 1d100, opt-in) | → `medical[]` | `chargen §Char9` | §9 | ✅ |
| Char 10–13 | Skills framework: SB=avg3+sun, ML=SB×OML; base+SB openings | `skillBase`/`computeOccupationSkills` | `chargen §SB/base+SB` | §15 | ✅ |
| Char 14 | Occupation generation (class × culture); patterns A–D | filtered dropdown + 🎲; title-choice/culture-name/distinct/labels | `occupations`, `tables`, `chargen-4001 §Char14-15` | §14 | ✅ |
| Char 15 | Occupational skills (ML = SB×OML); family skills (parent bundle) | `occBundle` + parent pickers + Skills-table picker | `chargen-4001 §Char14-15` | §15 | ✅ |
| Char 16 | Optional skills (5 OP) | `#optList` → merged skills | — | §16 | ✅(browser) |
| Char 17 | Equipment & Funds (Social Class × wealth) | `familyFunds` / `familyWealth` → `gear.funds` | `Character 17 — Equipment & Funds` | §17 | ✅ |
| Char 17 | Price-list picker (Comprehensive Price List) | `gearTotals` → `gear.items/spent/weightCarried/remaining` | `Character 17 — Equipment & Funds` | §17 | ✅(unit) / browser-pending |
| Combat 3–5 | Weapons + Armour catalog (public 4001 data, prices) | `equipment.public.json` (inlined) → picker | `Character 17 — public 4001 equipment catalog` | Combat 3–5 | ✅(unit) / browser-pending |
| Char 18–20 | (veterans / contacts) | — | — | — | ⛔ out of scope |
| Char 23 | Clerics — deity-driven skills (ALL + per-deity), RML, Piety=Will×5 (Pattern E) | deity picker drives bundle | `chargen-4001 §Char23` | §23 | ✅ (invocations 🔲 deferred 4401) |
| Char 25–26 | Mages — convocation skills (Char 26 ALL+per-conv), CML CSB×chantry + sunsign mod (Pattern E) | convocation + chantry pickers → `magic` block | `chargen-4001 §Char26` | §26 | ✅ (spells 🔲 deferred 4301) |
| Char 27 | Military Careers — per-culture units, ALL-common, weapons-as-specialty (Pattern F); noble knights + Lady (G) | Soldier/knight unit picker | `chargen §Char27`, `chargen-4001 §Char27/Noble` | §27, §N | ✅ (Fighting Orders 🔲 deferred) |
| Char 28–30 | (out of scope) | — | — | — | ⛔ out of scope |

**Status:** the chargen Character section is implemented + covered (pure layer unit-tested in
`test/chargen-4001.test.mjs` + the per-module suites; UI in TESTPLAN-4001.md). Remaining 🔲 are the
genuinely deferred sub-features (cleric invocations 4401, mage spells 4301, Fighting Orders) — they
become rows here as those books are imported.
