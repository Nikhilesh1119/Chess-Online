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

export const FILES = "abcdefgh";

export const THEMES = [
  { id: "classic", name: "Classic Wood" },
  { id: "emerald", name: "Emerald" },
  { id: "midnight", name: "Midnight Slate" }
];

export const PIECE_IMAGES = {
  w: { k: kingW, q: queenW, r: rookW, b: bishopW, n: knightW, p: pawnW },
  b: { k: kingB, q: queenB, r: rookB, b: bishopB, n: knightB, p: pawnB }
};

export const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;
