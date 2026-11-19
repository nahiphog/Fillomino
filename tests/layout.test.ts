import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLayoutPuzzle } from '../src/layout.ts';
import { generateBoard, isValidBoard } from '../src/generator.ts';
import { countSolutions } from '../src/solver.ts';

function seeded(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

test('default custom search continues beyond 1,000 attempts and 30 seconds', () => {
  const board = generateBoard(3, 3, seeded(41));
  let attempts = 0, time = 0;
  const result = createLayoutPuzzle(3, 3, Array(9).fill(true), {
    now: () => time,
    generate: () => board,
    check: (...args) => {
      attempts++; time += 100;
      return attempts <= 1001 ? { status: 'timeout', count: 1 } : countSolutions(...args);
    },
  });
  assert.equal(result.status, 'found');
  assert.equal(result.attempts, 1002);
  assert.equal(result.timeouts, 1001);
  assert.ok(time > 30000);
});

test('layout search keeps exactly the highlighted givens on square, wide and tall grids', () => {
  for (const [rows, columns] of [[3, 3], [3, 5], [5, 3]]) {
    const board = generateBoard(rows, columns, seeded(17));
    const mask = board.values.map(() => true);
    // Find a single removable clue; the mask is deliberately asymmetric.
    const removable = board.values.findIndex((_, cell) => {
      const clues = [...board.values]; clues[cell] = 0;
      const result = countSolutions(rows, columns, clues);
      return result.status === 'complete' && result.count === 1;
    });
    assert.ok(removable >= 0);
    mask[removable] = false;
    const originalMask = [...mask], originalBoard = structuredClone(board);
    const result = createLayoutPuzzle(rows, columns, mask, { generate: () => board });
    assert.equal(result.status, 'found');
    if (result.status !== 'found') return;
    assert.ok(result.clues.every((value, i) => Boolean(value) === mask[i]));
    assert.deepEqual(result.board.values, board.values);
    assert.ok(isValidBoard(result.board));
    const count = countSolutions(rows, columns, result.clues);
    assert.equal(count.status, 'complete'); assert.equal(count.count, 1);
    assert.deepEqual(mask, originalMask); assert.deepEqual(board, originalBoard);
  }
});

test('layout search rejects empty/malformed masks and invalid dimensions', () => {
  for (const [rows, columns, mask] of [
    [3, 3, Array(9).fill(false)], [3, 4, Array(9).fill(true)],
    [2, 3, Array(6).fill(true)], [3, 3, Array(9).fill(1)],
  ] as [number, number, boolean[]][]) {
    assert.equal(createLayoutPuzzle(rows, columns, mask).status, 'invalid');
  }
});

test('ambiguity and timeouts never become a successful custom puzzle', () => {
  const board = generateBoard(3, 3, seeded(2));
  const mask = Array(9).fill(true);
  for (const response of [{ status: 'complete', count: 2 }, { status: 'timeout', count: 1 }] as const) {
    const result = createLayoutPuzzle(3, 3, mask, {
      generate: () => board, check: () => response, maxAttempts: 3,
    });
    assert.equal(result.status, 'not-found'); assert.equal(result.attempts, 3);
    assert.equal(result.timeouts, response.status === 'timeout' ? 3 : 0);
  }
});

test('layout search retries candidates, respects time budgets and reports progress', () => {
  const board = generateBoard(3, 3, seeded(8));
  let checks = 0;
  const progress: number[] = [];
  const result = createLayoutPuzzle(3, 3, Array(9).fill(true), {
    generate: () => board,
    check: (...args) => ++checks === 1 ? { status: 'complete', count: 2 } : countSolutions(...args),
    onProgress: p => progress.push(p.attempts),
  });
  assert.equal(result.status, 'found'); assert.equal(result.attempts, 2);
  assert.deepEqual(progress, [0, 1, 2]);
  assert.equal(createLayoutPuzzle(3, 3, Array(9).fill(true), { timeLimitMs: 0 }).attempts, 0);
  let time = 0;
  const timed = createLayoutPuzzle(3, 3, Array(9).fill(true), {
    now: () => time, timeLimitMs: 10, generate: () => board,
    check: (_rows, _columns, _clues, budget) => {
      assert.equal(budget, 10); time += 10; return { status: 'timeout', count: 1 };
    },
  });
  assert.equal(timed.status, 'not-found'); assert.equal(timed.attempts, 1);
});
