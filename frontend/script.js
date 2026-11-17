"use strict";

/* =====================================================
   Tower of Hanoi - frontend logic
   - Auto-solve mode: moves come from the Prolog server
   - Play mode: the player moves the disks (click or drag)
   ===================================================== */

// ---------- Settings ----------
const API_URL = "http://localhost:8000";   // Prolog server address
const DISK_H = 24;                          // vertical space per disk (px)
const BASE_H = 16;                          // height of the wooden base (px)
const LIFT_Y = 12;                          // height where disks travel (px from top)
const PEG_NAMES = ["left", "middle", "right"];
const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e",
                "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"];

// ---------- Page elements ----------
const $ = (id) => document.getElementById(id);
const board = $("board");
const zones = document.querySelectorAll(".zone");
const diskSelect = $("diskSelect");
const movesEl = $("moves");
const minMovesEl = $("minMoves");
const messageEl = $("message");
const startBtn = $("startBtn");
const pauseBtn = $("pauseBtn");
const speedInput = $("speed");
const winBox = $("win");
const tutorial = $("tutorial");

// ---------- Game state ----------
let mode = "auto";        // "auto" or "play"
let n = 3;                // number of disks
let pegs = [[], [], []];  // each peg = array of disk sizes, bottom -> top
let diskEls = [];         // diskEls[size] = the HTML element of that disk
let moveCount = 0;

let solution = null;      // moves received from Prolog
let solutionFor = 0;      // disk count the solution belongs to
let autoIndex = 0;        // next move to play in auto mode
let running = false;
let paused = false;

let busy = false;         // true while an animation is running
let selected = null;      // peg index chosen by clicking (play mode)
let won = false;
let drag = null;          // info about the current drag
let runToken = 0;         // changes on reset to cancel old animations

// ---------- Small helpers ----------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const topOf = (p) => pegs[p][pegs[p].length - 1];   // undefined if peg is empty
const stepMs = () => 600 - (Number(speedInput.value) - 1) * 60;  // 600..60 ms
const minMoves = () => 2 ** n - 1;

function setMessage(text) { messageEl.textContent = text; }

// ---------- Geometry (positions in pixels) ----------
const boardW = () => board.clientWidth;
const baseY = () => board.clientHeight - BASE_H;
const pegX = (p) => (boardW() * (2 * p + 1)) / 6;          // center of peg p
const yFor = (idx) => baseY() - (idx + 1) * DISK_H + 2;     // top of disk at height idx

function diskW(size) {
  const maxW = boardW() / 3 - 16;
  const minW = 30;
  return minW + (maxW - minW) * (size / n);
}

function setTransform(el, x, y, ms) {
  el.style.transition = ms > 0 ? `transform ${ms}ms ease-in-out` : "none";
  el.style.transform = `translate(${x}px, ${y}px)`;
}

// Put a disk at its normal place (or lifted above its peg).
function place(size, peg, idx, ms, lifted = false) {
  const x = pegX(peg) - diskW(size) / 2;
  const y = lifted ? LIFT_Y : yFor(idx);
  setTransform(diskEls[size], x, y, ms);
}

// Put every disk where the "pegs" array says it should be.
function layout(ms = 0) {
  for (let p = 0; p < 3; p++) {
    pegs[p].forEach((size, idx) => {
      diskEls[size].style.width = diskW(size) + "px";
      place(size, p, idx, ms);
    });
  }
}

// ---------- Setup / reset ----------
function buildDisks() {
  board.querySelectorAll(".disk").forEach((el) => el.remove());
  diskEls = [];
  for (let size = n; size >= 1; size--) {
    const el = document.createElement("div");
    el.className = "disk";
    el.dataset.size = size;
    el.textContent = size;
    el.style.background = COLORS[(size - 1) % COLORS.length];
    el.addEventListener("pointerdown", onDiskPointerDown);
    el.addEventListener("pointermove", onDiskPointerMove);
    el.addEventListener("pointerup", onDiskPointerUp);
    el.addEventListener("pointercancel", onDiskPointerCancel);
    board.appendChild(el);
    diskEls[size] = el;
  }
}

function resetGame() {
  runToken++;                       // cancels any animation still running
  n = Number(diskSelect.value);
  pegs = [[], [], []];
  for (let size = n; size >= 1; size--) pegs[0].push(size);

  if (solutionFor !== n) solution = null;
  autoIndex = 0;
  moveCount = 0;
  running = false;
  paused = false;
  busy = false;
  selected = null;
  won = false;
  drag = null;
  winBox.hidden = true;

  buildDisks();
  layout(0);
  updateStats();
  updateButtons();
  setMessage(mode === "auto"
    ? "Press “Solve / Start” to let Prolog solve it."
    : "Your turn! Move all disks to the right peg.");
}

