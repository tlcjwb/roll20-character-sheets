// A small evaluator for the *deterministic* parts of Roll20 roll macros — enough to
// check the TARGET a roll button computes (not the random dice in rollresult).
//
// It pulls a roll button's macro out of harnsheet.html by name, extracts a {{field=...}}
// (e.g. rolltarget), substitutes @{attr} from a store and ?{query|default} (or a test
// override), then evaluates [[ ]] grouping, {a,b}kh1 / {a,b}kl1 (max/min), and
// floor/round/ceil/abs. Dice (XdY) are not supported — targets are deterministic.
//
// This lets rulebook worked-examples that live in roll macros (healing target, attribute
// tests, the 5/95 clamp, etc.) be golden-tested against the real shipped macros.

import fs from 'node:fs';

const SHEET_URL = new URL('../harnsheet.html', import.meta.url);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let _html = null;
const html = () => (_html ??= fs.readFileSync(SHEET_URL, 'utf8'));

// Return a roll button's `value="..."` macro, located by its name="roll_<name>".
export function getRollMacro(name) {
  const tag = escapeRe('roll_' + name);
  const valFirst = new RegExp('<button[^>]*\\bvalue="([^"]*)"[^>]*\\bname="' + tag + '"');
  const nameFirst = new RegExp('<button[^>]*\\bname="' + tag + '"[^>]*\\bvalue="([^"]*)"');
  const m = html().match(valFirst) || html().match(nameFirst);
  if (!m) throw new Error('roll macro not found: roll_' + name);
  return m[1];
}

// Extract the value of a {{key=VALUE}} field from a macro (fields don't nest {{ }}).
export function getField(macro, key) {
  const start = macro.indexOf('{{' + key + '=');
  if (start < 0) throw new Error(`field not found: {{${key}=...}} in macro`);
  const from = start + ('{{' + key + '=').length;
  const end = macro.indexOf('}}', from);
  if (end < 0) throw new Error(`unterminated field: {{${key}=...`);
  return macro.slice(from, end);
}

// Split on top-level commas (respecting parentheses depth).
function splitTopComma(s) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// Replace innermost {A,B}kh1 / {A,B}kl1 with Math.max / Math.min, repeatedly.
function reduceKeep(s) {
  const re = /\{([^{}]*)\}(kh1|kl1)/;
  let m;
  while ((m = s.match(re))) {
    const parts = splitTopComma(m[1]);
    const fn = m[2] === 'kh1' ? 'Math.max' : 'Math.min';
    s = s.slice(0, m.index) + fn + '(' + parts.join(',') + ')' + s.slice(m.index + m[0].length);
  }
  return s;
}

// Evaluate a deterministic Roll20 expression.
//   store:   { attrName: value }            for @{attr}
//   queries: { 'Query Label?': value }       for ?{Label|default}; else first default; else 0
export function evalExpr(expr, store = {}, queries = {}) {
  let s = expr;
  // @{attr}
  s = s.replace(/@\{([^}]+)\}/g, (_, n) => {
    const v = store[n];
    return (v === undefined || v === '') ? '0' : String(Number(v));
  });
  // ?{Label|opt1|opt2...}
  s = s.replace(/\?\{([^}]*)\}/g, (_, inner) => {
    const parts = inner.split('|');
    const label = parts[0];
    if (Object.prototype.hasOwnProperty.call(queries, label)) return String(Number(queries[label]));
    return parts.length > 1 ? String(Number(parts[1])) : '0';
  });
  // [[ ]] inline rolls -> grouping parens
  s = s.replace(/\[\[/g, '(').replace(/\]\]/g, ')');
  // {a,b}kh1 / {a,b}kl1
  s = reduceKeep(s);
  // math fns
  s = s.replace(/\b(floor|round|ceil|abs)\s*\(/g, (_, f) => 'Math.' + f + '(');
  // safety: nothing unresolved should remain
  if (/[@?{}\[\]]/.test(s) || /\bd\d/.test(s)) {
    throw new Error('evalExpr: unresolved tokens remain -> ' + s);
  }
  // eslint-disable-next-line no-new-func
  return Function('"use strict"; return (' + s + ');')();
}

// Convenience: evaluate the rolltarget (or another field) of a named roll button.
export function evalTarget(rollName, store, queries, field = 'rolltarget') {
  return evalExpr(getField(getRollMacro(rollName), field), store, queries);
}
