import { solveBoard } from './solver.ts';

self.onmessage = (event: MessageEvent<{ size: number; clues: number[] }>) => {
  self.postMessage(solveBoard(event.data.size, event.data.clues));
};
