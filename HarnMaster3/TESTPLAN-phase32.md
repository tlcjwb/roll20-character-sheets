# Phase 3.2 (v3.2.3) — in-VTT test plan

Automated: `node --test` (118 total). `test/phase32.test.mjs` covers the seed (SB×OML), the
only-when-0 guard, specialty skip, unrecognised skip, no-SB skip, and fixed skills. Live checks:

## A. Version
- [ ] Settings shows **20260617 - Version 3.2.3**; Changelog has the Phase 3.2 entry.

## B. ML → OML (always on — no setting)
- [ ] Add a recognised combat skill **Sword** with a Skill Base (e.g. SB 12) and a **blank ML** →
  ML fills to **36** (Sword OML = SB×3). Try a couple more: **Climbing** (SB×4), **Awareness** (SB×4),
  **Dagger** (SB×3), a lore skill like **Physician** (SB×1).
- [ ] Auto-calc SB on or off both work (it only needs an SB present, however it got there).
- [ ] **Does not overwrite**: set/develop an ML, then it's never auto-changed.
- [ ] **Blank SB → no fill** (nothing to multiply yet).
- [ ] **Unrecognised skill** (made-up name) → ML left blank.

## C. Interaction with specialties (Phase 11)
- [ ] A specialty row (`Sword (Broadsword)`/`Broadsword (Sword)`, specialties on) opens at the
  **base's current ML**, **not** its own OML (the OML seed skips specialties).

## D. Fixed skills
- [ ] A fixed automatic skill (Climbing, Stealth, Initiative, etc.) with SB and blank ML fills to its OML.

## E. Regression
- [ ] Existing skills with MLs are untouched on open; develop/checks still work.
