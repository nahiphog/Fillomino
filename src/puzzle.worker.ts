import { generateBoard, type Board } from './generator.ts';
import { digPuzzle, type PuzzleProgress, type PuzzleResult } from './puzzle.ts';

export type PuzzleWorkerMessage =
  | { type: 'progress'; rows: number; columns: number; progress: PuzzleProgress }
  | { type: 'complete'; rows: number; columns: number; result: PuzzleResult }
  | { type: 'error'; message: string };

self.onmessage = async (event: MessageEvent<{ rows: number; columns: number; board?: Board }>) => {
  try {
    const board = event.data.board ?? generateBoard(event.data.rows, event.data.columns);
    const steps = digPuzzle(board);
    let step = steps.next();
    let lastRemoved = -1;
    while (!step.done) {
      const progress = step.value;
      self.postMessage({ type: 'progress', rows: board.rows, columns: board.columns, progress } satisfies PuzzleWorkerMessage);
      if (progress.removed !== lastRemoved) {
        // Leave each accepted removal on screen long enough to see it, even
        // on tiny puzzles whose uniqueness checks finish within one frame.
        await new Promise(resolve => setTimeout(resolve, lastRemoved < 0 ? 350 : 100));
        lastRemoved = progress.removed;
      }
      step = steps.next();
    }
    const result = step.value;
    self.postMessage({ type: 'complete', rows: board.rows, columns: board.columns, result } satisfies PuzzleWorkerMessage);
  } catch {
    self.postMessage({ type: 'error', message: 'Unable to create a puzzle. Your grid is unchanged; please try again.' } satisfies PuzzleWorkerMessage);
  }
};
