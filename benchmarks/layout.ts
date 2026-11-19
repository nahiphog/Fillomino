import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createLayoutPuzzle as baseline } from './reference-layout.ts';
import { createLayoutPuzzle as improved } from '../src/layout.ts';
import { countSolutions } from '../src/solver.ts';
import { isValidBoard } from '../src/generator.ts';

function seeded(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
const budget = Number(process.env.LAYOUT_BUDGET_MS ?? 1000);
const repeats = Number(process.env.LAYOUT_REPEATS ?? 1);
const fixtures = [[6,6,.6],[6,6,.3],[6,6,.15],[10,10,.4],[10,10,.2],[15,15,.3],[4,9,.25],[9,4,.25]].map(([rows,columns,density], index) => {
  const random = seeded(1200 + index);
  const mask = Array.from({length:rows*columns}, () => random() < density);
  return {name:`${rows}x${columns}-${density}`,rows,columns,mask};
});
fixtures.push({name:'6x6-edge',rows:6,columns:6,mask:Array.from({length:36},(_,i)=>i<6)});
const runs: unknown[] = [];
for (let repeat=0; repeat<repeats; repeat++) for (const [index, fixture] of fixtures.entries()) {
  for (const [engine, search] of (repeat % 2 ? [['improved',improved],['baseline',baseline]] : [['baseline',baseline],['improved',improved]]) as const) {
    const started = performance.now();
    const result = search(fixture.rows,fixture.columns,fixture.mask,{random:seeded(3000+index+repeat*100),timeLimitMs:budget});
    const elapsedMs = performance.now()-started;
    if (result.status === 'found') {
      assert.ok(isValidBoard(result.board));
      assert.ok(result.clues.every((value,i)=>Boolean(value)===fixture.mask[i]));
      const verified=countSolutions(fixture.rows,fixture.columns,result.clues,10000);
      assert.equal(verified.status,'complete'); assert.equal(verified.count,1);
    }
    const row={name:fixture.name,repeat,engine,elapsedMs,status:result.status,attempts:result.attempts,timeouts:result.timeouts,
      regions:result.status==='found'?new Set(result.board.regions).size:null,
      maxValue:result.status==='found'?Math.max(...result.board.values):null};
    runs.push(row); console.log(JSON.stringify(row));
  }
}
fs.writeFileSync(new URL('./layout-results.json',import.meta.url),JSON.stringify({node:process.version,budget,repeats,fixtures,runs},null,2)+'\n');
