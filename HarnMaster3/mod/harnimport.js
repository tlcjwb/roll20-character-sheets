// !harnimport — Roll20 API Mod (Pro): consume a `harnchar` JSON (from the local generator,
// chargen/harnchargen.html) and populate a HarnMaster character sheet (harnsheet.html).
//
//   local HTML generator ──emit──► harnchar JSON ──consume──► THIS MOD ──► sheet attrs/rows
//
// The JSON contract lives in chargen/CONTRACT.md. Every mapping here targets a real sheet
// attribute name (verified against harnsheet.html). Sheet workers cannot create repeating
// rows — only the Mod can (createObj + generateRowID) — which is why this exists.
//
// USAGE (in Roll20 chat, as GM):
//   1. Paste the generator's "Copy JSON" output into a Handout's text (notes) — default name "harnchar".
//   2. Run:  !harnimport                       → reads handout "harnchar", creates a new character
//            !harnimport --handout "My Char"    → reads a differently-named handout
//            !harnimport --update               → writes into the SELECTED token's character instead
//            !harnimport { ...inline json... }  → parse JSON straight from chat (small payloads only)
//
// Design: planFromHarnchar(data) is a PURE function (no Roll20 globals) returning a write-plan
// {attrs, rows, notes, ...}. applyPlan() does the Roll20 side-effects. The pure half is unit-
// tested in Node (test/harnimport.test.mjs); the Roll20 half is exercised live in-VTT.

/* global on, sendChat, findObjs, getObj, createObj, generateRowID, log, _ */

// ---------- mapping tables (JSON field → sheet attr) ----------
var IDENTITY_ATTR = {
  species: 'species', culture: 'culture', socialClass: 'social_class', sunsign: 'sunsign',
  gender: 'gender', age: 'age', birthdate: 'birthdate', birthplace: 'birthplace',
  siblingRank: 'sibling_rank', parentOccupation: 'parent', clanHead: 'clanhead',
  estrangement: 'estrangement', frame: 'frame', height: 'height', weight: 'weight',
  complexion: 'complexion', eyeColor: 'eye_color', hairColor: 'hair_colors',
};
// attribute scores: generator key === sheet attr name (incl. cml + moral)
var ATTR_KEYS = ['str', 'sta', 'dex', 'agl', 'eye', 'hrg', 'sml', 'voi', 'int', 'aur', 'wil', 'cml', 'moral'];
// skills section (JSON bucket) → sheet repeating section + row-field prefix
var SKILL_SECTIONS = {
  combat: 'combatskill', physical: 'physicalskill', communication: 'communicationskill',
  lore: 'loreskill', ritual: 'ritualskill', magic: 'magicskill',
};

