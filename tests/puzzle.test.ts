import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSolutions, countSolutions, solveBoard } from '../src/solver.ts';
import { createPuzzle } from '../src/puzzle.ts';
import { generateBoard, isValidBoard, type Board } from '../src/generator.ts';
import { Constraints, newMetrics } from '../src/constraints.ts';

function seeded(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

// Independent exhaustive oracle: enumerate ALL set partitions of nine cells,
// derive their number grids, and check components without the production solver.
function allThreeByThreeSolutions(): number[][] {
  const labels = Array<number>(9).fill(0), results = new Map<string, number[]>();
  function enumerate(index: number, maxLabel: number) {
    if (index < 9) {
      for (let label = 0; label <= maxLabel + 1; label++) {
        labels[index] = label; enumerate(index + 1, Math.max(maxLabel, label));
      }
      return;
    }
    const sizes = Array<number>(9).fill(0);
    labels.forEach(label => sizes[label]++);
    const values = labels.map(label => sizes[label]);
    const visited = new Set<number>();
    for (let start = 0; start < 9; start++) {
      if (visited.has(start)) continue;
      const stack = [start]; visited.add(start); let total = 0;
      while (stack.length) {
        const cell = stack.pop()!; total++;
        for (let other = 0; other < 9; other++) {
          const distance = Math.abs(Math.floor(cell / 3) - Math.floor(other / 3)) + Math.abs(cell % 3 - other % 3);
          if (distance === 1 && values[other] === values[start] && !visited.has(other)) { visited.add(other); stack.push(other); }
        }
      }
      if (total !== values[start]) return;
    }
    results.set(values.join(','), values);
  }
  enumerate(1, 0);
  return [...results.values()];
}
const oracle = allThreeByThreeSolutions();
const matches = (values: number[], clues: number[]) => clues.every((clue, i) => !clue || clue === values[i]);

test('solution counting agrees with an independent exhaustive 3×3 oracle', () => {
  assert.ok(oracle.length > 1);
  const random = seeded(37);
  for (let sample = 0; sample < 1500; sample++) {
    const solution = oracle[Math.floor(random() * oracle.length)];
    const clues = solution.map(value => random() < .55 ? 0 : value);
    if (sample % 3 === 0) clues[Math.floor(random() * 9)] = 1 + Math.floor(random() * 9);
    const compatible = oracle.filter(values => matches(values, clues));
    const expected = Math.min(2, compatible.length);
    const propagated = new Constraints(3, 3, clues, newMetrics(), () => {});
    const consistent = propagated.propagate();
    if (compatible.length) {
      assert.ok(consistent);
      for (const values of compatible) assert.ok(values.every((value, i) => propagated.has(i, value)), `Deduction removed a valid completion for ${clues}`);
    }
    const result = countSolutions(3, 3, clues);
    assert.equal(result.status, 'complete');
    assert.equal(result.count, expected, `Wrong count for ${clues}`);
    const pure = analyzeSolutions(3, 3, clues, { regionProbeMs: 0 }).result;
    assert.equal(pure.status, 'complete');
    assert.equal(pure.count, expected, `Wrong propagation count for ${clues}`);
  }
});

test('counts unique, ambiguous, impossible, invalid and timed-out searches distinctly', () => {
  assert.equal(countSolutions(3, 3, [9,...Array(8).fill(0)]).count, 1);
  assert.equal(countSolutions(3, 3, Array(9).fill(0)).count, 2);
  assert.equal(countSolutions(3, 3, [1,1,...Array(7).fill(0)]).count, 0);
  assert.equal(countSolutions(3, 3, []).status, 'invalid');
  assert.deepEqual(countSolutions(3, 3, Array(9).fill(0), 0), { status: 'timeout', count: 0 });
});

test('created puzzles have blanks and exactly one solution according to the independent oracle', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const random = seeded(seed), board = generateBoard(3, 3, random);
    const original = structuredClone(board);
    const result = createPuzzle(board, { random });
    assert.ok(result.removed > 0);
    assert.deepEqual(board, original, 'Must not mutate the source solution');
    const solutions = oracle.filter(values => matches(values, result.clues));
    assert.equal(solutions.length, 1);
    assert.deepEqual(solutions[0], board.values);
  }
});

test('creates verified puzzles at larger sizes and solves back to the original grid', () => {
  for (const size of [4,6,15]) {
    const random = seeded(size), board = generateBoard(size, size, random);
    const progress: number[] = [];
    const result = createPuzzle(board, { random, timeLimitMs: 2000, checkTimeLimitMs: 80, onProgress: p => progress.push(p.checked) });
    assert.ok(result.removed > 0, `No clues removed at size ${size}`);
    assert.equal(result.removed, result.clues.filter(value => value === 0).length);
    assert.ok(matches(board.values, result.clues));
    assert.equal(progress.at(-1), result.checked);
    const counted = countSolutions(size, size, result.clues);
    assert.equal(counted.status, 'complete');
    assert.equal(counted.count, 1);
    const solved = solveBoard(size, size, result.clues);
    assert.equal(solved.status, 'solved');
    if (solved.status === 'solved') assert.deepEqual(solved.board.values, board.values);
  }
});

test('unproved removals are restored and an exhausted budget preserves the solution', () => {
  const board = generateBoard(3, 3, seeded(9));
  for (const options of [{ timeLimitMs: 0 }, { checkTimeLimitMs: 0 }]) {
    const result = createPuzzle(board, options);
    assert.equal(result.limited, true);
    assert.equal(result.removed, 0);
    assert.deepEqual(result.clues, board.values);
    assert.ok(isValidBoard({ rows: board.rows, columns: board.columns, values: result.clues }));
  }
  assert.throws(() => createPuzzle({ rows: 3, columns: 3, values: Array(9).fill(1), regions: [] } as Board));
});
