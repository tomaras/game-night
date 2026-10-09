// Runtime settings. The build script (scripts/build.mjs) REPLACES this file in every deployed copy
// with the right environment ('dev' or 'prod'); the version below is what you get when you open the
// source tree directly (env 'local'), which uses its own room namespace so it never meets real players.
window.GAME_NIGHT_CONFIG = {
  env: 'local',
  build: 'local',
  // Room ids are "<prefix><number>" on the shared PeerJS matchmaking server. Each environment has its own
  // prefix, so rooms made while testing on dev never collide with the real (prod) room numbers.
  prefix: 'gnight-local-v1-',

  // Use your own PeerJS signalling server instead of the free public one:
  // peer: { host: 'peer.example.com', port: 443, path: '/', secure: true, key: 'peerjs' },
};
