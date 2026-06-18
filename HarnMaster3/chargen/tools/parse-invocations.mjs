#!/usr/bin/env node
// parse-invocations.mjs — extract the 4401 (HarnMaster Religion) ritual INVOCATIONS into owner-only
// data that augments the clerics table. Each invocation in 4401 is laid out as:
//     <Name>            <Circle roman>
//     time: …   ritual: …
//     range: …  Duration: …
//     <prose description>            (DROPPED — functional data only)
// We keep name + circle + the mechanical fields (time/ritual/range/duration), grouped by deity
// (invocations before the first deity article = Common). Output: chargen/owner/tables.4401.json,
// a harntables layer whose tables.clerics.byDeity[*].invocations deep-merge onto the public clerics.
//
// Run: node chargen/tools/parse-invocations.mjs ../PDF/4401-HarnMaster-Religion.txt chargen/owner/tables.4401.json

import { readFileSync, writeFileSync } from 'node:fs';

const [SRC, OUT] = process.argv.slice(2);
if (!SRC || !OUT) { console.error('usage: parse-invocations.mjs <4401.txt> <out.json>'); process.exit(1); }

const raw = readFileSync(SRC, 'utf8').split(/\r?\n/);
const lines = raw.filter((l) => !/=====|Columbia Games|HârnMaster|Copyright|licensed copy|^®/.test(l));

function deSpace(s) { let p; s = String(s); do { p = s; s = s.replace(/([A-Za-z]) +([A-Za-z])/g, '$1$2'); } while (s !== p); return s.replace(/\s+/g, ' ').trim(); }
const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };

