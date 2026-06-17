// Shared merge helpers for the chargen engines (bestiary + occupations). Pure, no deps.

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Deep-merge `over` onto `base` (returns a new object). Rules tuned for layered data:
//   - plain objects merge recursively
//   - scalars: `over` wins
//   - arrays: `over` REPLACES, but an EMPTY array is treated as "not provided" → inherit
//     (so a layer/breed inherits the base list unless it supplies its own non-empty one)
//   - undefined in `over` never clobbers
export function deepMerge(base, over) {
  const out = isPlainObject(base) ? { ...base } : {};
  if (!isPlainObject(over)) return out;
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) { if (v.length > 0) out[k] = v.slice(); }
    else if (isPlainObject(v)) out[k] = deepMerge(isPlainObject(out[k]) ? out[k] : {}, v);
    else out[k] = v;
  }
  return out;
}

export const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
