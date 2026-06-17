// Validate the occupation data files against the engine contract. Run from HarnMaster3/:
//   cmd.exe /c "node chargen\\tools\\lint-occupations.mjs"
// Loads the layered files (private optional), runs lintOccupations, resolves every selectable
// occupation. Exit 1 on error so it can gate a build.
import { readFileSync, existsSync } from 'node:fs';
import { lintOccupations, mergeOccupations, resolveOccupation } from '../occupations.mjs';

const paths = ['chargen/occupations.json', 'chargen/occupations.private.json', 'chargen/occupations.homebrew.json'];
const files = paths.map((p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null));

const { errors, warnings } = lintOccupations(files);
const merged = mergeOccupations(files);
let ok = 0; const bad = [];
for (const [id, o] of merged.occupations) if (o.selectable) {
  try { resolveOccupation(merged, id); ok++; } catch (e) { bad.push(`${id}: ${e.message}`); }
}

console.log(`occupations: ${merged.occupations.size} | specializations: ${merged.specializations.size} | selectable resolved: ${ok} | unresolved: ${bad.length}`);
console.log('lint errors:', errors.length ? errors : 'none');
if (warnings.length) console.log('lint warnings:', warnings);
if (bad.length) console.log('UNRESOLVED:', bad);
if (errors.length || bad.length) process.exit(1);
console.log('OK');
