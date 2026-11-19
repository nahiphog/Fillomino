import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StepPlayback } from '../src/playback.ts';
import { generateBoard } from '../src/generator.ts';
import type { PuzzleWorkerMessage, PuzzleWorkerRequest } from '../src/puzzle.worker.ts';

test('pause freezes scheduled steps; changing speed while paused does not resume', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0;
  const shown: string[] = [];
  const playback = new StepPlayback<string>(1000, message => { shown.push(message); return 'removal'; }, () => requests++);
  playback.receive('full grid');
  t.mock.timers.tick(100);
  playback.pause();
  playback.setDelay(250);
  t.mock.timers.tick(5000);
  assert.equal(requests, 0);
  playback.resume();
  t.mock.timers.tick(249);
  assert.equal(requests, 0);
  t.mock.timers.tick(1);
  assert.equal(requests, 1);
  assert.deepEqual(shown, ['full grid']);
  playback.dispose();
});

test('an in-flight result is held while paused and resumed exactly once', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0;
  const shown: string[] = [];
  const playback = new StepPlayback<string>(100, message => { shown.push(message); return 'removal'; }, () => requests++);
  playback.receive('full grid');
  t.mock.timers.tick(100);
  playback.pause();
  playback.receive('one removed');
  t.mock.timers.tick(5000);
  assert.deepEqual(shown, ['full grid']);
  assert.equal(requests, 1);
  playback.resume(); playback.resume();
  assert.deepEqual(shown, ['full grid', 'one removed']);
  t.mock.timers.tick(100);
  assert.equal(requests, 2);
  playback.dispose();
});

test('speed changes reschedule the wait; disposal discards pending results and timers', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0, shown = 0;
  const playback = new StepPlayback<string>(2000, () => { shown++; return 'removal'; }, () => requests++);
  playback.receive('first');
  playback.setDelay(100);
  t.mock.timers.tick(100);
  assert.equal(requests, 1);
  playback.pause(); playback.receive('pending');
  playback.dispose(); playback.resume(); playback.receive('stale');
  t.mock.timers.tick(10000);
  assert.equal(shown, 1);
  assert.equal(requests, 1);
});

test('completion is held during pause and schedules no further work', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let complete = false, requests = 0;
  const playback = new StepPlayback<string>(0, () => { complete = true; return 'done'; }, () => requests++);
  playback.pause(); playback.receive('complete');
  assert.equal(complete, false);
  playback.resume();
  assert.equal(complete, true);
  t.mock.timers.tick(1000);
  assert.equal(requests, 0);
});

test('worker advances only when requested and still finishes a unique minimal puzzle', async () => {
  const messages: PuzzleWorkerMessage[] = [];
  const scope = { postMessage: (message: PuzzleWorkerMessage) => messages.push(message), onmessage: (_event: { data: PuzzleWorkerRequest }) => {} };
  Object.assign(globalThis, { self: scope });
  await import('../src/puzzle.worker.ts');
  const board = generateBoard(3, 3, () => 0.4);
  scope.onmessage({ data: { type: 'start', rows: 3, columns: 3, board } });
  assert.equal(messages.length, 1);
  const first = messages[0];
  assert.equal(first.type, 'progress');
  if (first.type === 'progress') assert.deepEqual(first.progress.clues, board.values);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(messages.length, 1, 'Worker must wait for the next request');
  for (let i = 0; i < 100 && messages.at(-1)?.type === 'progress'; i++) {
    const before = messages.length;
    scope.onmessage({ data: { type: 'next' } });
    assert.equal(messages.length, before + 1);
  }
  const last = messages.at(-1)!;
  assert.equal(last.type, 'complete');
  if (last.type === 'complete') assert.equal(last.result.minimal, true);
  const count = messages.length;
  scope.onmessage({ data: { type: 'next' } });
  assert.equal(messages.length, count, 'No duplicate completion');
});