function setMode(newMode) {
  mode = newMode;
  $("tabAuto").classList.toggle("active", mode === "auto");
  $("tabPlay").classList.toggle("active", mode === "play");
  $("autoControls").hidden = mode !== "auto";
  $("playControls").hidden = mode !== "play";
  board.classList.toggle("mode-play", mode === "play");
  resetGame();
}

function updateStats() {
  movesEl.textContent = moveCount;
  minMovesEl.textContent = minMoves();
}

function updateButtons() {
  const finished = solution !== null && autoIndex >= solution.length;
  startBtn.disabled = running || finished;
  pauseBtn.disabled = !running;
  startBtn.textContent = autoIndex > 0 && !finished ? "▶ Resume" : "▶ Solve / Start";
}

// ---------- Moving one disk (used by both modes) ----------
// direct = true: slide straight to the target (used after a drag)
async function moveDisk(from, to, ms, direct = false) {
  const token = runToken;
  const size = pegs[from].pop();
  const targetIdx = pegs[to].length;
  pegs[to].push(size);

  const el = diskEls[size];
  const w = diskW(size);
  const xFrom = pegX(from) - w / 2;
  const xTo = pegX(to) - w / 2;
  el.style.zIndex = 5;

  if (direct) {
    setTransform(el, xTo, yFor(targetIdx), ms);
    await sleep(ms);
  } else {
    setTransform(el, xFrom, LIFT_Y, ms);        // 1. lift up
    await sleep(ms);
    setTransform(el, xTo, LIFT_Y, ms);          // 2. slide across
    await sleep(ms);
    setTransform(el, xTo, yFor(targetIdx), ms); // 3. drop down
    await sleep(ms);
  }

  if (token !== runToken) return false;         // game was reset meanwhile
  el.style.zIndex = "";
  el.classList.remove("selected");
  moveCount++;
  updateStats();
  return true;
}

// ---------- Auto-solve mode (moves come from Prolog) ----------
async function fetchSolution(count) {
  const response = await fetch(`${API_URL}/solve?disks=${count}`);
  if (!response.ok) throw new Error("Server answered with status " + response.status);
  const data = await response.json();
  return data.moves;
}

async function startAuto() {
  if (running) return;
  const token = runToken;

  if (solution === null) {
    try {
      setMessage("Asking the Prolog server for the solution…");
      const moves = await fetchSolution(n);
      if (token !== runToken) return;           // user reset while waiting
      solution = moves;
      solutionFor = n;
    } catch (error) {
      setMessage("❌ Cannot reach the Prolog server. Is it running on port 8000?");
      return;
    }
  }

  running = true;
  paused = false;
  updateButtons();
  setMessage(`Solving… (${solution.length} moves from Prolog)`);

  while (autoIndex < solution.length) {
    if (paused || token !== runToken) break;
    const move = solution[autoIndex];
    const ok = await moveDisk(PEG_NAMES.indexOf(move.from),
                              PEG_NAMES.indexOf(move.to), stepMs());
    if (!ok) return;
    autoIndex++;
  }

  if (token !== runToken) return;
  running = false;
  updateButtons();
  setMessage(autoIndex >= solution.length
    ? `✅ Solved in ${solution.length} moves!`
    : "⏸ Paused. Press Resume to continue.");
}

function pauseAuto() {
  paused = true;
  pauseBtn.disabled = true;
}

// ---------- Play mode: rules ----------
function clearSelection() {
  if (selected !== null) {
    const size = topOf(selected);
    if (size !== undefined) diskEls[size].classList.remove("selected");
    selected = null;
  }
}

function flashError(text) {
  setMessage(text);
  board.classList.add("shake");
  setTimeout(() => board.classList.remove("shake"), 400);
}

// Check the rules, then move the disk if the move is legal.
async function tryMove(from, to, direct = false) {
  if (from === to) {                      // dropped on the same peg
    clearSelection();
    layout(150);
    return;
  }
  const size = topOf(from);
  if (size === undefined) {
    setMessage("That peg is empty.");
    return;
  }
  const targetTop = topOf(to);
  if (targetTop !== undefined && targetTop < size) {   // RULE: no big on small
    clearSelection();
    layout(150);                                       // snap disk back
    flashError("🚫 You can't put a bigger disk on a smaller one!");
    return;
  }

  clearSelection();
  busy = true;
  const ok = await moveDisk(from, to, 170, direct);
  if (!ok) return;
  busy = false;
  setMessage("Good move!");

  if (pegs[2].length === n) showWin();
}

