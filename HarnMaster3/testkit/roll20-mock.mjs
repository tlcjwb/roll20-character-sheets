// Minimal in-memory Roll20 sheetworker API mock.
//
// Implements just enough of the Roll20 worker globals (on / getAttrs / setAttrs /
// getSectionIDs) to load the real worker block from harnsheet.html and exercise its
// event handlers in Node. setAttrs fires change: events for attributes whose value
// actually changed, so reactive cascades behave like the live sheet; a depth cap
// guards against accidental infinite loops.
//
// Notes on faithfulness:
//  - getAttrs returns `undefined` for attributes never set (matching parseInt(undefined)=NaN,
//    which the migration logic and some guards rely on). Set values are stored as strings,
//    as Roll20 does.
//  - getSectionIDs returns ids from `mock.sections[<section>]` (set repeating-row ids there
//    for repeating-section tests); defaults to [].

export function createMock() {
  const attrs = {};
  const handlers = {};   // eventName -> [fn]
  const sections = {};   // sectionName (without "repeating_") -> [ids]
  let depth = 0;

  const on = (spec, fn) => {
    String(spec).trim().split(/\s+/).forEach((ev) => {
      (handlers[ev] ||= []).push(fn);
    });
  };

  const getAttrs = (names, cb) => {
    const out = {};
    names.forEach((n) => { out[n] = (n in attrs) ? attrs[n] : undefined; });
    cb(out);
  };

  const setAttrs = (obj, opts, cb) => {
    if (typeof opts === 'function') { cb = opts; opts = undefined; }
    const changed = [];
    for (const k of Object.keys(obj)) {
      const v = obj[k] === undefined || obj[k] === null ? '' : String(obj[k]);
      if (attrs[k] !== v) { attrs[k] = v; changed.push(k); }
    }
    if (typeof cb === 'function') cb();
    fire(changed.map((k) => 'change:' + k));
  };

  const getSectionIDs = (section, cb) => {
    const key = String(section).replace(/^repeating_/, '');
    cb(sections[key] || sections[section] || []);
  };

  function fire(events) {
    if (!Array.isArray(events)) events = [events];
    if (depth > 200) throw new Error('Roll20Mock: cascade too deep (possible loop): ' + events.join(', '));
    depth++;
    try {
      for (const ev of events) {
        for (const fn of (handlers[ev] || [])) {
          fn({ sourceAttribute: ev.split(':').slice(1).join(':'), triggerName: ev });
        }
      }
    } finally { depth--; }
  }

  // Fire a single event with caller-supplied eventInfo (e.g. a realistic repeating-row
  // sourceAttribute for clicked: handlers). Defaults match fire()'s synthesized info.
  function emit(ev, info) {
    for (const fn of (handlers[ev] || [])) {
      fn(Object.assign({ sourceAttribute: ev.split(':').slice(1).join(':'), triggerName: ev }, info || {}));
    }
  }

  return {
    on, getAttrs, setAttrs, getSectionIDs, fire, emit,
    // test helpers
    set: (n, v) => { attrs[n] = (v === undefined || v === null) ? '' : String(v); },
    setAll: (o) => { for (const k of Object.keys(o)) attrs[k] = String(o[k]); },
    get: (n) => attrs[n],
    has: (n) => n in attrs,
    attrs,
    sections,
    handlers,
  };
}
