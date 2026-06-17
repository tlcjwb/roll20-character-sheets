// One-off build tool: parse the 4001 Bestiary genus/species tables (Bestiary 3-8) from the
// owner's licensed extracted text into structured bestiary nodes, split public vs harn.
//
// Reads ../PDF/4001-Harnmaster.txt (git-ignored, owner-only). Contains NO IP itself — just the
// parser + the public/private classification. Run from HarnMaster3/:
//   cmd.exe /c "node chargen\\tools\\parse-bestiary.mjs"
// Writes chargen/bestiary.parsed.json (intermediate, for review) — NOT shipped.
//
// Vertical extraction. Column order: STR STA DEX AGL EYE HRG SML INT AUR WIL INI END MOV DGE,
// then ARMOUR (B# E# P# F#), GAC, then 1+ SKILLS lines. Variants handled: Gargun have no
// armour/GAC/skills (14 cells); Ivashu have no GAC (18); some creatures drop DGE. The mapper
// locates the armour block positionally, so it doesn't assume a fixed cell count.
// Ethereals/Ghosts use a compressed (collapsed-physical) format and are EXCLUDED → hand-done.
import { readFileSync, writeFileSync } from 'node:fs';

// Args (so the same tool runs over new sources — e.g. 4601-Bestiary, 4611-Ivashu — without edits):
//   node chargen/tools/parse-bestiary.mjs [srcTxt] [startLine] [endLine] [outJson]
// Defaults target 4001 Bestiary 3-8. For a new supplement: extract its PDF to text (pdfx/extract.js),
// find the genus-table line span, and extend KNOWN_GENERA / PRIVATE_* below if it adds new genera or
// coined species. NOTE: the full supplements use in-depth *article* stat blocks (not just these summary
// tables) — that layout may need parser tweaks; that's expected, the tool is meant to be edited + re-run.
const SRC = process.argv[2] || '../PDF/4001-Harnmaster.txt';
const RANGE = [Number(process.argv[3]) || 17134, Number(process.argv[4]) || 23800]; // 1-based line span
const OUT = process.argv[5] || 'chargen/bestiary.parsed.json';

const KNOWN_GENERA = new Set([
  'AQUATICS','BATS','BEARS','BIRDS','CATS','CATTLE','CHIMERAE','DEER','DOGS','DRAGONS',
  'ETHEREALS','GARGUN','GHOSTS','GOATS','HORSES','ILME','IVASHU','LYCANTHROPES','MORVRIN',
  'RABBITS','RODENTS','SEALS','SHEEP','SNAKES','SWINE','TAWEDOG','YELGRI','WEASELS',
]);
const EXCLUDE_GENERA = new Set(['ETHEREALS','GHOSTS']); // compressed format → hand-transcribe
// 4001 CORE creature STAT BLOCKS are functional game data (like weapon/armour/occupation tables) →
// PUBLIC. Coined Hârn NAMES are not copyright (we already ship deities/convocations/sunsigns), and
// prose stays in flavor.*.json. So nothing from 4001 core is private. The tri-state engine + these
// sets remain for FUTURE UNOWNED supplements (4601-Bestiary / 4611-Ivashu) — repopulate then.
const PRIVATE_GENERA = new Set([]);
const PRIVATE_SPECIES = new Set([]);
const GENUS_ARCHETYPE = {
  AQUATICS:'custom', BATS:'winged', BEARS:'quadruped', BIRDS:'winged', CATS:'quadruped',
  CATTLE:'quadruped', CHIMERAE:'custom', DEER:'quadruped', DOGS:'quadruped', DRAGONS:'custom',
  GARGUN:'humanoid', GOATS:'quadruped', HORSES:'quadruped', ILME:'custom', IVASHU:'custom',
  LYCANTHROPES:'quadruped', MORVRIN:'custom', RABBITS:'quadruped', RODENTS:'quadruped',
  SEALS:'custom', SHEEP:'quadruped', SNAKES:'custom', SWINE:'quadruped', TAWEDOG:'quadruped',
  YELGRI:'winged', WEASELS:'quadruped',
};
const ATTR_KEYS = ['str','sta','dex','agl','eye','hrg','sml','int','aur','wil'];
const DERIVED_KEYS = ['ini','end','move','dodge'];