// ---------- pure planner: harnchar JSON → write-plan ----------
// Returns { ok, error?, kind, name, attrs:[{name,current}], rows:[{section,fields}], notes:[], warnings:[] }
function planFromHarnchar(data) {
  if (!data || typeof data !== 'object') return { ok: false, error: 'not a JSON object' };
  if (data.harnchar !== 1) return { ok: false, error: 'missing/!==1 "harnchar" version field (got ' + JSON.stringify(data.harnchar) + ')' };
  var c = data.character || {};
  var plan = { ok: true, kind: data.kind || 'pc', name: (c.identity && c.identity.name) || 'Imported Character', attrs: [], rows: [], notes: [], warnings: [] };
  var put = function (name, val) { if (val !== undefined && val !== null && val !== '') plan.attrs.push({ name: name, current: val }); };
  var row = function (section, fields) { plan.rows.push({ section: section, fields: fields }); };

  // attributes (shared by pc + creature)
  var attrs = c.attributes || {};
  ATTR_KEYS.forEach(function (k) { if (attrs[k] !== undefined && attrs[k] !== '') put(k, attrs[k]); });

  if (plan.kind === 'creature') return planCreature(data, c, plan, put, row);

  // ----- PC -----
  var id = c.identity || {};
  Object.keys(IDENTITY_ATTR).forEach(function (k) { put(IDENTITY_ATTR[k], id[k]); });
  // occupation has no sheet attr yet (CONTRACT Gaps) → notes
  if (id.occupation) plan.notes.push('Occupation: ' + id.occupation);
  // comeliness/morality are descriptor strings derived from cml/moral — informational only (the
  // numeric scores already went to cml/moral above). Never write the descriptor into a numeric field.
  if (id.comeliness) plan.notes.push('Comeliness: ' + id.comeliness + (attrs.cml ? ' (CML ' + attrs.cml + ')' : ''));
  if (id.morality) plan.notes.push('Morality: ' + id.morality + (attrs.moral ? ' (MOR ' + attrs.moral + ')' : ''));
  if (id.sexuality) plan.notes.push('Sexuality: ' + id.sexuality);

  // skills
  var sk = c.skills || {};
  var fixed = sk.fixed || {};
  Object.keys(fixed).forEach(function (key) {
    var f = fixed[key] || {};
    if (f.ml !== undefined) put(key + '_ml', f.ml);
    if (f.sb !== undefined) put(key + '_sb', f.sb); // omit → sheet auto-calcs SB from name+attrs+sunsign
  });
  Object.keys(SKILL_SECTIONS).forEach(function (bucket) {
    var section = SKILL_SECTIONS[bucket];
    (sk[bucket] || []).forEach(function (e) {
      if (!e || !e.name) return;
      var fields = {}; fields[section + '_name'] = e.name;
      if (e.ml !== undefined) fields[section + '_ml'] = e.ml;
      if (e.sb !== undefined) fields[section + '_sb'] = e.sb;
      row('repeating_' + section, fields);
    });
  });

  // religion → a piety row + ritual_religion (CONTRACT §7)
  if (c.religion && c.religion.deity) {
    put('ritual_religion', c.religion.deity);
    row('repeating_piety', { piety_name: c.religion.deity, piety_points: c.religion.piety || 0 });
  }

  // magic (schema reserved; generator currently emits empty arrays) → rows when present
  if (c.magic) {
    (c.magic.convocations || []).forEach(function (m) {
      if (!m || !m.name) return;
      var fields = { magicskill_name: m.name }; if (m.ml !== undefined) fields.magicskill_ml = m.ml;
      row('repeating_magicskill', fields);
    });
    (c.magic.spells || []).forEach(function (s) {
      if (!s || !s.name) return;
      row('repeating_spells', {
        spell_name: s.name, spell_convocation: s.convocation || '', spell_level: s.level || '',
        spell_ct: s.ct || '', spell_range: s.range || '', spell_duration: s.duration || '',
        spell_eml: s.eml || '', spell_note: s.note || '',
      });
    });
  }

  // psyche / medical / honor — no structured sheet home yet (CONTRACT Gaps) → notes
  (c.psyche || []).forEach(function (p) {
    plan.notes.push('Psyche: ' + [p.trait, p.severity && ('severity ' + p.severity), p.subject, p.effect].filter(Boolean).join(' — '));
  });
  (c.medical || []).forEach(function (m) { plan.notes.push('Medical: ' + [m.trait, m.note].filter(Boolean).join(' — ')); });
  if (c.honor && c.honor.value !== undefined) plan.notes.push('Honor: ' + c.honor.value);

  // gear (full inventory import is post-core) → notes summary
  if (c.gear && (c.gear.funds || c.gear.equipment || c.gear.wealthLevel)) {
    plan.notes.push('Funds: ' + (c.gear.funds || 0) + 'd' + (c.gear.wealthLevel ? ' (' + c.gear.wealthLevel + ')' : '') + (c.gear.equipment ? ' · ' + c.gear.equipment : ''));
  }
  if (data.houserules && Object.keys(data.houserules).length) plan.notes.push('House rules: ' + JSON.stringify(data.houserules));
  return plan;
}

// Creature mode (CONTRACT §10). Full creature-mode sheet support (data-driven hit locations) is
// Phase 7 sheet work; until then the importer sets attributes + parks the stat block in notes.
function planCreature(data, c, plan, put, row) {
  plan.warnings.push('Creature import: attributes set; stat block written to notes. Full creature-mode sheet support is pending (Phase 7).');
  if (c.archetype) plan.notes.push('Archetype: ' + c.archetype + (c.size ? ' · size ' + c.size : ''));
  if (c.movement && c.movement.move) plan.notes.push('Move: ' + c.movement.move);
  (c.attacks || []).forEach(function (a) {
    plan.notes.push('Attack: ' + [a.name, a.ml !== undefined && ('ML ' + a.ml), a.impact !== undefined && ('impact ' + a.impact), a.aspect && ('aspect ' + a.aspect)].filter(Boolean).join(' · '));
  });
  if (c.armor && c.armor.natural) plan.notes.push('Natural armor: ' + c.armor.natural);
  (c.hitLocations || []).forEach(function (h) {
    plan.notes.push('Hit loc: ' + [h.name, (h.lo !== undefined && h.hi !== undefined) && (h.lo + '-' + h.hi), h.armor && JSON.stringify(h.armor), h.impactMod && ('impactMod ' + h.impactMod)].filter(Boolean).join(' · '));
  });
  // creature skills carry no sheet section → a flat note list (Phase 7 will section them)
  (c.skills || []).forEach(function (s) { if (s && s.name) plan.notes.push('Skill: ' + s.name + (s.ml !== undefined ? ' ' + s.ml : '')); });
  if ((c.specialQualities || []).length) plan.notes.push('Special: ' + c.specialQualities.join(', '));
  return plan;
}

