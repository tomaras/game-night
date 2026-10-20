// Original vector art for the court: six character portraits, the card back, coins and action glyphs.
// All hand-written SVG (no outside assets). Portraits are drawn on a 120x150 card face.
import { ROLES } from './coup-engine.js';

const SKIN = ['#F7CDA4', '#E3A877', '#B97A4E', '#8A5636'];

const wrap = (inner) => `<svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${inner}</svg>`;
const sparkle = (x, y, s, c = '#fff') => `<path d="M${x} ${y - s}L${x + s * 0.28} ${y - s * 0.28}L${x + s} ${y}L${x + s * 0.28} ${y + s * 0.28}L${x} ${y + s}L${x - s * 0.28} ${y + s * 0.28}L${x - s} ${y}L${x - s * 0.28} ${y - s * 0.28}Z" fill="${c}"/>`;

// ---------------------------------------------------------------- Duchess (purple): towering hair, tiara, pearl collar
const duchess = () => wrap(`
<rect width="120" height="150" fill="#A142F4"/>
<circle cx="60" cy="68" r="50" fill="#B772F7"/>
<circle cx="60" cy="68" r="38" fill="#C48CF9"/>
${sparkle(18, 28, 6, '#FFE082')}${sparkle(104, 40, 5, '#FFE082')}${sparkle(100, 92, 4, '#fff')}${sparkle(14, 84, 3.5, '#fff')}
<path d="M10 150C10 120 34 106 60 106C86 106 110 120 110 150Z" fill="#6A1FC2"/>
<path d="M22 150C24 128 40 116 60 116C80 116 96 128 98 150Z" fill="#8330DE"/>
<path d="M27 108L18 54Q60 28 102 54L93 108Q60 96 27 108Z" fill="#FFF3D6"/>
<path d="M27 108L18 54Q24 52 30 52L38 104Z M93 108L102 54Q96 52 90 52L82 104Z" fill="#F2DDA8"/>
<rect x="52" y="86" width="16" height="24" fill="${SKIN[0]}"/>
<path d="M44 100Q60 116 76 100" fill="none" stroke="#F7F4EE" stroke-width="3" stroke-dasharray="0.1 5.6" stroke-linecap="round"/>
<circle cx="60" cy="110" r="4.6" fill="#FFD54F"/><circle cx="60" cy="110" r="2.4" fill="#EA4335"/>
<circle cx="60" cy="22" r="15" fill="#2D1E4F"/><circle cx="60" cy="22" r="8" fill="#3B2A63"/>
<path d="M33 66C28 34 44 24 60 24C76 24 92 34 87 66C84 52 76 44 60 44C44 44 36 52 33 66Z" fill="#2D1E4F"/>
<ellipse cx="60" cy="64" rx="21" ry="25" fill="${SKIN[0]}"/>
<path d="M39 58C44 42 76 42 81 58C74 50 66 48 60 49C54 48 46 50 39 58Z" fill="#2D1E4F"/>
<path d="M38 40L44 28L52 36L60 22L68 36L76 28L82 40Z" fill="#FFC928"/>
<rect x="38" y="38" width="44" height="5" fill="#F9AB00"/>
<circle cx="60" cy="30" r="3.4" fill="#EA4335"/><circle cx="46" cy="36" r="2" fill="#4285F4"/><circle cx="74" cy="36" r="2" fill="#34A853"/>
<path d="M46 63Q50 60 54 63M66 63Q70 60 74 63" stroke="#2D1E4F" stroke-width="2.2" fill="none" stroke-linecap="round"/>
<path d="M45 57Q50 54 55 56M65 56Q70 54 75 57" stroke="#2D1E4F" stroke-width="1.8" fill="none" stroke-linecap="round"/>
<path d="M53 76Q60 82 68 75Q60 77 53 76Z" fill="#D93A55"/>
<circle cx="45" cy="71" r="4" fill="#F6A0A0" opacity=".55"/><circle cx="75" cy="71" r="4" fill="#F6A0A0" opacity=".55"/>
<circle cx="71" cy="74" r="1.1" fill="#2D1E4F"/>
<g transform="translate(88 118)"><circle r="14" fill="#FFC928"/><circle r="10.5" fill="#F9AB00"/><circle r="8.4" fill="#FFD54F"/><path d="M-4 3L-4.5-3L-2 0L0-4L2 0L4.5-3L4 3Z" fill="#F9AB00"/></g>
`);

