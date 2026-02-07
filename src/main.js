import "./style.css";
import { Chess } from "chess.js";
import { io } from "socket.io-client";
import kingW from "./assets/king_w.png";
import queenW from "./assets/queen_w.png";
import rookW from "./assets/rook_w.png";
import bishopW from "./assets/bishop_w.png";
import knightW from "./assets/knight_w.png";
import pawnW from "./assets/pawn_w.png";
import kingB from "./assets/king_b.png";
import queenB from "./assets/queen_b.png";
import rookB from "./assets/rook_b.png";
import bishopB from "./assets/bishop_b.png";
import knightB from "./assets/knight_b.png";
import pawnB from "./assets/pawn_b.png";

const FILES = "abcdefgh";
const THEMES = [
  { id: "classic", name: "Classic Wood" },
  { id: "emerald", name: "Emerald" },
  { id: "midnight", name: "Midnight Slate" }
];

const PIECE_IMAGES = {
  w: { k: kingW, q: queenW, r: rookW, b: bishopW, n: knightW, p: pawnW },
  b: { k: kingB, q: queenB, r: rookB, b: bishopB, n: knightB, p: pawnB }
};

const SERVER_URL = import.meta.env.PROD ? window.location.origin : import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

const app = document.querySelector("#app");
const savedTheme = localStorage.getItem("chess-theme") || "classic";

const state = {
  theme: THEMES.some((t) => t.id === savedTheme) ? savedTheme : "classic",
  mode: "local",
  chess: new Chess(),
  selected: null,
  selectedMoves: [],
  engineTimer: null,
  promotionPending: null,
  socket: null,
  sessionId: "",
  myColor: null,
  online: null,
  notice: ""
};

app.innerHTML = `
  <main class="mx-auto grid w-full max-w-7xl gap-6 p-3 md:grid-cols-[auto_360px] md:p-8">
    <section class="panel-shell rounded-3xl border p-4 shadow-2xl md:p-5">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 class="font-title text-3xl leading-tight">Vite Chess Arena</h1>
          <p class="mt-1 font-body text-sm opacity-85">Play local, vs engine, or online session multiplayer.</p>
        </div>
        <span id="mode-chip" class="badge-chip">Local</span>
      </div>

      <div class="board-area rounded-2xl p-3">
        <div class="board-wrap">
          <div id="rank-labels" class="rank-labels" aria-hidden="true"></div>
          <div>
            <div id="board" class="chess-board" aria-label="Chess board"></div>
            <div id="file-labels" class="file-labels" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    </section>

    <aside class="panel-shell rounded-3xl border p-4 shadow-2xl md:p-5">
      <h2 class="font-title text-2xl">Control Panel</h2>
      <p id="status" class="mt-2 min-h-16 font-body text-sm"></p>
      <p id="notice" class="min-h-6 font-body text-xs text-emerald-800"></p>

      <label class="mt-2 block font-body text-sm" for="mode-select">Mode</label>
      <select id="mode-select" class="mt-1 w-full rounded-xl border px-3 py-2 font-body text-sm">
        <option value="local">Local 2 Player</option>
        <option value="engine">Play vs Engine</option>
        <option value="online">Online Session</option>
      </select>

      <label class="mt-2 block font-body text-sm" for="theme-select">Theme</label>
      <select id="theme-select" class="mt-1 w-full rounded-xl border px-3 py-2 font-body text-sm"></select>

      <section id="online-controls" class="mt-3 rounded-xl border p-3 hidden">
        <h3 class="font-title text-base">Session Multiplayer</h3>
        <div class="mt-2 flex gap-2">
          <button id="create-session" class="rounded-full px-3 py-1.5 font-body text-xs font-semibold text-white">Create Session</button>
          <button id="join-session" class="rounded-full px-3 py-1.5 font-body text-xs font-semibold text-white">Join</button>
        </div>
        <input id="session-input" class="mt-2 w-full rounded-lg border px-3 py-2 font-body text-sm uppercase" placeholder="Enter session code" maxlength="6" />
        <p id="session-meta" class="mt-2 font-body text-xs"></p>
      </section>

      <div class="mb-4 mt-3 flex gap-2">
        <button id="new-game" class="rounded-full px-4 py-2 font-body text-sm font-semibold text-white transition">New Game</button>
      </div>

      <h3 class="font-title text-lg">Moves Notation</h3>
      <ol id="move-list" class="mt-2 max-h-[350px] list-decimal overflow-auto pl-5 font-body text-sm"></ol>
    </aside>
  </main>

  <div id="promotion-modal" class="promo-overlay hidden" role="dialog" aria-modal="true" aria-label="Choose promotion piece">
    <div class="promo-card">
      <h4 class="font-title text-xl">Choose Promotion</h4>
      <div id="promo-choices" class="promo-choices"></div>
    </div>
  </div>

  <div id="game-end-modal" class="end-overlay hidden" role="dialog" aria-modal="true" aria-label="Game over">
    <div class="end-card">
      <h4 class="font-title text-2xl">Game Over</h4>
      <p id="end-message" class="mt-2 font-body text-sm"></p>
      <button id="restart-game" class="mt-4 rounded-full px-4 py-2 font-body text-sm font-semibold text-white">Restart Game</button>
    </div>
  </div>
`;

