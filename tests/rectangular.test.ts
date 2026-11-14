import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBoard, isValidBoard, neighbors } from '../src/generator.ts';
import { solveBoard, countSolutions } from '../src/solver.ts';
import { createPuzzle } from '../src/puzzle.ts';

function seeded(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

test('generates valid boards for all 169 row/column combinations', () => {
  for (let rows = 3; rows <= 15; rows++) for (let columns = 3; columns <= 15; columns++) {
    const board = generateBoard(rows, columns, seeded(rows * 100 + columns));
    assert.equal(board.rows, rows);
    assert.equal(board.columns, columns);
    assert.equal(board.values.length, rows * columns);
    assert.ok(isValidBoard(board), `Invalid ${rows}×${columns}`);
    for (const id of new Set(board.regions)) {
      const cells = board.regions.flatMap((region, i) => region === id ? [i] : []);
      assert.ok(cells.every(i => board.values[i] === cells.length));
      const visited = new Set([cells[0]]), stack = [cells[0]];
      while (stack.length) for (const next of neighbors(stack.pop()!, rows, columns)) {
        if (board.regions[next] === id && !visited.has(next)) { visited.add(next); stack.push(next); }
      }
      assert.equal(visited.size, cells.length);
    }
  }
});

test('rectangular neighbors use the column stride and do not wrap at row edges', () => {
  assert.deepEqual(neighbors(0, 3, 5), [5,1]);
  assert.deepEqual(neighbors(4, 3, 5), [9,3]);
  assert.deepEqual(neighbors(5, 3, 5), [0,10,6]);
  assert.deepEqual(neighbors(14, 3, 5), [9,13]);
  assert.deepEqual(neighbors(3, 5, 3), [0,6,4]);
  assert.deepEqual(neighbors(14, 5, 3), [11,13]);
});

test('solves partial wide and tall grids without changing clues or dimensions', () => {
  for (const [rows, columns] of [[3,15],[15,3],[4,7],[7,4]]) {
    const board = generateBoard(rows, columns, seeded(rows * columns));
    const clues = board.values.map((value, i) => i % 4 === 0 ? 0 : value);
    const result = solveBoard(rows, columns, clues);
    assert.equal(result.status, 'solved');
    if (result.status !== 'solved') continue;
    assert.equal(result.board.rows, rows);
    assert.equal(result.board.columns, columns);
    assert.ok(isValidBoard(result.board));
    assert.ok(clues.every((clue, i) => !clue || clue === result.board.values[i]));
  }
});

test('creates unique rectangular puzzles that solve to their source', () => {
  for (const [rows, columns] of [[3,5],[5,3],[3,15],[15,3]]) {
    const random = seeded(rows * 100 + columns);
    const board = generateBoard(rows, columns, random);
    const puzzle = createPuzzle(board, { random, timeLimitMs: 1500, checkTimeLimitMs: 100 });
    assert.ok(puzzle.removed > 0, `${rows}×${columns} has no blanks`);
    assert.equal(puzzle.clues.length, rows * columns);
    const counted = countSolutions(rows, columns, puzzle.clues);
    assert.equal(counted.status, 'complete');
    assert.equal(counted.count, 1);
    if (counted.status === 'complete') assert.deepEqual(counted.board?.values, board.values);
  }
});

test('validates both dimensions and uses rows × columns for the maximum clue', () => {
  for (const bad of [2,16,3.5,NaN,Infinity]) {
    for (const [rows, columns] of [[bad,5],[5,bad]]) {
      assert.throws(() => generateBoard(rows, columns));
      assert.equal(solveBoard(rows, columns, Array(15).fill(0)).status, 'invalid');
    }
  }
  assert.equal(solveBoard(3, 5, [16,...Array(14).fill(0)]).status, 'invalid');
  assert.equal(solveBoard(3, 5, Array(9).fill(0)).status, 'invalid');
  assert.equal(isValidBoard({ rows:3, columns:5, values:Array(9).fill(9) }), false);
  assert.equal(countSolutions(3, 5, [15,...Array(14).fill(0)]).count, 1);
  assert.equal(countSolutions(5, 3, [15,...Array(14).fill(0)]).count, 1);
});
