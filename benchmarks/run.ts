import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fixtures } from './fixtures.ts';
import { searchSolutions as reference } from './reference-solver.ts';
import { analyzeSolutions } from '../src/solver.ts';
import { isValidBoard } from '../src/generator.ts';

const budgetMs = Number(process.env.BENCH_BUDGET_MS ?? 1000);
const repeats = Number(process.env.BENCH_REPEATS ?? 3);
const cases = fixtures();
const results: object[] = [];
// Small warm-up for both engines; measured cases are identical and deterministic.
for (let i = 0; i < 3; i++) {
  reference(3,3,[9,...Array(8).fill(0)],budgetMs,2);
  analyzeSolutions(3,3,[9,...Array(8).fill(0)],{ timeLimitMs:budgetMs });
}
for (const fixture of cases) for (const limit of [1,2] as const) {
  const runs: Record<string, unknown>[] = [];
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const engine of repeat % 2 ? ['improved','reference'] : ['reference','improved']) {
      const start = performance.now();
      const oldMetrics = { nodes:0, branches:0, shapes:0 };
      const analysis = engine === 'improved' ? analyzeSolutions(fixture.rows,fixture.columns,fixture.clues,{timeLimitMs:budgetMs,limit}) : undefined;
      const result = analysis?.result ?? reference(fixture.rows,fixture.columns,fixture.clues,budgetMs,limit,oldMetrics);
      const ms = performance.now() - start;
      if (result.status === 'complete' && result.board) {
        assert.ok(isValidBoard(result.board));
        assert.ok(fixture.clues.every((v,i)=>!v || result.board!.values[i] === v));
      }
      runs.push({engine,repeat,ms,status:result.status,count:result.count,metrics:analysis?.metrics ?? oldMetrics});
    }
  }
  const completed = runs.filter(run=>run.status==='complete');
  if (completed.length) assert.ok(completed.every(run=>run.count===completed[0].count), `Count disagreement: ${fixture.name}`);
  const summary: Record<string, unknown> = { name:fixture.name,mode:limit===1?'solve':'count',runs };
  for (const engine of ['reference','improved']) {
    const entries = runs.filter(run=>run.engine===engine);
    const times = entries.map(run=>Number(run.ms)).sort((a,b)=>a-b);
    summary[engine] = { medianMs:times[Math.floor(times.length/2)],timeouts:entries.filter(run=>run.status==='timeout').length,
      branches:(entries[0].metrics as {branches:number}).branches,count:entries[0].count,status:entries[0].status };
  }
  results.push(summary);
  console.log(JSON.stringify({name:summary.name,mode:summary.mode,reference:summary.reference,improved:summary.improved}));
}
const report = { node:process.version,cpu:os.cpus()[0]?.model,platform:process.platform,budgetMs,repeats,fixtures:cases,results };
fs.writeFileSync('benchmarks/results.json',JSON.stringify(report,null,2)+'\n');
