// Runs the chess search in the background (see chessai.js → chooseMoveAsync).
import { chooseMove } from './chessai.js';
self.onmessage = (e) => {
  const { id, fen, level } = e.data;
  self.postMessage({ id, move: chooseMove(fen, level) });
};
