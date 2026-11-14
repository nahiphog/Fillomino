import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveBoard } from '../src/solver.ts';
import { generateBoard, isValidBoard } from '../src/generator.ts';

const example = '333122122553551533524552524412514221'.split('').map(Number);
function check(size: number, clues: number[]) {
  const result = solveBoard(size, clues);
  assert.equal(result.status, 'solved');
  if (result.status !== 'solved') return;
  assert.ok(isValidBoard(result.board));
  clues.forEach((clue, i) => { if (clue) assert.equal(result.board.values[i], clue); });
}
test('solves the example with half its clues removed', () => {
  check(6, example.map((value, i) => i % 2 ? 0 : value));
});
test('preserves a completed example and supports regions without clues', () => {
  check(6, example);
  check(3, [1,0,0,0,0,0,0,0,0]);
  check(3, Array(9).fill(0));
});
test('handles multi-digit clues and the largest grid', () => {
  check(15, [225, ...Array(224).fill(0)]);
  check(4, [16, ...Array(15).fill(0)]);
});
test('rejects impossible clues without reporting a timeout', () => {
  assert.equal(solveBoard(3, [1,1,0,0,0,0,0,0,0]).status, 'impossible');
  assert.equal(solveBoard(3, [2,2,2,0,0,0,0,0,0]).status, 'impossible');
});
test('distinguishes invalid inputs and exhausted search time', () => {
  assert.equal(solveBoard(3, [10,...Array(8).fill(0)]).status, 'invalid');
  assert.equal(solveBoard(3, [NaN,...Array(8).fill(0)]).status, 'invalid');
  assert.equal(solveBoard(3, []).status, 'invalid');
  assert.equal(solveBoard(3, Array(9).fill(0), 0).status, 'timeout');
});
test('solves deterministic generated boards with missing clues', () => {
  let seed = 23;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (const size of [3,4,5,6,10,15]) {
    const board = generateBoard(size, random);
    check(size, board.values.map(value => random() < .25 ? 0 : value));
  }
});
