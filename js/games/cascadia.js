// Timberline — original habitat drafting UI, vector art and host integration by OpenAI Codex.
import { h, clamp } from '../util.js';
import { avatarEl } from '../avatar.js';
import { botLoop, thinkMs } from '../bots.js';
import * as R from './cascadia-rules.js';
import { planTurn } from './cascadia-ai.js';

const NS = 'http://www.w3.org/2000/svg';
const SQ3 = Math.sqrt(3), SIZE = 44;
const HAB_COLOR = ['#34A853', '#8E4DE8', '#FBBC05', '#12B5CB', '#4285F4'];
const HAB_DARK = ['#137333', '#6533A6', '#B06000', '#087888', '#1967D2'];
const AN_COLOR = ['#EA4335', '#8E4DE8', '#4285F4', '#F29900', '#E5399B'];

const CSS = `
.tl{max-width:1400px;gap:8px;padding-bottom:92px}.tl *{box-sizing:border-box}
.tl-top{display:flex;align-items:center;gap:7px;overflow-x:auto;padding:3px 2px 6px;scrollbar-width:none}
.tl-player{flex:0 0 auto;min-width:116px;height:52px;padding:5px 8px;border:2px solid var(--line);background:var(--surface);box-shadow:var(--z1);display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:6px;cursor:pointer;color:var(--on)}
.tl-player.turn{border-color:var(--green);box-shadow:var(--z2);transform:translateY(-2px)}.tl-player.view{outline:3px solid var(--blue);outline-offset:1px}
.tl-player .who{min-width:0;font:750 12px/1.15 var(--font);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tl-player .who small{display:block;color:var(--on2);font:650 10px var(--font);margin-top:3px}
.tl-score{min-width:34px;height:34px;border-radius:50%;background:var(--green);color:#fff;display:grid;place-items:center;font:850 13px var(--font)}
.tl-main{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:10px;min-height:560px}
.tl-board-card,.tl-side section{background:var(--surface);box-shadow:var(--z1);border:1px solid var(--line);border-radius:var(--r)}
.tl-board-card{min-width:0;display:flex;flex-direction:column;overflow:hidden;position:relative}.tl-boardbar{min-height:45px;padding:6px 8px;display:flex;gap:6px;align-items:center;border-bottom:1px solid var(--line)}
.tl-boardbar strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tl-boardbar .spacer{flex:1}
.tl-circle{width:38px;height:38px;padding:0;border:0;border-radius:50%;background:var(--s2);color:var(--on);box-shadow:var(--z1);display:grid;place-items:center;font:850 19px var(--font);cursor:pointer}.tl-circle:active{transform:translateY(2px);box-shadow:none}
.tl-board{width:100%;flex:1 1 auto;min-height:500px;touch-action:none;cursor:grab;background:var(--bg)}.tl-board.drag{cursor:grabbing}
.tl-hex{filter:drop-shadow(0 3px 2px rgba(22,28,38,.22));transition:transform .16s ease,opacity .16s ease}.tl-hex.legal{cursor:pointer;filter:drop-shadow(0 0 4px #34A853);animation:tl-breathe 1.4s ease-in-out infinite}.tl-hex.tokenable{cursor:pointer}.tl-hex.last{animation:tl-settle .42s cubic-bezier(.2,.8,.2,1)}
.tl-outline{fill:none;stroke:#fff;stroke-width:2.6;stroke-linejoin:round;vector-effect:non-scaling-stroke}.tl-token{filter:drop-shadow(0 3px 2px rgba(0,0,0,.3))}.tl-target{fill:none;stroke:#fff;stroke-width:3;stroke-dasharray:5 4;vector-effect:non-scaling-stroke;animation:tl-spin 9s linear infinite}
.tl-side{display:flex;flex-direction:column;gap:8px;min-width:0}.tl-side section{padding:9px}.tl-section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;gap:6px}.tl-section-head b{font:800 13px var(--font);letter-spacing:.03em;text-transform:uppercase;color:var(--on2)}.tl-round{font:750 12px var(--font);color:var(--on2);white-space:nowrap}
.tl-market{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.tl-pair{min-width:0;border:2px solid var(--line);background:var(--s1);box-shadow:var(--z1);padding:5px 3px;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;position:relative;transition:transform .14s,box-shadow .14s,border-color .14s}.tl-pair:hover{transform:translateY(-3px);box-shadow:var(--z2)}.tl-pair.sel{border-color:var(--green);background:var(--surface);transform:translateY(-3px);box-shadow:var(--z2)}.tl-pair.split{border-color:var(--purple)}.tl-pair .num{position:absolute;top:2px;left:4px;color:var(--on3);font:800 10px var(--font)}
.tl-minihex{width:58px;height:54px;display:block;border:0;padding:0;background:transparent;cursor:pointer}.tl-wild{width:44px;height:44px;border:0;padding:0;border-radius:50%;background:#fff;box-shadow:0 2px 0 rgba(0,0,0,.2),0 3px 7px rgba(0,0,0,.22);cursor:pointer}.tl-wild svg{width:100%;height:100%;display:block}.tl-pair .tl-minihex.pick,.tl-pair .tl-wild.pick{outline:3px solid var(--purple);outline-offset:1px;border-radius:50%}
.tl-resource{display:flex;gap:5px;align-items:center;flex-wrap:wrap;font:700 12px var(--font)}.tl-pine{display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border-radius:999px;background:var(--green);color:#fff}.tl-over{margin-top:7px;padding-top:7px;border-top:1px solid var(--line);display:flex;gap:5px;align-items:center;flex-wrap:wrap;color:var(--on2);font:650 11px/1.25 var(--font)}.tl-over button{min-height:32px}
.tl-cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}.tl-rule{min-width:0;height:80px;border:2px solid var(--ac);background:var(--surface);color:var(--on);padding:5px 3px;cursor:pointer;text-align:center;box-shadow:var(--z1)}.tl-rule .animal{width:25px;height:25px;margin:auto}.tl-rule b{display:block;font:800 9px/1.05 var(--font);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tl-rule small{display:block;color:var(--on2);font:800 10px var(--font)}
.tl-break{display:flex;gap:4px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.tl-hab{flex:1 0 49px;border:1px solid var(--line);background:var(--s1);padding:5px 2px;text-align:center;font:800 10px var(--font);color:var(--on2)}.tl-hab i{display:block;width:19px;height:8px;margin:0 auto 3px;background:var(--hc)}.tl-hab strong{display:block;color:var(--on);font-size:13px}
.tl-log{max-height:100px;overflow:auto;display:flex;flex-direction:column;gap:4px;color:var(--on2);font:600 11px/1.3 var(--font)}.tl-log div:first-child{color:var(--on);font-weight:750}
.tl-prompt{position:sticky;bottom:8px;z-index:5;margin-top:-74px;align-self:center;width:min(620px,calc(100% - 14px));min-height:66px;display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface);border-left:5px solid var(--green);box-shadow:var(--z4);border-radius:var(--r)}.tl-prompt .copy{min-width:0;flex:1;font:700 13px/1.25 var(--font);color:var(--on)}.tl-prompt .copy small{display:block;color:var(--on2);font:600 11px var(--font);margin-top:2px}.tl-prompt .btn{min-height:40px;padding:0 12px}.tl-prompt .tl-circle{flex:0 0 38px}
.tl-dialog{position:absolute;inset:8px;z-index:10;background:var(--surface);border:1px solid var(--line);box-shadow:var(--z5);padding:13px;overflow:auto}.tl-dialog-head{display:flex;align-items:center;gap:8px;position:sticky;top:-13px;background:var(--surface);padding:3px 0 9px;z-index:2}.tl-dialog-head h3{margin:0;flex:1}.tl-card-detail{border-left:6px solid var(--ac);background:var(--s1);padding:10px;margin:7px 0}.tl-card-detail h4{margin:0 0 3px}.tl-card-detail p{margin:3px 0 8px;color:var(--on2);font:600 13px/1.35 var(--font)}.tl-card-detail table{width:100%;border-collapse:collapse;font:650 12px var(--font)}.tl-card-detail td{border-top:1px solid var(--line);padding:4px}.tl-card-detail td:last-child{text-align:right;font-weight:850}
.tl-final{display:grid;gap:8px}.tl-final-row{display:grid;grid-template-columns:minmax(100px,1fr) repeat(4,54px);align-items:center;gap:3px;border:1px solid var(--line);padding:6px}.tl-final-row>span{text-align:center;font:700 11px var(--font)}.tl-final-row>span strong{display:block;font-size:15px}.tl-final-row.win{border-color:var(--yellow);box-shadow:var(--z2)}
@keyframes tl-breathe{50%{opacity:.58}}@keyframes tl-settle{from{transform:scale(1.35);opacity:.3}70%{transform:scale(.94)}}@keyframes tl-spin{to{stroke-dashoffset:-36}}
@media(max-width:760px){.tl{padding-left:4px;padding-right:4px;gap:6px}.tl-main{display:flex;flex-direction:column;min-height:660px}.tl-side{display:contents}.tl-side .market-section{order:-2}.tl-board-card{order:-1;min-height:470px}.tl-board{min-height:420px}.tl-side .score-section{order:1}.tl-side .log-section{order:2}.tl-market{gap:4px}.tl-pair{padding:4px 1px}.tl-minihex{width:52px;height:47px}.tl-wild{width:40px;height:40px}.tl-player{min-width:102px;height:47px;grid-template-columns:30px 1fr auto;padding:3px 5px}.tl-score{min-width:30px;height:30px}.tl-prompt{position:fixed;left:7px;right:7px;bottom:74px;width:auto;margin:0}.tl-log{max-height:70px}}
@media(prefers-reduced-motion:reduce){.tl-hex,.tl-pair{transition:none!important;animation:none!important}}
`;

