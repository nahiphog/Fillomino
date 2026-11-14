import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Constraints, newMetrics } from '../src/constraints.ts';
import { analyzeSolutions, countSolutions } from '../src/solver.ts';
import { countSolutions as referenceCount, solveBoard as referenceSolve } from '../benchmarks/reference-solver.ts';
import { generateBoard, isValidBoard } from '../src/generator.ts';
import { seeded } from '../benchmarks/fixtures.ts';

const stateFor = (clues: number[]) => new Constraints(3,3,clues,newMetrics(),()=>{});
test('completed regions exclude their value from neighboring cells', () => {
  const state = stateFor([2,2,0,0,0,0,0,0,0]);
  assert.ok(state.propagate());
  for (const i of [2,3,4]) assert.equal(state.has(i,2), false);
  assert.ok(state.metrics.removals.completedRegion > 0);
});
test('oversized fixed components immediately contradict', () => {
  const state = stateFor([2,2,2,0,0,0,0,0,0]);
  assert.equal(state.propagate(),false);
});
test('merge prevention counts distinct fixed components', () => {
  const state = stateFor([3,0,3,3,0,3,0,0,0]);
  state.propagate();
  assert.equal(state.has(1,3),false);
  assert.ok(state.metrics.removals.forcedMerge > 0);
  const same = stateFor([4,4,0,4,0,0,0,0,0]);
  assert.ok(same.propagate());
  assert.ok(same.has(4,4), 'Two neighbors of one component must not be counted twice');
});
test('too-small eligible areas lose the candidate even without a clue', () => {
  const state = stateFor(Array(9).fill(0));
  for (const i of [2,4,5,6,7,8]) state.remove(i,4,'branch');
  assert.ok(state.propagate());
  for (const i of [0,1,3]) assert.equal(state.has(i,4),false);
  assert.ok(state.metrics.removals.insufficientSpace > 0);
});
test('exact-fit expansion and bottleneck growth force cells without branching', () => {
  const exact = stateFor([4,4,1,4,0,0,1,0,0]);
  assert.ok(exact.propagate());
  assert.equal(exact.fixed[4],4);
  assert.ok(exact.metrics.removals.exactFit > 0);
  const bottleneck = stateFor([3,0,0,1,0,0,0,0,0]);
  assert.ok(bottleneck.propagate());
  assert.equal(bottleneck.fixed[1],3);
  assert.ok(bottleneck.metrics.removals.bottleneck > 0);
});
test('a single remaining candidate becomes fixed and undo restores every domain', () => {
  const state = stateFor(Array(9).fill(0));
  assert.ok(state.propagate());
  const before = { domains:[...state.domains],lengths:[...state.lengths],fixed:[...state.fixed] };
  const mark = state.trail.length;
  for (let n=2;n<=9;n++) assert.ok(state.remove(0,n,'insufficientSpace'));
  assert.equal(state.fixed[0],1);
  assert.ok(state.propagate());
  assert.equal(state.has(1,1),false);
  state.undo(mark);
  assert.deepEqual({domains:[...state.domains],lengths:[...state.lengths],fixed:[...state.fixed]},before);
  // Undo also repairs a branch that has emptied a domain.
  assert.ok(state.assign(0,1,'branch'));
  assert.equal(state.remove(0,1,'branch'),false);
  state.undo(mark);
  assert.deepEqual([...state.domains],before.domains);
  assert.deepEqual([...state.fixed],before.fixed);
});
test('large exact-fit puzzles are proved unique without search branches', () => {
  const {result,metrics} = analyzeSolutions(15,15,[225,...Array(224).fill(0)]);
  assert.equal(result.status,'complete'); assert.equal(result.count,1);
  assert.equal(metrics.branches,0);
  assert.equal(metrics.forcedAssignments,224);
});
test('propagation retains known solutions and agrees with the previous solver', () => {
  const random = seeded(918);
  for (let sample=0;sample<100;sample++) {
    const rows=3+sample%3,columns=3+Math.floor(sample/3)%3;
    const board=generateBoard(rows,columns,random);
    const clues=board.values.map(v=>random()<.6?v:0);
    const state=new Constraints(rows,columns,clues,newMetrics(),()=>{});
    assert.ok(state.propagate());
    assert.ok(board.values.every((v,i)=>state.has(i,v)));
    // An alternative completion must also survive propagation.
    const alternative=referenceSolve(rows,columns,clues,1000);
    assert.equal(alternative.status,'solved');
    if(alternative.status==='solved') assert.ok(alternative.board.values.every((v,i)=>state.has(i,v)));
    const old=referenceCount(rows,columns,clues,1000);
    const pure=analyzeSolutions(rows,columns,clues,{timeLimitMs:1000,regionProbeMs:0}).result;
    const hybrid=countSolutions(rows,columns,clues,1000);
    assert.equal(old.status,'complete'); assert.equal(pure.status,'complete'); assert.equal(hybrid.status,'complete');
    assert.equal(pure.count,old.count); assert.equal(hybrid.count,old.count);
    if(pure.status==='complete'&&pure.board) assert.ok(isValidBoard(pure.board));
  }
});
test('a timeout after the first solution remains inconclusive', () => {
  // An injected monotonic clock gives deterministic deadlines, without wall-clock flakiness.
  const clues=Array(9).fill(0);
  let ticks=0;
  analyzeSolutions(3,3,clues,{limit:1,regionProbeMs:0,timeLimitMs:1e9,now:()=>ticks++});
  const firstSolutionTicks=ticks;
  ticks=0;
  const partial=analyzeSolutions(3,3,clues,{limit:2,regionProbeMs:0,timeLimitMs:firstSolutionTicks-1,now:()=>ticks++}).result;
  assert.equal(partial.status,'timeout'); assert.equal(partial.count,1);
  assert.equal(countSolutions(3,3,clues).count,2);
});
