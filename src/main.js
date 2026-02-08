import "./style.css";
import { io } from "socket.io-client";
import { Chess } from "chess.js";
import { FILES, PIECE_IMAGES, SERVER_URL, THEMES } from "./constants";
import { pickEngineMove } from "./engine";
import { createInitialState, normalizeDifficulty } from "./state";
import { createAppLayout } from "./template";

const app = document.querySelector("#app");

const savedTheme = localStorage.getItem("chess-theme") || "classic";
const validTheme = THEMES.some((theme) => theme.id === savedTheme) ? savedTheme : "classic";
const savedDifficulty = normalizeDifficulty(localStorage.getItem("engine-difficulty") || 5);

const state = createInitialState(validTheme, savedDifficulty);

app.innerHTML = createAppLayout(state.engineDifficulty);

const boardEl = document.querySelector("#board");
const rankLabelsEl = document.querySelector("#rank-labels");
const fileLabelsEl = document.querySelector("#file-labels");
const statusEl = document.querySelector("#status");
const moveListEl = document.querySelector("#move-list");
const themeSelect = document.querySelector("#theme-select");
const modeSelect = document.querySelector("#mode-select");
const modeChip = document.querySelector("#mode-chip");
const newGameBtn = document.querySelector("#new-game");
const engineControls = document.querySelector("#engine-controls");
const engineDifficultySelect = document.querySelector("#engine-difficulty");
const engineLevelValue = document.querySelector("#engine-level-value");
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
engineDifficultySelect.value = String(state.engineDifficulty);
updateEngineDifficultyLabel();

themeSelect.addEventListener("change", () => {
  state.theme = themeSelect.value;
  localStorage.setItem("chess-theme", state.theme);
  applyTheme();
});

engineDifficultySelect.addEventListener("change", () => {
  state.engineDifficulty = normalizeDifficulty(engineDifficultySelect.value);
  engineDifficultySelect.value = String(state.engineDifficulty);
  localStorage.setItem("engine-difficulty", String(state.engineDifficulty));
  updateEngineDifficultyLabel();
  clearTimers();
  if (state.mode === "engine") {
    maybeEngineTurn();
    renderStatus();
  }
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
    const response = await fetch(`${SERVER_URL}/api/sessions`, { method: "POST" });
    const data = await response.json();
    sessionInput.value = data.sessionId;
    joinOnlineSession(data.sessionId);
  } catch (error) {
    console.error(error);
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

function updateEngineDifficultyLabel() {
  engineLevelValue.textContent = String(state.engineDifficulty);
}

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
    engineControls.classList.add("hidden");
    onlineControls.classList.add("hidden");
  }

  if (mode === "engine") {
    teardownOnline();
    state.chess = new Chess();
    modeChip.textContent = "Engine";
    engineControls.classList.remove("hidden");
    onlineControls.classList.add("hidden");
  }

  if (mode === "online") {
    state.chess = new Chess();
    modeChip.textContent = "Online";
    engineControls.classList.add("hidden");
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
  state.engineSearchToken += 1;
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
    const candidates = state.selectedMoves.filter((move) => move.to === square);
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

  const searchToken = state.engineSearchToken + 1;
  state.engineSearchToken = searchToken;
  const thinkDelay = Math.max(100, 500 - state.engineDifficulty * 30);
  state.engineTimer = setTimeout(async () => {
    if (searchToken !== state.engineSearchToken) {
      return;
    }

    try {
      const bestMove = await pickEngineMove(state.chess, state.engineDifficulty);
      if (!bestMove || searchToken !== state.engineSearchToken) {
        return;
      }

      state.chess.move(bestMove);
      render();
      if (state.chess.isGameOver()) {
        showGameEndModal(getGameOverMessage());
      }
    } catch (error) {
      console.error(error);
      setNotice("Engine move failed. Try another move.");
    }
  }, thinkDelay);
}

function render() {
  boardEl.innerHTML = "";
  renderCoordinateLabels();

  const board = state.chess.board();
  const selectedSquare = state.selected;
  const targetMap = new Map();

  for (const move of state.selectedMoves) {
    targetMap.set(move.to, move.flags.includes("c") || move.flags.includes("e"));
  }

  const inCheckSquare = findKingSquare(state.chess, state.chess.turn());
  const checkActive = state.chess.isCheck();
  const flipped = shouldFlipBoard();

  for (let viewRow = 0; viewRow < 8; viewRow += 1) {
    for (let viewCol = 0; viewCol < 8; viewCol += 1) {
      const boardRow = flipped ? 7 - viewRow : viewRow;
      const boardCol = flipped ? 7 - viewCol : viewCol;
      const square = `${FILES[boardCol]}${8 - boardRow}`;
      const piece = board[boardRow][boardCol];
      const isLight = (boardRow + boardCol) % 2 === 0;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = ["chess-square", isLight ? "sq-light" : "sq-dark"].join(" ");
      btn.dataset.square = square;
      btn.setAttribute("aria-label", square);

      if (selectedSquare === square) {
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
    status += ` You play White. Engine level ${state.engineDifficulty}/10.`;
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
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (piece && piece.type === "k" && piece.color === color) {
        return `${FILES[col]}${8 - row}`;
      }
    }
  }
  return null;
}