function sv(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v != null) el.setAttribute(k, v);
  }
  kids.flat().forEach((x) => x != null && el.append(x));
  return el;
}
const pts = (s = SIZE) => Array.from({ length: 6 }, (_, i) => { const a = (-30 + i * 60) * Math.PI / 180; return `${(Math.cos(a) * s).toFixed(2)},${(Math.sin(a) * s).toFixed(2)}`; });
const center = (q, r) => [SQ3 * SIZE * (q + r / 2), SIZE * 1.5 * r];

function animalArt(a, small = false) {
  const svg = sv('svg', { viewBox: '0 0 48 48', 'aria-hidden': 'true' });
  svg.append(sv('circle', { cx: 24, cy: 24, r: 21, fill: '#fff', stroke: AN_COLOR[a], 'stroke-width': 4 }));
  if (a === 0) svg.append(sv('g', { fill: AN_COLOR[a] }, sv('ellipse', { cx: 24, cy: 28, rx: 9, ry: 8 }), ...[[15, 18], [21, 14], [28, 14], [34, 19]].map(([x, y]) => sv('circle', { cx:x, cy:y, r:4 }))));
  if (a === 1) svg.append(sv('g', { fill:'none', stroke:AN_COLOR[a], 'stroke-width':3.2, 'stroke-linecap':'round', 'stroke-linejoin':'round' }, sv('path', { d:'M18 37V24L12 16M18 23L25 14M14 19L9 20M14 19L14 13M25 28V20L33 12M28 18L37 18M33 14L33 9' }), sv('circle', { cx:22, cy:31, r:7, fill:AN_COLOR[a], stroke:'none' })));
  if (a === 2) svg.append(sv('g', { fill:AN_COLOR[a] }, sv('path', { d:'M9 25l9-8c9-4 16 1 20 7-4 7-12 11-20 7z' }), sv('path', { d:'M10 25L5 17v16z' }), sv('circle', { cx:31, cy:22, r:1.8, fill:'#fff' })));
  if (a === 3) svg.append(sv('path', { d:'M6 17c8 0 13 4 18 10 5-6 10-10 18-10-3 10-9 17-18 20-9-3-15-10-18-20zm14 8l4-13 4 13', fill:AN_COLOR[a] }));
  if (a === 4) svg.append(sv('g', { fill:AN_COLOR[a] }, sv('path', { d:'M11 13l10 5h6l10-5-3 15-10 10-10-10z' }), sv('path', { d:'M16 31l8 9 8-9', fill:'#fff' }), sv('circle', { cx:19, cy:25, r:1.7, fill:'#fff' }), sv('circle', { cx:29, cy:25, r:1.7, fill:'#fff' })));
  if (small) svg.setAttribute('class', 'animal');
  return svg;
}

