# Owner data folder

Drop your **owned-supplement** and **owner-only** data files here, then in the generator click
**Load owner data…**, pick this folder (or any folder), and tick which files to include.

Nothing in this folder is committed (see `.gitignore`) except `*.template.json` and this README —
these files derive from material the owner owns (supplements like 4823 / 4401 / 4601 / 4611, the
lythia.com price list, or copyrightable prose), so they stay local.

## File naming

`<kind>.<source>.json` — e.g. `occupations.4823.json`, `skills.4401.json`, `flavor.4001.json`,
`equipment.lythia.json`. The filename is just human-friendly; the real classification is in `_meta`.

`kind` ∈ `occupations` · `bestiary` · `tables` · `skills` · `equipment` · `flavor`
(matches the `_meta.harn<kind>` marker the loader looks for).

## Required `_meta`

```json
{
  "_meta": {
    "harnoccupations": 1,            // the kind marker: harn{occupations|bestiary|tables|skills|equipment|flavor}
    "source": "4823",               // short machine token, recorded in the character's sources[] (e.g. 4823, lythia)
    "title": "Ostlers (4823)",      // friendly label shown in the load table + source pills (falls back to source)
    "distribution": "owner-only",   // owner-only | cc-by-nc-sa | shareable | public
    "note": "short description shown in the load table"
  }
}
```

The loader skips any file marked `distribution: "public"` (the core 4001 data is already built in).
Files deep-merge by id onto what's already loaded (public → owner supplements → homebrew), so a
supplement file only needs to state the fields it adds/overrides.