// ---------------------------------------------------------------- Shade (red): hooded, glowing eyes, dagger
const shade = () => wrap(`
<rect width="120" height="150" fill="#EA4335"/>
<circle cx="60" cy="66" r="50" fill="#F06A5E"/>
<circle cx="82" cy="40" r="17" fill="#FFE082"/><circle cx="89" cy="36" r="15" fill="#F06A5E"/>
${sparkle(20, 34, 5, '#fff')}${sparkle(100, 100, 4, '#fff')}${sparkle(16, 90, 3, '#FFE082')}
<path d="M6 150C8 118 30 100 60 100C90 100 112 118 114 150Z" fill="#241A3F"/>
<path d="M60 12C32 14 22 44 24 74C26 92 40 104 60 104C80 104 94 92 96 74C98 44 88 14 60 12Z" fill="#241A3F"/>
<path d="M60 22C42 24 36 46 38 70C40 86 48 94 60 94C72 94 80 86 82 70C84 46 78 24 60 22Z" fill="#0E0A1F"/>
<path d="M60 12C46 14 40 26 38 30C48 22 72 22 82 30C80 26 74 14 60 12Z" fill="#3A2B66"/>
<path d="M38 66L60 112L82 66Q60 76 38 66Z" fill="#B3261E"/>
<path d="M38 66Q60 78 82 66L78 74Q60 86 42 74Z" fill="#D93025"/>
<path d="M44 52Q52 46 56 54Q50 58 44 52Z" fill="#FFEB3B"/><path d="M76 52Q68 46 64 54Q70 58 76 52Z" fill="#FFEB3B"/>
<ellipse cx="52" cy="53" rx="1.8" ry="2.6" fill="#0E0A1F"/><ellipse cx="68" cy="53" rx="1.8" ry="2.6" fill="#0E0A1F"/>
<g transform="rotate(24 94 100)"><path d="M91 54L97 54L99 108L89 108Z" fill="#ECEFF1"/><path d="M94 54L97 54L99 108L94 108Z" fill="#B0BEC5"/><rect x="82" y="106" width="24" height="6" rx="3" fill="#FFC928"/><rect x="90" y="112" width="8" height="22" rx="3" fill="#6A1FC2"/><circle cx="94" cy="136" r="4.2" fill="#FFC928"/><path d="M93 46L95 40L97 46L95 56Z" fill="#ECEFF1"/><path d="M96 78Q99 88 94 90" fill="none" stroke="#EA4335" stroke-width="2.4" stroke-linecap="round"/></g>
`);

// ---------------------------------------------------------------- Corsair (blue): tricorn, eye patch, bandana
const corsair = () => wrap(`
<rect width="120" height="150" fill="#4285F4"/>
<circle cx="60" cy="68" r="50" fill="#6E9FF7"/>
<path d="M-4 118Q30 104 60 118T124 118V150H-4Z" fill="#2F6FE0"/><path d="M-4 130Q30 116 60 130T124 130V150H-4Z" fill="#1A56C2"/>
${sparkle(100, 34, 5, '#fff')}${sparkle(18, 96, 4, '#fff')}
<g transform="rotate(-38 22 112)"><path d="M16 52L26 52L28 112L14 112Z" fill="#ECEFF1"/><path d="M21 52L26 52L28 112L21 112Z" fill="#B0BEC5"/><rect x="8" y="110" width="26" height="6" rx="3" fill="#FFC928"/><rect x="17" y="116" width="8" height="18" rx="3" fill="#7A3E12"/></g>
<path d="M12 150C14 122 34 108 60 108C86 108 106 122 108 150Z" fill="#F7F4EE"/>
<path d="M12 150C14 122 34 108 60 108L60 150Z" fill="#E3DED2"/>
<path d="M30 150L38 114M50 150L52 110M70 150L68 110M90 150L82 114" stroke="#EA4335" stroke-width="5"/>
<path d="M42 108L60 128L78 108L70 106L60 114L50 106Z" fill="#B3261E"/>
<rect x="52" y="88" width="16" height="22" fill="${SKIN[2]}"/>
<ellipse cx="60" cy="68" rx="22" ry="25" fill="${SKIN[2]}"/>
<path d="M39 76Q42 98 60 100Q78 98 81 76Q70 88 60 88Q50 88 39 76Z" fill="#2B1A12"/>
<path d="M50 80Q60 86 70 80Q64 90 60 90Q56 90 50 80Z" fill="#fff"/><path d="M52 81Q60 86 68 81" stroke="#2B1A12" stroke-width="1.4" fill="none"/>
<path d="M36 52C38 40 48 36 60 36C72 36 82 40 84 52L84 56C76 48 44 48 36 56Z" fill="#EA4335"/>
<circle cx="46" cy="44" r="1.8" fill="#fff"/><circle cx="56" cy="41" r="1.8" fill="#fff"/><circle cx="68" cy="42" r="1.8" fill="#fff"/><circle cx="77" cy="46" r="1.8" fill="#fff"/>
<path d="M34 54Q26 56 24 66Q32 62 38 60Z" fill="#EA4335"/>
<path d="M20 44Q60 6 100 44Q96 52 88 48Q60 32 32 48Q24 52 20 44Z" fill="#1F1A2E"/>
<path d="M20 44Q60 6 100 44L98 48Q60 14 22 48Z" fill="#FFC928"/>
<path d="M60 8Q40 8 34 30Q60 22 86 30Q80 8 60 8Z" fill="#2A2342"/>
<path d="M88 18Q104 4 112 14Q104 16 96 28Z" fill="#fff"/>
<circle cx="60" cy="25" r="5.5" fill="#FFC928"/><path d="M57 27L60 21L63 27Z M58 24H62" fill="none" stroke="#1F1A2E" stroke-width="1.2"/>
<path d="M44 66Q50 62 55 66" stroke="#2B1A12" stroke-width="2.4" fill="none" stroke-linecap="round"/>
<ellipse cx="68" cy="65" rx="6.4" ry="5.4" fill="#1F1A2E"/><path d="M36 52L68 65L84 54" stroke="#1F1A2E" stroke-width="2" fill="none"/>
<path d="M54 76Q61 80 66 74" stroke="#2B1A12" stroke-width="2" fill="none" stroke-linecap="round"/>
<circle cx="38" cy="76" r="3" fill="none" stroke="#FFC928" stroke-width="1.8"/>
`);

