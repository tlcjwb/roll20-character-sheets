# Phase 11 (v3.2.2) — in-VTT test plan

Automated coverage: `node --test` from `HarnMaster3/` (108 tests). `test/phase11.test.mjs` covers the
specialty linking (SB-from-base, ML-seed, gating) and the develop auto-increment (+1, specialty +2,
cap at 100+SB, success/fail via a controllable roll). Below is what only live Roll20 can exercise.

## A. Version
- [ ] Settings shows **20260616 - Version 3.2.2**; Changelog has the Phase 11 entry.

## B. Skill specialties (Settings → "Skill specialties?", default off)
- [ ] With the setting **on**, add a combat skill **Sword** (SB e.g. 12, ML e.g. 50), then add a row
  **Sword (Broadsword)** with ML 0 → it picks up **SB 12** and **ML seeds to 50**.
- [ ] Set the Broadsword ML to something (e.g. 52); re-opening/renaming does **not** overwrite it (it
  develops independently now).
- [ ] With the setting **off**, a new `Sword (Broadsword)` row is left alone (no auto SB/ML link).
- [ ] Works the same in the other skill sections (physical, communication, lore, ritual, magic).
- [ ] (With Auto-calculate Skill Base also on, SB still comes out right — no fighting between the two.)

## C. Develop buttons auto-increment ML
- [ ] The develop button (the `{` / Pictos icon) still shows its icon (it's now an action button).
- [ ] Click develop on a skill where `1d100 + SB` can beat ML: on **Success** the ML field **goes up by 1**
  and chat shows **Success.**; on **Failure** ML is unchanged and chat shows **Failure.**
- [ ] A **specialty** row (e.g. `Sword (Broadsword)`, specialties on) increments by **2** on success.
- [ ] A skill at **ML = 100 + SB** does not increase (and never exceeds it).
- [ ] Spot-check a fixed skill (Climbing/Stealth/etc.) and a repeating skill (combat/lore/etc.).

## D. Regression
- [ ] Normal skill **checks** and other rolls are unchanged.
- [ ] The develop buttons that aren't combat-experience-gated still behave (the sheet doesn't block
  any develop; GM decides when one is earned).
