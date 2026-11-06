import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boardFeetOf, piecesPerBuyUnit, receiptPieces, costPerPiece, piecePriceFromQuote, priceVariance, isFlagged, ageDays
} from './purchase.js';

test('board feet from the size label', () => {
  assert.equal(boardFeetOf(`2x6"-8'`), 8);
  assert.equal(boardFeetOf(`2x4"-10'`), 6.6667);
  assert.equal(boardFeetOf(`2x6"-92-5/8"`), 7.7188);
  assert.equal(boardFeetOf(`2x10-16'`), 26.6667);
  assert.equal(boardFeetOf(`4x8'-1/2"`), null, 'sheets have no board feet');
  assert.equal(boardFeetOf(`1-1/4x5-1/2" LSL Rimboard`), null, 'no length');
  assert.equal(boardFeetOf('HU26'), null);
});

test('5 bundles of 189 pieces for $2,000', () => {
  const pieces = receiptPieces({ buyUnit: 'bundle', buyQty: 5, pcsPerBundle: 189 });
  assert.equal(pieces, 945);
  assert.equal(costPerPiece(2000, pieces), 2.1164);
});

test('bought by the thousand board feet', () => {
  const bf = boardFeetOf(`2x6"-8'`);
  assert.equal(piecesPerBuyUnit('mbf', { boardFeet: bf }), 125);
  assert.equal(receiptPieces({ buyUnit: 'mbf', buyQty: 7.56, boardFeet: bf }), 945);
  assert.equal(piecePriceFromQuote('mbf', 265, { boardFeet: bf }), 2.12);
  assert.equal(receiptPieces({ buyUnit: 'mbf', buyQty: 2, boardFeet: null }), null, 'not lumber');
});

test('each, bundles without a count, and quotes per bundle', () => {
  assert.equal(receiptPieces({ buyUnit: 'each', buyQty: 12 }), 12);
  assert.equal(receiptPieces({ buyUnit: 'bundle', buyQty: 2 }), null);
  assert.equal(piecePriceFromQuote('bundle', 420, { pcsPerBundle: 70 }), 6);
  assert.equal(costPerPiece('', 10), null);
});

test('price variance against the list', () => {
  assert.equal(priceVariance(5.2, 4.6), 13);
  assert.equal(priceVariance(4.37, 4.6), -5);
  assert.ok(isFlagged(13));
  assert.ok(isFlagged(-5));
  assert.ok(!isFlagged(4.9));
  assert.equal(priceVariance(5, 0), null);
});

test('price age', () => {
  const now = Date.UTC(2026, 10, 6);
  assert.equal(ageDays(new Date(Date.UTC(2026, 9, 1)), now), 36);
  assert.equal(ageDays(null, now), null);
});