const boardEl = document.querySelector("#board");
const rankLabelsEl = document.querySelector("#rank-labels");
const fileLabelsEl = document.querySelector("#file-labels");
const statusEl = document.querySelector("#status");
const moveListEl = document.querySelector("#move-list");
const themeSelect = document.querySelector("#theme-select");
const modeSelect = document.querySelector("#mode-select");
const modeChip = document.querySelector("#mode-chip");
const newGameBtn = document.querySelector("#new-game");
const onlineControls = document.querySelector("#online-controls");
const createSessionBtn = document.querySelector("#create-session");
const joinSessionBtn = document.querySelector("#join-session");
const sessionInput = document.querySelector("#session-input");
const sessionMeta = document.querySelector("#session-meta");
const noticeEl = document.querySelector("#notice");
const promoModal = document.querySelector("#promotion-modal");
const promoChoices = document.querySelector("#promo-choices");
const endModal = document.querySelector("#game-end-modal");
const endMessageEl = document.querySelector("#end-message");
const restartGameBtn = document.querySelector("#restart-game");

themeSelect.innerHTML = THEMES.map((theme) => `<option value="${theme.id}">${theme.name}</option>`).join("");
themeSelect.value = state.theme;

themeSelect.addEventListener("change", () => {
  state.theme = themeSelect.value;
  localStorage.setItem("chess-theme", state.theme);
  applyTheme();
});

modeSelect.addEventListener("change", () => {
  switchMode(modeSelect.value);
});

newGameBtn.addEventListener("click", () => {
  if (state.mode === "online") {
    if (state.socket) {
      state.socket.emit("reset-session");
    }
    return;
  }
  resetLocalGame();
});

restartGameBtn.addEventListener("click", () => {
  hideGameEndModal();
  if (state.mode === "online") {
    if (state.socket) {
      state.socket.emit("reset-session");
    }
    return;
  }
  resetLocalGame();
});

createSessionBtn.addEventListener("click", async () => {
  try {
    const res = await fetch(`${SERVER_URL}/api/sessions`, { method: "POST" });
    const data = await res.json();
    sessionInput.value = data.sessionId;
    joinOnlineSession(data.sessionId);
  } catch (e) {
    console.error(e);
    setNotice("Could not create session. Check server.");
  }
});

joinSessionBtn.addEventListener("click", () => {
  joinOnlineSession(sessionInput.value);
});

sessionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    joinOnlineSession(sessionInput.value);
  }
});

boardEl.addEventListener("click", (event) => {
  const squareBtn = event.target.closest("button[data-square]");
  if (!squareBtn || state.promotionPending) {
    return;
  }
  handleSquareClick(squareBtn.dataset.square);
});

applyTheme();
switchMode("local");

function applyTheme() {
  document.body.classList.remove("theme-classic", "theme-emerald", "theme-midnight");
  document.body.classList.add(`theme-${state.theme}`);
}