// ---------------------------------------------------------------- Envoy (green): feathered cap, sealed letter, ruff
const envoy = () => wrap(`
<rect width="120" height="150" fill="#34A853"/>
<circle cx="60" cy="68" r="50" fill="#5DBE78"/>
${sparkle(100, 30, 5, '#fff')}${sparkle(16, 40, 4, '#FFE082')}${sparkle(104, 96, 3.5, '#fff')}
<path d="M10 150C12 122 34 108 60 108C86 108 108 122 110 150Z" fill="#1E7E3C"/>
<path d="M26 150C28 130 42 120 60 120C78 120 92 130 94 150Z" fill="#26914A"/>
<path d="M60 108L52 150M60 108L68 150" stroke="#FFC928" stroke-width="2.4"/>
<g fill="#fff"><circle cx="40" cy="106" r="8"/><circle cx="50" cy="112" r="8"/><circle cx="60" cy="114" r="8"/><circle cx="70" cy="112" r="8"/><circle cx="80" cy="106" r="8"/></g>
<g fill="#E8E4DA"><circle cx="46" cy="112" r="4"/><circle cx="57" cy="116" r="4"/><circle cx="67" cy="116" r="4"/><circle cx="76" cy="112" r="4"/></g>
<rect x="52" y="88" width="16" height="22" fill="${SKIN[1]}"/>
<ellipse cx="60" cy="68" rx="21" ry="24" fill="${SKIN[1]}"/>
<path d="M38 64C36 44 48 40 60 40C72 40 84 44 82 64C78 54 70 50 60 50C50 50 42 54 38 64Z" fill="#4B2E1A"/>
<path d="M30 46Q60 22 90 46Q60 40 30 46Z" fill="#1E7E3C"/>
<path d="M36 46C38 24 82 24 84 46Z" fill="#2E9E52"/>
<rect x="34" y="42" width="52" height="6" rx="3" fill="#FFC928"/>
<path d="M82 36Q100 4 112 12Q106 30 90 42Z" fill="#fff"/><path d="M84 36Q98 12 108 14" stroke="#CFE9D6" stroke-width="2" fill="none"/>
<path d="M45 64Q50 61 54 64M66 64Q70 61 75 64" stroke="#3B2314" stroke-width="2.2" fill="none" stroke-linecap="round"/>
<circle cx="50" cy="66" r="2" fill="#3B2314"/><circle cx="70" cy="66" r="2" fill="#3B2314"/>
<path d="M50 74Q60 71 70 74Q66 79 60 77Q54 79 50 74Z" fill="#4B2E1A"/>
<path d="M54 80Q60 85 66 80" stroke="#3B2314" stroke-width="2" fill="none" stroke-linecap="round"/>
<g transform="rotate(-14 92 118)"><rect x="74" y="104" width="34" height="24" rx="2" fill="#FFF8E1"/><path d="M74 104L91 118L108 104" fill="none" stroke="#E0C98A" stroke-width="2"/><circle cx="91" cy="118" r="5.5" fill="#EA4335"/><circle cx="91" cy="118" r="2.6" fill="#B3261E"/></g>
<g transform="rotate(10 24 120)"><rect x="8" y="108" width="30" height="22" rx="2" fill="#E3F2FD"/><path d="M8 108L23 120L38 108" fill="none" stroke="#9EC6F5" stroke-width="2"/><circle cx="23" cy="120" r="4.5" fill="#FBBC05"/></g>
`);

