// Bohnanza — styles (injected by beans.js). Uses the app tokens; the only literal colours are the bean colours,
// the coin gold and the card paper, which belong to the physical objects.
export const CSS = `
.bz { --cw: 62px; flex:1; min-height:0; min-width:0; display:flex; flex-direction:column; position:relative; font-family:var(--font); color:var(--on); overflow:hidden; }
.bz * { box-sizing:border-box; }
.bz svg.ic { width:20px; height:20px; fill:currentColor; flex:none; }

/* ------------------------------------------------------------------ top bar */
.bz-top { flex:none; display:flex; align-items:center; gap:10px; padding:8px 12px; background:var(--surface); box-shadow:var(--z1); position:relative; z-index:3; }
.bz-status { flex:1; min-width:0; }
.bz-status b { display:block; font:700 16px/1.2 var(--display); letter-spacing:-.01em; }
.bz-status span { display:block; font:500 12.5px/1.3 var(--font); color:var(--on2); margin-top:1px; }
.bz-status.mine b { color:var(--primary); }
.bz-piles { display:flex; gap:8px; align-items:center; flex:none; }
.bz-pile { position:relative; width:34px; height:46px; flex:none; }
.bz-pile .bz-pcard { position:absolute; inset:0; border-radius:var(--card-r,5px); overflow:hidden; background:#1E9E57; border:2px solid #fff; box-shadow:0 1px 2px rgba(0,0,0,.3); }
.bz-pile .bz-pcard:nth-child(1) { translate:0 3px; } .bz-pile .bz-pcard:nth-child(2) { translate:0 1.5px; }
.bz-pile .bz-pcard svg { width:100%; height:100%; display:block; }
.bz-pile.disc .bz-pcard { background:var(--s3); }
.bz-pile b { position:absolute; left:50%; bottom:-9px; translate:-50% 0; min-width:22px; height:18px; padding:0 5px; border-radius:9px; background:var(--on); color:var(--surface); font:800 11px/18px var(--font); text-align:center; z-index:2; }
.bz-pile.disc .bz-pcard .bz-card { position:absolute; inset:-2px; width:auto; height:auto; border-radius:0; }
.bz-pass { font:700 10.5px/1.1 var(--font); color:var(--on2); text-align:center; text-transform:uppercase; letter-spacing:.06em; width:40px; }
.bz-ib { width:38px; height:38px; border-radius:50%; border:0; background:var(--s2); color:var(--on); display:grid; place-items:center; cursor:pointer; flex:none; box-shadow:var(--z1); transition:box-shadow .15s, transform .15s; }
.bz-ib:hover { box-shadow:var(--z2); transform:translateY(-1px); } .bz-ib:active { box-shadow:var(--z1); transform:none; }
.bz-ib.on { background:var(--primary); color:#fff; }

/* ------------------------------------------------------------------ layout */
.bz-main { flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; padding:10px 10px 14px; display:flex; flex-direction:column; gap:10px; }
.bz-col { display:flex; flex-direction:column; gap:10px; min-width:0; }
@media (min-width: 980px) {
  .bz-main { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.05fr); gap:14px; overflow:hidden; padding:12px 14px; }
  .bz-col { overflow-y:auto; padding:2px 4px 14px 2px; min-height:0; }
  .bz { --cw: 70px; }
}
.bz-sec { font:700 11px/1 var(--font); letter-spacing:.09em; text-transform:uppercase; color:var(--on2); margin:2px 2px 6px; display:flex; align-items:center; gap:8px; }
.bz-sec i { flex:1; height:1px; background:var(--line); }
.bz-panel { background:var(--surface); border-radius:var(--r); box-shadow:var(--z1), inset 0 0 0 1px var(--line); padding:10px; }

/* ------------------------------------------------------------------ cards */
.bz-card { --cw:62px; position:relative; width:var(--cw); height:calc(var(--cw) * 1.42); flex:none; border-radius:var(--card-r,6px); background:var(--bc); border:2px solid #fff; box-shadow:0 1px 1px rgba(20,16,30,.25), 0 3px 8px rgba(20,16,30,.2); color:var(--ink,#fff); font-size:calc(var(--cw) / 10); user-select:none; overflow:hidden; contain:layout style; transition:box-shadow .15s; }
.bz-card.xl { --cw:124px; } .bz-card.lg { --cw:92px; } .bz-card.md { --cw:62px; } .bz-card.sm { --cw:40px; } .bz-card.xs { --cw:30px; }
.bz-card .t { position:absolute; left:0; right:0; top:.5em; text-align:center; font:800 max(9.5px, 1.2em)/1.1 var(--display); letter-spacing:.01em; white-space:nowrap; }
.bz-card .a { position:absolute; left:50%; top:2.7em; width:8.4em; height:8.4em; translate:-50% 0; border-radius:50%; background:#fff; }
.bz-card .a svg { position:absolute; inset:.35em; width:calc(100% - .7em); height:calc(100% - .7em); }
.bz-card .m { position:absolute; left:.5em; right:.5em; bottom:.5em; display:flex; gap:.3em; justify-content:center; }
.bz-card .m i { flex:1; display:flex; flex-direction:column; align-items:center; font-style:normal; line-height:1; background:rgba(255,255,255,0); }
.bz-card .m b { font:800 1.05em/1 var(--display); color:var(--ink,#fff); }
.bz-card .m s { text-decoration:none; width:1.9em; height:1.9em; border-radius:50%; background:#FBBC05; color:#6B4200; font:800 1.15em/1.9em var(--display); text-align:center; margin-top:.2em; box-shadow:0 0 0 .1em #E8A100 inset; }
.bz-card.md .m, .bz-card.sm .m, .bz-card.xs .m { display:none; }
.bz-card.sm .t, .bz-card.xs .t { display:none; }
.bz-card.sm .a, .bz-card.xs .a { top:50%; translate:-50% -50%; width:8.6em; height:8.6em; }
.bz-card.md .a { top:2.9em; }
/* hand cards: a compact index (bean + name down the side) plus a vertical bean-o-meter, so a fanned hand stays readable */
.bz-card.hand { --cw:64px; height:90px; }
.bz-card.hand .t, .bz-card.hand .m, .bz-card.hand .a { display:none; }
.bz-card .ci { display:none; }
.bz-card .vn, .bz-card .vm { display:none; }
.bz-card.hand .ci { display:block; position:absolute; left:2px; top:2px; width:30px; height:30px; border-radius:50%; background:#fff; }
.bz-card.hand .ci svg { position:absolute; inset:1px; width:28px; height:28px; }
.bz-card.hand .vn { position:absolute; left:2px; top:36px; width:30px; bottom:3px; writing-mode:vertical-rl; rotate:180deg; text-align:left; font:800 11px/30px var(--display); white-space:nowrap; letter-spacing:.02em; overflow:hidden; text-overflow:clip; }
.bz-card.hand .vm { position:absolute; right:3px; top:4px; bottom:3px; width:24px; display:flex; flex-direction:column; justify-content:space-between; gap:2px; }
.bz-card.hand .vm i { flex:1; display:flex; align-items:center; justify-content:space-between; font-style:normal; font:800 9.5px/1 var(--display); color:var(--ink,#fff); }
.bz-card.hand .vm s { text-decoration:none; width:11px; height:11px; border-radius:50%; background:#FBBC05; color:#6B4200; font:800 8px/11px var(--display); text-align:center; }
.bz-card.hand { transition:translate .18s var(--dec), box-shadow .15s; cursor:pointer; }
.bz-card.hand:hover { translate:0 -4px; }
.bz-card.click { cursor:pointer; }
.bz-card.sel { outline:3px solid var(--primary); outline-offset:1px; translate:0 -8px; z-index:5; box-shadow:0 6px 14px rgba(20,16,30,.35); }
.bz-card.dim { opacity:.4; }
.bz-card.nextc { outline:3px solid var(--accent); outline-offset:1px; box-shadow:0 0 0 5px rgba(255,200,61,0) , 0 6px 14px rgba(20,16,30,.35); z-index:6; }
.bz-card.new { animation:bzglow 1.2s ease-out; }
@keyframes bzglow { 0% { box-shadow:0 0 0 0 var(--accent), 0 3px 8px rgba(20,16,30,.2); } 100% { box-shadow:0 0 0 14px rgba(255,200,61,0), 0 3px 8px rgba(20,16,30,.2); } }
.bz-back { position:relative; width:var(--cw); height:calc(var(--cw) * 1.42); border-radius:var(--card-r,6px); border:2px solid #fff; overflow:hidden; background:#1E9E57; box-shadow:0 1px 2px rgba(0,0,0,.3); flex:none; }
.bz-back svg { width:100%; height:100%; display:block; }
.bz-tag { display:inline-flex; align-items:center; gap:4px; vertical-align:middle; font-weight:700; white-space:nowrap; }
.bz-tag i { width:16px; height:16px; border-radius:50%; background:var(--bc); display:inline-block; position:relative; flex:none; box-shadow:0 0 0 1.5px var(--bc); }
.bz-tag i svg { position:absolute; inset:0; width:100%; height:100%; border-radius:50%; background:#fff; padding:1px; }
.bz-coin { display:inline-block; width:1.1em; height:1.1em; vertical-align:-.2em; flex:none; } .bz-coin svg { width:100%; height:100%; display:block; }

/* ------------------------------------------------------------------ players */
.bz-opps { display:grid; grid-template-columns:repeat(auto-fill, minmax(168px, 1fr)); gap:8px; }
.bz-op { position:relative; background:var(--surface); border-radius:var(--r); box-shadow:var(--z1), inset 0 0 0 1px var(--line); padding:8px 9px 9px; cursor:pointer; text-align:left; border:0; color:inherit; font:inherit; transition:box-shadow .2s, translate .2s var(--dec); min-width:0; }
.bz-op:hover { box-shadow:var(--z2), inset 0 0 0 1px var(--line2); translate:0 -1px; }
.bz-op.turn { box-shadow:var(--z2), inset 0 0 0 2.5px var(--accent); }
.bz-op.left { opacity:.45; }
.bz-op .hd { display:flex; align-items:center; gap:7px; min-width:0; }
.bz-op .nm { font:700 13.5px/1.1 var(--display); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; }
.bz-op .st { display:flex; gap:8px; font:700 12px/1 var(--font); color:var(--on2); margin-top:6px; align-items:center; }
.bz-op .st span { display:inline-flex; align-items:center; gap:3px; }
.bz-op .st .hc { width:11px; height:15px; border-radius:2px; background:#1E9E57; border:1.5px solid var(--on3); display:inline-block; }
.bz-op .fl { display:flex; gap:5px; margin-top:7px; }
.bz-mf { flex:1; min-width:0; height:48px; border-radius:var(--r-s,4px); background:var(--s2); position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; font:800 10.5px/1 var(--display); color:var(--on2); }
.bz-mf.has { background:var(--s1); box-shadow:inset 0 0 0 2px var(--bc); color:var(--on); }
.bz-mf .bn { width:24px; height:24px; border-radius:50%; background:#fff; position:relative; margin-bottom:2px; box-shadow:0 0 0 1px var(--line); }
.bz-mf .bn svg { position:absolute; inset:1px; width:22px; height:22px; }
.bz-mf em { position:absolute; top:-5px; right:-3px; min-width:17px; height:17px; padding:0 4px; border-radius:9px; background:var(--bc); color:var(--ink,#fff); font:800 10px/17px var(--display); font-style:normal; text-align:center; box-shadow:0 1px 2px rgba(0,0,0,.25); }
.bz-mf.empty { color:var(--on3); font-weight:600; border:1.5px dashed var(--line2); background:transparent; }
.bz-mf .cv { display:flex; align-items:center; gap:2px; }
.bz-mf .cv .bz-coin { width:11px; height:11px; }
.bz-pend { display:flex; gap:4px; margin-top:6px; align-items:center; flex-wrap:wrap; font:600 11px var(--font); color:var(--on2); }
.bz-turnchip { position:absolute; top:-8px; left:10px; background:var(--accent); color:var(--on-accent,#2A2100); font:800 10px/1 var(--font); letter-spacing:.06em; text-transform:uppercase; padding:4px 7px; border-radius:var(--r-pill); }

/* ------------------------------------------------------------------ table: face-up + trade board */
.bz-center { display:flex; flex-direction:column; gap:10px; }
.bz-fu { display:flex; gap:12px; align-items:center; justify-content:flex-start; }
.bz-fu .cards { display:flex; gap:10px; min-height:calc(var(--cw) * 1.42 + 6px); align-items:center; }
.bz-fu .lbl { font:500 13px/1.35 var(--font); color:var(--on2); flex:1; min-width:0; }
.bz-fu .lbl b { display:block; color:var(--on); font:700 15px/1.2 var(--display); }
.bz-board-h { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.bz-board-h b { font:700 15px var(--display); flex:1; }
.bz-timer { height:5px; background:var(--s3); border-radius:3px; overflow:hidden; margin-bottom:8px; }
.bz-timer i { display:block; height:100%; width:100%; background:var(--orange); transform-origin:left; }
.bz-timer-t { font:600 12px var(--font); color:var(--on2); margin:-2px 0 6px; }
.bz-offers { display:flex; flex-direction:column; gap:7px; }
.bz-empty { color:var(--on2); font:500 13px/1.4 var(--font); padding:10px 4px; text-align:center; }
.bz-offer { position:relative; display:grid; grid-template-columns:1fr auto; gap:6px 8px; align-items:center; background:var(--s1); border-radius:var(--r-s,6px); padding:8px 8px 8px 10px; box-shadow:inset 0 0 0 1px var(--line); }
.bz-offer.forme { box-shadow:inset 0 0 0 2px var(--green); background:var(--surface); }
.bz-offer.mine { box-shadow:inset 0 0 0 2px var(--primary); background:var(--surface); }
.bz-offer .who { grid-column:1 / -1; display:flex; align-items:center; gap:6px; font:700 12px/1 var(--font); color:var(--on2); }
.bz-offer .who b { color:var(--on); font-weight:700; }
.bz-offer .who .ic { width:15px; height:15px; }
.bz-offer .sw { display:flex; align-items:center; gap:7px; flex-wrap:wrap; min-width:0; }
.bz-offer .side { display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
.bz-offer .side .none { font:600 12px var(--font); color:var(--on2); padding:0 4px; }
.bz-offer .ar { color:var(--on3); }
.bz-offer .acts { display:flex; gap:6px; align-items:center; }
.bz-cb { width:40px; height:40px; border-radius:50%; border:0; display:grid; place-items:center; cursor:pointer; color:#fff; box-shadow:var(--z1); transition:box-shadow .15s, transform .15s; flex:none; background:var(--s3); }
.bz-cb:hover { box-shadow:var(--z3); transform:translateY(-1px); } .bz-cb:active { box-shadow:var(--z1); transform:none; }
.bz-cb.ok { background:var(--green); } .bz-cb.no { background:var(--s2); color:var(--red); box-shadow:inset 0 0 0 2px var(--red), var(--z1); } .bz-cb.ctr { background:var(--s2); color:var(--primary); box-shadow:inset 0 0 0 2px var(--primary), var(--z1); }
.bz-cb.sm { width:34px; height:34px; } .bz-cb .ic { width:22px; height:22px; }
.bz-wchip { display:inline-flex; align-items:center; gap:5px; height:34px; padding:0 10px 0 4px; border-radius:var(--r-pill); background:var(--surface); box-shadow:inset 0 0 0 2px var(--bc), var(--z1); font:800 13px var(--display); white-space:nowrap; }
.bz-wchip .bn { width:26px; height:26px; border-radius:50%; background:#fff; position:relative; box-shadow:0 0 0 1px var(--line); } .bz-wchip .bn svg { position:absolute; inset:1px; width:24px; height:24px; }
.bz-wchip button { width:22px; height:22px; border-radius:50%; border:0; background:var(--s2); color:var(--on); font:800 14px/1 var(--font); cursor:pointer; padding:0; }

/* ------------------------------------------------------------------ offer builder */
.bz-builder { flex:none; background:var(--surface); box-shadow:0 -4px 16px rgba(20,16,30,.16); padding:10px 12px 12px; display:flex; flex-direction:column; gap:8px; max-height:58%; overflow-y:auto; position:relative; z-index:4; animation:bzup .26s var(--dec); }
@keyframes bzup { from { translate:0 40px; opacity:0; } }
.bz-builder .row1 { display:flex; align-items:center; gap:8px; }
.bz-builder .row1 b { font:700 15px var(--display); flex:1; }
.bz-to { display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; padding:1px 1px 3px; }
.bz-to button { display:inline-flex; align-items:center; gap:6px; flex:none; height:36px; padding:0 12px 0 4px; border-radius:var(--r-pill); border:0; background:var(--s2); color:var(--on); font:600 13px var(--font); cursor:pointer; }
.bz-to button.on { background:var(--primary); color:#fff; }
.bz-to button.pad { padding-left:12px; }
.bz-two { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.bz-tray { background:var(--s1); border-radius:var(--r-s,6px); box-shadow:inset 0 0 0 1px var(--line); padding:6px 8px 8px; min-height:104px; display:flex; flex-direction:column; gap:6px; min-width:0; }
.bz-tray h6 { margin:0; font:700 11px/1 var(--font); letter-spacing:.08em; text-transform:uppercase; color:var(--on2); }
.bz-tray .in { display:flex; flex-wrap:wrap; gap:5px; align-items:center; flex:1; }
.bz-tray .hint { font:500 12px/1.3 var(--font); color:var(--on3); }
.bz-types { display:flex; flex-wrap:wrap; gap:5px; }
.bz-tp { display:inline-flex; align-items:center; gap:4px; height:34px; padding:0 9px 0 3px; border-radius:var(--r-pill); border:0; background:var(--s2); color:var(--on); font:700 12px var(--font); cursor:pointer; box-shadow:inset 0 0 0 2px transparent; transition:box-shadow .15s; }
.bz-tp .bn { width:26px; height:26px; border-radius:50%; background:#fff; position:relative; } .bz-tp .bn svg { position:absolute; inset:1px; width:24px; height:24px; }
.bz-tp.on { box-shadow:inset 0 0 0 2px var(--bc); background:var(--surface); }

/* ------------------------------------------------------------------ my fields */
.bz-fields { display:flex; flex-direction:column; gap:9px; }
.bz-field { position:relative; background:var(--surface); border-radius:var(--r); box-shadow:var(--z1), inset 0 0 0 1px var(--line); padding:9px 10px 8px; transition:box-shadow .2s; }
.bz-field.empty { background:var(--s1); box-shadow:inset 0 0 0 2px var(--line2); }
.bz-field.target { box-shadow:var(--z2), inset 0 0 0 3px var(--green); cursor:pointer; animation:bzpulse 1.1s ease-in-out infinite; }
.bz-field.no { opacity:.5; }
.bz-field.make { box-shadow:var(--z2), inset 0 0 0 3px var(--orange); }
@keyframes bzpulse { 50% { box-shadow:var(--z3), inset 0 0 0 3px var(--green); translate:0 -2px; } }
.bz-field .fh { display:flex; align-items:center; gap:8px; margin-bottom:6px; min-height:40px; }
.bz-field .fn { font:700 11px/1 var(--font); letter-spacing:.08em; text-transform:uppercase; color:var(--on2); }
.bz-field .fv { flex:1; min-width:0; }
.bz-field .fv b { display:flex; align-items:center; gap:5px; font:800 18px/1.1 var(--display); letter-spacing:-.01em; }
.bz-field .fv b .bz-coin { width:20px; height:20px; }
.bz-field .fv span { display:block; font:500 12px/1.3 var(--font); color:var(--on2); }
.bz-hv { height:40px; padding:0 14px 0 10px; border-radius:var(--r-s,6px); border:0; background:var(--green); color:#fff; font:700 13.5px var(--font); display:inline-flex; align-items:center; gap:6px; cursor:pointer; box-shadow:var(--z1); transition:box-shadow .15s, transform .15s; flex:none; }
.bz-hv:hover { box-shadow:var(--z3); transform:translateY(-1px); } .bz-hv:active { box-shadow:var(--z1); transform:none; }
.bz-hv.off { background:var(--s3); color:var(--on3); box-shadow:none; }
.bz-hv.must { background:var(--orange); animation:bzpulse2 1s ease-in-out infinite; }
@keyframes bzpulse2 { 50% { translate:0 -2px; box-shadow:var(--z3); } }
.bz-stack { position:relative; height:calc(var(--cw) * 1.42 * .74 + 4px); margin-top:2px; }
.bz-stack .bz-card { position:absolute; top:0; --cw:46px; }
.bz-stack .bz-card.new { animation:bzland .5s var(--spring); }
@keyframes bzland { from { scale:1.25; } }
.bz-meter { position:relative; height:44px; margin:8px 6px 0; }
.bz-meter .tr { position:absolute; left:0; right:0; top:2px; height:9px; border-radius:5px; background:var(--s3); overflow:hidden; }
.bz-meter .tr i { display:block; height:100%; background:var(--bc); border-radius:5px; transition:width .5s var(--dec); }
.bz-meter .tk { position:absolute; top:0; translate:-50% 0; display:flex; flex-direction:column; align-items:center; gap:2px; font:700 10px/1 var(--font); color:var(--on3); }
.bz-meter .tk s { text-decoration:none; width:22px; height:22px; border-radius:50%; background:var(--s3); color:var(--on3); font:800 12px/22px var(--display); text-align:center; margin-top:3px; transition:background .3s, color .3s, scale .3s var(--spring); }
.bz-meter .tk.got s { background:#FBBC05; color:#6B4200; box-shadow:0 0 0 2px #E8A100 inset; scale:1.12; }
.bz-meter .tk.got { color:var(--on); }
.bz-meter .tk.last { translate:-100% 0; align-items:flex-end; }
.bz-farmhd { display:flex; align-items:center; gap:10px; }
.bz-farmhd .bz-sec { margin:0; flex:1; }
.bz-purse { display:inline-flex; align-items:center; gap:6px; font:800 17px var(--display); background:var(--surface); box-shadow:var(--z1), inset 0 0 0 1px var(--line); height:36px; padding:0 12px 0 8px; border-radius:var(--r-pill); }
.bz-purse .bz-coin { width:22px; height:22px; }
.bz-buy { height:36px; padding:0 12px; border-radius:var(--r-s,6px); border:0; background:var(--s2); color:var(--on); font:700 12.5px var(--font); cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:var(--z1); }
.bz-buy:disabled { opacity:.45; cursor:default; } .bz-buy.ready { background:var(--accent); color:var(--on-accent,#2A2100); }

/* ------------------------------------------------------------------ dock: actions + pending + hand */
.bz-dock { flex:none; background:var(--surface); box-shadow:0 -2px 10px rgba(20,16,30,.12); padding:8px 10px calc(8px + var(--sab,0px)); position:relative; z-index:5; display:flex; flex-direction:column; gap:7px; }
.bz-act { display:flex; gap:8px; align-items:center; min-height:40px; flex-wrap:wrap; }
.bz-act .sp { flex:1; }
.bz-btn { height:40px; padding:0 16px; border-radius:var(--r-s,6px); border:0; font:700 14px var(--font); display:inline-flex; align-items:center; gap:7px; cursor:pointer; background:var(--s2); color:var(--on); box-shadow:var(--z1); transition:box-shadow .15s, transform .15s; }
.bz-btn:hover { box-shadow:var(--z3); transform:translateY(-1px); } .bz-btn:active { box-shadow:var(--z1); transform:none; }
.bz-btn.pri { background:var(--primary); color:#fff; } .bz-btn.good { background:var(--green); color:#fff; } .bz-btn.acc { background:var(--accent); color:var(--on-accent,#2A2100); }
.bz-btn:disabled { opacity:.45; cursor:default; box-shadow:none; transform:none; }
.bz-pending { display:flex; align-items:center; gap:8px; }
.bz-pending .lb { font:700 11px/1.2 var(--font); letter-spacing:.06em; text-transform:uppercase; color:var(--orange); width:54px; flex:none; }
.bz-pending .cs { display:flex; gap:6px; overflow-x:auto; padding:6px 4px 6px 2px; scrollbar-width:none; }
.bz-handw { position:relative; }
.bz-hand { overflow-x:auto; overflow-y:visible; scrollbar-width:none; padding-top:16px; height:122px; }
.bz-hand::-webkit-scrollbar { display:none; }
.bz-hand-in { position:relative; height:100%; min-width:100%; }
.bz-hand-in .bz-card { position:absolute; top:16px; }
.bz-hand-in .bz-card.nextc { top:10px; }
.bz-hand-in .bz-card.sel { top:2px; translate:0 0; }
.bz-hand-lb { position:absolute; left:2px; top:-2px; z-index:7; font:800 10px/1 var(--font); letter-spacing:.08em; text-transform:uppercase; background:var(--accent); color:var(--on-accent,#2A2100); padding:3px 7px; border-radius:var(--r-pill); pointer-events:none; }
.bz-handempty { color:var(--on2); font:500 13px var(--font); padding:34px 4px; }
.bz-peek { position:absolute; left:50%; bottom:100%; translate:-50% -6px; z-index:20; background:var(--surface); border-radius:var(--r); box-shadow:var(--z4); padding:12px; display:flex; gap:12px; align-items:center; animation:bzup .2s var(--dec); max-width:96%; }
.bz-peek .tx { font:500 13px/1.4 var(--font); color:var(--on2); max-width:190px; }
.bz-peek .tx b { display:block; font:700 17px var(--display); color:var(--on); margin-bottom:4px; }

/* ------------------------------------------------------------------ sheets & overlays */
.bz-scrim { position:absolute; inset:0; background:var(--scrim); z-index:30; animation:fade .2s; display:flex; align-items:flex-end; justify-content:center; }
@media (min-width: 700px) { .bz-scrim { align-items:center; } }
.bz-sheet { background:var(--surface); width:min(560px,100%); max-height:88%; overflow-y:auto; border-radius:var(--r-l,8px) var(--r-l,8px) 0 0; box-shadow:var(--z5); padding:14px 14px 18px; animation:bzup .28s var(--dec); }
@media (min-width: 700px) { .bz-sheet { border-radius:var(--r-l,8px); } }
.bz-sheet h3 { margin:0 0 10px; display:flex; align-items:center; gap:8px; font:700 18px var(--display); }
.bz-sheet h3 span { flex:1; }
.bz-chart { width:100%; border-collapse:collapse; }
.bz-chart td { padding:6px 4px; border-bottom:1px solid var(--line); vertical-align:middle; font:600 13px var(--font); }
.bz-chart .nm { font:700 14px var(--display); }
.bz-chart .nm small { display:block; font:500 11px var(--font); color:var(--on2); }
.bz-chart .mt { display:flex; gap:4px; flex-wrap:wrap; }
.bz-chart .mt span { display:inline-flex; align-items:center; gap:3px; background:var(--s2); border-radius:var(--r-pill); height:24px; padding:0 8px 0 3px; font:700 12px var(--display); }
.bz-chart .mt span .bz-coin { width:17px; height:17px; }
.bz-chart .rm { text-align:right; font:700 12px var(--font); color:var(--on2); white-space:nowrap; }
.bz-log { display:flex; flex-direction:column; gap:1px; }
.bz-log div { font:500 13.5px/1.4 var(--font); padding:5px 2px; border-bottom:1px solid var(--line); }
.bz-log div.turn { font:700 11px/1.2 var(--font); letter-spacing:.08em; text-transform:uppercase; color:var(--on2); padding-top:10px; border-bottom:0; }
.bz-log div.me { }
.bz-pick { display:flex; flex-direction:column; gap:12px; }
.bz-pick .grp { display:flex; flex-wrap:wrap; gap:8px; }
.bz-pick .grp .bz-card { cursor:pointer; }
.bz-pick .pos { position:absolute; left:3px; bottom:3px; background:var(--on); color:var(--surface); font:800 10px/1 var(--font); padding:2px 5px; border-radius:var(--r-pill); }
.bz-final { position:absolute; inset:0; z-index:40; background:var(--bg); overflow-y:auto; padding:14px 12px 24px; display:flex; flex-direction:column; gap:10px; align-items:center; animation:fade .3s; }
.bz-final h2 { font:800 26px/1.1 var(--display); text-align:center; }
.bz-final .sub { color:var(--on2); font:500 14px/1.4 var(--font); text-align:center; margin-top:-4px; }
.bz-score { width:min(560px,100%); background:var(--surface); border-radius:var(--r); box-shadow:var(--z1), inset 0 0 0 1px var(--line); padding:10px 12px; }
.bz-score.win { box-shadow:var(--z2), inset 0 0 0 3px var(--accent); }
.bz-score .h { display:flex; align-items:center; gap:10px; }
.bz-score .h b { flex:1; font:700 16px var(--display); }
.bz-score .h .tot { font:800 26px/1 var(--display); display:flex; align-items:center; gap:6px; } .bz-score .h .tot .bz-coin { width:26px; height:26px; }
.bz-score .ln { display:flex; align-items:center; gap:8px; font:500 13px/1.3 var(--font); padding:5px 0; border-top:1px solid var(--line); }
.bz-score .ln:first-of-type { margin-top:8px; }
.bz-score .ln .g { margin-left:auto; font:800 14px var(--display); display:flex; align-items:center; gap:4px; }
.bz-score .ln .g .bz-coin { width:16px; height:16px; }
.bz-score .note { font:500 12px var(--font); color:var(--on2); margin-top:4px; }
.bz-flyfx { position:absolute; inset:0; pointer-events:none; z-index:60; overflow:hidden; }
.bz-flyfx .bz-card, .bz-flyfx .bz-back { box-shadow:0 4px 10px rgba(20,16,30,.3); }
.bz-flyfx .bz-card { --cw:36px; } .bz-flyfx .bz-back { --cw:34px; }
.bz-flyfx .coinfx { width:24px; height:24px; }
@keyframes fade { from { opacity:0; } }
@media (max-width: 420px) { .bz-top { padding:6px 10px; } .bz-opps { grid-template-columns:repeat(2, minmax(0,1fr)); } .bz-status b { font-size:15px; } }
@media (prefers-reduced-motion: reduce) { .bz-field.target, .bz-hv.must { animation:none; } }
`;
