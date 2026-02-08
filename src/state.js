import { Chess } from "chess.js";

function clampDifficulty(level) {
  const numeric = Number(level);
  if (!Number.isFinite(numeric)) {
    return 5;
  }
  return Math.max(1, Math.min(10, Math.round(numeric)));
}

export function createInitialState(theme, difficulty) {
  return {
    theme,
    mode: "local",
    chess: new Chess(),
    selected: null,
    selectedMoves: [],
    engineTimer: null,
    engineSearchToken: 0,
    engineDifficulty: clampDifficulty(difficulty),
    promotionPending: null,
    socket: null,
    sessionId: "",
    myColor: null,
    online: null,
    notice: ""
  };
}

export function normalizeDifficulty(level) {
  return clampDifficulty(level);
}
