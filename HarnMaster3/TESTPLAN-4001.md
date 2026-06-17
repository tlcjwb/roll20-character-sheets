# TESTPLAN-4001 — Character Generator (browser)

A systematic, page-by-page manual walkthrough of `chargen/harnchargen.html`, mirroring the 4001
Character section. Companion to the unit suite (`node --test`): the unit tests prove the pure rule
layer; **this proves the live UI + the emitted `harnchar` JSON**. Scope = chargen only (Char 1–17,
21–27); **18–20 and 28–30 are out of scope**. See `COVERAGE-4001.md` for the rule→test→step matrix.

## How to use
1. Open `chargen/harnchargen.html` in a browser. **Two passes:**
   - **PUBLIC** — as shipped (build pill reads "public build").
   - **OWNER** — first use the file picker to load `chargen/*.private.json` (build pill flips to
     "owner build"); re-run the owner-only checks (§OWNER).
2. For each step: do the **input**, confirm the **expected** on-screen change.
3. Finish every character with **§JSON** (Copy JSON → verify the envelope).
4. Each panel has a 🎲 per field + a **Roll all**; rolled results show in the green log line as raw
   dice (e.g. `STR 14 (4,4,4,2 drop 2)`), not interpreted text.

---

## Char 2–3 — Identity (Birth)
| # | Input | Expected |
|---|---|---|
| 2.1 | Set **Species** = Human | dropdown set; later JSON `identity.species="Human"` |
| 2.2 | Click **Sex** 🎲 | log shows `sexHuman: NN`; field set Male/Female |
| 3.1 | Set **Birthdate** = 15 Nuzyael | **Sunsign** auto-derives = Ulandus |
| 3.1b | Set Birthdate to a cusp day (e.g. 1 Ilvin) | Sunsign shows the cusp (e.g. "Tai-Skorus") |
| 3.2 | Set **Culture** = Feudal | occupation/parent lists refilter to Feudal |
| 3.3 | Click **Social class** 🎲 | log shows roll; class set; occupation list refilters by class |

## Char 3/8 — Appearance (do BEFORE Attributes)
| # | Input | Expected |
|---|---|---|
| 8.1 | Click **Frame** 🎲 then **Height** 🎲 | Frame set; Height set; **Weight** auto-derives; **Comeliness/Morality** descriptors fill |
| 8.2 | Toggle Options → "Other Appearance" | complexion/hair/eyes fields appear |

## Char 4–5 — Background
| # | Input | Expected |
|---|---|---|
| 4.1 | Set **Sibling rank** (two selects) | "rank of family-size" set |
| 4.2 | Click **Parent** 🎲 | parent set incl. offspring/orphan sub-result |
| 5.1 | Click **Clanhead** / **Estrangement** 🎲 | each set (eldest → +5 estrangement shown in log) |

## Char 6–8 — Attributes (3d6 + modifiers)
| # | Input | Expected |
|---|---|---|
| 6.1 | Click **Attributes → Roll all** | each attr shows dice + mods, e.g. Khuzdul `STR 19 (4,4,4 +4 khuzdul +3 weight)` |
| 6.2 | Verify **weight** mod on STR, **frame** mod on AGL | STR uses weight table; AGL uses frame; STA gets neither |
| 7.1 | Options → "Use Key Attributes" ON, Roll all | the 7 key attrs roll 4d6-drop-lowest and show a `*` |
| 8.1 | Human, set Sex = Female | AUR gains +2 (female) on next roll |

## Char 9 — Medical (Options-gated)
| # | Input | Expected |
|---|---|---|
| 9.1 | Options → "Show medical" ON; roll Medical | sex-specific trait appears; "Multiple traits" rolls add more |

## Char 14–15 — Occupation & Occupational Skills
| # | Input | Expected |
|---|---|---|
| 14.1 | Click **Occupation** 🎲 | rolls within class×culture; lands a valid occupation |
| 14.2 | (Title-choice) open the Occupation list | Cook & Servant, Gladiator & Guard, Beggar & Scavenger, …, appear as **separate** pickable titles |
| 14.3 | Pick "Cook" then "Servant" | skills identical (shared bundle); JSON `occupation` = the chosen title |
| 14.4 | Set culture Feudal, pick the cleric occupation | label reads **"Cleric"** (Tribal would read "Shaman") |
| 14.5 | (Distinct-choice) Unguilded culture | both **Laborer** and **Longshoreman** selectable (different skills) |
| 15.1 | Pick Ostler | Skills table fills Horsecraft/Riding/Hidework at ML = SB×OML; Specialization dropdown offers Farrier/etc. (owner build) |
| 15.2 | Set **Parent occupation** ≠ occupation | family-skill row appears in the Skills table (dropdown "— choose —"); picking fills SB/OML/ML |

