// Zero-dependency test for the OOXML color normalizer.
// Run:  cd app && node --test src/lib/ooxmlColor.test.mjs
//
// Guards the load-bearing PPTX color rule: no `#`-prefixed color may ever reach
// the pptxgenjs writer (a `#` makes the color disappear in PowerPoint).

import test from 'node:test';
import assert from 'node:assert/strict';
import { toOoxmlColor } from './ooxmlColor.mjs';

test('strips the leading # and uppercases', () => {
  assert.equal(toOoxmlColor('#6b3fa0'), '6B3FA0');
  assert.equal(toOoxmlColor('#1a1c20'), '1A1C20');
});

test('passes bare hex through (already #-free)', () => {
  assert.equal(toOoxmlColor('1A1C20'), '1A1C20');
  assert.equal(toOoxmlColor('e267e4'), 'E267E4');
});

test('expands 3-digit shorthand', () => {
  assert.equal(toOoxmlColor('#fff'), 'FFFFFF');
  assert.equal(toOoxmlColor('abc'), 'AABBCC');
});

test('rejects non-hex input (returns undefined, never a # string)', () => {
  for (const bad of [
    undefined, '', 'none', 'transparent', 'currentColor',
    'rgb(0,0,0)', '#12', '#1234567', 'not-a-color',
  ]) {
    assert.equal(toOoxmlColor(bad), undefined);
  }
});

test('LOAD-BEARING: output never contains a # for any accepted input', () => {
  const inputs = ['#000', '#ffffff', '#0B1F3A', '1a1c20', '#AbCdEf', '#e267e4', 'fff', '#6B3FA0'];
  for (const c of inputs) {
    const out = toOoxmlColor(c);
    assert.ok(out, `expected a normalized color for ${c}`);
    assert.ok(!out.includes('#'), `expected no '#' in output, got ${out}`);
  }
});
