
const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const INFINITY = 1_000_000;
const MATE_SCORE = 100_000;

function clampDifficulty(level) {
  const numeric = Number(level);
  if (!Number.isFinite(numeric)) {
    return 5;
  }
  return Math.max(1, Math.min(10, Math.round(numeric)));
}

function getEngineConfig(level) {
  const difficulty = clampDifficulty(level);
  const depthByLevel = [4, 6, 8, 10, 12, 14, 15, 16, 18, 20];
  const movetimeByLevel = [120, 180, 250, 350, 500, 700, 900, 1200, 1700, 2400];
  const randomByLevel = [0.35, 0.25, 0.18, 0.12, 0.08, 0.05, 0.03, 0.015, 0.008, 0];

  return {
    depth: depthByLevel[difficulty - 1],
    movetimeMs: movetimeByLevel[difficulty - 1],
    fallbackDepth: Math.min(8, 3 + Math.floor(difficulty / 2)),
    randomChance: randomByLevel[difficulty - 1],
    skill: Math.min(20, Math.round((difficulty / 10) * 20))
  };
}

function moveToUci(move) {
  return `${move.from}${move.to}${move.promotion || ""}`;
}

function isCapture(move) {
  return move.flags.includes("c") || move.flags.includes("e");
}

function evaluateBoard(chess) {
  if (chess.isCheckmate()) {
    return chess.turn() === "w" ? -MATE_SCORE : MATE_SCORE;
  }
  if (chess.isDraw()) {
    return 0;
  }

  let score = 0;
  const board = chess.board();
  for (const rank of board) {
    for (const piece of rank) {
      if (!piece) {
        continue;
      }
      const value = PIECE_VALUES[piece.type] || 0;
      score += piece.color === "w" ? value : -value;
    }
  }
  return score;
}

function ttFlag(score, alpha, beta) {
  if (score <= alpha) {
    return "upper";
  }
  if (score >= beta) {
    return "lower";
  }
  return "exact";
}

function moveOrderScore(move, ply, ttBest, killers, history) {
  const uci = moveToUci(move);
  let score = 0;

  if (uci === ttBest) {
    score += 2_000_000;
  }
  if (move.promotion) {
    score += 50_000 + (PIECE_VALUES[move.promotion] || 0);
  }
  if (isCapture(move)) {
    const victim = PIECE_VALUES[move.captured] || 0;
    const attacker = PIECE_VALUES[move.piece] || 0;
    score += 100_000 + victim * 10 - attacker;
  }

  const killerMoves = killers[ply];
  if (killerMoves && killerMoves.includes(uci)) {
    score += 80_000;
  }

  score += history.get(uci) || 0;
  if (move.san.includes("+")) {
    score += 8_000;
  }

  return score;
}

