// Runs the computer player's search in the background (see hive-ai.js → chooseMoveAsync).
import { chooseFromMoves } from './hive-ai.js';
self.onmessage = (e) => {
  const { id, opts, moves, level } = e.data;
  let move = null;
  try { move = chooseFromMoves(opts, moves, level); } catch (err) { console.error('[hive worker]', err); }
  self.postMessage({ id, move });
};
