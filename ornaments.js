// 挂件图鉴 + 占位美术（代码画的 SVG）。
// 正式美术在 art/（由 开发工具/导入美术.py 从 ChatGPT 原图切出）；ART_READY 某项改回 false 就退回占位图。
(() => {
'use strict';
const ART_READY = { ornaments: true, tree: true, gift: true, background: true };

// id 要和 supabase_setup.sql 里 xmas_draw 的奖池一致
const ORNAMENTS = {
  red_ball:         { name: '红色彩球',   unit: '一颗', rarity: 'common' },
  blue_ball:        { name: '蓝色彩球',   unit: '一颗', rarity: 'common' },
  candy_cane:       { name: '糖果拐杖',   unit: '一根', rarity: 'common' },
  snowflake:        { name: '雪花',       unit: '一片', rarity: 'common' },
  gold_bell:        { name: '金色铃铛',   unit: '一个', rarity: 'common' },
  pinecone:         { name: '小松果',     unit: '一颗', rarity: 'common' },
  gingerbread:      { name: '姜饼人',     unit: '一只', rarity: 'special' },
  red_bow:          { name: '红色蝴蝶结', unit: '一个', rarity: 'special' },
  teddy:            { name: '小熊',       unit: '一只', rarity: 'special' },
  stocking:         { name: '圣诞袜',     unit: '一只', rarity: 'special' },
  mini_gift:        { name: '迷你礼物盒', unit: '一个', rarity: 'special' },
  snowman:          { name: '小雪人',     unit: '一个', rarity: 'special' },
  glow_star:        { name: '发光星星',   unit: '一颗', rarity: 'rare' },
  crystal_reindeer: { name: '水晶驯鹿',   unit: '一只', rarity: 'rare' },
  crescent_moon:    { name: '月亮挂件',   unit: '一个', rarity: 'rare' }
};
const RARITY = { common: '普通装饰', special: '特别装饰', rare: '稀有装饰' };

const loop = '<circle cx="50" cy="9" r="5" fill="none" stroke="#c9a24a" stroke-width="2.5"/>';
const line = 'stroke="#5b3a2a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"';
const ball = (c1, c2) => `${loop}<rect x="43" y="13" width="14" height="8" rx="2" fill="#d8b25a" ${line}/>
  <circle cx="50" cy="55" r="33" fill="${c1}" ${line}/>
  <path d="M22 52 Q50 64 78 52" fill="none" stroke="${c2}" stroke-width="5" stroke-linecap="round"/>
  <path d="M24 64 Q50 76 76 64" fill="none" stroke="#fff6e0" stroke-width="3" stroke-dasharray="1 7" stroke-linecap="round"/>
  <ellipse cx="38" cy="40" rx="8" ry="5" fill="#fff" opacity=".55" transform="rotate(-30 38 40)"/>`;

const SVG = {
  red_ball: ball('#d9473f', '#f2c14e'),
  blue_ball: ball('#4a7fc9', '#fff6e0'),
  candy_cane: `${loop}<path d="M58 92 V38 Q58 16 40 16 Q24 16 24 32" fill="none" stroke="#5b3a2a" stroke-width="17" stroke-linecap="round"/>
    <path d="M58 92 V38 Q58 16 40 16 Q24 16 24 32" fill="none" stroke="#fffaf0" stroke-width="12" stroke-linecap="round"/>
    <path d="M58 92 V38 Q58 16 40 16 Q24 16 24 32" fill="none" stroke="#d9473f" stroke-width="12" stroke-dasharray="7 7"/>`,
  snowflake: `${loop}<g transform="translate(50 55)" stroke="#8fc6e8" stroke-width="5" stroke-linecap="round">
    ${[0, 60, 120].map(a => `<g transform="rotate(${a})"><line x1="0" y1="-36" x2="0" y2="36"/><path d="M-9 -26 L0 -17 L9 -26 M-9 26 L0 17 L9 26" fill="none"/></g>`).join('')}
    <circle r="6" fill="#fff" stroke="#8fc6e8"/></g>`,
  gold_bell: `${loop}<path d="M50 16 C30 16 26 38 25 60 L18 74 H82 L75 60 C74 38 70 16 50 16 Z" fill="#f2c14e" ${line}/>
    <circle cx="50" cy="80" r="7" fill="#d9a43a" ${line}/>
    <path d="M30 22 Q22 12 34 12 Q44 14 50 20 Q56 14 66 12 Q78 12 70 22" fill="#d9473f" ${line}/>
    <ellipse cx="38" cy="40" rx="5" ry="11" fill="#fff" opacity=".5"/>`,
  pinecone: `${loop}<path d="M44 16 Q50 12 56 16" ${line} fill="none"/><ellipse cx="50" cy="56" rx="24" ry="36" fill="#9b6a43" ${line}/>
    ${[30, 44, 58, 72].map((y, i) => `<path d="M${30 + i * 2} ${y} Q50 ${y + 10} ${70 - i * 2} ${y}" fill="none" stroke="#6e452a" stroke-width="3"/>`).join('')}
    <path d="M36 24 Q50 34 64 24" fill="none" stroke="#fff" stroke-width="5" opacity=".9" stroke-linecap="round"/>`,
  gingerbread: `${loop}<path d="M50 16 a14 14 0 1 1 -0.1 0 Z M36 44 H64 L84 50 Q88 58 80 60 L66 56 V70 L76 90 Q74 97 66 94 L50 76 L34 94 Q26 97 24 90 L34 70 V56 L20 60 Q12 58 16 50 Z" fill="#c9834a" ${line}/>
    <circle cx="45" cy="29" r="2.4" fill="#3a2418"/><circle cx="55" cy="29" r="2.4" fill="#3a2418"/><path d="M44 35 Q50 39 56 35" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="50" cy="52" r="3" fill="#d9473f"/><circle cx="50" cy="62" r="3" fill="#4a9a5e"/>
    <path d="M20 54 l6 2 M80 54 l-6 2 M30 88 l5 -4 M70 88 l-5 -4" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`,
  red_bow: `${loop}<path d="M50 50 C36 30 14 30 16 46 C18 60 36 60 50 50 Z M50 50 C64 30 86 30 84 46 C82 60 64 60 50 50 Z" fill="#d9473f" ${line}/>
    <path d="M46 54 L34 88 L42 84 L48 92 L50 56 Z M54 54 L66 88 L58 84 L52 92 L50 56 Z" fill="#c23a35" ${line}/>
    <rect x="42" y="42" width="16" height="16" rx="5" fill="#e8625a" ${line}/>`,
  teddy: `${loop}<circle cx="32" cy="28" r="9" fill="#b98055" ${line}/><circle cx="68" cy="28" r="9" fill="#b98055" ${line}/>
    <ellipse cx="50" cy="76" rx="22" ry="18" fill="#b98055" ${line}/><circle cx="50" cy="44" r="22" fill="#c98f62" ${line}/>
    <ellipse cx="50" cy="52" rx="9" ry="7" fill="#f0d2b0"/><circle cx="50" cy="49" r="3" fill="#3a2418"/>
    <circle cx="42" cy="40" r="2.6" fill="#3a2418"/><circle cx="58" cy="40" r="2.6" fill="#3a2418"/>
    <path d="M38 62 L50 68 L62 62 L58 72 L50 68 L42 72 Z" fill="#d9473f" ${line}/>`,
  stocking: `${loop}<path d="M34 26 H66 V58 L72 66 Q78 80 64 88 L40 92 Q22 92 24 78 Q26 70 36 66 Z" fill="#d9473f" ${line}/>
    <rect x="30" y="16" width="40" height="16" rx="6" fill="#fffaf0" ${line}/>
    <path d="M40 92 Q30 84 36 74" fill="none" stroke="#fffaf0" stroke-width="6" stroke-linecap="round"/>
    <path d="M44 44 l4 4 l6 -8 M48 56 l4 4 l6 -8" fill="none" stroke="#f2c14e" stroke-width="3" stroke-linecap="round"/>`,
  mini_gift: `${loop}<rect x="20" y="36" width="60" height="52" rx="5" fill="#4a9a5e" ${line}/>
    <rect x="16" y="28" width="68" height="14" rx="4" fill="#5fb072" ${line}/>
    <rect x="45" y="28" width="10" height="60" fill="#f2c14e"/>
    <path d="M50 28 C40 12 26 18 34 26 Z M50 28 C60 12 74 18 66 26 Z" fill="#f2c14e" ${line}/>`,
  snowman: `${loop}<circle cx="50" cy="72" r="22" fill="#fffaf2" ${line}/><circle cx="50" cy="40" r="16" fill="#fffaf2" ${line}/>
    <rect x="38" y="16" width="24" height="14" rx="2" fill="#3a3a4a" ${line}/><rect x="32" y="27" width="36" height="5" rx="2" fill="#3a3a4a" ${line}/>
    <circle cx="44" cy="38" r="2.4" fill="#3a2418"/><circle cx="56" cy="38" r="2.4" fill="#3a2418"/><path d="M50 43 L62 46 L50 47 Z" fill="#f0883e"/>
    <path d="M36 54 Q50 60 64 54 L66 62 Q50 66 34 62 Z" fill="#d9473f" ${line}/>`,
  glow_star: `<defs><radialGradient id="g_star"><stop offset="0" stop-color="#fff6c8"/><stop offset="1" stop-color="#ffe38a" stop-opacity="0"/></radialGradient></defs>
    <circle cx="50" cy="55" r="44" fill="url(#g_star)"/>${loop}
    <path d="M50 18 L60 42 L86 44 L66 60 L72 86 L50 72 L28 86 L34 60 L14 44 L40 42 Z" fill="#f7cf4f" ${line}/>
    <path d="M50 30 L55 44 L44 44 Z" fill="#fff" opacity=".7"/>`,
  crystal_reindeer: `<defs><linearGradient id="g_ice" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8f7ff"/><stop offset="1" stop-color="#9fd3f0"/></linearGradient></defs>${loop}
    <path d="M38 34 L30 18 M30 18 L22 20 M30 18 L32 10 M62 34 L70 18 M70 18 L78 20 M70 18 L68 10" fill="none" stroke="#c9a24a" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M36 30 L64 30 L70 56 L58 84 L42 84 L30 56 Z" fill="url(#g_ice)" ${line}/>
    <path d="M36 30 L50 46 L64 30 M30 56 L50 46 L70 56 M42 84 L50 46 L58 84" fill="none" stroke="#fff" stroke-width="1.8" opacity=".9"/>
    <circle cx="50" cy="78" r="5" fill="#ff8a8a"/><circle cx="42" cy="50" r="2.4" fill="#3a2418"/><circle cx="58" cy="50" r="2.4" fill="#3a2418"/>`,
  crescent_moon: `<defs><radialGradient id="g_moon"><stop offset="0" stop-color="#fff3c4"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient></defs>
    <circle cx="50" cy="55" r="44" fill="url(#g_moon)"/>${loop}
    <path d="M62 18 A36 36 0 1 0 84 70 A28 28 0 1 1 62 18 Z" fill="#f5d77a" ${line}/>
    <circle cx="44" cy="58" r="2.4" fill="#3a2418"/><path d="M40 66 Q45 70 50 66" fill="none" stroke="#3a2418" stroke-width="2" stroke-linecap="round"/>
    <path d="M74 30 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z" fill="#fff"/>`
};

const svgDoc = (inner, vb = '0 0 100 100') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${inner}</svg>`;
const dataUrl = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

function ornamentSrc(id) {
  if (!ORNAMENTS[id]) id = 'red_ball';
  if (ART_READY.ornaments) return `art/ornaments/${id}.webp`;
  return dataUrl(svgDoc(SVG[id] || SVG.red_ball));
}

// 圣诞树：画框 200×300（宽:高 = 2:3），树冠形状要和 app.js 的 CANOPY 对得上
const TREE_SVG = svgDoc(`
  <defs>
    <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f9a5d"/><stop offset="1" stop-color="#2f7445"/></linearGradient>
  </defs>
  <ellipse cx="100" cy="286" rx="70" ry="9" fill="#000" opacity=".12"/>
  <rect x="88" y="248" width="24" height="36" rx="4" fill="#8a5a3b" stroke="#5b3a2a" stroke-width="2.5"/>
  <path d="M100 118 L10 250 Q30 262 55 252 Q78 264 100 254 Q122 264 145 252 Q170 262 190 250 Z" fill="url(#tg)" stroke="#24563a" stroke-width="3" stroke-linejoin="round"/>
  <path d="M100 62 L36 182 Q54 192 74 184 Q88 192 100 186 Q112 192 126 184 Q146 192 164 182 Z" fill="url(#tg)" stroke="#24563a" stroke-width="3" stroke-linejoin="round"/>
  <path d="M100 26 L58 112 Q72 120 86 114 Q100 120 114 114 Q128 120 142 112 Z" fill="url(#tg)" stroke="#24563a" stroke-width="3" stroke-linejoin="round"/>
  <path d="M30 236 Q60 246 90 236 M50 172 Q76 180 98 172 M70 104 Q86 110 98 104" fill="none" stroke="#fff" stroke-width="5" opacity=".75" stroke-linecap="round"/>
  <path d="M100 4 L105 17 L119 18 L108 26 L112 40 L100 32 L88 40 L92 26 L81 18 L95 17 Z" fill="#f7cf4f" stroke="#c9952e" stroke-width="2"/>
`, '0 0 200 300');
function treeSrc() { return ART_READY.tree ? 'art/tree.webp' : dataUrl(TREE_SVG); }

// 礼物盒：closed / open 两种状态（占位用同一张 SVG，盖子单独一层方便做动画）
const GIFT_BOX = svgDoc(`
  <ellipse cx="100" cy="186" rx="70" ry="10" fill="#000" opacity=".14"/>
  <rect x="34" y="86" width="132" height="96" rx="10" fill="#d9473f" stroke="#7a2a24" stroke-width="3"/>
  <rect x="91" y="86" width="18" height="96" fill="#f2c14e"/>
  <text x="100" y="150" text-anchor="middle" font-size="44" font-weight="700" fill="#fff6e0" font-family="sans-serif">?</text>
`, '0 0 200 200');
const GIFT_LID = svgDoc(`
  <rect x="24" y="66" width="152" height="28" rx="8" fill="#e8625a" stroke="#7a2a24" stroke-width="3"/>
  <rect x="91" y="66" width="18" height="28" fill="#f2c14e"/>
  <path d="M100 66 C80 30 52 40 66 60 Z M100 66 C120 30 148 40 134 60 Z" fill="#f2c14e" stroke="#b9862a" stroke-width="3"/>
`, '0 0 200 200');
function giftSrc(part) {
  if (ART_READY.gift) return part === 'lid' ? 'art/gift_lid.webp' : 'art/gift_box.webp';
  return dataUrl(part === 'lid' ? GIFT_LID : GIFT_BOX);
}

window.XmasArt = { ART_READY, ORNAMENTS, RARITY, ornamentSrc, treeSrc, giftSrc };
})();