// deity section headers: "aGriK 2", "save-K'nor 4", … (deity name + page number)
const DEITY = { agrik: 'Agrik', halea: 'Halea', ilvir: 'Ilvir', larani: 'Larani', morgath: 'Morgath', naveh: 'Naveh', peoni: 'Peoni', sarajin: 'Sarajin', "save-k'nor": "Save-K'nor", siem: 'Siem' };
function deityHeader(l) {
  const m = /^([A-Za-z'’-]+)\s+\d+\s*$/.exec(deSpace(l).replace(/’/g, "'"));
  return m && DEITY[m[1].toLowerCase()] ? DEITY[m[1].toLowerCase()] : null;
}
const field = (re, s) => { const m = re.exec(s); return m ? m[1].replace(/\s+/g, ' ').trim() : undefined; };

const byDeity = {}; const common = [];
let cur = null; // null → Common (pre-deity)

for (let i = 0; i < lines.length; i++) {
  const dh = deityHeader(lines[i]); if (dh) { cur = dh; continue; }
  // an invocation header is the line directly above a "time:" line, ending in a Circle roman numeral
  if (!/^\s*time\s*:/i.test(lines[i])) continue;
  // find the name+circle line just above (skip blanks)
  let j = i - 1; while (j >= 0 && !lines[j].trim()) j--;
  if (j < 0) continue;
  const cm = /^(.*\S)\s+(VII|VI|IV|V|III|II|I)\s*$/i.exec(lines[j].replace(/’/g, "'"));
  if (!cm) continue;
  // plain extraction keeps words intact (no intra-word spacing) → just clean+title-case; do NOT
  // de-space (that would merge multi-word names like "Banner of Mendiz"). Keep small words lowercase.
  let name = titleCase(cm[1].replace(/\s+/g, ' ').trim()).replace(/\b(Of|The|And|To|In|Or)\b/g, (w) => w.toLowerCase()).replace(/'S\b/g, "'s");
  name = name.charAt(0).toUpperCase() + name.slice(1); // always capitalize the first word
  const circle = ROMAN[cm[2].toLowerCase()];
  if (!name || !circle || name.length < 2) continue;
  // mechanical fields from the time: line and the (range/Duration) line below it
  const block = (lines[i] + ' ' + (lines[i + 1] || '') + ' ' + (lines[i + 2] || '')).replace(/\s+/g, ' ');
  const inv = { name, circle };
  const t = field(/time:\s*([^]*?)\s*ritual:/i, block); if (t) inv.time = t;
  const r = field(/ritual:\s*([^]*?)\s*(?:range:|$)/i, block); if (r) inv.ritual = r;
  const rg = field(/range:\s*([^]*?)\s*(?:Duration:|$)/i, block); if (rg) inv.range = rg;
  const d = field(/Duration:\s*([^]*?)\s*(?:CF:|[A-Z][a-z]|$)/i, block); if (d) inv.duration = d;
  (cur ? (byDeity[cur] = byDeity[cur] || { invocations: [] }).invocations : common).push(inv);
}

// Per-deity CLERIC OCCUPATION SKILLS (4401, supersedes 4001). Format: "<deity>: Skill/N, Skill/N, …
// 70+SB skills for languages/scripts; trailing "(optional)" marks optional grants."
const SKILL_DEITY = { all: 'all', agrik: 'Agrik', halea: 'Halea', ilvir: 'Ilvir', larani: 'Larani', morgath: 'Morgath', naveh: 'Naveh', peoni: 'Peoni', sarajin: 'Sarajin', "save-k'nor": "Save-K'nor", siem: 'Siem' };
const skillSets = {}; // deity → [skills]; skills are space- OR comma-separated "Name/N" tokens
for (let i = 0; i < lines.length; i++) {
  const hm = /^([A-Za-z'’-]+)\s*:\s*(.+)$/.exec(lines[i].replace(/’/g, "'"));
  if (!hm || !SKILL_DEITY[hm[1].toLowerCase()]) continue;
  if (!/\w+\/\s*(70\+SB|\d)/.test(hm[2])) continue;                 // must look like a skill list ("Name/N")
  let text = hm[2];
  while (i + 1 < lines.length && !/\.\s*$/.test(text) && /\w+\//.test(lines[i + 1])) text += ' ' + lines[++i].trim();
  const list = []; const re = /([A-Za-z0-9][A-Za-z0-9'()&. -]*?)\s*\/\s*(70\+SB|\d+)\s*(\(optional\))?/gi;
  let mm; while ((mm = re.exec(text))) {
    const name = mm[1].replace(/\s+/g, ' ').trim();
    const sk = /70\+SB/i.test(mm[2]) ? { name, base: 70, mult: 1 } : { name, oml: +mm[2] };
    if (mm[3]) sk.optional = true;
    list.push(sk);
  }
  if (list.length) skillSets[SKILL_DEITY[hm[1].toLowerCase()]] = list;
}

// Cleric chargen essentials (Religion: cleric opening rules + starting kit), from 4401.
for (const [d, sk] of Object.entries(skillSets)) { if (d === 'all') continue; (byDeity[d] = byDeity[d] || {}).skills = sk; }
const clerics = {
  ...(skillSets.all ? { allCommon: skillSets.all } : {}),
  commonInvocations: common,
  byDeity,
  clericStart: {
    openingPiety: 'Will×5', startingInvocations: 'All Common Circle-II invocations (opened free); more via Ritual Option points (1/Circle)',
    equipment: ['Wool robe', 'Linen tunic & hose', 'Leather sandals or boots', 'Dagger or staff', 'Status ring'],
    coins: '6–36d',
  },
};

const total = common.length + Object.values(byDeity).reduce((n, d) => n + d.invocations.length, 0);
const out = {
  _meta: {
    harntables: 1, layer: 'owner', distribution: 'owner-only', source: '4401', title: 'Religion (4401) — invocations',
    note: 'OWNER-ONLY (git-ignored) — 4401 ritual invocations (name + circle + time/ritual/range/duration; prose dropped) + cleric chargen essentials. Deep-merges onto the public clerics table (tables.clerics.byDeity[*].invocations). Regenerate: node chargen/tools/parse-invocations.mjs ../PDF/4401-HarnMaster-Religion.txt chargen/owner/tables.4401.json',
  },
  tables: { clerics },
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`${OUT}: ${total} invocations (${common.length} Common + ${total - common.length} deity-specific)`);
for (const [d, v] of Object.entries(byDeity)) console.log(`  ${d}: ${v.invocations.length}`);
