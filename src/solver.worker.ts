import { solveBoard } from './solver.ts';

self.onmessage = (event: MessageEvent<{ rows: number; columns: number; clues: number[] }>) => {
  self.postMessage(solveBoard(event.data.rows, event.data.columns, event.data.clues));
};