// ---------------------------------------------------------------- Warden (yellow): crested helm, big shield
const warden = () => wrap(`
<rect width="120" height="150" fill="#FBBC05"/>
<circle cx="60" cy="68" r="50" fill="#FDD04F"/>
${sparkle(100, 28, 5, '#fff')}${sparkle(16, 56, 4, '#fff')}
<path d="M8 150C10 122 32 108 60 108C88 108 110 122 112 150Z" fill="#CBD2D9"/>
<path d="M8 150C10 122 32 108 60 108L60 150Z" fill="#AEB8C2"/>
<path d="M30 118Q60 132 90 118L86 108Q60 120 34 108Z" fill="#E8EDF2"/>
<rect x="52" y="90" width="16" height="22" fill="${SKIN[3]}"/>
<path d="M36 44C36 24 48 16 60 16C72 16 84 24 84 44L84 78C84 94 74 104 60 104C46 104 36 94 36 78Z" fill="#E8EDF2"/>
<path d="M36 44C36 24 48 16 60 16L60 104C46 104 36 94 36 78Z" fill="#CBD2D9"/>
<path d="M44 60L76 60L76 76Q76 92 60 96Q44 92 44 76Z" fill="${SKIN[3]}"/>
<path d="M44 54L76 54L76 62L44 62Z" fill="#1F2A37"/>
<rect x="58" y="54" width="4" height="30" fill="#E8EDF2"/>
<path d="M60 86Q64 90 68 87" stroke="#4B2E1A" stroke-width="2" fill="none" stroke-linecap="round"/>
<ellipse cx="51" cy="58" rx="3" ry="1.4" fill="#fff"/><ellipse cx="69" cy="58" rx="3" ry="1.4" fill="#fff"/>
<path d="M50 74Q55 72 58 74M62 74Q65 72 70 74" stroke="#4B2E1A" stroke-width="1.6" fill="none"/>
<path d="M56 4Q60 -2 64 4L68 18L52 18Z" fill="#EA4335"/><path d="M52 18L68 18L66 26L54 26Z" fill="#B3261E"/>
<path d="M34 38L86 38L86 44L34 44Z" fill="#FFC928"/>
<circle cx="60" cy="41" r="3.5" fill="#EA4335"/>
<path d="M14 92L60 80L106 92L106 126Q106 146 60 156Q14 146 14 126Z" fill="#4285F4"/>
<path d="M14 92L60 80L60 156Q14 146 14 126Z" fill="#2F6FE0"/>
<path d="M22 98L60 88L98 98L98 126Q98 140 60 148Q22 140 22 126Z" fill="none" stroke="#FFC928" stroke-width="3"/>
<path d="M60 104L66 116L79 117L69 126L72 139L60 132L48 139L51 126L41 117L54 116Z" fill="#FFC928"/>
`);