function habitatMarks(g, t) {
  const hs = R.tileHabs(t);
  if (hs.includes(0)) g.append(sv('g', { fill:'#fff', opacity:.82 }, sv('path', { d:'M-27 14l7-14 7 14zM-16 19l8-16 8 16zM10 16l7-14 7 14z' })));
  if (hs.includes(1)) g.append(sv('path', { d:'M-29 17l12-25 8 13 9-20 20 32z', fill:'none', stroke:'#fff', opacity:.8, 'stroke-width':3, 'stroke-linejoin':'round' }));
  if (hs.includes(2)) g.append(sv('g', { fill:'#fff', opacity:.8 }, ...[[-24,-8],[-8,-15],[8,-7],[24,-14],[-18,14],[1,16],[22,9]].map(([x,y])=>sv('circle',{cx:x,cy:y,r:2.2}))));
  if (hs.includes(3)) g.append(sv('g', { stroke:'#fff', opacity:.82, 'stroke-width':2.4, 'stroke-linecap':'round' }, ...[-21,-10,2,14,25].map((x)=>sv('path',{d:`M${x} 17v-23m0 12l-5-5m5 0l5-6`}))));
  if (hs.includes(4)) g.append(sv('path', { d:'M-31-10c10-8 18 8 28 0s18 8 30 0M-31 8c10-8 18 8 28 0s18 8 30 0', fill:'none', stroke:'#fff', opacity:.86, 'stroke-width':3, 'stroke-linecap':'round' }));
}

