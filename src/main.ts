import './style.css';
import { generateBoard, isValidBoard, type Board } from './generator.ts';
import type { SolveResult } from './solver.ts';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header><a class="brand" href="./"><span class="brand-mark">f.</span>fillomino<span class="brand-dot">®</span></a><span class="header-note">A LITTLE ROOM FOR LOGIC</span></header>
  <main><section class="intro"><div class="eyebrow"><span></span> THE NUMBER REGION PUZZLE</div><h1>Everything has<br>its <em>place.</em></h1><p>A grid of numbers. A collection of regions.<br>A satisfying little world where everything fits.</p></section>
  <section class="workspace" aria-label="Fillomino generator"><aside><div class="section-label">01 / MAKE A GRID</div><h2>Start with a size.</h2><p>Choose your canvas. We’ll fill it with a complete, valid Fillomino solution.</p><form id="generate-form"><label for="size">Grid size <span>3–15</span></label><div class="size-input"><input id="size" type="number" min="3" max="15" step="1" value="6" required aria-describedby="size-help"><span id="dimensions">× 6</span></div><div id="size-help" class="hint">Rows × columns · always square</div><button class="generate" type="submit">Generate <span aria-hidden="true">↗</span></button></form><div class="solver-actions"><button id="enter-clues" type="button">Enter clues</button><button id="solve" type="button">Solve</button><button id="cancel" type="button" hidden>Cancel</button></div><button id="clear-clues" class="text-button" type="button" hidden>Clear clues</button><p id="solver-help" class="hint" hidden>Enter numbers in the grid; leave unknown cells blank. Arrow keys move between cells.</p><label class="toggle"><input id="colors" type="checkbox" checked><span>Region colors</span></label><div class="rule-card"><span class="small-label">THE BEAUTY IS IN THE RULES</span><ol><li>Every region is connected edge to edge.</li><li>Each number tells you its region’s size.</li><li>Equal-sized regions never share an edge.</li></ol></div></aside>
  <div class="board-panel"><div class="board-toolbar"><span id="board-title">YOUR COMPLETED GRID</span><span class="valid-badge">✓ Valid solution</span></div><div class="board-wrap"><div id="board" role="table" aria-label="Completed Fillomino grid"></div></div><div class="board-footer"><div id="stats"></div><button id="copy" type="button">Copy grid <span aria-hidden="true">↗</span></button></div><p id="status" role="status" aria-live="polite"></p></div></section>
  <footer><span>Small numbers. Beautiful possibilities.</span><span>FILLOMINO / GRID STUDIO</span></footer></main>`;

const input = document.querySelector<HTMLInputElement>('#size')!;
const boardElement = document.querySelector<HTMLDivElement>('#board')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
let board: Board;
let clues: number[] = [];
let editing = false;
let worker: Worker | undefined;
const solveButton = document.querySelector<HTMLButtonElement>('#solve')!;
const editButton = document.querySelector<HTMLButtonElement>('#enter-clues')!;
const clearButton = document.querySelector<HTMLButtonElement>('#clear-clues')!;
const cancelButton = document.querySelector<HTMLButtonElement>('#cancel')!;

function stopSolving() {
  worker?.terminate(); worker = undefined;
  cancelButton.hidden = true;
  solveButton.disabled = false;
  boardElement.removeAttribute('aria-busy');
}

function draw() {
  document.querySelector('#board-title')!.textContent = editing ? 'ENTER YOUR CLUES' : 'YOUR COMPLETED GRID';
  const badge = document.querySelector<HTMLElement>('.valid-badge')!;
  badge.textContent = editing ? 'Clue editor' : '✓ Valid solution';
  editButton.textContent = editing ? 'Editing clues' : clues.some(Boolean) ? 'Edit clues' : 'Enter clues';
  clearButton.hidden = !editing;
  document.querySelector<HTMLElement>('#solver-help')!.hidden = !editing;
  boardElement.classList.toggle('editing', editing);

  boardElement.replaceChildren();
  boardElement.style.setProperty('--size', String(board.size));
  boardElement.setAttribute('aria-label', `${editing ? 'Editable' : 'Completed'} ${board.size} by ${board.size} Fillomino grid`);
  for (let row = 0; row < board.size; row++) {
    const rowElement = document.createElement('div');
    rowElement.className = 'board-row';
    rowElement.setAttribute('role', 'row');
    for (let column = 0; column < board.size; column++) {
      const index = row * board.size + column;
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.setAttribute('role', 'cell');
      if (editing) {
        const field = document.createElement('input');
        field.type = 'text'; field.inputMode = 'numeric'; field.autocomplete = 'off';
        field.value = clues[index] ? String(clues[index]) : '';
        field.setAttribute('aria-label', `Row ${row + 1}, column ${column + 1} clue`);
        field.addEventListener('input', () => {
          stopSolving();
          const valid = field.value === '' || (/^\d+$/.test(field.value) && Number(field.value) >= 1 && Number(field.value) <= board.size ** 2);
          field.setCustomValidity(valid ? '' : `Enter a whole number from 1 to ${board.size ** 2}, or leave blank.`);
          field.setAttribute('aria-invalid', String(!valid));
          clues[index] = valid ? Number(field.value) : NaN;
          status.textContent = valid ? 'Clues updated. Click Solve when ready.' : field.validationMessage;
        });
        field.addEventListener('keydown', event => {
          const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -board.size, ArrowDown: board.size };
          if (!(event.key in offsets)) return;
          event.preventDefault();
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
      if (!editing && column < board.size - 1 && board.regions[index] !== board.regions[index + 1]) cell.classList.add('edge-right');
      if (!editing && row < board.size - 1 && board.regions[index] !== board.regions[index + board.size]) cell.classList.add('edge-bottom');
      rowElement.append(cell);
    }
    boardElement.append(rowElement);
  }
  document.querySelector('#stats')!.textContent = editing ? `${board.size} × ${board.size} · blanks are unknown` : `${board.size} × ${board.size} grid  ·  ${new Set(board.regions).size} regions  ·  ${board.values.length} cells`;
}

function render() {
  stopSolving();
  board = generateBoard(Number(input.value));
  if (!isValidBoard(board)) throw new Error('The generated grid did not pass validation. Please try again.');
  clues = Array(board.size ** 2).fill(0); editing = false; draw();
}

function enterClues(clear = false) {
  if (!input.reportValidity()) return;
  stopSolving();
  const size = Number(input.value);
  if (clear || size !== board.size) clues = Array(size ** 2).fill(0);
  board = { size, values: Array(size ** 2).fill(0), regions: Array(size ** 2).fill(-1) };
  editing = true; draw();
  status.textContent = 'Enter your clues, then click Solve. Blank cells will be filled in.';
  boardElement.querySelector('input')?.focus();
}
editButton.addEventListener('click', () => enterClues());
clearButton.addEventListener('click', () => enterClues(true));
input.addEventListener('change', () => { if (input.checkValidity()) enterClues(true); });
cancelButton.addEventListener('click', () => { stopSolving(); status.textContent = 'Search cancelled. Your clues are unchanged.'; });
solveButton.addEventListener('click', () => {
  if (!editing) { enterClues(); return; }
  for (const field of Array.from(boardElement.querySelectorAll('input'))) if (!field.reportValidity()) return;
  if (!clues.some(Boolean)) { status.textContent = 'Enter at least one clue, or use Generate for a completed grid.'; return; }
  stopSolving();
  solveButton.disabled = true; cancelButton.hidden = false;
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
        status.textContent = 'Solved! Black numbers are your clues; blue numbers are filled in. One valid solution shown; uniqueness is not checked.';
      } else status.textContent = result.status === 'impossible' ? 'No solution exists for these clues. Edit them and try again.' : result.status === 'timeout' ? 'Search reached the 10-second limit. A solution may still exist; add more clues and try again.' : 'Check your clues: use whole numbers between 1 and the number of cells.';
    };
    worker.onerror = () => { stopSolving(); status.textContent = 'The solver could not finish. Your clues are preserved; please try again.'; };
    worker.postMessage({ size: board.size, clues: [...clues] });
  } catch { stopSolving(); status.textContent = 'The solver could not start in this browser. Your clues are preserved.'; }
});

input.addEventListener('input', () => { document.querySelector('#dimensions')!.textContent = `× ${input.value || '—'}`; });
document.querySelector('#generate-form')!.addEventListener('submit', event => {
  event.preventDefault();
  if (!input.reportValidity()) return;
  try { render(); status.textContent = 'New grid generated. All regions checked and valid.'; }
  catch (error) { status.textContent = error instanceof Error ? error.message : 'Unable to generate grid.'; }
});
document.querySelector('#colors')!.addEventListener('change', event => { boardElement.classList.toggle('no-colors', !(event.target as HTMLInputElement).checked); });
document.querySelector('#copy')!.addEventListener('click', async () => {
  const values = editing ? clues.map(value => Number.isFinite(value) && value > 0 ? value : '.') : board.values;
  const text = Array.from({ length: board.size }, (_, row) => values.slice(row * board.size, (row + 1) * board.size).join(' ')).join('\n');
  try { await navigator.clipboard.writeText(text); status.textContent = 'Grid copied. Numbers are separated by spaces.'; }
  catch { status.textContent = 'Clipboard unavailable. Select the grid’s numbers to copy them.'; }
});
render();

