// Harmonies — card data (all names, patterns and numbers are original to this game).
// A pattern is a list of hex cells (axial q,r relative to an origin). Cell kinds:
//   w water · f field · m1..m3 mountain of that height · t1..t3 tree of that height · b building (red on grey/brown/red)
// The cell marked with * is where the animal cube goes. k = number of cubes on the card, T = points once all are placed.
// Neighbour directions (axial): (1,0) (1,-1) (0,-1) (-1,0) (-1,1) (0,1).

const P = (s) => s.split(';').map((c) => {
  const m = /^\s*([a-z]\d?)\s+(-?\d+),(-?\d+)(\*?)\s*$/.exec(c);
  return { k: m[1], q: +m[2], r: +m[3], mk: !!m[4] };
});

// [name, k, T, pattern, look]  — look drives the little illustrated critter on the card (see harmonies-art.js)
const A = [
  ['Pond Newt', 5, 9, 'w 0,0*;f 1,0', { body: '#43b36a', belly: '#ffe69a', ears: 'none', tail: 'short', face: 'round', extra: 'spots', spot: '#1f8a4c' }],
  ['Thatch Mouse', 4, 10, 'f 0,0*;b 1,0', { body: '#d9b48a', belly: '#fff3e0', ears: 'round', tail: 'curl', face: 'snout', extra: 'none' }],
  ['Reed Duck', 4, 12, 'w 0,0;w 1,0*;t1 1,-1', { body: '#fff8e1', belly: '#ffffff', ears: 'none', tail: 'short', face: 'beak', beak: '#ff9800', extra: 'wing', spot: '#ffd54f' }],
  ['Hill Marmot', 4, 13, 'm2 0,0*;m1 1,0;f 0,1', { body: '#b98a5e', belly: '#f1dcc3', ears: 'round', tail: 'short', face: 'muzzle', extra: 'none' }],
  ['Birch Hare', 4, 13, 't2 0,0*;f 1,0;f 0,1', { body: '#e9e4dc', belly: '#ffffff', ears: 'long', tail: 'puff', face: 'snout', extra: 'none' }],
  ['Cliff Goat', 3, 15, 'm3 0,0*;m1 1,0;w 0,1', { body: '#f5f1ea', belly: '#ffffff', ears: 'horn', tail: 'short', face: 'muzzle', extra: 'whisk' }],
  ['Mill Hedgehog', 4, 13, 'b 0,0*;t1 1,0;f 0,1', { body: '#c49a6c', belly: '#ffe8cc', ears: 'round', tail: 'none', face: 'snout', extra: 'quills', spot: '#7b5a3a' }],
  ['Brook Beaver', 3, 14, 't2 0,0*;w 1,0;w 2,0', { body: '#9a6a43', belly: '#d9b48a', ears: 'round', tail: 'flat', face: 'muzzle', extra: 'teeth' }],
  ['Wheat Quail', 4, 12, 'f 0,0;f 1,0*;f 2,0', { body: '#d8a867', belly: '#fff0cf', ears: 'none', tail: 'short', face: 'beak', beak: '#8d6e63', extra: 'crest', spot: '#6d4c41' }],
  ['Cairn Pika', 3, 15, 'm1 0,0;m2 1,0*;m3 2,0', { body: '#9aa3ad', belly: '#e8ecf0', ears: 'round', tail: 'none', face: 'snout', extra: 'none' }],
  ['Mist Heron', 3, 16, 'w 0,0;w 1,0*;w 2,0;t1 1,-1', { body: '#8fb4d9', belly: '#eaf3fb', ears: 'none', tail: 'short', face: 'beak', beak: '#ffb300', extra: 'crest', spot: '#35577d' }],
  ['Glade Deer', 3, 17, 't3 0,0*;t2 1,0;t1 0,1', { body: '#c9925a', belly: '#f6dcb8', ears: 'point', tail: 'puff', face: 'muzzle', extra: 'antler', spot: '#ffffff' }],
  ['Ember Fox', 3, 16, 't2 0,0*;b 1,0;f 1,-1', { body: '#ef7d32', belly: '#fff3e6', ears: 'point', tail: 'bushy', face: 'snout', extra: 'mask', spot: '#ffffff' }],
  ['Moss Turtle', 3, 17, 'w 0,0*;w 1,-1;t1 1,0;m1 0,1', { body: '#6fbf73', belly: '#d7f0a8', ears: 'none', tail: 'short', face: 'round', extra: 'shell', spot: '#3f8f49' }],
  ['Lantern Owl', 3, 17, 't3 0,0*;b 1,0;m1 0,1', { body: '#a77b52', belly: '#f2dfc4', ears: 'tuft', tail: 'none', face: 'beak', beak: '#ffb300', extra: 'wing' }],
  ['Hollow Badger', 3, 16, 'm2 0,0*;t2 1,0;t1 0,1', { body: '#8e9aa6', belly: '#f1f3f5', ears: 'round', tail: 'short', face: 'snout', extra: 'stripes', spot: '#2f3640' }],
  ['Pine Squirrel', 2, 16, 't3 0,0;t3 1,0*', { body: '#d1683a', belly: '#ffe6d1', ears: 'tuft', tail: 'bushy', face: 'snout', extra: 'none' }],
  ['Tide Otter', 2, 16, 'w 0,0;w 1,0;w 2,0*;w 3,0', { body: '#7b5a45', belly: '#e9d2b8', ears: 'round', tail: 'curl', face: 'muzzle', extra: 'whisk' }],
  ['Stone Bear', 2, 21, 'm3 0,0*;m2 1,0;m2 0,1', { body: '#6e5a4b', belly: '#c7a98a', ears: 'round', tail: 'short', face: 'muzzle', extra: 'none' }],
  ['Clover Lamb', 3, 14, 'f 0,0*;f 1,0;f 0,1;f 1,-1', { body: '#fffdf8', belly: '#ffffff', ears: 'round', tail: 'puff', face: 'round', extra: 'fluff', spot: '#3b3b3b' }],
  ['Dawn Crane', 3, 16, 'w 0,0;w 1,0*;f 0,1;f 1,1', { body: '#fafafa', belly: '#ffffff', ears: 'none', tail: 'short', face: 'beak', beak: '#ff7043', extra: 'crest', spot: '#e53935' }],
  ['Rill Salamander', 3, 13, 'w 0,0;w 1,0;w 1,1*', { body: '#ff9a3c', belly: '#ffe0a8', ears: 'none', tail: 'curl', face: 'round', extra: 'spots', spot: '#d9531e' }],
  ['Thistle Finch', 4, 12, 't1 0,0;t1 1,0*;t1 0,1;t1 1,-1', { body: '#7ec0ee', belly: '#fff7d6', ears: 'none', tail: 'short', face: 'beak', beak: '#ffb300', extra: 'wing', spot: '#3b82c4' }],
  ['Orchard Pig', 3, 17, 't2 0,0;b 1,0*;t2 1,-1', { body: '#ffb3c1', belly: '#ffd6de', ears: 'point', tail: 'curl', face: 'snout', extra: 'none', snout: '#ff8fa3' }],
  ['Shaggy Yak', 2, 17, 'm2 0,0;m2 1,0*;m2 2,0', { body: '#6d4c41', belly: '#a1887f', ears: 'horn', tail: 'short', face: 'muzzle', extra: 'fluff', spot: '#4e342e' }],
  ['Burrow Mole', 4, 11, 'm1 0,0*;f 1,0;f 2,0', { body: '#7a8aa0', belly: '#c9d3df', ears: 'none', tail: 'short', face: 'snout', extra: 'none', snout: '#ff9db0' }],
  ['Mesa Lynx', 3, 18, 'm3 0,0*;b 1,0;m1 0,1;f 1,-1', { body: '#e4b66a', belly: '#fff2d6', ears: 'tuft', tail: 'short', face: 'muzzle', extra: 'spots', spot: '#8a5a22' }],
  ['Brine Seal', 3, 15, 'w 0,0;w 1,0;w 2,0*;m1 1,-1', { body: '#8e9db0', belly: '#dfe6ee', ears: 'none', tail: 'flat', face: 'muzzle', extra: 'whisk' }],
  ['Bamboo Bear', 2, 20, 't3 0,0*;t1 1,0;t1 1,-1;t1 0,1', { body: '#f7f7f7', belly: '#ffffff', ears: 'round', tail: 'short', face: 'muzzle', extra: 'mask', spot: '#2b2b2b' }],
  ['Lagoon Capybara', 3, 15, 'w 0,0;w 1,0;f 0,1*;f 1,1', { body: '#b57f4f', belly: '#e6c49c', ears: 'round', tail: 'none', face: 'muzzle', extra: 'none' }],
  ['Garden Snail', 3, 15, 'b 0,0*;b 1,0;f 0,1', { body: '#e8cf9d', belly: '#fff3d6', ears: 'none', tail: 'none', face: 'round', extra: 'shell', spot: '#e57d4e' }],
  ['Sleepy Sloth', 3, 18, 't3 0,0;t2 1,0*;b 0,1', { body: '#a7957f', belly: '#e1d4c0', ears: 'none', tail: 'none', face: 'round', extra: 'mask', spot: '#6b5a48' }],
];