const lines = readFileSync(SRC, 'utf8').split(/\r?\n/);

const isNoise = (l) => l.trim() === '' || /=====|Copyright|licensed copy|H[âa]rnMaster|Version 3|^\s*bestiary \d/i.test(l) || /^(\s*•\s*){2,}$/.test(l);
const isColHeader = (l) => /^(STR|STA|DEX|AGL|EYE|HRG|SML|INT|AUR|WIL|INI|END|MOV|DGE|ARMOUR|GAC|SKILLS|BREED|PR|Load)$/.test(l.trim());
const isGenus = (l) => KNOWN_GENERA.has(l.trim());
const isCell = (l) => /^(•|\d+\*?|\d+\/\d+\*?|[A-Za-z]\d+\*?)$/.test(l.trim());
const isArmourCell = (l) => /^[BEPF]\d+\*?$/.test(l.trim());
const hasLetters = (l) => /[A-Za-z]{2,}/.test(l);
const looksSkills = (l) => /\/\d/.test(l); // a skill/attack line always has "<word>/<number>"; a comma in a name must NOT count
const looksFootnote = (l) => /[:]/.test(l) || /^See .*\barticle\b/i.test(l.trim()) || /^(All |Average|Untrained|Weight in|This assumes|Initiative|These |The |AGL is|Note)/.test(l.trim()) || (l.trim().length > 45 && /[a-z]{4}/.test(l) && !looksSkills(l));