function switchMode(mode) {
  clearTimers();
  state.mode = mode;
  modeSelect.value = mode;
  state.selected = null;
  state.selectedMoves = [];
  hidePromotionModal();
  hideGameEndModal();

  if (mode === "local") {
    teardownOnline();
    state.chess = new Chess();
    modeChip.textContent = "Local";
    onlineControls.classList.add("hidden");
  }

  if (mode === "engine") {
    teardownOnline();
    state.chess = new Chess();
    modeChip.textContent = "Engine";
    onlineControls.classList.add("hidden");
  }

  if (mode === "online") {
    state.chess = new Chess();
    modeChip.textContent = "Online";
    onlineControls.classList.remove("hidden");
    ensureSocket();
  }

  render();
}

function ensureSocket() {
  if (state.socket) {
    return;
  }

  state.socket = io(SERVER_URL, {
    transports: ["polling", "websocket"]
  });

  state.socket.on("connect", () => {
    setNotice("Realtime connected.");
  });

  state.socket.on("disconnect", () => {
    setNotice("Realtime disconnected.");
  });

  state.socket.on("joined-session", (payload) => {
    state.sessionId = payload.sessionId;
    state.myColor = payload.color;
    applyOnlinePayload(payload);
    setNotice(`Joined ${payload.sessionId} as ${payload.color === "w" ? "White" : "Black"}.`);
  });

  state.socket.on("session-update", (payload) => {
    applyOnlinePayload(payload);
  });

  state.socket.on("session-reset", ({ message }) => {
    setNotice(message);
  });

  state.socket.on("join-error", ({ message }) => {
    setNotice(message);
  });

  state.socket.on("action-error", ({ message }) => {
    setNotice(message);
  });

  state.socket.on("connect_error", (error) => {
    setNotice(`Realtime connection failed: ${error.message}`);
  });
}

function teardownOnline() {
  state.online = null;
  state.sessionId = "";
  state.myColor = null;
  sessionInput.value = "";
  if (state.socket) {
    state.socket.disconnect();
    state.socket = null;
  }
}

function joinOnlineSession(rawId) {
  const sessionId = String(rawId || "").trim().toUpperCase();
  if (sessionId.length < 4) {
    setNotice("Enter a valid session code.");
    return;
  }
  ensureSocket();
  state.socket.emit("join-session", { sessionId });
}

function applyOnlinePayload(payload) {
  state.online = payload;
  state.chess.load(payload.fen);
  state.selected = null;
  state.selectedMoves = [];
  sessionMeta.textContent = payload.sessionId
    ? `Session: ${payload.sessionId} | White ${payload.players.white ? "connected" : "waiting"} | Black ${payload.players.black ? "connected" : "waiting"}`
    : "";
  render();
}

function setNotice(message) {
  state.notice = message;
  noticeEl.textContent = message;
  if (message) {
    setTimeout(() => {
      if (noticeEl.textContent === message) {
        noticeEl.textContent = "";
      }
    }, 3500);
  }
}

function resetLocalGame() {
  clearTimers();
  state.chess.reset();
  state.selected = null;
  state.selectedMoves = [];
  hidePromotionModal();
  hideGameEndModal();
  render();
}

function clearTimers() {
  if (state.engineTimer) {
    clearTimeout(state.engineTimer);
    state.engineTimer = null;
  }
}

function canControl(color) {
  if (state.mode === "local") {
    return true;
  }
  if (state.mode === "engine") {
    return color === "w";
  }
  if (state.mode === "online") {
    return state.myColor === color;
  }
  return false;
}

function handleSquareClick(square) {
  if (isCurrentGameOver()) {
    return;
  }

  if (state.mode === "online" && !state.myColor) {
    setNotice("Create or join a session first.");
    return;
  }

  const piece = state.chess.get(square);
  const turn = state.chess.turn();
  if (!canControl(turn)) {
    return;
  }

  if (state.selected) {
    const candidates = state.selectedMoves.filter((m) => m.to === square);
    if (candidates.length > 0) {
      if (candidates.length > 1) {
        showPromotionModal(candidates);
      } else {
        submitMove(candidates[0]);
      }
      return;
    }
  }

  if (piece && piece.color === turn && canControl(piece.color)) {
    state.selected = square;
    state.selectedMoves = state.chess.moves({ square, verbose: true });
  } else {
    state.selected = null;
    state.selectedMoves = [];
  }
  render();
}

