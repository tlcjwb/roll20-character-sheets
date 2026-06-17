// HarnMaster3 chargen — bestiary engine.
//
// Pure, dependency-free ES module (runs in Node AND the browser; no file I/O — callers parse
// JSON and pass the objects in). Three jobs, per chargen/CONTRACT.md §11:
//   mergeBestiary(files)        — merge the tri-state files (public/homebrew/harn) into one set
//   resolveCreature(merged, id) — walk `extends` + expand `archetype`/`sizeClass` → a full block
//   lintBestiary(files)         — enforce the setting↔file contract + that selectable nodes resolve
//
// The per-node `setting` flag is authoritative; files are just distribution containers.

import { isPlainObject, deepMerge, clone } from './merge-util.mjs';

export const SETTINGS = ['public', 'homebrew', 'harn'];

// ---- merge ------------------------------------------------------------------

// files: array of parsed bestiary file objects (falsy entries skipped — e.g. an absent private
// file), in precedence order [public, homebrew, private]. Returns
// { components:{archetypes,sizeClasses}, nodes:Map<id,node>, warnings:[] }.
// Same id across layers is PER-FIELD deep-merged (a later layer overrides only the fields it
// states; everything else inherits) — consistent with the occupation engine — and the merged
// node carries an accumulated `sources` array (e.g. ["4001","4611","homebrew"]). To list a
// variant as its OWN selectable entry instead of overriding, give it a DISTINCT id.
export function mergeBestiary(files) {
  const components = { archetypes: {}, sizeClasses: {} };
  const nodes = new Map();
  const sources = new Map();      // id → Set of source/setting tags
  const warnings = [];
  for (const f of files || []) {
    if (!f) continue;
    const comp = f.components || {};
    Object.assign(components.archetypes, comp.archetypes || {});
    Object.assign(components.sizeClasses, comp.sizeClasses || {});
    const layer = f._meta && f._meta.setting;
    for (const n of f.nodes || []) {
      if (!n || !n.id) { warnings.push('node with no id skipped'); continue; }
      nodes.set(n.id, deepMerge(nodes.get(n.id) || {}, clone(n)));
      if (!sources.has(n.id)) sources.set(n.id, new Set());
      sources.get(n.id).add(n.source || layer);
    }
  }
  for (const [id, set] of sources) nodes.get(id).sources = [...set].filter(Boolean);
  return { components, nodes, warnings };
}

// ---- resolve ----------------------------------------------------------------

// Resolve a node id to a complete, importable creature block: walk the extends chain
// (baseline → leaf), deep-merge overrides, then expand component refs (archetype → default
// hitLocations unless overridden; sizeClass → size info). Throws on unknown id / missing
// parent / circular extends.
export function resolveCreature(merged, id) {
  const { nodes, components } = merged;
  const leaf = nodes.get(id);
  if (!leaf) throw new Error(`unknown creature id "${id}"`);

  // Build the chain from baseline to leaf.
  const chain = [];
  const seen = new Set();
  let node = leaf;
  while (node) {
    if (seen.has(node.id)) throw new Error(`circular extends at "${node.id}"`);
    seen.add(node.id);
    chain.unshift(node);
    if (!node.extends) break;
    const parent = nodes.get(node.extends);
    if (!parent) throw new Error(`"${node.id}" extends missing "${node.extends}"`);
    node = parent;
  }

  // Merge baseline → leaf.
  let resolved = {};
  for (const n of chain) resolved = deepMerge(resolved, clone(n));

  // Expand archetype → default hit locations (only when the node didn't supply its own).
  if (resolved.archetype) {
    const arch = components.archetypes[resolved.archetype];
    if (!arch) throw new Error(`"${id}" references unknown archetype "${resolved.archetype}"`);
    resolved.archetypeLabel = arch.label || resolved.archetype;
    if (!Array.isArray(resolved.hitLocations) || resolved.hitLocations.length === 0) {
      resolved.hitLocations = clone(arch.hitLocations || []);
      resolved.hitLocationsFrom = 'archetype';
    } else {
      resolved.hitLocationsFrom = 'override';
    }
  }

  // Expand sizeClass → size info.
  if (resolved.sizeClass) {
    const sz = components.sizeClasses[resolved.sizeClass];
    if (!sz) throw new Error(`"${id}" references unknown sizeClass "${resolved.sizeClass}"`);
    resolved.sizeInfo = clone(sz);
  }

  return resolved;
}

// ---- lint -------------------------------------------------------------------

// Validate the tri-state contract. Returns { errors:[], warnings:[] }.
// files: same array shape as mergeBestiary. Each file's _meta.setting declares its kind.
export function lintBestiary(files) {
  const errors = [];
  const warnings = [];

  for (const f of files || []) {
    if (!f) continue;
    const fileSetting = f._meta && f._meta.setting;
    const label = `[${fileSetting || 'unknown'} file]`;
    if (!SETTINGS.includes(fileSetting)) {
      errors.push(`${label} _meta.setting must be one of ${SETTINGS.join('/')}`);
    }
    const idsThisFile = new Set();
    for (const n of f.nodes || []) {
      if (!n || !n.id) { errors.push(`${label} node with no id`); continue; }
      if (idsThisFile.has(n.id)) errors.push(`${label} duplicate id "${n.id}" within file`);
      idsThisFile.add(n.id);
      if (n.setting !== fileSetting) {
        errors.push(`${label} node "${n.id}" has setting:"${n.setting}" — must match the file (${fileSetting})`);
      }
      if (fileSetting === 'public' && n.setting === 'harn') {
        errors.push(`${label} IP LEAK: harn node "${n.id}" must not live in the public file`);
      }
    }
  }

  // Resolution check across the merged set.
  const merged = mergeBestiary(files);
  for (const [id, n] of merged.nodes) {
    if (!n.selectable) continue;
    try {
      resolveCreature(merged, id);
    } catch (e) {
      errors.push(`unresolvable selectable node "${id}": ${e.message}`);
    }
  }

  return { errors, warnings: warnings.concat(merged.warnings) };
}