// ---------- Roll20 application layer (runs only in the API sandbox) ----------
function decodeNotes(s) {
  // Roll20 handout notes are HTML: strip tags, decode the entities Roll20 inserts.
  return String(s || '')
    .replace(/<br\s*\/?>(?=)/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .trim();
}

function upsertAttr(charId, name, value) {
  var found = findObjs({ type: 'attribute', characterid: charId, name: name });
  if (found.length) { found[0].set('current', value); return found[0]; }
  return createObj('attribute', { characterid: charId, name: name, current: value });
}

function applyPlan(charId, plan) {
  var charObj = getObj('character', charId);
  if (charObj && plan.name) charObj.set('name', plan.name);
  plan.attrs.forEach(function (a) { upsertAttr(charId, a.name, a.current); });
  plan.rows.forEach(function (r) {
    var rid = generateRowID();
    Object.keys(r.fields).forEach(function (f) { upsertAttr(charId, r.section + '_' + rid + '_' + f, r.fields[f]); });
  });
  if (plan.notes.length) {
    var existing = findObjs({ type: 'attribute', characterid: charId, name: 'various_notes' });
    var prior = existing.length ? String(existing[0].get('current') || '') : '';
    var block = '=== Imported by !harnimport ===\n' + plan.notes.join('\n');
    upsertAttr(charId, 'various_notes', prior ? prior + '\n\n' + block : block);
  }
  return { attrCount: plan.attrs.length, rowCount: plan.rows.length, noteCount: plan.notes.length };
}

function whisper(to, msg) { sendChat('harnimport', '/w "' + to + '" ' + msg); }

function ingest(playerName, who, data, opts) {
  var plan = planFromHarnchar(data);
  if (!plan.ok) { whisper(who, '❌ ' + plan.error); return; }
  var charId;
  if (opts.update && opts.selectedCharId) charId = opts.selectedCharId;
  else { var nc = createObj('character', { name: plan.name }); charId = nc.id; }
  var res = applyPlan(charId, plan);
  plan.warnings.forEach(function (w) { whisper(who, '⚠ ' + w); });
  whisper(who, '✅ Imported <b>' + plan.name + '</b> (' + plan.kind + '): ' + res.attrCount + ' attrs, ' + res.rowCount + ' skill/row entries, ' + res.noteCount + ' notes.');
}

function handleChat(msg) {
  if (msg.type !== 'api' || !/^!harnimport(\b|$)/.test(msg.content)) return;
  var who = (msg.who || 'gm').replace(/ \(GM\)$/, '');
  var rest = msg.content.replace(/^!harnimport\s*/, '');
  var opts = { update: /--update\b/.test(rest), selectedCharId: null };
  // resolve selected token → its represented character (for --update)
  if (opts.update && msg.selected && msg.selected.length) {
    var tok = getObj('graphic', msg.selected[0]._id);
    if (tok && tok.get('represents')) opts.selectedCharId = tok.get('represents');
    if (!opts.selectedCharId) { whisper(who, '❌ --update needs a selected token that represents a character.'); return; }
  }
  // inline JSON?
  var brace = rest.indexOf('{');
  if (brace >= 0) {
    var jsonText = rest.slice(brace);
    var parsed;
    try { parsed = JSON.parse(jsonText); } catch (e) { whisper(who, '❌ inline JSON parse error: ' + e.message); return; }
    ingest(who, who, parsed, opts); return;
  }
  // else read from a handout
  var hm = rest.match(/--handout\s+"([^"]+)"|--handout\s+(\S+)/);
  var handoutName = hm ? (hm[1] || hm[2]) : 'harnchar';
  var handouts = findObjs({ type: 'handout', name: handoutName });
  if (!handouts.length) { whisper(who, '❌ no handout named "' + handoutName + '". Paste the JSON into a handout, or use !harnimport {json}.'); return; }
  var h = handouts[0];
  h.get('notes', function (notes) {
    h.get('gmnotes', function (gm) {
      var raw = decodeNotes(notes) || decodeNotes(gm);
      var parsed;
      try { parsed = JSON.parse(raw); } catch (e) { whisper(who, '❌ handout "' + handoutName + '" JSON parse error: ' + e.message + '. Make sure it holds ONLY the harnchar JSON.'); return; }
      ingest(who, who, parsed, opts);
    });
  });
}

if (typeof on !== 'undefined') {
  on('ready', function () { log('harnimport ready — paste harnchar JSON into a handout named "harnchar" and run !harnimport'); });
  on('chat:message', handleChat);
}

// expose pure pieces for Node unit tests (Roll20 sandbox has no `module`)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { planFromHarnchar: planFromHarnchar, decodeNotes: decodeNotes, IDENTITY_ATTR: IDENTITY_ATTR, ATTR_KEYS: ATTR_KEYS, SKILL_SECTIONS: SKILL_SECTIONS };
}
