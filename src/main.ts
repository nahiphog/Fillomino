import './style.css';
import { isValidBoard, type Board } from './generator.ts';
import type { SolveResult } from './solver.ts';
import type { PuzzleWorkerMessage, PuzzleWorkerRequest } from './puzzle.worker.ts';
import { StepPlayback } from './playback.ts';
import type { LayoutWorkerMessage } from './layout.worker.ts';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header><a class="brand" href="./"><span class="brand-mark">f.</span>fillomino<span class="brand-dot">®</span></a><span class="header-note">A LITTLE ROOM FOR LOGIC</span></header>
  <main>
  <section class="workspace" aria-label="Fillomino generator"><aside><div class="section-label">01 / MAKE A GRID</div><h2>Start with a size.</h2><p>Choose your canvas. Generate a puzzle with exactly one solution.</p><label class="mode-label" for="puzzle-mode">Puzzle mode</label><select id="puzzle-mode"><option value="automatic">Automatic digging</option><option value="layout">Choose clue positions</option></select><form id="generate-form"><div class="dimension-inputs"><div><label for="rows">Rows <span>3–15</span></label><div class="size-input"><input id="rows" type="number" min="3" max="15" step="1" value="6" required aria-describedby="size-help"></div></div><div><label for="columns">Columns <span>3–15</span></label><div class="size-input"><input id="columns" type="number" min="3" max="15" step="1" value="6" required aria-describedby="size-help"></div></div></div><div id="size-help" class="hint">Rows × columns · set each dimension separately</div><div id="symmetry-settings"><label class="symmetry-option"><input id="rotational-symmetry" type="checkbox" checked><span>Rotational symmetry</span></label><p class="hint">Clues and blanks match after a half-turn.</p></div><button class="generate" type="submit">Generate <span aria-hidden="true">↗</span></button></form><div id="layout-controls" hidden><p class="layout-help">Click cells to highlight the exact clue positions. Every highlighted cell will contain a number; all other cells will be blank. Your layout is used exactly as selected, without adding symmetric partners.</p><button id="edit-layout" class="create-puzzle" type="button">Edit highlighted cells</button><div class="playback-actions" id="layout-selection-actions"><button id="select-all-cells" type="button">Select all</button><button id="clear-selected-cells" type="button">Clear highlights</button></div></div><button id="create-puzzle" class="create-puzzle" type="button">Create Puzzle</button><div id="digging-hint" class="hint">Dig clues while preserving exactly one solution.</div><div class="digging-controls"><label for="digging-speed">Digging speed</label><select id="digging-speed"><option value="2000">Slow · 2 seconds</option><option value="1000">Relaxed · 1 second</option><option value="250">Normal · 0.25 seconds</option><option value="100">Fast · 0.1 seconds</option><option value="0" selected>Maximum speed</option></select><p class="hint">Time between removals. Difficult checks may take longer.</p><div class="playback-actions"><button id="pause-digging" type="button" disabled>Pause</button><button id="resume-digging" type="button" disabled>Resume</button></div></div><div class="solver-actions"><button id="enter-clues" type="button">Enter clues</button><button id="solve" type="button">Solve</button><button id="cancel" type="button" hidden>Cancel</button></div><button id="clear-clues" class="text-button" type="button" hidden>Clear clues</button><p id="solver-help" class="hint" hidden>Enter numbers in the grid; leave unknown cells blank. Arrow keys move between cells.</p><label class="toggle"><input id="colors" type="checkbox" checked><span>Region colors</span></label><div class="rule-card"><span class="small-label">THE BEAUTY IS IN THE RULES</span><ol><li>Every region is connected edge to edge.</li><li>Each number tells you its region’s size.</li><li>Equal-sized regions never share an edge.</li></ol></div></aside>
  <div class="board-panel"><div class="board-toolbar"><span id="board-title">YOUR COMPLETED GRID</span><span class="valid-badge">✓ Valid solution</span></div><div class="board-wrap"><div id="board" role="table" aria-label="Completed Fillomino grid"></div></div><div class="board-footer"><div id="stats"></div><button id="copy" type="button">Copy grid <span aria-hidden="true">↗</span></button></div><p id="status" role="status" aria-live="polite"></p></div></section>
  <footer><span>Small numbers. Beautiful possibilities.</span><span>FILLOMINO / GRID STUDIO</span></footer></main>`;

const rowsInput = document.querySelector<HTMLInputElement>('#rows')!;
const columnsInput = document.querySelector<HTMLInputElement>('#columns')!;
const validInputs = () => rowsInput.reportValidity() && columnsInput.reportValidity();
const boardElement = document.querySelector<HTMLDivElement>('#board')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
let board: Board = { rows: 6, columns: 6, values: Array(36).fill(0), regions: Array(36).fill(-1) };
let clues: number[] = [];
let editing = false;
let uniquePuzzle = false;
let minimalPuzzle = false;
let worker: Worker | undefined;
let restoreBeforeDigging: (() => void) | undefined;
let playback: StepPlayback<PuzzleWorkerMessage> | undefined;
let diggingStatus = '';
let selectingLayout = false;
let layoutMask: boolean[] = Array(36).fill(false);
const modeInput = document.querySelector<HTMLSelectElement>('#puzzle-mode')!;
const layoutControls = document.querySelector<HTMLElement>('#layout-controls')!;
const editLayoutButton = document.querySelector<HTMLButtonElement>('#edit-layout')!;
const symmetryInput = document.querySelector<HTMLInputElement>('#rotational-symmetry')!;
const speedInput = document.querySelector<HTMLSelectElement>('#digging-speed')!;
const pauseButton = document.querySelector<HTMLButtonElement>('#pause-digging')!;
const resumeButton = document.querySelector<HTMLButtonElement>('#resume-digging')!;
const solveButton = document.querySelector<HTMLButtonElement>('#solve')!;
const editButton = document.querySelector<HTMLButtonElement>('#enter-clues')!;
const clearButton = document.querySelector<HTMLButtonElement>('#clear-clues')!;
const cancelButton = document.querySelector<HTMLButtonElement>('#cancel')!;
const createButton = document.querySelector<HTMLButtonElement>('#create-puzzle')!;

function stopSolving() {
  symmetryInput.disabled = false;
  playback?.dispose(); playback = undefined;
  pauseButton.disabled = true; resumeButton.disabled = true;
  worker?.terminate(); worker = undefined;
  const restore = restoreBeforeDigging;
  restoreBeforeDigging = undefined;
  restore?.();
  cancelButton.hidden = true;
  solveButton.disabled = false;
  createButton.disabled = false;
  editButton.disabled = false;
  clearButton.disabled = false;
  solveButton.disabled = selectingLayout || !!worker;
  layoutControls.querySelectorAll('button').forEach(button => { button.disabled = false; });
  boardElement.querySelectorAll<HTMLButtonElement>('.layout-cell').forEach(button => { button.disabled = false; });
  boardElement.removeAttribute('aria-busy');
}

speedInput.addEventListener('change', () => playback?.setDelay(Number(speedInput.value)));
pauseButton.addEventListener('click', () => {
  if (!playback) return;
  playback.pause();
  pauseButton.disabled = true; resumeButton.disabled = false;
  status.textContent = 'Paused. Change the speed or click Resume to continue digging.';
});
resumeButton.addEventListener('click', () => {
  if (!playback) return;
  pauseButton.disabled = false; resumeButton.disabled = true;
  status.textContent = diggingStatus;
  playback.resume();
});

function draw() {
  const customLayout = modeInput.value === 'layout';
  document.querySelector<HTMLButtonElement>('.generate')!.textContent = customLayout ? 'Generate from highlights' : 'Generate';
  layoutControls.hidden = !customLayout;
  editLayoutButton.hidden = selectingLayout;
  document.querySelector<HTMLElement>('#layout-selection-actions')!.hidden = !selectingLayout;
  document.querySelector<HTMLElement>('#symmetry-settings')!.hidden = customLayout;
  document.querySelector<HTMLElement>('.digging-controls')!.hidden = customLayout;
  document.querySelector<HTMLElement>('#digging-hint')!.hidden = customLayout;
  createButton.hidden = customLayout;
  solveButton.disabled = selectingLayout || !!worker;
  editButton.hidden = selectingLayout;
  solveButton.textContent = editing ? 'Solve' : 'Hide solution';
  document.querySelector('#board-title')!.textContent = editing ? uniquePuzzle ? 'YOUR FILLOMINO PUZZLE' : 'ENTER YOUR CLUES' : 'YOUR COMPLETED GRID';
  const badge = document.querySelector<HTMLElement>('.valid-badge')!;
  badge.textContent = minimalPuzzle ? '✓ Unique · fully dug' : uniquePuzzle ? '✓ Unique solution' : editing ? 'Clue editor' : '✓ Valid solution';
  editButton.textContent = editing ? 'Editing clues' : clues.some(Boolean) ? 'Edit clues' : 'Enter clues';
  clearButton.hidden = !editing || selectingLayout;
  document.querySelector<HTMLElement>('#solver-help')!.hidden = !editing || selectingLayout;
  boardElement.classList.toggle('editing', editing);
  boardElement.classList.toggle('selecting-layout', selectingLayout);
  if (selectingLayout) {
    document.querySelector('#board-title')!.textContent = 'CHOOSE YOUR CLUE POSITIONS';
    badge.textContent = 'Clue layout';
  }

  boardElement.replaceChildren();
  boardElement.style.setProperty('--rows', String(board.rows));
  boardElement.style.setProperty('--columns', String(board.columns));
  document.querySelector<HTMLElement>('.board-wrap')!.style.width = `min(100%, ${445 * board.columns / Math.max(board.rows, board.columns)}px)`;
  boardElement.setAttribute('aria-label', `${editing ? 'Editable' : 'Completed'} ${board.rows} by ${board.columns} Fillomino grid`);
  for (let row = 0; row < board.rows; row++) {
    const rowElement = document.createElement('div');
    rowElement.className = 'board-row';
    rowElement.setAttribute('role', 'row');
    for (let column = 0; column < board.columns; column++) {
      const index = row * board.columns + column;
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.setAttribute('role', 'cell');
      if (selectingLayout) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'layout-cell';
        button.setAttribute('aria-label', `Row ${row + 1}, column ${column + 1} clue position`);
        button.setAttribute('aria-pressed', String(layoutMask[index]));
        button.textContent = layoutMask[index] ? '●' : '';
        button.addEventListener('click', () => {
          layoutMask[index] = !layoutMask[index];
          button.setAttribute('aria-pressed', String(layoutMask[index]));
          button.textContent = layoutMask[index] ? '●' : '';
          updateLayoutStats();
          status.textContent = 'Layout updated. Click Generate from highlights to search for a unique puzzle.';
        });
        cell.append(button);
      } else if (editing) {
        const field = document.createElement('input');
        field.type = 'text'; field.inputMode = 'numeric'; field.autocomplete = 'off';
        field.value = clues[index] ? String(clues[index]) : '';
        field.setAttribute('aria-label', `Row ${row + 1}, column ${column + 1} clue`);
        field.addEventListener('input', () => {
          stopSolving();
          uniquePuzzle = false; minimalPuzzle = false;
          badge.textContent = 'Clue editor';
          document.querySelector('#board-title')!.textContent = 'ENTER YOUR CLUES';
          const valid = field.value === '' || (/^\d+$/.test(field.value) && Number(field.value) >= 1 && Number(field.value) <= board.rows * board.columns);
          field.setCustomValidity(valid ? '' : `Enter a whole number from 1 to ${board.rows * board.columns}, or leave blank.`);
          field.setAttribute('aria-invalid', String(!valid));
          clues[index] = valid ? Number(field.value) : NaN;
          status.textContent = valid ? 'Clues updated. Click Solve when ready.' : field.validationMessage;
        });
        field.addEventListener('keydown', event => {
          const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -board.columns, ArrowDown: board.columns };
          if (!(event.key in offsets)) return;
          event.preventDefault();
          if ((event.key === 'ArrowLeft' && column === 0) || (event.key === 'ArrowRight' && column === board.columns - 1)) return;
          const next = index + offsets[event.key];
          const fields = boardElement.querySelectorAll('input');
          if (next >= 0 && next < fields.length) { fields[next].focus(); fields[next].select(); }
        });
        cell.append(field);
      } else {
        cell.textContent = String(board.values[index]);
        if (clues[index]) { cell.classList.add('given'); cell.setAttribute('aria-label', `${board.values[index]}, given clue`); }
        else if (clues.some(Boolean)) { cell.classList.add('filled'); cell.setAttribute('aria-label', `${board.values[index]}, solver-filled cell`); }
      }
      cell.style.setProperty('--cell-color', `var(--color-${(board.values[index] - 1) % 9})`);
      if (!editing && column < board.columns - 1 && board.regions[index] !== board.regions[index + 1]) cell.classList.add('edge-right');
      if (!editing && row < board.rows - 1 && board.regions[index] !== board.regions[index + board.columns]) cell.classList.add('edge-bottom');
      rowElement.append(cell);
    }
    boardElement.append(rowElement);
  }
  document.querySelector('#stats')!.textContent = editing ? `${board.rows} × ${board.columns} · blanks are unknown` : `${board.rows} × ${board.columns} grid  ·  ${new Set(board.regions).size} regions  ·  ${board.values.length} cells`;
  if (selectingLayout) updateLayoutStats();
}

function updateLayoutStats() {
  document.querySelector('#stats')!.textContent = `${board.rows} × ${board.columns} · ${layoutMask.filter(Boolean).length} highlighted clue positions`;
}

function enterLayout(reset = false) {
  if (!validInputs()) return;
  stopSolving();
  const rows = Number(rowsInput.value), columns = Number(columnsInput.value);
  if (reset || rows !== board.rows || columns !== board.columns) layoutMask = Array(rows * columns).fill(false);
  board = { rows, columns, values: Array(rows * columns).fill(0), regions: Array(rows * columns).fill(-1) };
  clues = Array(rows * columns).fill(0);
  selectingLayout = true; editing = true; uniquePuzzle = false; minimalPuzzle = false;
  draw();
  status.textContent = 'Highlight your chosen clue cells, then click Generate from highlights. You can use Tab and Space to select cells.';
}

modeInput.addEventListener('change', () => {
  if (modeInput.value === 'layout') enterLayout(true);
  else { selectingLayout = false; enterClues(true, false); }
});
editLayoutButton.addEventListener('click', () => enterLayout());
document.querySelector('#select-all-cells')!.addEventListener('click', () => { layoutMask.fill(true); draw(); });
document.querySelector('#clear-selected-cells')!.addEventListener('click', () => { layoutMask.fill(false); draw(); });

function generateFromLayout() {
  if (!validInputs()) return;
  enterLayout();
  if (!layoutMask.some(Boolean)) { status.textContent = 'Highlight at least one cell before generating a puzzle.'; return; }
  const { rows, columns } = board;
  const mask = [...layoutMask];
  cancelButton.hidden = false;
  layoutControls.querySelectorAll('button').forEach(button => { button.disabled = true; });
  boardElement.querySelectorAll<HTMLButtonElement>('.layout-cell').forEach(button => { button.disabled = true; });
  boardElement.setAttribute('aria-busy', 'true');
  status.textContent = 'Searching for a unique puzzle with exactly your highlighted clues…';
  try {
    const layoutWorker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
    worker = layoutWorker;
    layoutWorker.onmessage = (event: MessageEvent<LayoutWorkerMessage>) => {
      if (worker !== layoutWorker) return;
      const message = event.data;
      if (message.type === 'progress') {
        status.textContent = `Searching… ${message.progress.attempts} candidate grids checked; ${message.progress.timeouts} inconclusive checks. Your highlighted positions stay fixed. Search limit: 30 seconds or 1,000 candidates.`;
        return;
      }
      stopSolving();
      if (message.type === 'error') { status.textContent = 'Search could not finish. Your highlights are preserved; please try again.'; return; }
      const result = message.result;
      if (result.status !== 'found') {
        status.textContent = result.status === 'invalid' ? 'Highlight at least one cell and choose valid dimensions.' : `No unique puzzle found within this search (${result.attempts} candidates). This does not prove the layout is impossible. Try again or highlight more cells.`;
        return;
      }
      clues = result.clues;
      selectingLayout = false; editing = true; uniquePuzzle = true; minimalPuzzle = false;
      draw();
      status.textContent = `Unique puzzle found after ${result.attempts} candidates. The ${mask.filter(Boolean).length} highlighted cells are exactly the givens. Click Solve to reveal the solution.`;
    };
    layoutWorker.onerror = () => { stopSolving(); status.textContent = 'Search could not finish. Your highlights are preserved; please try again.'; };
    layoutWorker.postMessage({ rows, columns, mask });
  } catch { stopSolving(); status.textContent = 'Search could not start. Your highlights are preserved.'; }
}

function enterClues(clear = false, focus = true) {
  if (!validInputs()) return;
  stopSolving();
  selectingLayout = false;
  const rows = Number(rowsInput.value), columns = Number(columnsInput.value);
  if (clear || rows !== board.rows || columns !== board.columns) { clues = Array(rows * columns).fill(0); uniquePuzzle = false; minimalPuzzle = false; }
  board = { rows, columns, values: Array(rows * columns).fill(0), regions: Array(rows * columns).fill(-1) };
  editing = true; draw();
  status.textContent = 'Enter your clues, then click Solve. Blank cells will be filled in.';
  if (focus) boardElement.querySelector('input')?.focus();
}
editButton.addEventListener('click', () => enterClues());
clearButton.addEventListener('click', () => enterClues(true));
for (const input of [rowsInput, columnsInput]) {
  input.addEventListener('input', () => {
    if (worker) { stopSolving(); status.textContent = 'Cancelled because the dimensions changed.'; }
  });
  input.addEventListener('change', () => {
    if (rowsInput.checkValidity() && columnsInput.checkValidity()) {
      if (modeInput.value === 'layout') enterLayout(true);
      else enterClues(true, false);
    }
  });
}
cancelButton.addEventListener('click', () => { stopSolving(); status.textContent = 'Cancelled. Your grid and clues are unchanged.'; });
function startDigging(fresh: boolean) {
  if (!validInputs()) return;
  stopSolving();
  const rows = Number(rowsInput.value), columns = Number(columnsInput.value);
  // Use the displayed completion, or generate a fresh one when in the editor.
  const source = !fresh && !editing && board.rows === rows && board.columns === columns ? board : undefined;
  const rotationalSymmetry = symmetryInput.checked;
  symmetryInput.disabled = true;
  const previous = { board, clues, editing, uniquePuzzle, minimalPuzzle };
  restoreBeforeDigging = () => {
    ({ board, clues, editing, uniquePuzzle, minimalPuzzle } = previous);
    draw();
  };
  let previewStarted = false;
  createButton.disabled = true; solveButton.disabled = true; cancelButton.hidden = false;
  editButton.disabled = true; clearButton.disabled = true;
  boardElement.querySelectorAll('input').forEach(field => { field.readOnly = true; });
  boardElement.setAttribute('aria-busy', 'true');
  status.textContent = 'Digging… removing clues only when exactly one solution remains. Difficult checks may take time; Cancel stops the search.';
  diggingStatus = status.textContent;
  pauseButton.disabled = false;
  try {
    worker = new Worker(new URL('./puzzle.worker.ts', import.meta.url), { type: 'module' });
    const diggingWorker = worker;
    let lastRemoved = -1;
    playback = new StepPlayback<PuzzleWorkerMessage>(Number(speedInput.value), message => {
      if (message.type === 'progress') {
        const { checked, removed, pending, round, checkBudgetMs } = message.progress;
        clues = message.progress.clues;
        if (!previewStarted) {
          board = { rows: message.rows, columns: message.columns, values: Array(clues.length).fill(0), regions: Array(clues.length).fill(-1) };
          editing = true; uniquePuzzle = true; minimalPuzzle = false;
          draw();
          boardElement.querySelectorAll('input').forEach(field => { field.readOnly = true; });
          document.querySelector('#board-title')!.textContent = 'DIGGING YOUR PUZZLE';
          document.querySelector<HTMLElement>('#solver-help')!.hidden = true;
          previewStarted = true;
        } else {
          boardElement.querySelectorAll('input').forEach((field, index) => {
            field.value = clues[index] ? String(clues[index]) : '';
          });
        }
        document.querySelector('#stats')!.textContent = `${board.rows} × ${board.columns} · ${clues.length - removed} clues · ${removed} removed`;
        status.textContent = `Digging… ${removed} removed; ${pending} ${rotationalSymmetry ? 'symmetric groups' : 'clues'} still to decide; ${checked} checks. Round ${round || 1}${round > 1 ? ` (retrying with up to ${Math.round(checkBudgetMs / 1000)}s per check)` : ''}.`;
        diggingStatus = status.textContent;
        const changed = removed !== lastRemoved;
        lastRemoved = removed;
        return changed ? 'removal' : 'step';
      }
      if (message.type === 'error') { stopSolving(); status.textContent = message.message; return 'done'; }
      restoreBeforeDigging = undefined;
      stopSolving();
      const result = message.result;
      clues = result.clues;
      board = { rows: message.rows, columns: message.columns, values: Array(clues.length).fill(0), regions: Array(clues.length).fill(-1) };
      editing = true; uniquePuzzle = true; minimalPuzzle = result.minimal; draw();
      status.textContent = result.minimal
        ? `Digging complete: ${clues.length - result.removed} clues, ${result.removed} blanks. Exactly one solution; ${rotationalSymmetry ? 'no further opposite pair or center clue can be removed' : 'no remaining clue can be removed'}. Click Solve to reveal it.`
        : `Digging unfinished: ${result.pending} removal checks remain inconclusive. The puzzle is unique, but minimality is not yet proved.`;
      return 'done';
    }, () => diggingWorker.postMessage({ type: 'next' } satisfies PuzzleWorkerRequest));
    worker.onmessage = (event: MessageEvent<PuzzleWorkerMessage>) => {
      if (worker === diggingWorker) playback?.receive(event.data);
    };
    worker.onerror = () => { stopSolving(); status.textContent = 'Puzzle creation could not finish. Your grid is unchanged; please try again.'; };
    worker.postMessage({ type: 'start', rows, columns, board: source, rotationalSymmetry } satisfies PuzzleWorkerRequest);
  } catch { stopSolving(); status.textContent = 'Puzzle creation could not start in this browser. Your grid is unchanged.'; }
}
createButton.addEventListener('click', () => startDigging(false));
solveButton.addEventListener('click', () => {
  if (!validInputs()) return;
  if (!editing) {
    enterClues(false, false);
    status.textContent = 'Solution hidden. Your original clues and blanks are restored. Click Solve to reveal the solution again.';
    return;
  }
  for (const field of Array.from(boardElement.querySelectorAll('input'))) if (!field.reportValidity()) return;
  if (!clues.some(Boolean)) { status.textContent = 'Enter at least one clue, or use Generate to create a puzzle.'; return; }
  stopSolving();
  solveButton.disabled = true; createButton.disabled = true; cancelButton.hidden = false;
  boardElement.setAttribute('aria-busy', 'true');
  status.textContent = 'Searching for a valid completion…';
  try {
    worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<SolveResult>) => {
      stopSolving();
      const result = event.data;
      if (result.status === 'solved') {
        if (!isValidBoard(result.board) || clues.some((clue, i) => clue && result.board.values[i] !== clue)) {
          status.textContent = 'The solution failed validation. Please try again.'; return;
        }
        board = result.board; editing = false; draw();
        status.textContent = 'Solved! Black numbers are your clues; blue numbers are filled in. ' + (uniquePuzzle ? 'This puzzle has exactly one solution.' : 'One valid solution shown; uniqueness is not checked.');
      } else status.textContent = result.status === 'impossible' ? 'No solution exists for these clues. Edit them and try again.' : result.status === 'timeout' ? 'Search reached the 10-second limit. A solution may still exist; add more clues and try again.' : 'Check your clues: use whole numbers between 1 and the number of cells.';
    };
    worker.onerror = () => { stopSolving(); status.textContent = 'The solver could not finish. Your clues are preserved; please try again.'; };
    worker.postMessage({ rows: board.rows, columns: board.columns, clues: [...clues] });
  } catch { stopSolving(); status.textContent = 'The solver could not start in this browser. Your clues are preserved.'; }
});

document.querySelector('#generate-form')!.addEventListener('submit', event => {
  event.preventDefault();
  if (!validInputs()) return;
  if (modeInput.value === 'layout') generateFromLayout();
  else startDigging(true);
});
document.querySelector('#colors')!.addEventListener('change', event => { boardElement.classList.toggle('no-colors', !(event.target as HTMLInputElement).checked); });
document.querySelector('#copy')!.addEventListener('click', async () => {
  const values = editing ? clues.map(value => Number.isFinite(value) && value > 0 ? value : '.') : board.values;
  const text = Array.from({ length: board.rows }, (_, row) => values.slice(row * board.columns, (row + 1) * board.columns).join(' ')).join('\n');
  try { await navigator.clipboard.writeText(text); status.textContent = 'Grid copied. Numbers are separated by spaces.'; }
  catch { status.textContent = 'Clipboard unavailable. Select the grid’s numbers to copy them.'; }
});
enterClues(true, false);