function handlePegClick(p) {
  if (mode !== "play" || busy || won) return;

  if (selected === null) {                // first click: pick up top disk
    if (pegs[p].length === 0) {
      setMessage("That peg is empty. Pick a peg that has a disk.");
      return;
    }
    selected = p;
    const size = topOf(p);
    diskEls[size].classList.add("selected");
    place(size, p, pegs[p].length - 1, 150, true);   // lift it
    setMessage("Now click the peg where it should go.");
  } else if (selected === p) {            // click the same peg: put it back
    clearSelection();
    layout(150);
    setMessage("Disk put back.");
  } else {                                // second click: try to move
    tryMove(selected, p);
  }
}

function showWin() {
  won = true;
  const perfect = moveCount === minMoves();
  $("winText").textContent =
    `You moved ${n} disks in ${moveCount} moves. ` +
    (perfect ? "That is the perfect minimum! 🏆"
             : `The minimum possible is ${minMoves()}.`);
  winBox.hidden = false;
  setMessage("🎉 You won!");
}

// ---------- Play mode: drag and drop ----------
function onDiskPointerDown(e) {
  if (mode !== "play" || busy || won) return;
  const el = e.currentTarget;
  const size = Number(el.dataset.size);
  const peg = pegs.findIndex((list) => list.includes(size));
  const isTop = topOf(peg) === size;

  el.setPointerCapture(e.pointerId);
  drag = {
    el, size, peg,
    startX: e.clientX,
    startY: e.clientY,
    allowDrag: isTop && selected === null,  // only top disk can be dragged
    moved: false,
  };
}

function onDiskPointerMove(e) {
  if (!drag || !drag.allowDrag) return;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;
  if (!drag.moved && Math.hypot(dx, dy) < 6) return;   // tiny move = click

  drag.moved = true;
  const rect = board.getBoundingClientRect();
  const x = e.clientX - rect.left - diskW(drag.size) / 2;
  const y = e.clientY - rect.top - DISK_H / 2;
  drag.el.classList.add("dragging");
  drag.el.style.zIndex = 10;
  setTransform(drag.el, x, y, 0);                      // follow the pointer
}

async function onDiskPointerUp(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.el.classList.remove("dragging");

  if (!d.moved) {                         // it was a simple click
    handlePegClick(d.peg);
    return;
  }
  const rect = board.getBoundingClientRect();
  let to = Math.floor((e.clientX - rect.left) / (rect.width / 3));
  to = Math.max(0, Math.min(2, to));
  d.el.style.zIndex = "";
  await tryMove(d.peg, to, true);
}

function onDiskPointerCancel() {
  if (!drag) return;
  drag.el.classList.remove("dragging");
  drag.el.style.zIndex = "";
  drag = null;
  layout(150);
}

// ---------- Hint (works from any position) ----------
// Collects the optimal moves to bring disks 1..k onto the target peg.
function planMoves(k, target, pos, out) {
  if (k === 0) return;
  if (pos[k] === target) {                // biggest disk already in place
    planMoves(k - 1, target, pos, out);
    return;
  }
  const other = 3 - pos[k] - target;      // the third peg (0+1+2 = 3)
  planMoves(k - 1, other, pos, out);
  out.push({ from: pos[k], to: target });
  pos[k] = target;
  planMoves(k - 1, target, pos, out);
}

function showHint() {
  if (mode !== "play" || busy || won) return;
  clearSelection();
  layout(150);

  const pos = new Array(n + 1);
  pegs.forEach((list, p) => list.forEach((size) => { pos[size] = p; }));
  const out = [];
  planMoves(n, 2, pos, out);
  const next = out[0];

  setMessage(`💡 Hint: move the top disk from the ${PEG_NAMES[next.from]} peg to the ${PEG_NAMES[next.to]} peg.`);
  zones[next.from].classList.add("hint");
  zones[next.to].classList.add("hint");
  setTimeout(() => zones.forEach((z) => z.classList.remove("hint")), 1800);
}

// ---------- Tutorial ----------
function runDemo() {
  tutorial.close();
  diskSelect.value = "3";
  speedInput.value = 6;
  setMode("auto");
  startAuto();
}

// ---------- Connect buttons ----------
startBtn.addEventListener("click", startAuto);
pauseBtn.addEventListener("click", pauseAuto);
$("resetBtn").addEventListener("click", resetGame);
$("resetBtn2").addEventListener("click", resetGame);
$("playAgainBtn").addEventListener("click", resetGame);
$("hintBtn").addEventListener("click", showHint);
diskSelect.addEventListener("change", resetGame);
$("tabAuto").addEventListener("click", () => setMode("auto"));
$("tabPlay").addEventListener("click", () => setMode("play"));
zones.forEach((zone, p) => zone.addEventListener("click", () => handlePegClick(p)));
$("helpBtn").addEventListener("click", () => tutorial.showModal());
$("closeBtn").addEventListener("click", () => tutorial.close());
$("demoBtn").addEventListener("click", runDemo);
window.addEventListener("resize", () => layout(0));

// ---------- Start ----------
setMode("auto");