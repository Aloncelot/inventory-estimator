import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, tryEvaluate } from './calc.js';

test('calculator follows operator precedence', () => {
  assert.equal(evaluate('2+3*4'), 14);
  assert.equal(evaluate('(2+3)*4'), 20);
  assert.equal(evaluate('2^3^2'), 512);
  assert.equal(evaluate('10/4'), 2.5);
});

test('accepts ×, ÷, x, thousands commas, unary minus and percent', () => {
  assert.equal(evaluate('12 × 8'), 96);
  assert.equal(evaluate('96 ÷ 8'), 12);
  assert.equal(evaluate('1,200 x 2'), 2400);
  assert.equal(evaluate('-3+5'), 2);
  assert.equal(evaluate('4*-2'), -8);
  assert.equal(evaluate('200*15%'), 30);
  assert.equal(evaluate('0.1+0.2'), 0.3);
});

test('reports errors instead of throwing', () => {
  assert.ok(tryEvaluate('2+').error);
  assert.ok(tryEvaluate('(2').error);
  assert.ok(tryEvaluate('5/0').error);
  assert.ok(tryEvaluate('alert(1)').error);
});
