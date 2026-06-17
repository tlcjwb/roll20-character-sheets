// Validate the bestiary data files against the engine contract. Run from HarnMaster3/:
//   cmd.exe /c "node chargen\\tools\\lint-bestiary.mjs"
// Loads the three tri-state files (private one optional), runs lintBestiary, and resolves every
// selectable creature. Exit code 1 on any error so it can gate a build.
import { readFileSync, existsSync } from 'node:fs';
import { lintBestiary, mergeBestiary, resolveCreature } from '../bestiary.mjs';

const paths = ['chargen/bestiary.json', 'chargen/bestiary.homebrew.json', 'chargen/bestiary.private.json'];
const files = paths.map((p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null));

const { errors, warnings } = lintBestiary(files);
const merged = mergeBestiary(files);
let ok = 0; const bad = [];
for (const [id, n] of merged.nodes) if (n.selectable) {
  try { resolveCreature(merged, id); ok++; } catch (e) { bad.push(`${id}: ${e.message}`); }
}

console.log(`nodes: ${merged.nodes.size} | selectable resolved: ${ok} | unresolved: ${bad.length}`);
console.log('lint errors:', errors.length ? errors : 'none');
if (warnings.length) console.log('lint warnings:', warnings);
if (bad.length) console.log('UNRESOLVED:', bad);
if (errors.length || bad.length) process.exit(1);
console.log('OK');
