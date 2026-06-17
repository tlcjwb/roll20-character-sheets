// Build the single-file generator: inline the engines + public data + UI into chargen/harnchargen.html.
// Run from HarnMaster3/:  cmd.exe /c "node chargen\\tools\\build-generator.mjs"
//
// The engine ES modules are concatenated in dependency order with `import`/`export` stripped, so they
// become plain globals in the page's <script>. Public data is inlined as consts. Owner-only data
// (private/homebrew) is NOT inlined — owners load it at runtime via the file picker (FileReader, no
// CORS), which keeps the shipped file free of IP and lets the same HTML serve public + owner builds.
import { readFileSync, writeFileSync } from 'node:fs';

const strip = (src) => src.split('\n')
  .filter((l) => !/^\s*import\b/.test(l))
  .map((l) => l.replace(/^(\s*)export\s+/, '$1'))
  .join('\n');

const engine = ['merge-util', 'occupations', 'bestiary', 'tables', 'chargen']
  .map((n) => `// ===== ${n}.mjs =====\n` + strip(readFileSync(`chargen/${n}.mjs`, 'utf8')))
  .join('\n\n');

const min = (p) => JSON.stringify(JSON.parse(readFileSync(p, 'utf8'))); // minify inlined JSON
const data = [
  '// ===== inlined public data =====',
  'const DATA_OCC = ' + min('chargen/occupations.json') + ';',
  'const DATA_BEST = ' + min('chargen/bestiary.json') + ';',
  'const DATA_TABLES = ' + min('chargen/tables.json') + ';',
  'const DATA_EQUIP = ' + min('chargen/equipment.public.json') + ';',
  'const SKILLS = ' + JSON.stringify(JSON.parse(readFileSync('chargen/skills.json', 'utf8')).skills) + ';',
].join('\n');

const ui = readFileSync('chargen/ui.js', 'utf8');
const shell = readFileSync('chargen/ui.html', 'utf8');
const bundle = [engine, data, '// ===== ui.js =====', ui].join('\n\n');

const html = shell.replace('/*__BUNDLE__*/', () => bundle);
writeFileSync('chargen/harnchargen.html', html);
console.log(`harnchargen.html: ${html.length} bytes (engine+data+ui = ${bundle.length})`);