// ---------------------------------------------------------------- Oracle (teal): veiled seer with a third eye and crystal ball
const oracle = () => wrap(`
<rect width="120" height="150" fill="#12B5CB"/>
<circle cx="60" cy="66" r="50" fill="#47CADB"/>
${sparkle(16, 30, 5, '#fff')}${sparkle(104, 44, 4.5, '#FFE082')}${sparkle(98, 110, 3.5, '#fff')}${sparkle(24, 100, 3, '#FFE082')}
<path d="M6 150C8 120 30 104 60 104C90 104 112 120 114 150Z" fill="#6A1FC2"/>
<path d="M6 150C8 120 30 104 60 104L60 150Z" fill="#5517A5"/>
<g fill="#FFD54F"><circle cx="30" cy="124" r="2"/><circle cx="46" cy="136" r="2"/><circle cx="26" cy="142" r="2"/><circle cx="92" cy="128" r="2"/></g>
<path d="M60 8C34 10 24 34 26 66C28 86 40 100 60 100C80 100 92 86 94 66C96 34 86 10 60 8Z" fill="#5517A5"/>
<path d="M60 14C42 16 34 34 36 62L84 62C86 34 78 16 60 14Z" fill="#7B2FE0"/>
<ellipse cx="60" cy="64" rx="19" ry="23" fill="${SKIN[1]}"/>
<path d="M38 62C38 54 46 50 60 50C74 50 82 54 82 62L82 68Q60 56 38 68Z" fill="#5517A5"/>
<path d="M40 76Q60 66 80 76L76 92Q60 100 44 92Z" fill="#3B0E86"/>
<path d="M40 76Q60 66 80 76L80 80Q60 70 40 80Z" fill="#7B2FE0"/>
<path d="M44 64Q50 60 56 64Q50 67 44 64Z M64 64Q70 60 76 64Q70 67 64 64Z" fill="#fff"/>
<circle cx="50" cy="63.6" r="2" fill="#1F1A2E"/><circle cx="70" cy="63.6" r="2" fill="#1F1A2E"/>
<path d="M44 59Q50 55 56 59M64 59Q70 55 76 59" stroke="#3B0E86" stroke-width="1.6" fill="none"/>
<path d="M60 30L66 40L60 50L54 40Z" fill="#FFC928"/><circle cx="60" cy="40" r="3.6" fill="#fff"/><circle cx="60" cy="40" r="1.9" fill="#12B5CB"/>
<path d="M24 34L60 20L96 34L60 30Z" fill="#FFC928"/>
<circle cx="86" cy="124" r="19" fill="#E0F7FA"/><circle cx="86" cy="124" r="19" fill="none" stroke="#fff" stroke-width="2"/>
<path d="M68 124Q86 108 104 124Q86 140 68 124Z" fill="#fff" stroke="#12B5CB" stroke-width="2"/>
<circle cx="86" cy="124" r="6.4" fill="#12B5CB"/><circle cx="86" cy="124" r="3" fill="#0E0A1F"/><circle cx="88" cy="122" r="1.2" fill="#fff"/>
<path d="M66 144Q86 152 106 144L100 138L72 138Z" fill="#FFC928"/>
<path d="M28 112Q40 104 48 112L44 120Q38 114 32 120Z" fill="${SKIN[1]}"/>
`);

const ART = { duchess, shade, corsair, envoy, warden, oracle };
export const roleArt = (r) => (ART[r] || duchess)();

// ---------------------------------------------------------------- card back, coin, crown
export const crownPath = 'M-9 6L-11-6L-5-1L0-9L5-1L11-6L9 6Z';
export const cardBackArt = () => wrap(`
<rect width="120" height="150" fill="#2F58C9"/>
<g stroke="#4F7CF0" stroke-width="2.2" fill="none"><path d="M-30 30L150 210M-30 70L110 210M-30 110L70 210M-30 150L30 210M0 -60L150 90M0 -20L150 130M0 20L150 170M30 -30L150 50"/><path d="M150 30L-30 210M150 70L10 210M150 110L-50 310M150 150L90 210M120 -60L-30 90M120 -20L-30 130M120 20L-30 170M90 -30L-30 50"/></g>
<rect x="8" y="8" width="104" height="134" fill="none" stroke="#FFC928" stroke-width="2.4"/>
<rect x="13" y="13" width="94" height="124" fill="none" stroke="#9DB8F8" stroke-width="1"/>
<circle cx="60" cy="75" r="30" fill="#FFC928"/><circle cx="60" cy="75" r="25" fill="#2F58C9"/><circle cx="60" cy="75" r="22" fill="none" stroke="#FFC928" stroke-width="1.4"/>
<g transform="translate(60 76) scale(1.9)"><path d="${crownPath}" fill="#FFC928"/><circle cx="-11" cy="-7" r="1.7" fill="#FFC928"/><circle cx="0" cy="-10.4" r="1.7" fill="#FFC928"/><circle cx="11" cy="-7" r="1.7" fill="#FFC928"/><rect x="-9" y="7" width="18" height="2" fill="#FFC928"/></g>
${sparkle(24, 28, 5, '#FFC928')}${sparkle(96, 122, 5, '#FFC928')}${sparkle(96, 28, 3.5, '#9DB8F8')}${sparkle(24, 122, 3.5, '#9DB8F8')}
`);

