// Build tool: parse the 4001 Occupational Skills table (Character 15) into the PUBLIC occupations.json.
// Reads ../PDF/4001-Harnmaster.txt (owner-only, git-ignored). Contains no IP. Run from HarnMaster3/:
//   cmd.exe /c "node chargen\\tools\\parse-occupations.mjs"
// One line per occupation: "<Name> <Yrs> <skill/oml, skill/oml, special phrase, ...>".
// `oml` = OML multiplier (skill opens at SB × oml). Non-"/N" tokens (Script, 2nd Language,
// "Three weapons at OML+SB×2", "Depends on deity…") are kept verbatim in `special`.
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = process.argv[2] || '../PDF/4001-Harnmaster.txt';
const RANGE = [Number(process.argv[3]) || 2183, Number(process.argv[4]) || 2245]; // first pass of the table
const OUT = process.argv[5] || 'chargen/occupations.json';

const lines = readFileSync(SRC, 'utf8').split(/\r?\n/);
const CATS = { UNGUILDED: 'unguilded', GUILDED: 'guilded', NOBLE: 'noble' };
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[()'’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const isNoise = (l) => l.trim() === '' || /=====|Copyright|H[âa]rnMaster|Version 3|occupational\s+skills|^Occupation Yrs/i.test(l);

// The PDF renders small-caps as space-separated single letters ("C H a r a C t e r"). Collapse a run
// of 3+ single letters back into one word, title-cased ("Character", "Skills").
const fixSmallCaps = (s) => s.replace(/\b(?:[A-Za-z] ){2,}[A-Za-z]\b/g, (run) => {
  const w = run.replace(/ /g, '');
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
});

function parseSkills(text) {
  const skills = []; const special = [];
  for (let tok of fixSmallCaps(text).split(',')) {
    tok = tok.trim().replace(/^plus\s+/i, ''); if (!tok) continue;
    const m = tok.match(/^(.*)\/\s*(\d+)\s*$/); // last "/N" is the OML multiplier
    if (m && m[1].trim()) skills.push({ name: m[1].replace(/\s+/g, ' ').trim(), oml: +m[2] });
    else special.push(tok.replace(/\s+/g, ' ').trim());
  }
  return { skills, special };
}

const occupations = [];
let category = null;
for (let i = RANGE[0] - 1; i < Math.min(RANGE[1], lines.length); i++) {
  const l = lines[i].trim();
  if (isNoise(lines[i])) continue;
  if (CATS[l]) { category = CATS[l]; continue; }
  const m = l.match(/^([^\d]+?)\s+(\d+)\s+(.+)$/); // <name (no digits)> <yrs> <skills>
  if (!m) continue;
  const name = m[1].replace(/\s+/g, ' ').trim();
  const { skills, special } = parseSkills(m[3]);
  occupations.push({
    id: slug(name), name, category, years: +m[2], source: '4001',
    skills, ...(special.length ? { special } : {}), selectable: true, flavorKey: slug(name),
  });
}
occupations.sort((a, b) => a.id.localeCompare(b.id));

const file = {
  _meta: {
    harnoccupations: 1, layer: 'public',
    note: 'PUBLIC occupations — the 4001 Occupational Skills table (Character 15), functional data, ships with the product. `oml` = OML multiplier (ML = SB × oml). `special` holds verbatim non-numeric grants (Script, 2nd Language, "Three weapons at OML+SB×2", "Depends on deity…"). Supplement expansions (e.g. 4823 Ostler guild/specializations) live owner-only in occupations.private.json and deep-merge on top by id (precedence public → private → homebrew).',
    generatedBy: 'chargen/tools/parse-occupations.mjs from 4001 Character 15',
  },
  occupations,
  specializations: [],
};
writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n');
console.log(`occupations.json: ${occupations.length} occupations (${occupations.filter((o) => o.skills.length).length} with parsed skills)`);
console.log('categories:', [...new Set(occupations.map((o) => o.category))].join(', '));
