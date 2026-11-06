import test from 'node:test';
import assert from 'node:assert/strict';
import { sheetLabel, filterSheets } from './sheets.js';

const W = 2592, H = 1728;
const T = (str, x, y, size, angle = 0) => ({ str, x, y, size, angle });

test('sheet number and title from the title block', () => {
  const texts = [
    T('A2-401', 2194, 790, 9.5), // a section tag: small
    T('A2-101', 2355, 1675, 37.5),
    T('KEY PLAN', 1866, 1330, 25),
    T('BUILDING 2 -', 2488, 1140, 25.1, -Math.PI / 2),
    T('THIRD FLOOR FRAMING PLAN', 2514, 1227, 25.1, -Math.PI / 2),
    T('NOT FOR', 2490, 1210, 23, -Math.PI / 2),
    T('FLOOR PLAN GENERAL NOTES', 130, 1330, 25),
  ];
  assert.deepEqual(sheetLabel(texts, W, H), { number: 'A2-101', title: 'BUILDING 2 - THIRD FLOOR FRAMING PLAN' });
  assert.deepEqual(sheetLabel([T('A2-401', 2194, 790, 9.5)], W, H), { number: '', title: '' });
});

test('search by number, any separator, or by title words', () => {
  const sheets = [
    { page: 1, number: 'A2-101', title: 'BLDG 2 - GROUND FLOOR PLAN' },
    { page: 3, number: 'S2-201', title: 'BUILDING 2 - FOUNDATION PLAN' },
    { page: 6, number: 'S102A', title: 'LEVEL 2 FRAMING PLAN - PART A' },
  ];
  assert.deepEqual(filterSheets(sheets, 'S2.201').map((s) => s.page), [3]);
  assert.deepEqual(filterSheets(sheets, 's2201').map((s) => s.page), [3]);
  assert.deepEqual(filterSheets(sheets, 'framing plan').map((s) => s.page), [6]);
  assert.equal(filterSheets(sheets, '').length, 3);
});