function orderMoves(moves, ply, ttBest, killers, history) {
  return moves
    .map((move) => ({ move, score: moveOrderScore(move, ply, ttBest, killers, history) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.move);
}

function quiescence(chess, alpha, beta) {
  let standPat = evaluateBoard(chess);
  if (chess.turn() === "b") {
    standPat = -standPat;
  }

  if (standPat >= beta) {
    return beta;
  }
  if (standPat > alpha) {
    alpha = standPat;
  }

  const captures = chess.moves({ verbose: true }).filter(isCapture);
  for (const move of captures) {
    chess.move(move);
    const score = -quiescence(chess, -beta, -alpha);
    chess.undo();

    if (score >= beta) {
      return beta;
    }
    if (score > alpha) {
      alpha = score;
    }
  }

  return alpha;
}

function searchWithTT(chess, depth, alpha, beta, ply, tt, killers, history) {
  const alphaStart = alpha;
  const key = chess.fen().split(" ").slice(0, 4).join(" ");
  const cached = tt.get(key);
  if (cached && cached.depth >= depth) {
    if (cached.flag === "exact") {
      return { score: cached.score, bestMoveUci: cached.bestMoveUci };
    }
    if (cached.flag === "lower") {
      alpha = Math.max(alpha, cached.score);
    } else if (cached.flag === "upper") {
      beta = Math.min(beta, cached.score);
    }
    if (alpha >= beta) {
      return { score: cached.score, bestMoveUci: cached.bestMoveUci };
    }
  }

  if (depth <= 0) {
    return { score: quiescence(chess, alpha, beta), bestMoveUci: null };
  }
  if (chess.isGameOver()) {
    let terminal = evaluateBoard(chess);
    if (chess.turn() === "b") {
      terminal = -terminal;
    }
    return { score: terminal, bestMoveUci: null };
  }

  const rawMoves = chess.moves({ verbose: true });
  const orderedMoves = orderMoves(rawMoves, ply, cached?.bestMoveUci || null, killers, history);
  let bestMoveUci = null;
  let bestScore = -INFINITY;

  for (const move of orderedMoves) {
    chess.move(move);
    const reply = searchWithTT(chess, depth - 1, -beta, -alpha, ply + 1, tt, killers, history);
    chess.undo();
    const score = -reply.score;

    if (score > bestScore) {
      bestScore = score;
      bestMoveUci = moveToUci(move);
    }
    if (score > alpha) {
      alpha = score;
    }
    if (alpha >= beta) {
      if (!isCapture(move)) {
        killers[ply] = killers[ply] || [];
        if (!killers[ply].includes(moveToUci(move))) {
          killers[ply].unshift(moveToUci(move));
          killers[ply] = killers[ply].slice(0, 2);
        }
        history.set(moveToUci(move), (history.get(moveToUci(move)) || 0) + depth * depth);
      }
      break;
    }
  }

  const flag = ttFlag(bestScore, alphaStart, beta);
  tt.set(key, { depth, score: bestScore, flag, bestMoveUci });
  return { score: bestScore, bestMoveUci };
}

function fallbackMove(chess, config) {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return null;
  }

  const tt = new Map();
  const killers = [];
  const history = new Map();
  let bestMoveUci = moveToUci(moves[0]);

  for (let depth = 1; depth <= config.fallbackDepth; depth += 1) {
    const result = searchWithTT(chess, depth, -INFINITY, INFINITY, 0, tt, killers, history);
    if (result.bestMoveUci) {
      bestMoveUci = result.bestMoveUci;
    }
  }

  return moves.find((move) => moveToUci(move) === bestMoveUci) || moves[0];
}

class StockfishController {
  constructor(url) {
    this.url = url;
    this.worker = null;
    this.readyPromise = null;
    this.currentSearch = null;
  }

  post(command) {
    if (this.worker) {
      this.worker.postMessage(command);
    }
  }

  parseLine(event) {
    const line = typeof event.data === "string" ? event.data.trim() : "";
    if (!line) {
      return;
    }

    if (line === "uciok" && this.waitUciOk) {
      this.waitUciOk();
      this.waitUciOk = null;
      return;
    }

    if (line === "readyok" && this.waitReadyOk) {
      this.waitReadyOk();
      this.waitReadyOk = null;
      return;
    }

    if (line.startsWith("bestmove") && this.currentSearch) {
      const parts = line.split(/\s+/);
      const uci = parts[1] && parts[1] !== "(none)" ? parts[1] : null;
      const resolve = this.currentSearch.resolve;
      this.currentSearch = null;
      resolve(uci);
    }
  }

  async ensureReady() {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise((resolve, reject) => {
      if (typeof Worker === "undefined") {
        reject(new Error("Web Worker is not available in this browser."));
        return;
      }

      this.worker = new Worker(this.url);
      this.worker.onmessage = (event) => this.parseLine(event);
      this.worker.onerror = (error) => {
        reject(error);
      };

      const uciPromise = new Promise((uciResolve) => {
        this.waitUciOk = uciResolve;
      });
      const readyPromise = new Promise((readyResolve) => {
        this.waitReadyOk = readyResolve;
      });

      this.post("uci");

      uciPromise
        .then(() => {
          this.post("setoption name Hash value 64");
          this.post("isready");
          return readyPromise;
        })
        .then(resolve)
        .catch(reject);
    });

    return this.readyPromise;
  }

  async searchBestMove(fen, config) {
    await this.ensureReady();

    if (this.currentSearch) {
      this.post("stop");
      this.currentSearch.resolve(null);
      this.currentSearch = null;
    }

    this.post("ucinewgame");
    this.post(`setoption name Skill Level value ${config.skill}`);
    this.post(`position fen ${fen}`);

    return new Promise((resolve) => {
      this.currentSearch = { resolve };
      this.post(`go depth ${config.depth} movetime ${config.movetimeMs}`);
      setTimeout(() => {
        if (!this.currentSearch) {
          return;
        }
        this.post("stop");
      }, config.movetimeMs + 1500);
    });
  }
}

const stockfish = new StockfishController("/stockfish/stockfish-17.1-lite-single-03e3232.js");

export async function pickEngineMove(chess, difficulty) {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return null;
  }

  const config = getEngineConfig(difficulty);
  if (Math.random() < config.randomChance) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  try {
    const fen = chess.fen();
    const bestMoveUci = await stockfish.searchBestMove(fen, config);
    if (bestMoveUci) {
      const selected = moves.find((move) => moveToUci(move) === bestMoveUci);
      if (selected) {
        return selected;
      }
    }
  } catch (error) {
    console.warn("Stockfish worker unavailable, using JS fallback.", error);
  }

  return fallbackMove(chess, config);
}