export const coinSVG = () => `<svg viewBox="0 0 32 32" aria-hidden="true"><defs><radialGradient id="cpg" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#FFE57A"/><stop offset=".6" stop-color="#FBBC05"/><stop offset="1" stop-color="#E09A00"/></radialGradient></defs><circle cx="16" cy="16" r="15" fill="#C98A00"/><circle cx="16" cy="15" r="15" fill="url(#cpg)"/><circle cx="16" cy="15" r="11.2" fill="none" stroke="#C98A00" stroke-width="1.3"/><g transform="translate(16 16) scale(.62)"><path d="${crownPath}" fill="#C98A00"/></g></svg>`;

// ---------------------------------------------------------------- action glyphs (24x24, stroke/fill white via currentColor)
const G = {
  income: '<circle cx="12" cy="12" r="7" fill="currentColor"/><path d="M12 8v8M9.5 10.5h5" stroke="#0003" stroke-width="1.6" fill="none"/>',
  aid: '<circle cx="9" cy="13" r="5.4" fill="currentColor"/><circle cx="16" cy="9" r="5.4" fill="currentColor" opacity=".78"/>',
  coup: '<path d="M3 18L5 7l4.5 4L12 4l2.5 7L19 7l2 11Z" fill="currentColor"/><rect x="3" y="19" width="18" height="2.4" fill="currentColor"/>',
  tax: '<ellipse cx="12" cy="17" rx="7" ry="3" fill="currentColor"/><ellipse cx="12" cy="12.6" rx="7" ry="3" fill="currentColor" opacity=".85"/><ellipse cx="12" cy="8.2" rx="7" ry="3" fill="currentColor" opacity=".7"/>',
  assassinate: '<path d="M18 2l3.5 3.5L12 15 9 12Z" fill="currentColor"/><path d="M6 11l7 7-2.2 2.2-7-7Z M3.5 20.5l3-3" fill="currentColor"/><path d="M4 21l3-3" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  steal: '<path d="M5 12.5c0-2 1-3 2.4-3H9V6.5a1.5 1.5 0 013 0V9h1V7a1.5 1.5 0 013 0v2h1V8.5a1.5 1.5 0 013 0V15c0 4-3 7-7 7h-1.5C8 22 5 19 5 15Z" fill="currentColor"/>',
  exchange: '<path d="M4 8h13l-3.5-3.5L15 3l6.2 6.2L15 15.4l-1.5-1.5L17 10.4H4Z M20 16H7l3.5 3.5L9 21l-6.2-6.2L9 8.6l1.5 1.5L7 13.6H20Z" fill="currentColor"/>',
  swap: '<path d="M5 8h11l-3-3 1.5-1.5L20 9.2 14.5 14.8 13 13.3l3-3H5Z" fill="currentColor"/><path d="M7 15h12v3H7Z" fill="currentColor" opacity=".6"/>',
  examine: '<path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7S18.500 19 12 19 1.5 12 1.5 12Z" fill="currentColor"/><circle cx="12" cy="12" r="4.4" fill="#fff"/><circle cx="12" cy="12" r="2.2" fill="#000" opacity=".65"/>',
  convert: '<path d="M5 3h2v18H5Z M7 4h12l-3.5 4.5L19 13H7Z" fill="currentColor"/>',
  embezzle: '<path d="M3 11h18v9H3Z" fill="currentColor"/><path d="M3 11C3 6 7 4 12 4s9 2 9 7Z" fill="currentColor" opacity=".75"/><rect x="10.5" y="10" width="3" height="4.6" rx="1" fill="#0004"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.500 9-8 11C7.500 20 4 16 4 11V5Z" fill="currentColor"/>',
  hand: '<path d="M7 11V5.500a1.500 1.500 0 013 0V10h1V4a1.500 1.500 0 013 0v6h1V6a1.500 1.500 0 013 0v9c0 4-3 7-7 7-3.500 0-6-2-7-5l-1.500-3.500a1.400 1.400 0 012.400-1.300Z" fill="currentColor"/>',
  block: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3"/><path d="M6 6l12 12" stroke="currentColor" stroke-width="3"/>',
  challenge: '<path d="M12 3v11M12 18.500v2.500" stroke="currentColor" stroke-width="3.400" stroke-linecap="round"/>',
  ok: '<path d="M5 12.500l4.500 4.500L19 7.500" fill="none" stroke="currentColor" stroke-width="3.200" stroke-linecap="round" stroke-linejoin="round"/>',
};
export const glyph = (name, size = 24) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${G[name] || ''}</svg>`;
export { ROLES };