const FRAC = { 2: [0.4, 1], 3: [0.22, 0.5, 1], 4: [0.18, 0.4, 0.68, 1], 5: [0.14, 0.3, 0.5, 0.74, 1] };
export const ANIMALS = A.map(([name, k, T, pat, look], i) => ({
  id: i, name, k, T, cells: P(pat), look,
  vals: FRAC[k].map((f) => Math.max(1, Math.round(T * f))),
  spirit: false,
}));

// Nature spirits: one cube, a roomy pattern, and an extra end-of-game scoring rule (see harmonies-rules.js `spiritScore`).
// kind 'land' = pays per landscape feature; 'group' = pays per connected group (matters for the solo sun bonus).
const S = [
  ['Spirit of the Grove', 'land', 'Trees: 3 for each tall tree, 1 for every other tree.', 't3 0,0*;t2 1,0;t2 0,1;t1 1,-1', 'grove'],
  ['Spirit of the Peaks', 'land', 'Mountains: 3 for each mountain of height 2 or more.', 'm3 0,0*;m2 1,0;m2 0,1;m1 1,-1', 'peaks'],
  ['Spirit of the Meadow', 'group', 'Fields: 3 for each field, plus 3 more for a field of 3 or more.', 'f 0,0*;f 1,0;f 0,1;b 1,-1', 'meadow'],
  ['Spirit of the Hearth', 'land', 'Buildings: 2 for each building, 3 more for each that scores.', 'b 0,0*;b 1,0;t1 0,1;m1 1,-1', 'hearth'],
  ['Spirit of the Waters', 'group', 'Water: each group of water scores 1, 3 or 6 for size 1, 2 or 3 and up.', 'w 0,0*;w 1,0;w 2,0;f 1,-1', 'waters'],
  ['Spirit of the Harvest', 'land', 'Harvest: 2 for each field token next to a building.', 'f 0,0*;b 1,0;f 0,1;f 1,-1', 'harvest'],
  ['Spirit of Seasons', 'land', 'Seasons: 4 for each of the five landscapes you have: water, mountain, tree, field, building.', 'w 0,0*;m1 1,0;t1 0,1;f 1,-1;b 1,1', 'seasons'],
  ['Spirit of Old Wood', 'land', 'Old wood: 2 for each tree of height 2 or more and for each bare trunk.', 't2 0,0*;t2 1,0;t3 0,1', 'oldwood'],
  ['Spirit of the Steppes', 'group', 'Ranges: each connected range of 3 or more grey tokens scores 6.', 'm2 0,0*;m2 1,0;m1 2,0;f 1,1', 'steppes'],
  ['Spirit of Stillness', 'group', 'Islands: 4 for each island, and 4 more for an island with a tall tree.', 'w 0,0;w 1,0*;w 1,1;t3 0,1', 'stillness'],
];
export const SPIRITS = S.map(([name, kind, rule, pat, key], i) => ({ id: 100 + i, name, kind, rule, key, k: 1, T: 0, cells: P(pat), vals: [0], spirit: true, look: { glow: ['#7ae582', '#7cc4ff', '#ffd25e', '#ff8a65', '#4dd0e1', '#ffb74d', '#ba68c8', '#a1887f', '#90a4ae', '#80cbc4'][i] } }));

const BY = new Map([...ANIMALS, ...SPIRITS].map((c) => [c.id, c]));
export const cardOf = (id) => BY.get(id);