## Char 27 — Military Careers (Soldier)
| # | Input | Expected |
|---|---|---|
| 27.1 | Occupation = **Soldier** | a **Military unit** dropdown appears with that culture's units |
| 27.2 | Pick "Guardsman (LF)" (Feudal) | Skills fill with the unit's weapons + ALL-military common; meta shows "END×4" |
| 27.3 | Pick "Militia" | NO ALL-common skills (Militia exception) |
| 27.4 | Change Culture to Viking | unit list changes (Clansman/Huscarl); to Imperial (Legionnaire/Officer) |

## Char 27 / Noble — Knights
| # | Input | Expected |
|---|---|---|
| N.1 | Social class Noble, occupation = the knight | Military-unit picker (knight-class units only) appears |
| N.2 | Sex Male, culture Imperial | name resolves **"Patrician"**; skills = knight unit + Law/Agriculture |
| N.3 | Sex Female | unit picker hides; character resolves as **"Lady"** (courtly bundle) |
| N.4 | Culture Khuzan | knight unit = High Guard (HF — no Riding/Lance) |

## Char 23 — Clerics (deity-driven)
| # | Input | Expected |
|---|---|---|
| 23.1 | Occupation = cleric, no deity | meta: "pick a deity for full skills"; only ALL-common cleric skills |
| 23.2 | Religion → pick **Larani** | Skills add martial deity skills (Sword/Shield/…); changing to **Peoni** swaps to Agriculture/Herblore/… |
| 23.3 | (owner) verify Language/Script rows | Language (Church)/Script (Local) rows compute (70+SB / SB×N); rename the parenthetical to a real language |

## Char 26 — Mages (convocation-driven)
| # | Input | Expected |
|---|---|---|
| 26.1 | Occupation = mage | **Convocation** + **Chantry quality** dropdowns appear |
| 26.2 | Pick **Fyvria** | Skills fill (Foraging/Survival/… + Folklore/Mathematics); meta shows "Fyvria domains: Healing, …" |
| 26.3 | Change **Chantry quality** H↔HHHHH | the convocation + Neutral CML values change in the JSON `magic` block (CSB×mult; sunsign-modified) |
| 26.4 | Harper/Skald occupation | three **Musician (instrument)** rows (one /4, two /3); rename to instruments from the list |

## Char 16 — Optional skills
| # | Input | Expected |
|---|---|---|
| 16.1 | Add an optional skill (open at OML) | row added; "X / 5 OP used" shows; over-budget warns |

## Char 17 — Equipment & Funds
| # | Input | Expected |
|---|---|---|
| 17.1 | Set Social class + wealth level | **Funds** auto = class × wealth (editable; editing sets an override) |

## §JSON — verify the envelope (every character)
| # | Input | Expected |
|---|---|---|
| J.1 | Click **Copy JSON** (or read the JSON box) | `harnchar:1`, `kind:"pc"`; `identity`, `attributes` (incl. numeric `cml`/`moral`), `skills` by section |
| J.2 | Confirm occupation | `identity.occupation` = the chosen title/unit/cleric/mage name |
| J.3 | Mage | `magic.convocations` lists the convocation + Neutral with CML values |
| J.4 | Print summary | opens a printable sheet matching the JSON |

## §OWNER — owner build only (load chargen/*.private.json first)
| # | Input | Expected |
|---|---|---|
| O.1 | Load owner files via picker | build pill → "owner build" |
| O.2 | Ostler → Specialization | Farrier/Saddler/Stablemaster (4823) selectable; choosing folds in its skills |
| O.3 | Creature tab | private creatures (Gargun/Ivashu/…) now appear in the list |

---
**Out of scope:** Char 18–20 (veterans/contacts), Char 28–30. **Deferred (no full data yet):** cleric
invocations (4401), mage spells (HârnMaster Magic), Fighting Orders.