function showPromotionModal(candidates) {
  state.promotionPending = candidates;
  promoChoices.innerHTML = "";

  for (const move of candidates) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "promo-btn";

    const image = document.createElement("img");
    image.src = PIECE_IMAGES[move.color][move.promotion];
    image.alt = `Promote to ${move.promotion.toUpperCase()}`;
    image.className = "promo-image";

    const label = document.createElement("span");
    label.textContent = move.promotion.toUpperCase();

    btn.appendChild(image);
    btn.appendChild(label);
    btn.addEventListener("click", () => {
      hidePromotionModal();
      submitMove(move);
    });
    promoChoices.appendChild(btn);
  }

  promoModal.classList.remove("hidden");
}

function hidePromotionModal() {
  state.promotionPending = null;
  promoModal.classList.add("hidden");
}

function submitMove(move) {
  state.selected = null;
  state.selectedMoves = [];

  if (state.mode === "online") {
    state.socket.emit("make-move", {
      from: move.from,
      to: move.to,
      promotion: move.promotion || undefined
    });
    return;
  }

  const played = state.chess.move({
    from: move.from,
    to: move.to,
    promotion: move.promotion || undefined
  });

  if (!played) {
    setNotice("Illegal move.");
    return;
  }

  render();
  if (state.chess.isGameOver()) {
    showGameEndModal(getGameOverMessage());
  } else {
    maybeEngineTurn();
  }
}

function maybeEngineTurn() {
  if (state.mode !== "engine" || state.chess.isGameOver()) {
    return;
  }
  if (state.chess.turn() !== "b") {
    return;
  }

  state.engineTimer = setTimeout(() => {
    const best = pickEngineMove(state.chess, 2);
    if (!best) {
      return;
    }
    state.chess.move(best);
    render();
    if (state.chess.isGameOver()) {
      showGameEndModal(getGameOverMessage());
    }
  }, 350);
}

