// Runs the chess search in the background (see chessai.js → chooseMoveAsync / analyzeAsync).
import { chooseMove, analyze } from './chessai.js';
self.onmessage = (e) => {
  const { id, fen, level, ms, kind } = e.data;
  if (kind === 'analyze') self.postMessage({ id, result: analyze(fen, ms) });
  else self.postMessage({ id, move: chooseMove(fen, level) });
};
