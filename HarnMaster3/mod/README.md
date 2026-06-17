# `!harnimport` — Roll20 Mod (generator → sheet bridge)

Consumes a `harnchar` JSON (produced by the local generator, `chargen/harnchargen.html`,
**Copy JSON** button) and populates a HarnMaster character sheet. Requires a Roll20 **Pro**
game (API Mods). The JSON contract is `chargen/CONTRACT.md`.

## Install
Roll20 → game **Settings → API Scripts → New Script**, paste `mod/harnimport.js`, Save.
On start it logs: `harnimport ready …`.

## Use (as GM, in chat)
1. Generate a character in `harnchargen.html`, click **Copy JSON**.
2. Make a **Handout** (default name `harnchar`), paste the JSON into its text, Save.
3. Run a command:

| Command | Effect |
|---|---|
| `!harnimport` | read handout `harnchar`, **create a new character** |
| `!harnimport --handout "Name"` | read a differently-named handout |
| `!harnimport --update` | write into the **selected token's** character instead of creating one |
| `!harnimport { …json… }` | parse JSON straight from chat (small payloads only) |

Results are whispered back (attrs / rows / notes counts; warnings).

## What maps where
- **Identity** → bio attrs (`species`, `culture`, `social_class`, `sunsign`, `frame`, `height`, `weight`, …).
- **Attributes** → `str sta dex agl eye hrg sml voi int aur wil cml moral` (the numeric scores).
  Comeliness/Morality **descriptor strings** (e.g. "Attractive") are informational → notes, never
  written into the numeric `cml`/`moral` fields.
- **Skills** → repeating sections `repeating_combatskill / physicalskill / communicationskill /
  loreskill / ritualskill / magicskill` (name + ml; SB omitted so the sheet auto-calcs it). Fixed
  skills → `<key>_ml`.
- **Religion** → a `repeating_piety` row + `ritual_religion`.
- **Magic** → `repeating_magicskill` + `repeating_spells` (schema ready; generator emits empty for now).

## Known gaps (parked in `various_notes` until sheet fields exist — see CONTRACT Gaps)
- **Occupation** (no `occupation` attr yet), **psyche**, **medical**, **honor**, **gear summary**.
- **Creature mode** (`kind:"creature"`): attributes are set; the stat block (attacks, armor, hit
  locations, special qualities) is written to notes. Full data-driven creature-mode import awaits
  the Phase-7 sheet work. The importer whispers a warning to that effect.

## Design / testing
`planFromHarnchar(data)` is a **pure** function (no Roll20 globals) returning a write-plan
(`{attrs, rows, notes, warnings}`); `applyPlan()` does the Roll20 `createObj`/`findObjs` side-effects.
The pure half is unit-tested in Node against the **real** generator output —
`test/harnimport.test.mjs` (`node --test`). The Roll20 half must be verified live in a Pro game.
`mod/package.json` pins this folder to CommonJS so the tests can require it; Roll20 ignores it.