function pickEngineMove(chess, depth) {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return null;
  }

  let best = null;
  let bestScore = Infinity;

  for (const move of moves) {
    chess.move(move);
    const score = search(chess, depth - 1, -Infinity, Infinity, true);
    chess.undo();
    if (score < bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best;
}

function search(chess, depth, alpha, beta, maximizing) {
  if (depth === 0 || chess.isGameOver()) {
    return evaluateBoard(chess);
  }

  const moves = chess.moves({ verbose: true });
  if (maximizing) {
    let value = -Infinity;
    for (const move of moves) {
      chess.move(move);
      value = Math.max(value, search(chess, depth - 1, alpha, beta, false));
      chess.undo();
      alpha = Math.max(alpha, value);
      if (alpha >= beta) {
        break;
      }
    }
    return value;
  }

  let value = Infinity;
  for (const move of moves) {
    chess.move(move);
    value = Math.min(value, search(chess, depth - 1, alpha, beta, true));
    chess.undo();
    beta = Math.min(beta, value);
    if (alpha >= beta) {
      break;
    }
  }
  return value;
}

function evaluateBoard(chess) {
  if (chess.isCheckmate()) {
    return chess.turn() === "w" ? -99999 : 99999;
  }
  if (chess.isDraw()) {
    return 0;
  }

  const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  let score = 0;
  const board = chess.board();

  for (const rank of board) {
    for (const piece of rank) {
      if (!piece) {
        continue;
      }
      const v = values[piece.type];
      score += piece.color === "w" ? v : -v;
    }
  }

  return score;
}

function render() {
  boardEl.innerHTML = "";
  renderCoordinateLabels();

  const board = state.chess.board();
  const selected = state.selected;
  const targetMap = new Map();

  for (const move of state.selectedMoves) {
    targetMap.set(move.to, move.flags.includes("c") || move.flags.includes("e"));
  }

  const inCheckSquare = findKingSquare(state.chess, state.chess.turn());
  const checkActive = state.chess.isCheck();

  const flipped = shouldFlipBoard();

  for (let viewR = 0; viewR < 8; viewR += 1) {
    for (let viewC = 0; viewC < 8; viewC += 1) {
      const boardR = flipped ? 7 - viewR : viewR;
      const boardC = flipped ? 7 - viewC : viewC;
      const square = `${FILES[boardC]}${8 - boardR}`;
      const piece = board[boardR][boardC];
      const isLight = (boardR + boardC) % 2 === 0;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = ["chess-square", isLight ? "sq-light" : "sq-dark"].join(" ");
      btn.dataset.square = square;
      btn.setAttribute("aria-label", square);

      if (selected === square) {
        btn.classList.add("sq-selected");
      }
      if (targetMap.has(square)) {
        btn.classList.add(targetMap.get(square) ? "sq-capture" : "sq-target");
      }
      if (checkActive && inCheckSquare === square) {
        btn.classList.add("sq-check");
      }

      if (piece) {
        const img = document.createElement("img");
        img.src = PIECE_IMAGES[piece.color][piece.type];
        img.alt = `${piece.color === "w" ? "White" : "Black"} ${piece.type}`;
        img.className = "piece-image";
        btn.appendChild(img);
      }

      boardEl.appendChild(btn);
    }
  }

  renderStatus();
  renderMoves();
  if (isCurrentGameOver()) {
    showGameEndModal(getGameOverMessage());
  } else {
    hideGameEndModal();
  }
}

function renderStatus() {
  let status;
  if (state.mode === "online" && state.online) {
    status = state.online.status;
  } else if (state.chess.isCheckmate()) {
    status = `Checkmate. ${state.chess.turn() === "w" ? "Black" : "White"} wins.`;
  } else if (state.chess.isStalemate()) {
    status = "Stalemate. Draw.";
  } else if (state.chess.isDraw()) {
    status = "Draw.";
  } else if (state.chess.isCheck()) {
    status = `${state.chess.turn() === "w" ? "White" : "Black"} to move (check).`;
  } else {
    status = `${state.chess.turn() === "w" ? "White" : "Black"} to move.`;
  }

  if (state.mode === "engine") {
    status += " You play White.";
  }
  if (state.mode === "online") {
    status += state.myColor ? ` You are ${state.myColor === "w" ? "White" : "Black"}.` : " Join a session to play.";
  }
  statusEl.textContent = status;
}

function renderMoves() {
  moveListEl.innerHTML = "";
  const history = state.mode === "online" && state.online ? state.online.history : state.chess.history();
  for (let i = 0; i < history.length; i += 2) {
    const li = document.createElement("li");
    li.textContent = `${history[i] || ""}${history[i + 1] ? `   ${history[i + 1]}` : ""}`;
    moveListEl.appendChild(li);
  }
}

function renderCoordinateLabels() {
  const flipped = shouldFlipBoard();
  rankLabelsEl.innerHTML = "";
  fileLabelsEl.innerHTML = "";

  for (let i = 0; i < 8; i += 1) {
    const rank = flipped ? i + 1 : 8 - i;
    const rankSpan = document.createElement("span");
    rankSpan.textContent = String(rank);
    rankLabelsEl.appendChild(rankSpan);
  }

  for (let i = 0; i < 8; i += 1) {
    const fileIndex = flipped ? 7 - i : i;
    const fileSpan = document.createElement("span");
    fileSpan.textContent = FILES[fileIndex];
    fileLabelsEl.appendChild(fileSpan);
  }
}

function shouldFlipBoard() {
  return state.mode === "online" && state.myColor === "b";
}

function isCurrentGameOver() {
  if (state.mode === "online" && state.online) {
    return state.online.gameOver;
  }
  return state.chess.isGameOver();
}

function getGameOverMessage() {
  if (state.mode === "online" && state.online) {
    return state.online.status;
  }

  if (state.chess.isCheckmate()) {
    return `Checkmate. ${state.chess.turn() === "w" ? "Black" : "White"} wins.`;
  }
  if (state.chess.isStalemate()) {
    return "Stalemate. Draw.";
  }
  if (state.chess.isThreefoldRepetition()) {
    return "Draw by threefold repetition.";
  }
  if (state.chess.isInsufficientMaterial()) {
    return "Draw by insufficient material.";
  }
  if (state.chess.isDraw()) {
    return "Draw.";
  }
  return "Game over.";
}

function showGameEndModal(message) {
  endMessageEl.textContent = message;
  endModal.classList.remove("hidden");
}

function hideGameEndModal() {
  endModal.classList.add("hidden");
}

function findKingSquare(chess, color) {
  const board = chess.board();
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (piece && piece.type === "k" && piece.color === color) {
        return `${FILES[c]}${8 - r}`;
      }
    }
  }
  return null;
}
