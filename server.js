import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { Chess } from "chess.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ["GET", "POST"]
  }
});

const sessions = new Map();

function createSessionId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i += 1) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
}

function buildSessionPayload(session) {
  const history = session.chess.history();
  let status = "In progress";
  if (session.chess.isCheckmate()) {
    status = `Checkmate. ${session.chess.turn() === "w" ? "Black" : "White"} wins.`;
  } else if (session.chess.isStalemate()) {
    status = "Stalemate. Draw.";
  } else if (session.chess.isDraw()) {
    status = "Draw.";
  } else if (session.chess.isCheck()) {
    status = `${session.chess.turn() === "w" ? "White" : "Black"} to move (check).`;
  } else {
    status = `${session.chess.turn() === "w" ? "White" : "Black"} to move.`;
  }

  return {
    sessionId: session.id,
    fen: session.chess.fen(),
    turn: session.chess.turn(),
    history,
    gameOver: session.chess.isGameOver(),
    status,
    players: {
      white: Boolean(session.players.w),
      black: Boolean(session.players.b)
    }
  };
}

function createSession() {
  let id = createSessionId();
  while (sessions.has(id)) {
    id = createSessionId();
  }

  const session = {
    id,
    chess: new Chess(),
    players: { w: null, b: null }
  };
  sessions.set(id, session);
  return session;
}

app.post("/api/sessions", (_req, res) => {
  const session = createSession();
  res.status(201).json({ sessionId: session.id });
});

app.get("/api/sessions/:sessionId", (req, res) => {
  const session = sessions.get(req.params.sessionId.toUpperCase());
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(buildSessionPayload(session));
});

io.on("connection", (socket) => {
  socket.on("join-session", ({ sessionId }) => {
    const normalized = String(sessionId || "").trim().toUpperCase();
    const session = sessions.get(normalized);

    if (!session) {
      socket.emit("join-error", { message: "Session not found." });
      return;
    }

    let color = null;
    if (!session.players.w) {
      color = "w";
      session.players.w = socket.id;
    } else if (!session.players.b) {
      color = "b";
      session.players.b = socket.id;
    } else {
      socket.emit("join-error", { message: "Session already has 2 players." });
      return;
    }

    socket.data.sessionId = normalized;
    socket.data.color = color;
    socket.join(normalized);

    socket.emit("joined-session", {
      color,
      ...buildSessionPayload(session)
    });
    io.to(normalized).emit("session-update", buildSessionPayload(session));
  });

  socket.on("make-move", ({ from, to, promotion }) => {
    const sessionId = socket.data.sessionId;
    const color = socket.data.color;
    if (!sessionId || !color) {
      socket.emit("action-error", { message: "Join a session first." });
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      socket.emit("action-error", { message: "Session no longer exists." });
      return;
    }

    if (session.chess.turn() !== color) {
      socket.emit("action-error", { message: "Not your turn." });
      return;
    }

    const result = session.chess.move({ from, to, promotion });
    if (!result) {
      socket.emit("action-error", { message: "Illegal move." });
      return;
    }

    io.to(sessionId).emit("session-update", buildSessionPayload(session));
  });

  socket.on("reset-session", () => {
    const sessionId = socket.data.sessionId;
    if (!sessionId) {
      return;
    }
    const session = sessions.get(sessionId);
    if (!session) {
      return;
    }
    session.chess.reset();
    io.to(sessionId).emit("session-update", buildSessionPayload(session));
  });

  socket.on("disconnect", () => {
    const sessionId = socket.data.sessionId;
    const color = socket.data.color;
    if (!sessionId || !color) {
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.players[color] === socket.id) {
      session.players[color] = null;
    }

    io.to(sessionId).emit("session-update", buildSessionPayload(session));
  });
});

const distPath = path.resolve(__dirname, "dist");
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const port = Number(process.env.PORT || 3001);
httpServer.listen(port, () => {
  console.log(`Chess server running on http://localhost:${port}`);
});
