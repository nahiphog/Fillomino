import { generateBoard } from '../src/generator.ts';
import fs from 'node:fs';

export function seeded(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
export function fixtures() {
  const cases: { name: string; rows: number; columns: number; clues: number[] }[] = [];
  const example = '333122122553551533524552524412514221'.split('').map(Number);
  cases.push({ name: 'example-half', rows: 6, columns: 6, clues: example.map((v, i) => i % 2 ? 0 : v) });
  for (const [rows, columns] of [[6,6],[10,10],[15,15],[6,12],[12,6]]) {
    for (const density of [.75,.4,.2]) {
      const random = seeded(rows * 1000 + columns * 10 + Math.round(density * 100));
      const board = generateBoard(rows, columns, random);
      cases.push({ name: `${rows}x${columns}-${density}`, rows, columns, clues: board.values.map(v => random() < density ? v : 0) });
    }
  }
  cases.push({ name: 'unclued-3x3', rows: 3, columns: 3, clues: Array(9).fill(0) });
  cases.push({ name: 'single-225', rows: 15, columns: 15, clues: [225,...Array(224).fill(0)] });
  cases.push({ name: 'contradiction', rows: 10, columns: 10, clues: [1,1,...Array(98).fill(0)] });
  cases.push(...JSON.parse(fs.readFileSync(new URL('./unique-fixtures.json', import.meta.url), 'utf8')));
  return cases;
}
