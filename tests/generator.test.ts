import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBoard, isValidBoard, neighbors } from '../src/generator.ts';

function seeded(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
test('generates valid connected regions for every supported size across 100 seeds', () => {
  for (let size = 3; size <= 15; size++) for (let seed = 1; seed <= 100; seed++) {
    const board = generateBoard(size, size, seeded(seed));
    assert.ok(isValidBoard(board), `Invalid ${size}×${size}, seed ${seed}`);
    for (const id of new Set(board.regions)) {
      const cells = board.regions.flatMap((region, cell) => region === id ? [cell] : []);
      assert.ok(cells.every(cell => board.values[cell] === cells.length));
      const visited = new Set([cells[0]]), stack = [cells[0]];
      while (stack.length) for (const next of neighbors(stack.pop()!, size, size)) {
        if (board.regions[next] === id && !visited.has(next)) { visited.add(next); stack.push(next); }
      }
      assert.equal(visited.size, cells.length);
    }
  }
});
test('accepts the supplied completed example', () => {
  assert.ok(isValidBoard({rows: 6, columns: 6,values:'333122122553551533524552524412514221'.split('').map(Number)}));
});
test('rejects invalid boards and dimensions', () => {
  for (const size of [2,16,3.5,NaN,Infinity]) assert.throws(() => generateBoard(size, size));
  assert.equal(isValidBoard({rows: 3, columns: 3,values:Array(9).fill(1)}),false);
  assert.equal(isValidBoard({rows: 3, columns: 3,values:[3,3,3]}),false);
});
