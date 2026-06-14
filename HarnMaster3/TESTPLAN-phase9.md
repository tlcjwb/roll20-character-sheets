# Phase 9 (v3.2.1) — in-VTT test plan

Automated coverage: `node --test` from `HarnMaster3/` (96 tests) — modifier math via the real
macros, the Strike-Location table mapping (every roll 1–100 × 3 aim zones, side parity, Face
sub-roll), the Missile Data table, and the aspect-selection + per-range/per-weapon damage handlers
(via a `startRoll` capture). Below is what only live Roll20 can exercise. **Status: passed
2026-06(owner).**

## A. Version
- [ ] Settings shows **20260615 - Version 3.2.1**; Changelog has the Phase 9 entry.

## B. Combat Modifiers panel (top of COMBAT STATS)
- [ ] Shows **Aim · Aspect** then **Opp. Prone · Close Mode**; Aim/Aspect dropdowns readable in
  dark mode (solid background like horse-speed), Aspect not clipped.
- [ ] Set **Aim = High** → attack rolls are −10 and you get **one** "Other modifier?" prompt only.
- [ ] **Opp. Prone** = +20 to attack and defense; **Close Mode** = −10; defenses don't read Aim.
- [ ] Outnumbering etc. go through the single **Other modifier** prompt.

## C. Per-weapon Damage + Strike Location (🎲)
- [ ] Each **melee weapon** row has a 🎲 (DMG column) after Defense; clicking posts
  `<weapon> — strike` with **Location** (Aim + d100 → body part, left/right side, Face sub-roll)
  and **Strike Impact** (chosen aspect impact + `Nd6`, prompting N), **no TARGET row**.
- [ ] Aspect auto-pick: single-aspect weapon uses it; multi-aspect uses the panel **Aspect**
  (or highest on Default).
- [ ] **Punch** and **Kick** rows have a working 🎲.
- [ ] **Horse Trample** row has a 🎲 in its own DMG column (not overflowing).
- [ ] **Missiles:** a 🎲 beside each range's attack die (**Short/Med/Long/Extreme**), each rolling
  that range's impact directly — **no range prompt**.
- [ ] Die backgrounds correct in dark mode (all use the `damage-die` theme class).

## D. Embedded tables
- [ ] Strike Location matches the book (spot-check: Mid 05→Skull, 60→Thorax, 100→right Foot; High 16→Face).
- [ ] Naming a standard missile (e.g. **Staff-sling**) auto-fills exact ranges/impacts (extreme = 3).

## E. Regression
- [ ] A normal weapon **Attack** and any **skill** roll still show **TARGET** and **RESULT**.
- [ ] Horse **combat-stats** panel and **attributes** panel render correctly (attributes seamless,
  matching the character attributes panel).
