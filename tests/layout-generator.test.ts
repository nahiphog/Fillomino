import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLayoutBoard, mergeLayoutRegions } from '../src/layout-generator.ts';
import { isValidBoard } from '../src/generator.ts';
import { createLayoutPuzzle } from '../src/layout.ts';
import { countSolutions } from '../src/solver.ts';

function seeded(seed: number) {
  return () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
}

test('clue-aware growth and rectangular partitions stay valid through merges', () => {
  for (const [rows,columns] of [[3,3],[3,8],[8,3],[10,10],[15,15]]) for (let seed=1;seed<=15;seed++) {
    const random=seeded(seed), mask=Array.from({length:rows*columns},()=>random()<.3); mask[0]=true;
    for (const rectangular of [false,true]) {
      let board=generateLayoutBoard(rows,columns,mask,random,rectangular);
      assert.ok(isValidBoard(board));
      const ids=new Set(board.regions);
      for(const id of ids) assert.ok(board.regions.some((region,i)=>region===id&&mask[i]));
      for(let step=0;step<5;step++) {
        const original=structuredClone(board), merged=mergeLayoutRegions(board,random);
        assert.deepEqual(board,original);
        if(!merged) break;
        assert.ok(isValidBoard(merged));
        assert.ok(new Set(merged.regions).size>=2);
        assert.ok(new Set(merged.regions).size<new Set(board.regions).size);
        board=merged;
      }
    }
  }
});

test('duplicate ambiguous clue patterns are skipped, but timed-out ones are retried', () => {
  const board=generateLayoutBoard(3,3,Array(9).fill(true),seeded(4));
  for(const response of [{status:'complete',count:2},{status:'timeout',count:1}] as const) {
    let calls=0;
    const result=createLayoutPuzzle(3,3,Array(9).fill(true),{maxAttempts:20,generate:()=>board,check:()=>{calls++;return response;}});
    assert.equal(result.status,'not-found'); assert.equal(result.attempts,20);
    assert.equal(calls,response.status==='complete'?1:20);
  }
});

test('short and periodic full checks both preserve the uniqueness requirement', () => {
  const board=generateLayoutBoard(3,3,Array(9).fill(true),seeded(5));
  const budgets:number[]=[];
  const result=createLayoutPuzzle(3,3,Array(9).fill(true),{maxAttempts:13,generate:()=>board,
    check:(_r,_c,_clues,budget)=>{budgets.push(budget!);return {status:'timeout',count:1};}});
  assert.equal(result.status,'not-found');
  assert.deepEqual(budgets, [...Array(11).fill(25),500,25]);
});

test('improved search preserves arbitrary masks and agrees with full solution counting', () => {
  for(let seed=1;seed<=20;seed++) {
    const random=seeded(seed), mask=Array.from({length:12},()=>random()<.5);mask[0]=true;
    const result=createLayoutPuzzle(3,4,mask,{random,timeLimitMs:1500,maxAttempts:500});
    assert.equal(result.status,'found');
    if(result.status!=='found') continue;
    assert.ok(result.clues.every((value,i)=>Boolean(value)===mask[i]));
    const verified=countSolutions(3,4,result.clues);
    assert.equal(verified.status,'complete');assert.equal(verified.count,1);
  }
});