function nextSignificant(i) {
  for (let j = i; j < lines.length; j++) if (!isNoise(lines[j])) return j;
  return -1;
}
const stripStar = (s) => String(s).replace(/\*$/, '');
const num = (s) => { s = stripStar(s); return s === '•' ? null : (/^\d+$/.test(s) ? +s : s); };
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[()'’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- scan into raw creature records (name + ordered cells + skills text) ----
const creatures = [];
let genus = null;
let i = RANGE[0] - 1;
const end = Math.min(RANGE[1], lines.length);
const seen = new Set();

while (i < end) {
  const raw = lines[i];
  const l = raw.trim();
  if (isNoise(raw) || isColHeader(raw)) { i++; continue; }
  if (isGenus(raw)) { genus = l; i++; continue; }
  const mergedGenus = l.match(/\s([A-Z]{3,}S?)$/); // extraction sometimes merges "<prev> RABBITS" onto one line
  if (mergedGenus && KNOWN_GENERA.has(mergedGenus[1])) { genus = mergedGenus[1]; i++; continue; }
  if (!genus || EXCLUDE_GENERA.has(genus)) { i++; continue; }
  if (isCell(raw)) { i++; continue; }              // stray cell — skip
  if (!hasLetters(l)) { i++; continue; }            // footnote markers like "40." / "4*"

  const nxt = nextSignificant(i + 1);
  if (nxt < 0 || !isCell(lines[nxt])) { i++; continue; } // a name is text followed by a cell
  const name = l.replace(/\s+/g, ' ');
  const key = genus + '|' + name.toLowerCase();

  const cells = [];
  let j = i + 1;
  while (j < end) {                                 // collect cells until skills/name/genus
    const c = lines[j];
    if (isNoise(c) || isColHeader(c)) { j++; continue; }
    if (isGenus(c) || !isCell(c)) break;
    cells.push(c.trim());
    j++;
  }
  const skillsParts = [];
  while (j < end) {                                 // collect skills until next name/genus
    const c = lines[j];
    if (isNoise(c) || isColHeader(c)) { j++; continue; }
    if (isGenus(c) || isCell(c)) break;
    if (looksFootnote(c)) { j++; continue; }
    const after = nextSignificant(j + 1);
    if (after >= 0 && isCell(lines[after]) && hasLetters(c.trim()) && !looksSkills(c)) break; // next name
    skillsParts.push(c.trim());
    j++;
  }

  if (!seen.has(key)) {
    seen.add(key);
    creatures.push({ genus, name, line: i + 1, cells, skills: skillsParts.join(' ').replace(/\s+/g, ' ').trim() });
  }
  i = j;
}

// ---- map cells → node (count-agnostic: find the armour block positionally) ----
function parseSkills(text) {
  const attacks = []; const skills = []; const other = [];
  text = text.split(/\s\(/)[0].split(/[.;]\s/)[0]; // drop trailing footnote prose / parenthetical notes
  for (let tok of text.split(',')) {
    tok = tok.trim().replace(/\.$/, ''); if (!tok) continue;
    let m;
    if ((m = tok.match(/^(.+?)\s+(\d+)\/(\d+)\s*([bepf])\*?$/i))) attacks.push({ name: m[1].trim(), ml: +m[2], impact: +m[3], aspect: m[4].toLowerCase() });
    else if ((m = tok.match(/^(.+?)\/(\d+)\*?$/))) skills.push({ name: m[1].trim(), ml: +m[2] });
    else if ((m = tok.match(/^(.+?)\s+(\d+)\*?$/))) skills.push({ name: m[1].trim(), ml: +m[2] });
    else other.push(tok);
  }
  return { attacks, skills, other };
}

const pub = []; const priv = []; const flagged = [];
for (const c of creatures) {
  const cells = c.cells;
  const armStart = cells.findIndex(isArmourCell);
  let preArmour, armour = null, gac = null;
  if (armStart >= 0) {
    let armEnd = armStart;
    while (armEnd + 1 < cells.length && isArmourCell(cells[armEnd + 1])) armEnd++;
    preArmour = cells.slice(0, armStart);
    armour = cells.slice(armStart, armEnd + 1);
    const post = cells.slice(armEnd + 1);
    if (post.length && /^\d+\*?$/.test(post[0])) gac = num(post[0]);
  } else {
    preArmour = cells.slice();
  }
  if (preArmour.length < 10 || preArmour.length > 14) {
    flagged.push({ genus: c.genus, name: c.name, line: c.line, cells: cells.length, preArmour: preArmour.length });
    continue;
  }
  const attributes = {};
  for (let k = 0; k < 10; k++) { const v = num(preArmour[k]); if (v !== null && v !== undefined) attributes[ATTR_KEYS[k]] = v; }
  const derived = {};
  for (let k = 10; k < preArmour.length; k++) { const v = num(preArmour[k]); if (v !== null) derived[DERIVED_KEYS[k - 10]] = v; }
  let armorNatural = null;
  if (armour) {
    armorNatural = {};
    for (const a of armour) { const t = stripStar(a); armorNatural[t[0].toLowerCase()] = +t.slice(1); }
  }
  const { attacks, skills, other } = parseSkills(c.skills);
  const isPriv = PRIVATE_GENERA.has(c.genus) || PRIVATE_SPECIES.has(c.name.toLowerCase());
  const node = {
    id: slug(c.genus) + '-' + slug(c.name),
    name: c.name,
    rank: c.genus === 'HORSES' && isPriv ? 'breed' : 'species',
    setting: isPriv ? 'harn' : 'public',
    source: '4001',
    genus: slug(c.genus),
    archetype: GENUS_ARCHETYPE[c.genus] || 'custom',
    attributes, derived,
    ...(armorNatural ? { armorNatural } : {}),
    ...(gac !== null ? { gac } : {}),
    attacks, skills,
    ...(other.length ? { specialQualities: other } : {}),
    selectable: true,
    flavorKey: slug(c.genus) + '-' + slug(c.name),
  };
  (isPriv ? priv : pub).push(node);
}

pub.sort((a, b) => a.id.localeCompare(b.id));
priv.sort((a, b) => a.id.localeCompare(b.id));

writeFileSync(OUT, JSON.stringify({
  source: SRC, range: RANGE,
  report: { total: creatures.length, public: pub.length, private: priv.length, flagged },
  public: pub, private: priv,
}, null, 2));

console.log(`parsed ${creatures.length} → public ${pub.length}, private ${priv.length}, flagged ${flagged.length}`);
if (flagged.length) console.log('FLAGGED:', flagged.map((f) => `${f.genus}/${f.name}@${f.line}(cells ${f.cells}/pre ${f.preArmour})`).join(', '));
