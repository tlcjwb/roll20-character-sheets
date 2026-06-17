// HarnMaster3 chargen — occupation engine.
//
// Pure, dependency-free ES module (Node + browser; callers parse JSON and pass objects).
//   mergeOccupations(files)          — layer the tri-state files into one set (see precedence below)
//   resolveOccupation(merged, id, …) — an occupation + its specializations (and a chosen one applied)
//   lintOccupations(files)           — schema + cross-reference checks
//
// LAYERING (per owner decision 2026-06-14): files are passed in precedence order
//   [public (4001), private (4823/supplements, owner-only), homebrew]
// and merged PER-FIELD by id (a later layer overrides only the fields it specifies; everything else
// inherits — so 4823 augments the 4001 Ostler with a guild + specializations WITHOUT restating its
// skill bundle). `sources` accumulates every contributing layer. To list a variant as its OWN
// selectable entry instead of overriding, give it a DISTINCT id.

import { deepMerge, clone } from './merge-util.mjs';

export const LAYERS = ['public', 'private', 'homebrew'];

// files: ordered [public, private, homebrew] (falsy skipped). Returns merged maps + warnings.
export function mergeOccupations(files) {
  const occupations = new Map();
  const sources = new Map();        // id → Set of source/layer tags
  const specializations = new Map();
  const warnings = [];
  for (const f of files || []) {
    if (!f) continue;
    const layer = (f._meta && f._meta.layer) || 'unknown';
    for (const o of f.occupations || []) {
      if (!o || !o.id) { warnings.push(`${layer}: occupation with no id`); continue; }
      occupations.set(o.id, deepMerge(occupations.get(o.id) || {}, clone(o)));
      if (!sources.has(o.id)) sources.set(o.id, new Set());
      sources.get(o.id).add(o.source || layer);
    }
    for (const s of f.specializations || []) {
      if (!s || !s.id) { warnings.push(`${layer}: specialization with no id`); continue; }
      specializations.set(s.id, deepMerge(specializations.get(s.id) || {}, clone(s)));
    }
  }
  for (const [id, set] of sources) occupations.get(id).sources = [...set];
  return { occupations, specializations, warnings };
}

// Walk an occupation's `extends` chain (single inheritance), flattening into one occ: parent fields
// first, child overrides; SKILLS are UNIONED (parent then child, child wins by name) so e.g.
// knight-bailiff = knight-bachelor's bundle + Law + Agriculture. `sources` accumulate.
function resolveExtends(merged, occ, seen = new Set()) {
  if (!occ.extends) return clone(occ);
  if (seen.has(occ.id)) throw new Error(`occupation extends cycle at "${occ.id}"`);
  seen.add(occ.id);
  const parent = merged.occupations.get(occ.extends);
  if (!parent) throw new Error(`occupation "${occ.id}" extends missing "${occ.extends}"`);
  const base = resolveExtends(merged, parent, seen);
  const out = { ...base, ...clone(occ) };
  const bySkill = new Map((base.skills || []).map((s) => [s.name, s]));
  for (const s of occ.skills || []) bySkill.set(s.name, s);
  out.skills = [...bySkill.values()];
  out.sources = [...new Set([...(base.sources || []), ...(occ.sources || [])])];
  delete out.extends;
  return out;
}

// Return an occupation + the specializations available for it. If opts.specialization is given,
// fold that specialization's skills into the bundle (additive; later entries win by skill name).
export function resolveOccupation(merged, id, opts = {}) {
  const occ0 = merged.occupations.get(id);
  if (!occ0) throw new Error(`unknown occupation id "${id}"`);
  const occ = resolveExtends(merged, occ0);
  const available = [...merged.specializations.values()].filter((s) => s.of === id);
  const out = { ...clone(occ), availableSpecializations: available.map((s) => s.id) };
  if (opts.specialization) {
    const spec = merged.specializations.get(opts.specialization);
    if (!spec) throw new Error(`unknown specialization "${opts.specialization}"`);
    if (spec.of !== id) throw new Error(`specialization "${opts.specialization}" is not of "${id}"`);
    const bySkill = new Map((out.skills || []).map((s) => [s.name, s]));
    for (const s of spec.skills || []) bySkill.set(s.name, s);
    out.skills = [...bySkill.values()];
    out.appliedSpecialization = spec.id;
    out.specializationEmphasis = spec.skillEmphasis || [];
  }
  return out;
}

// Returns { errors, warnings }.
export function lintOccupations(files) {
  const errors = []; const warnings = [];
  for (const f of files || []) {
    if (!f) continue;
    const layer = f._meta && f._meta.layer;
    const tag = `[${layer || 'unknown'} layer]`;
    if (!LAYERS.includes(layer)) errors.push(`${tag} _meta.layer must be one of ${LAYERS.join('/')}`);
    const ids = new Set();
    for (const o of f.occupations || []) {
      if (!o || !o.id) { errors.push(`${tag} occupation with no id`); continue; }
      if (ids.has(o.id)) errors.push(`${tag} duplicate occupation id "${o.id}"`);
      ids.add(o.id);
      for (const s of o.skills || []) if (typeof s.oml !== 'number') errors.push(`${tag} "${o.id}" skill "${s.name}" has non-numeric oml`);
    }
  }
  const merged = mergeOccupations(files);
  for (const [id, s] of merged.specializations) {
    if (s.of && !merged.occupations.has(s.of)) errors.push(`specialization "${id}" references missing occupation "${s.of}"`);
  }
  for (const [id, o] of merged.occupations) {
    if (o.extends && !merged.occupations.has(o.extends)) errors.push(`occupation "${id}" extends missing "${o.extends}"`);
  }
  return { errors, warnings: warnings.concat(merged.warnings) };
}