function tileSvg(tid, rot = 0, cls = '') {
  const t = R.TILE_BY_ID[tid], svg = sv('svg', { viewBox:'-48 -45 96 90', class:`tl-minihex ${cls}`, 'aria-label':R.tileHabs(t).map((x)=>R.HAB_NAME[x]).join(' and ') }), g = sv('g');
  g.append(sv('polygon', { points:pts().join(' '), fill:HAB_COLOR[t.h[1] < 0 ? t.h[0] : t.h[1]], stroke:HAB_DARK[t.h[0]], 'stroke-width':3 }));
  if (t.h[1] >= 0) { const p=pts().map((x)=>x.split(',').map(Number)), half=[0,1,2,3].map((n)=>p[(rot+n)%6].join(',')).join(' '); g.append(sv('polygon',{points:half,fill:HAB_COLOR[t.h[0]]})); }
  habitatMarks(g,t); g.append(sv('polygon',{points:pts().join(' '),class:'tl-outline'})); svg.append(g); return svg;
}

function stateRng(host) {
  const next=()=>{host.rand=((host.rand>>>0)+0x6d2b79f5)>>>0;let t=host.rand;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
  return {next,int:n=>Math.floor(next()*n),shuffle(arr){const x=arr.slice();for(let i=x.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[x[i],x[j]]=[x[j],x[i]];}return x;}};
}

export function start(api) {
  const ids=api.players.map((p)=>p.id), meIndex=ids.indexOf(api.me), root=h('div.kt.wide.tl');
  api.root.append(h('style',CSS),root);
  const S={g:null,log:[],scores:null,view:meIndex>=0?meIndex:0,sel:null,refresh:null,zoom:1,panX:0,panY:0,cards:false,final:false};
  const playerName=(i)=>api.player(ids[i])?.name||'Explorer';
  const myTurn=()=>!!S.g&&!S.g.over&&S.g.turn===meIndex&&api.iAmPlayer;
  const viewBoard=(i=S.view)=>S.g?R.boardFromList(S.g.boards[i],S.g.nature[i]):R.newBoard();
  const scoreFor=(i)=>S.scores?.[i]?.total??(S.g?R.quickTotal(viewBoard(i),S.g.cards):0);

  api.on('state',(m)=>{const changed=S.g&&m.g.turnNo!==S.g.turnNo;S.g=m.g;S.log=m.log||[];S.scores=m.scores||null;S.final=!!m.final;if(changed||!myTurn()){S.sel=null;S.refresh=null;}if(changed){S.panX=S.panY=0;api.sfx(m.g.over?'good':'turn',.55);}render();});
  api.on('sfx',(m)=>api.sfx(m.k,m.v)); api.onPlayersChanged(render);

  function selectPair(i){if(!myTurn())return;S.sel={i,j:i,rot:0,q:null,r:null,tq:null,tr:null};api.sfx('chip',.55);render();}
  function selectTile(i,e){e?.stopPropagation();if(!myTurn())return;if(!S.sel)return selectPair(i);const j=S.sel.j;if(i!==j&&S.g.nature[meIndex]<1)return api.toast('A pinecone lets you split a pair');S.sel={...S.sel,i,q:null,r:null,tq:null,tr:null};api.sfx('click',.4);render();}
  function selectToken(j,e){e?.stopPropagation();if(!myTurn())return;if(!S.sel)return selectPair(j);const i=S.sel.i;if(i!==j&&S.g.nature[meIndex]<1)return api.toast('A pinecone lets you split a pair');S.sel={...S.sel,j,tq:null,tr:null};api.sfx('click',.4);render();}
  function placeAt(q,r){if(!myTurn()||!S.sel)return;S.sel={...S.sel,q,r,tq:null,tr:null};api.sfx('wood',.55);render();}
  function tokenAt(q,r){if(!myTurn()||!S.sel||S.sel.q===null)return;S.sel={...S.sel,tq:q,tr:r};api.sfx('chip',.6);render();}
  function submit(){if(!myTurn()||!S.sel||S.sel.q===null)return;api.toHost('take',{...S.sel});api.sfx('place',.7);S.sel=null;render();}
  function wipe(kind,idx){if(!myTurn()||!idx?.length)return;api.toHost('wipe',{kind,idx});api.sfx('shuffle',.55);S.refresh=null;render();}
  function toggleRefresh(i,e){e?.stopPropagation();if(S.refresh===null)return;S.refresh=S.refresh.includes(i)?S.refresh.filter((x)=>x!==i):[...S.refresh,i];render();}

  function boardSvg() {
    let b=viewBoard(); const canAct=myTurn()&&S.view===meIndex; let opens=canAct&&S.sel?R.openHexes(b):[], tokenSpots=[];
    if(canAct&&S.sel&&S.sel.q!==null){b=R.withTile(b,S.g.market.tiles[S.sel.i],S.sel.q,S.sel.r,S.sel.rot);tokenSpots=R.tokenSpots(b,S.g.market.tokens[S.sel.j]);opens=[];}
    const cells=[...b.cells.values()],coords=[...cells,...opens];let minX=-120,maxX=120,minY=-120,maxY=120;
    for(const c of coords){const[x,y]=center(c.q,c.r);minX=Math.min(minX,x-SIZE-20);maxX=Math.max(maxX,x+SIZE+20);minY=Math.min(minY,y-SIZE-20);maxY=Math.max(maxY,y+SIZE+20);}
    const baseW=Math.max(300,maxX-minX),baseH=Math.max(300,maxY-minY),w=baseW/S.zoom,hgt=baseH/S.zoom,cx=(minX+maxX)/2+S.panX,cy=(minY+maxY)/2+S.panY;
    const svg=sv('svg',{class:'tl-board',viewBox:`${cx-w/2} ${cy-hgt/2} ${w} ${hgt}`,role:'img','aria-label':`${playerName(S.view)}'s wilderness`});
    const drawTile=(c,isLast=false)=>{const[x,y]=center(c.q,c.r),t=R.TILE_BY_ID[c.t],g=sv('g',{transform:`translate(${x} ${y})`,class:`tl-hex${isLast?' last':''}`});
      g.append(sv('polygon',{points:pts().join(' '),fill:HAB_COLOR[t.h[1]<0?t.h[0]:t.h[1]],stroke:HAB_DARK[t.h[0]],'stroke-width':3}));
      if(t.h[1]>=0){const p=pts().map((z)=>z.split(',').map(Number)),half=[0,1,2,3].map((n)=>p[(c.rot+n)%6].join(',')).join(' ');g.append(sv('polygon',{points:half,fill:HAB_COLOR[t.h[0]]}));}
      habitatMarks(g,t);g.append(sv('polygon',{points:pts().join(' '),class:'tl-outline'}));
      if(t.key&&c.tok<0)g.append(sv('path',{d:'M0-13l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z',fill:'#fff',stroke:'#137333','stroke-width':2}));
      if(c.tok>=0){const tok=animalArt(c.tok);tok.setAttribute('x',-27);tok.setAttribute('y',-27);tok.setAttribute('width',54);tok.setAttribute('height',54);tok.setAttribute('class','tl-token');g.append(tok);}
      if(canAct&&S.sel?.q!==null&&tokenSpots.some((s)=>s.q===c.q&&s.r===c.r)){g.setAttribute('class',g.getAttribute('class')+' tokenable');g.addEventListener('click',(e)=>{e.stopPropagation();tokenAt(c.q,c.r);});g.append(sv('circle',{r:31,class:'tl-target'}));}
      if(S.sel?.tq===c.q&&S.sel?.tr===c.r)g.append(sv('circle',{r:34,fill:'none',stroke:AN_COLOR[S.g.market.tokens[S.sel.j]],'stroke-width':5}));svg.append(g);};
    const last=S.g.last[S.view];cells.forEach((c)=>drawTile(c,!!last&&last.q===c.q&&last.r===c.r));
    opens.forEach((c)=>{const[x,y]=center(c.q,c.r),g=sv('g',{transform:`translate(${x} ${y})`,class:'tl-hex legal',onclick:(e)=>{e.stopPropagation();placeAt(c.q,c.r);}});g.append(sv('polygon',{points:pts(39).join(' '),fill:'var(--surface)',stroke:'#34A853','stroke-width':4,'stroke-dasharray':'7 5'}));g.append(sv('text',{x:0,y:7,'text-anchor':'middle',fill:'#34A853','font-size':24,'font-weight':900},'+'));svg.append(g);});
    let drag=null;svg.addEventListener('pointerdown',(e)=>{if(e.target.closest?.('.legal,.tokenable'))return;drag={x:e.clientX,y:e.clientY,px:S.panX,py:S.panY};svg.setPointerCapture(e.pointerId);svg.classList.add('drag');});
    svg.addEventListener('pointermove',(e)=>{if(!drag)return;const box=svg.getBoundingClientRect();S.panX=drag.px-(e.clientX-drag.x)*w/box.width;S.panY=drag.py-(e.clientY-drag.y)*hgt/box.height;svg.setAttribute('viewBox',`${cx+S.panX-drag.px-w/2} ${cy+S.panY-drag.py-hgt/2} ${w} ${hgt}`);});
    const up=()=>{drag=null;svg.classList.remove('drag');};svg.addEventListener('pointerup',up);svg.addEventListener('pointercancel',up);return svg;
  }

  function market() {
    const g=S.g,active=myTurn(),pairs=g.market.tiles.map((tid,i)=>h('div.tl-pair'+(S.sel?.i===i&&S.sel?.j===i?'.sel':S.sel?.i===i||S.sel?.j===i?'.split':''),{onclick:()=>active&&S.refresh===null&&selectPair(i),'aria-label':`Draft pair ${i+1}`},h('span.num',i+1),tid==null?h('div.tl-minihex'):tileSvg(tid,0,S.sel?.i===i?'pick':''),g.market.tokens[i]<0?h('div.tl-wild'):h('button.tl-wild'+(S.refresh?.includes(i)||S.sel?.j===i?'.pick':''),{onclick:(e)=>S.refresh===null?selectToken(i,e):toggleRefresh(i,e),'aria-label':R.ANIMAL_NAME[g.market.tokens[i]]},animalArt(g.market.tokens[i]))));
    pairs.forEach((p,i)=>p.querySelector('.tl-minihex')?.addEventListener('click',(e)=>S.refresh===null&&selectTile(i,e)));
    const o=R.overpop(g),over=o&&o.n===3&&!g.freeWiped&&active?h('div.tl-over',h('span',`Three ${R.ANIMAL_NAME[o.animal].toLowerCase()} tokens.`),h('button.btn.tonal',{onclick:()=>wipe('free',o.idx)},'Refresh free')):null,pine=g.nature[meIndex]||0;
    return h('section.market-section',h('div.tl-section-head',h('b','Trailhead'),h('span.tl-round',g.over?'Trail complete':g.solo?`${20-g.turns[0]} turns left`:`Turn ${g.turnNo+1} / ${20*g.n}`)),h('div.tl-market',pairs),h('div.tl-resource',h('span.tl-pine','◆',`${pine} pinecone${pine===1?'':'s'}`),S.sel&&S.sel.i!==S.sel.j?h('span.chip.purple','Split pair · costs 1'):null,active&&pine>0&&S.refresh===null?h('button.btn.ghost',{onclick:()=>{S.sel=null;S.refresh=[];render();}},'Choose refresh · 1 pinecone'):null),over);
  }

  function scoreSection() {
    const b=viewBoard(),sc=R.scoreAnimals(b,S.g.cards),cor=R.corridors(b);
    return h('section.score-section',h('div.tl-section-head',h('b','Field guide'),h('button.btn.ghost',{onclick:()=>{S.cards=true;render();}},'Details')),h('div.tl-cards',S.g.cards.map((v,a)=>{const info=v==='F'||v==='I'?R.SIMPLE_CARD_INFO[v]:R.CARD_INFO[a][v];return h('button.tl-rule',{style:`--ac:${AN_COLOR[a]}`,onclick:()=>{S.cards=true;render();},title:info.text},animalArt(a,true),h('b',info.name),h('small',sc[a].pts+' pts'));})),h('div.tl-section-head',{style:'margin-top:9px'},h('b','Corridors'),h('span.tl-round',`Live ${scoreFor(S.view)} pts`)),h('div.tl-break',cor.map((c,i)=>h('div.tl-hab',{style:`--hc:${HAB_COLOR[i]}`,title:R.HAB_NAME[i]},h('i'),R.HAB_NAME[i],h('strong',c.size)))));
  }

  function prompt() {
    if(S.final)return h('div.tl-prompt',h('div.copy','Final scores are ready',h('small','Open the breakdown to see every point.')),h('button.btn.primary',{onclick:()=>{S.cards=true;render();}},'Score breakdown'));
    if(!myTurn())return h('div.tl-prompt',h('div.copy',`${playerName(S.g.turn)} is exploring…`,h('small',S.g.solo?'Plan your next placement.':`Viewing ${playerName(S.view)}'s wilderness`)));
    if(S.refresh!==null)return h('div.tl-prompt',h('div.copy','Choose wildlife to refresh',h('small',`${S.refresh.length} selected · costs one pinecone`)),h('button.btn.ghost',{onclick:()=>{S.refresh=null;render();}},'Cancel'),h('button.btn.primary',{disabled:!S.refresh.length,onclick:()=>wipe('nature',S.refresh)},'Refresh'));
    if(!S.sel)return h('div.tl-prompt',h('div.copy','Choose a habitat and wildlife pair',h('small','With a pinecone, tap separate pieces to split the pair.')));
    if(S.sel.q===null)return h('div.tl-prompt',h('button.tl-circle',{onclick:()=>{S.sel.rot=(S.sel.rot+5)%6;render();},'aria-label':'Rotate left'},'↶'),h('div.copy','Place the habitat on a green space',h('small','Drag the map to pan. Rotation matters where two habitats meet.')),h('button.tl-circle',{onclick:()=>{S.sel.rot=(S.sel.rot+1)%6;render();},'aria-label':'Rotate right'},'↷'),h('button.btn.ghost',{onclick:()=>{S.sel=null;render();}},'Undo'));
    const b=R.withTile(viewBoard(meIndex),S.g.market.tiles[S.sel.i],S.sel.q,S.sel.r,S.sel.rot),spots=R.tokenSpots(b,S.g.market.tokens[S.sel.j]);
    return h('div.tl-prompt',h('div.copy',S.sel.tq!==null?'Wildlife ready':spots.length?'Place the wildlife on a pulsing tile':'No matching open habitat',h('small',S.sel.tq!==null?'Confirm this complete turn.':'You may return an unplaced wildlife token to the bag.')),h('button.btn.ghost',{onclick:()=>{S.sel={...S.sel,q:null,r:null,tq:null,tr:null};render();}},'Undo'),h('button.btn.primary',{onclick:submit},S.sel.tq!==null?'Confirm':'Place without'));
  }

  const cardDetails=()=>S.g.cards.map((v,a)=>{const info=v==='F'||v==='I'?R.SIMPLE_CARD_INFO[v]:R.CARD_INFO[a][v];return h('div.tl-card-detail',{style:`--ac:${AN_COLOR[a]}`},h('h4',`${R.ANIMAL_NAME[a]} · ${info.name}`),h('p',info.text),h('table',h('tbody',info.rows.map(([x,y])=>h('tr',h('td',x),h('td',y))))));});
  function cardsDialog() {
    if(S.final&&S.scores){const top=Math.max(...S.scores.map((s)=>s.total));return h('div.tl-dialog',h('div.tl-dialog-head',h('h3','Final score trail'),h('button.tl-circle',{onclick:()=>{S.cards=false;render();},'aria-label':'Close'},'×')),h('div.tl-final',S.scores.map((s,i)=>h('div.tl-final-row'+(s.total===top?'.win':''),h('b',playerName(i)),h('span','Wildlife',h('strong',s.wild)),h('span','Habitats',h('strong',s.hab)),h('span','Bonus + cones',h('strong',s.maj+s.nature)),h('span','Total',h('strong',s.total))))),S.g.solo?h('div.kt-hint',`${R.soloRank(S.scores[0].total)} · solo trail rating`):null,...cardDetails());}
    return h('div.tl-dialog',h('div.tl-dialog-head',h('h3','Wildlife goals'),h('button.tl-circle',{onclick:()=>{S.cards=false;render();},'aria-label':'Close'},'×')),...cardDetails());
  }

  function render() {
    if(!S.g){root.replaceChildren(h('div.kt-hint','Preparing the trail…'));return;}
    const players=h('div.tl-top',ids.map((id,i)=>h('button.tl-player'+(S.g.turn===i&&!S.g.over?'.turn':'')+(S.view===i?'.view':''),{onclick:()=>{S.view=i;S.panX=S.panY=0;S.sel=i===meIndex?S.sel:null;render();}},avatarEl(api.player(id),'sm',{still:S.g.turn!==i}),h('span.who',playerName(i)+(i===meIndex?' · you':''),h('small',`${S.g.turns[i]}/20 tiles · ◆ ${S.g.nature[i]}`)),h('span.tl-score',scoreFor(i)))));
    const board=h('div.tl-board-card',h('div.tl-boardbar',h('strong',`${playerName(S.view)}'s wilderness`),S.view!==meIndex?h('button.btn.ghost',{onclick:()=>{S.view=meIndex;render();}},'My board'):null,h('span.spacer'),h('button.tl-circle',{onclick:()=>{S.zoom=clamp(S.zoom-.2,.65,1.8);render();},'aria-label':'Zoom out'},'−'),h('button.tl-circle',{onclick:()=>{S.zoom=1;S.panX=S.panY=0;render();},'aria-label':'Fit board'},'⌂'),h('button.tl-circle',{onclick:()=>{S.zoom=clamp(S.zoom+.2,.65,1.8);render();},'aria-label':'Zoom in'},'+')),boardSvg(),S.cards?cardsDialog():null);
    const log=h('section.log-section',h('div.tl-section-head',h('b','Trail notes'),h('span.tl-round',S.g.stack.length+' tiles left')),h('div.tl-log',(S.log.length?S.log.slice(0,8):['The trail is open.']).map((x)=>h('div',x))));
    root.replaceChildren(players,h('div.tl-main',board,h('aside.tl-side',market(),scoreSection(),log)),prompt());
  }

  if(api.isHost) {
    const restored=api.restore?.v===1?JSON.parse(JSON.stringify(api.restore)):null,H=restored||{v:1,rand:(Number(api.seed)||Date.now())>>>0,g:null,log:[],finished:false},rng=stateRng(H);
    if(!H.g){const mode=api.opts.scoring||'varied',cards=mode==='family'?Array(5).fill('F'):mode==='intermediate'?Array(5).fill('I'):mode==='starter'?Array(5).fill('A'):Array.from({length:5},()=>R.VARIANTS[rng.int(4)]);H.g=R.newGame(ids.length,rng,{cards,solo:ids.length===1});H.log=['A new trail begins.'];}
    const scores=()=>H.g.over?R.finalScores(H.g.boards.map((x,i)=>R.boardFromList(x,H.g.nature[i])),H.g.cards,{n:H.g.n,majority:api.opts.bonus!=='off'}):null;
    const pub=()=>{api.broadcast('state',{g:H.g,log:H.log,scores:scores(),final:H.g.over});api.save({v:1,rand:H.rand,g:H.g,log:H.log,finished:H.finished},{turn:ids[H.g.turn],label:H.g.over?'Trail complete':`Turn ${H.g.turnNo+1}`,over:H.g.over,summary:H.g.over?'Final scores ready':'Wilderness in progress',moves:H.g.turnNo});};
    const finish=()=>{if(H.finished)return;H.finished=true;const sc=scores(),ranking=ids.map((id,i)=>({id,score:sc[i].total,note:`${sc[i].wild} wildlife · ${sc[i].hab} habitat · ${sc[i].maj} bonus · ${sc[i].nature} pinecones`})).sort((a,b)=>b.score-a.score),top=ranking[0].score,winners=ranking.filter((x)=>x.score===top).map((x)=>x.id);api.endGame({title:H.g.solo?`${R.soloRank(top)} wilderness`:`${winners.map((id)=>api.player(id)?.name||'Explorer').join(' & ')} reached the summit!`,subtitle:`${top} points`,ranking,winners});};
    api.on('wipe',(m,from)=>{const pi=ids.indexOf(from);if(pi<0||R.doWipe(H.g,rng,pi,m?.kind,m?.idx))return;H.log.unshift(`${playerName(pi)} refreshed the wildlife row${m.kind==='nature'?' with a pinecone':''}.`);api.broadcast('sfx',{k:'shuffle',v:.55});pub();});
    api.on('take',(m,from)=>{const pi=ids.indexOf(from);if(pi<0)return;const out=R.doTake(H.g,rng,pi,m||{});if(out.err)return;const r=out.res,animal=r.tok>=0?` and placed a ${R.ANIMAL_NAME[r.tok].toLowerCase()}`:' and returned the wildlife';H.log.unshift(`${playerName(pi)} added ${R.tileHabs(R.TILE_BY_ID[r.tile]).map((x)=>R.HAB_NAME[x].toLowerCase()).join(' / ')}${animal}${r.gained?' · +1 pinecone':''}.`);api.broadcast('sfx',{k:r.gained?'good':'wood',v:.65});pub();if(H.g.over)api.timeout(finish,6500);});
    botLoop(api,()=>{if(H.g.over)return null;const pi=H.g.turn,id=ids[pi];if(!api.isBot(id))return null;const level=api.player(id)?.level||api.level,plan=planTurn(H.g,pi,level,rng,true);return{delay:thinkMs(level,650,950),run:()=>{if(H.g.over||H.g.turn!==pi)return;if(plan.wipe)api.botDo(id,'wipe',plan.wipe);else if(plan.move)api.botDo(id,'take',plan.move);}};});
    api.onRejoin(pub);api.onLeave(pub);api.timeout(()=>{pub();if(H.g.over)api.timeout(finish,3500);},450);
  }
  render();
}
