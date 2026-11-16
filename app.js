(() => {
'use strict';
const { ORNAMENTS, RARITY, ornamentSrc, treeSrc, giftSrc, ART_READY } = window.XmasArt;
const API = window.XmasApi, { CANOPY } = API;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- 本地存储（读写失败也不影响使用） ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
function visitorToken() {
  let t = store.get('xmas_visitor', null);
  if (typeof t !== 'string' || t.length < 32) {
    t = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    store.set('xmas_visitor', t);
  }
  return t;
}
const myTrees = () => store.get('xmas_my_trees', []).filter(x => x && x.id && x.token);
function rememberTree(id, name, token) {
  const list = myTrees().filter(x => x.id !== id);
  list.unshift({ id, name, token, saved: Date.now() });
  store.set('xmas_my_trees', list.slice(0, 20));
}
function forgetTree(id) { store.set('xmas_my_trees', myTrees().filter(x => x.id !== id)); }
const tokenFor = id => (myTrees().find(x => x.id === id) || {}).token || null;

// ---------- 链接 ----------
const base = () => location.origin + location.pathname;
const mockQ = API.MOCK && new URLSearchParams(location.search).has('mock') ? '&mock=1' : '';
const visitorLink = id => `${base()}?t=${encodeURIComponent(id)}${mockQ}`;
const adminLink = (id, token) => `${visitorLink(id)}#k=${token}`;
function navTo(query) {
  const q = query ? `?${query}${mockQ}` : (mockQ ? `?${mockQ.slice(1)}` : '');
  history.pushState(null, '', base() + q);
  route();
}

// ---------- 小工具 ----------
let toastTimer;
function toast(text, ms = 2600) {
  const el = $('toast'); el.textContent = text; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
async function copyText(text, okMsg = '已复制链接') {
  try { await navigator.clipboard.writeText(text); toast(okMsg); return; } catch (e) {}
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.append(ta); ta.select();
  try { document.execCommand('copy'); toast(okMsg); } catch (e) { toast('复制失败，请长按链接手动复制'); }
  ta.remove();
}
async function shareTree(id, name) {
  const url = visitorLink(id), text = `快来装饰${name}的圣诞树！拆一个圣诞盲盒，挂上你的装饰 🎄`;
  if (navigator.share) { try { await navigator.share({ title: '圣诞盲盒树', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  copyText(`${text}\n${url}`, '邀请链接已复制，去发给朋友吧');
}
const ERR = {
  network: '网络好像断开了，请稍后再试',
  server: '服务器开小差了，请稍后再试',
  not_installed: '数据库还没有准备好（需要先运行 supabase_setup.sql）',
  not_found: '找不到这棵圣诞树',
  closed: '主人暂停了装饰，现在只能看看哦',
  bad_name: '名字需要 1–20 个字',
  busy: '参与的人太多啦，请过几分钟再试',
  forbidden: '管理凭据不对，无法管理这棵树',
  no_draw: '没有找到你抽到的挂件，请重新拆一次盲盒',
  bad_visitor: '浏览器标识异常，请刷新页面再试'
};
const errText = r => ERR[r && r.error] || '出了点小问题，请再试一次';
const ornName = id => (ORNAMENTS[id] || { name: '装饰' }).name;
const ornUnit = id => (ORNAMENTS[id] || { unit: '一个' }).unit;
const fmtDate = s => { if (!s) return ''; const d = new Date(s); return `${d.getMonth() + 1}月${d.getDate()}日`; };
const yearOf = s => (s ? new Date(s) : new Date()).getFullYear();
const nameLen = s => [...String(s || '').trim()].length;

// ---------- 音效（Web Audio 简单合成，可关闭） ----------
if (ART_READY.background) document.body.classList.add('art-bg');
let audioCtx = null, soundOn = store.get('xmas_sound', true);
function syncSoundBtn() { $('soundBtn').classList.toggle('off', !soundOn); $('soundBtn').textContent = soundOn ? '🔔' : '🔕'; }
function tone(freq, start, dur, type = 'sine', vol = 0.12) {
  if (!soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime + start, o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audioCtx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  } catch (e) {}
}
const sfx = {
  open() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.5, 'triangle')); },
  drop() { tone(880, 0, 0.25, 'sine', 0.1); tone(1320, 0.06, 0.3, 'sine', 0.06); },
  done() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.12, 0.6, 'triangle', 0.1)); },
  tap() { tone(660, 0, 0.12, 'sine', 0.06); }
};

// ---------- 雪花 ----------
(function snow() {
  const c = $('snow'), ctx = c.getContext('2d'); let W, H, flakes = [];
  const resize = () => { W = c.width = innerWidth * devicePixelRatio; H = c.height = innerHeight * devicePixelRatio; };
  resize(); addEventListener('resize', resize);
  const n = reduceMotion ? 25 : 70;
  for (let i = 0; i < n; i++) flakes.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 2.2, s: 0.0006 + Math.random() * 0.0014, w: Math.random() * 6 });
  function frame(t) {
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (const f of flakes) {
      if (!reduceMotion) { f.y += f.s; if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); } }
      const x = (f.x + Math.sin(t / 2000 + f.w) * 0.01) * W;
      ctx.beginPath(); ctx.arc(x, f.y * H, f.r * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
    }
    if (!reduceMotion) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

// ---------- 弹窗 ----------
let modalOnClose = null;
function openModal(html, { closable = true, onClose = null } = {}) {
  $('modal').innerHTML = (closable ? '<button class="close" type="button" data-close aria-label="关闭">×</button>' : '') + html;
  $('modalRoot').hidden = false; modalOnClose = onClose;
  $('modalRoot').dataset.closable = closable ? '1' : '';
  const first = $('modal').querySelector('input, .btn.primary'); if (first) setTimeout(() => first.focus(), 50);
}
function closeModal() { $('modalRoot').hidden = true; $('modal').innerHTML = ''; const f = modalOnClose; modalOnClose = null; if (f) f(); }
$('modalRoot').addEventListener('click', e => {
  if (e.target.closest('[data-close]') || (e.target === $('modalRoot') && $('modalRoot').dataset.closable)) closeModal();
});
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modalRoot').hidden && $('modalRoot').dataset.closable) closeModal(); });

// ---------- 页面切换 ----------
const S = { treeId: null, tree: null, decos: [], mine: null, token: null, placing: null, pollTimer: null, loading: false };
function show(screen) {
  ['screenHome', 'screenCreate', 'screenTree', 'screenMissing'].forEach(id => { $(id).hidden = id !== screen; });
  scrollTo(0, 0);
}
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]'); if (!go) return;
  e.preventDefault(); closeModal(); navTo(go.dataset.go === 'create' ? 'create=1' : '');
});
$('brandLink').addEventListener('click', e => { e.preventDefault(); navTo(''); });
$('soundBtn').addEventListener('click', () => { soundOn = !soundOn; store.set('xmas_sound', soundOn); syncSoundBtn(); if (soundOn) sfx.tap(); });

function route() {
  clearInterval(S.pollTimer); S.placing = null; $('tray').hidden = true; clearPreview();
  if (!$('modalRoot').hidden) closeModal();
  const p = new URLSearchParams(location.search);
  const id = p.get('t');
  if (id) return openTree(id);
  if (p.has('create')) { show('screenCreate'); $('ownerName').value = ''; setTimeout(() => $('ownerName').focus(), 50); return; }
  renderHome();
}

// ---------- 首页 ----------
function renderHome() {
  show('screenHome'); $('heroTree').src = treeSrc();
  const list = myTrees();
  $('myTrees').hidden = !list.length;
  $('myTreesList').innerHTML = list.map(x => `<li><a href="${esc(visitorLink(x.id))}" data-tree="${esc(x.id)}"><span>🎄 ${esc(x.name)}的圣诞树</span><span>›</span></a></li>`).join('');
}
$('myTreesList').addEventListener('click', e => { const a = e.target.closest('[data-tree]'); if (!a) return; e.preventDefault(); navTo('t=' + encodeURIComponent(a.dataset.tree)); });
$('goCreate').addEventListener('click', () => navTo('create=1'));

// ---------- 创建 ----------
$('createForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('ownerName').value.trim();
  if (nameLen(name) < 1 || nameLen(name) > 20) { toast(ERR.bad_name); return; }
  const btn = $('createBtn'); btn.disabled = true; btn.textContent = '正在种下圣诞树…';
  const r = await API.createTree(name);
  btn.disabled = false; btn.textContent = '创建我的圣诞树';
  if (!r || !r.ok) { toast(errText(r)); return; }
  rememberTree(r.tree_id, r.owner_name, r.admin_token);
  sfx.done();
  history.pushState(null, '', visitorLink(r.tree_id));
  await openTree(r.tree_id);
  showCreated(r.tree_id, r.owner_name, r.admin_token);
});
function showCreated(id, name, token) {
  openModal(`<div class="big-emoji">🎉</div><h2>${esc(name)}的圣诞树种好啦！</h2>
    <p class="section-title">① 邀请链接（发给朋友）</p>
    <div class="link-box"><input readonly value="${esc(visitorLink(id))}"><button class="btn soft small" data-copy="visitor">复制</button></div>
    <p class="section-title">② 管理链接（只留给自己）</p>
    <div class="link-box"><input readonly value="${esc(adminLink(id, token))}"><button class="btn soft small" data-copy="admin">复制</button></div>
    <p class="warn">管理链接是你管理这棵树的唯一钥匙，不需要账号，所以弄丢了无法找回。请复制保存到备忘录里，不要发给别人。这个浏览器也会记住它。</p>
    <div class="btns"><button class="btn primary" data-act="share">🎁 邀请朋友来装饰</button><button class="btn ghost" data-close>先看看我的圣诞树</button></div>`);
  $('modal').onclick = e => {
    const c = e.target.closest('[data-copy]'); if (c) copyText(c.dataset.copy === 'admin' ? adminLink(id, token) : visitorLink(id), c.dataset.copy === 'admin' ? '管理链接已复制，请存好' : '邀请链接已复制');
    if (e.target.closest('[data-act="share"]')) shareTree(id, name);
  };
}

// ---------- 圣诞树页面 ----------
async function openTree(id) {
  S.treeId = id; S.tree = null; S.decos = []; S.mine = null;
  // 管理链接：#k=凭据 → 记到本浏览器，然后从地址栏去掉，免得不小心分享出去
  const m = location.hash.match(/k=([0-9a-f]{32,})/i);
  if (m) {
    const r = await API.adminGet(id, m[1]);
    if (r && r.ok) { rememberTree(id, r.tree.owner_name, m[1]); toast('已进入主人模式'); } else toast(errText(r));
    history.replaceState(null, '', visitorLink(id));
  }
  S.token = tokenFor(id);
  show('screenTree'); $('treeImg').src = treeSrc();
  $('treeTitle').textContent = '🎄 圣诞树加载中…'; $('treeSub').textContent = ''; $('treeStats').textContent = '';
  $('treeActions').innerHTML = ''; $('ornLayer').innerHTML = '';
  const ok = await refreshTree();
  if (!ok) return;
  clearInterval(S.pollTimer);
  S.pollTimer = setInterval(() => { if (!S.placing && $('modalRoot').hidden && !document.hidden) refreshTree(true); }, 20000);
}
async function refreshTree(quiet = false) {
  const r = await API.getTree(S.treeId, visitorToken());
  if (!r || !r.ok) {
    if (r && r.error === 'not_found') { forgetTree(S.treeId); clearInterval(S.pollTimer); show('screenMissing'); return false; }
    if (!quiet) toast(errText(r));
    return false;
  }
  S.tree = r.tree; S.decos = r.decorations || []; S.mine = r.mine;
  const mt = myTrees().find(x => x.id === S.treeId); if (mt && mt.name !== r.tree.owner_name) rememberTree(S.treeId, r.tree.owner_name, mt.token);
  renderTree();
  return true;
}
const isOwner = () => !!S.token;

function renderTree() {
  const t = S.tree, n = S.decos.length, owner = esc(t.owner_name);
  document.title = `${t.owner_name}的圣诞树 · 圣诞盲盒树`;
  $('treeTitle').textContent = `🎄 ${t.owner_name}的圣诞树`;
  const friends = new Set(S.decos.map(d => d.visitor_name)).size;
  $('treeStats').textContent = n ? `树上已经有 ${n} 件装饰 · ${friends} 位朋友参与` : '';
  let sub;
  if (S.placing) sub = '';
  else if (isOwner()) sub = n ? `已经有朋友来装饰啦，点挂件看看是谁挂的` : '你的圣诞树还空空的，快邀请朋友们来装饰吧！';
  else if (S.mine && S.mine.status === 'placed') sub = `你给${t.owner_name}挂上了${ornUnit(S.mine.ornament_id)}${ornName(S.mine.ornament_id)}，谢谢你！`;
  else if (!t.decoration_enabled) sub = '主人暂停了装饰，现在只能看看哦';
  else sub = `快来给${t.owner_name}挂上一个圣诞装饰吧！`;
  $('treeSub').textContent = sub;
  renderOrnaments();
  if (S.placing) { $('treeActions').innerHTML = ''; return; }

  const a = [];
  const canDecorate = t.decoration_enabled;
  const mineDrawn = S.mine && S.mine.status === 'drawn';
  const minePlaced = S.mine && S.mine.status === 'placed';
  if (isOwner()) {
    a.push('<button class="btn primary" data-act="share">🎁 邀请朋友来装饰</button>');
    a.push('<button class="btn soft" data-act="copy">复制邀请链接</button>');
    a.push('<button class="btn green" data-act="admin">⚙️ 管理我的树</button>');
    a.push('<button class="btn soft" data-act="image">🖼️ 保存纪念图</button>');
    if (!canDecorate) a.push('<p class="notice">装饰已暂停：朋友现在只能看，不能抽盲盒。可在「管理我的树」里重新打开。</p>');
    else if (mineDrawn) a.push(`<button class="btn ghost" data-act="resume">继续挂上我的${esc(ornName(S.mine.ornament_id))}</button>`);
    else if (!minePlaced) a.push('<button class="btn ghost" data-act="decorate">我也给自己挂一个</button>');
  } else {
    if (mineDrawn) a.push(`<button class="btn primary big" data-act="resume">继续挂上我的${esc(ornName(S.mine.ornament_id))} 🎁</button>`);
    else if (minePlaced) a.push('<button class="btn primary" data-act="share">分享给其他朋友</button>');
    else if (canDecorate) a.push('<button class="btn primary big" data-act="decorate">🎁 我要装饰</button>');
    else a.push('<p class="notice">主人暂停了装饰，现在只能看看哦</p>');
    a.push('<button class="btn soft" data-go="create">🎄 我也要创建圣诞树</button>');
  }
  $('treeActions').innerHTML = a.join('');
}
$('treeActions').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, t = S.tree;
  if (act === 'share') shareTree(t.id, t.owner_name);
  else if (act === 'copy') copyText(visitorLink(t.id), '邀请链接已复制，去发给朋友吧');
  else if (act === 'admin') openAdmin();
  else if (act === 'image') saveImage();
  else if (act === 'decorate') askName();
  else if (act === 'resume') startPlacing(S.mine);
});

function ornEl(d, extra = '') {
  const o = ORNAMENTS[d.ornament_id] || {};
  return `<button class="orn ${o.rarity === 'rare' ? 'rare' : ''} ${extra}" type="button" data-id="${esc(d.id)}" style="left:${d.x * 100}%;top:${d.y * 100}%;animation-delay:${-((d.x * 7 + d.y * 3) % 3.6).toFixed(2)}s"
    aria-label="${esc(d.visitor_name)}挂上的${esc(o.name || '装饰')}"><img src="${ornamentSrc(d.ornament_id)}" alt=""></button>`;
}
function renderOrnaments(justId) {
  $('ornLayer').innerHTML = S.decos.filter(d => d.x != null).map(d => ornEl(d, d.id === justId ? 'just' : '')).join('');
  $('ornLayer').style.pointerEvents = S.placing ? 'none' : '';
  if (S.placing && S.placing.pos) drawPreview();
}
$('ornLayer').addEventListener('click', e => {
  const b = e.target.closest('.orn'); if (!b || S.placing) return;
  const d = S.decos.find(x => String(x.id) === b.dataset.id); if (!d) return;
  sfx.tap();
  const o = ORNAMENTS[d.ornament_id] || {};
  openModal(`<img class="orn-big" src="${ornamentSrc(d.ornament_id)}" alt="">
    <span class="badge ${o.rarity}">${RARITY[o.rarity] || ''}</span>
    <h2>${esc(d.visitor_name)}挂上的${esc(o.name || '装饰')}</h2>
    <p>${esc(S.tree.owner_name)}的圣诞树 · ${yearOf(S.tree.created_at)}${d.placed_at ? ' · ' + fmtDate(d.placed_at) : ''}</p>`);
});

// ---------- 拆盲盒 ----------
function askName() {
  const t = S.tree;
  openModal(`<div class="big-emoji">🎄</div><h2>欢迎来到${esc(t.owner_name)}的圣诞树！</h2>
    <form id="nameForm" autocomplete="off" style="display:grid;gap:12px;margin-top:10px">
      <label class="field" style="text-align:left"><span>你叫什么名字？</span><input id="visitorName" maxlength="20" placeholder="例如：宁宁" value="${esc(store.get('xmas_name', ''))}" required></label>
      <button class="btn primary big" type="submit">去拆圣诞盲盒 🎁</button>
    </form>`);
  $('nameForm').onsubmit = e => {
    e.preventDefault();
    const n = $('visitorName').value.trim();
    if (nameLen(n) < 1 || nameLen(n) > 20) { toast(ERR.bad_name); return; }
    store.set('xmas_name', n); openGift(n);
  };
}
function openGift(name) {
  openModal(`<p style="margin-top:0">圣诞老人为你准备了一个神秘装饰！</p>
    <div class="gift idle" id="gift"><div class="burst"></div><img class="box" src="${giftSrc('box')}" alt=""><img class="lid" src="${giftSrc('lid')}" alt=""></div>
    <div id="giftArea"><div class="btns"><button class="btn primary big" id="openGiftBtn">🎁 拆开礼物！</button></div></div>`, { closable: true, onClose: () => refreshTree(true) });
  let skipped = false;
  $('gift').onclick = () => $('openGiftBtn') && $('openGiftBtn').click();
  $('openGiftBtn').onclick = async () => {
    const gift = $('gift');
    $('giftArea').innerHTML = '<p class="skip"><button class="btn ghost small" id="skipBtn">跳过动画</button></p>';
    $('skipBtn').onclick = () => { skipped = true; };
    gift.classList.remove('idle'); gift.classList.add('shake');
    const req = API.draw(S.treeId, name, visitorToken());
    const wait = async ms => { const end = Date.now() + ms; while (!skipped && Date.now() < end) await sleep(50); };
    await wait(reduceMotion ? 0 : 1200);
    const r = await req;
    if (!r || !r.ok) {
      if (r && r.error === 'already_placed') { closeModal(); toast('你已经给这棵树挂过装饰啦'); refreshTree(); return; }
      if (!$('giftArea')) return; // 弹窗已关闭
      gift.classList.remove('shake'); gift.classList.add('idle');
      $('giftArea').innerHTML = `<p>${esc(errText(r))}</p><div class="btns"><button class="btn soft" data-close>好的</button></div>`;
      return;
    }
    if (!$('gift')) return; // 弹窗已关闭
    gift.classList.remove('shake'); gift.classList.add('open'); sfx.open();
    await wait(reduceMotion ? 0 : 800);
    showPrize(r.decoration, r.resumed);
  };
}
function showPrize(d, resumed) {
  const o = ORNAMENTS[d.ornament_id] || {};
  S.mine = d;
  $('modal').innerHTML = `<div class="prize"><img class="orn-big" src="${ornamentSrc(d.ornament_id)}" alt="">
    <span class="badge ${o.rarity}">${RARITY[o.rarity] || ''}</span>
    <h2>${resumed ? '你之前抽到的是' : '你抽到了'}${o.unit}${esc(o.name)}！</h2>
    <div class="btns"><button class="btn primary big" id="toPlace">把它挂到圣诞树上！</button></div></div>`;
  if (o.rarity === 'rare') sparkles($('modal'), 14);
  $('toPlace').onclick = () => { closeModal(); startPlacing(d); };
}

// ---------- 挂到树上 ----------
function startPlacing(d) {
  S.placing = { deco: d, pos: null, picked: true };
  $('tray').hidden = false;
  $('trayText').innerHTML = `恭喜${esc(d.visitor_name)}抽到了${ornUnit(d.ornament_id)}${esc(ornName(d.ornament_id))}！<br>把它拖到树上，或者直接点一下树上喜欢的位置。`;
  $('traySlot').innerHTML = `<img src="${ornamentSrc(d.ornament_id)}" alt="${esc(ornName(d.ornament_id))}" draggable="false">`;
  $('traySlot').className = 'tray-slot picked';
  $('confirmPlace').disabled = true;
  renderTree();
  $('stage').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  setHint('点树上的位置挂装饰');
}
function setHint(text) { $('dropHint').hidden = !text; $('dropHint').textContent = text || ''; }
function posValid(p) {
  if (!CANOPY.inside(p.x, p.y)) return 'outside';
  if (CANOPY.tooClose(S.decos, p.x, p.y)) return 'crowded';
  return '';
}
function drawPreview() {
  let el = $('previewOrn');
  const p = S.placing.pos, d = S.placing.deco;
  if (!el) {
    el = document.createElement('button'); el.type = 'button'; el.id = 'previewOrn';
    el.className = 'orn preview' + ((ORNAMENTS[d.ornament_id] || {}).rarity === 'rare' ? ' rare' : '');
    el.innerHTML = `<img src="${ornamentSrc(d.ornament_id)}" alt="">`;
    el.addEventListener('pointerdown', ev => beginDrag(ev, 'preview'));
    $('stage').append(el);
  }
  el.style.left = p.x * 100 + '%'; el.style.top = p.y * 100 + '%';
  const bad = posValid(p);
  el.classList.toggle('bad', !!bad);
  $('confirmPlace').disabled = !!bad;
  setHint(bad === 'outside' ? '要挂在树上哦' : bad === 'crowded' ? '这里有点挤，换个位置吧' : '满意就点「挂上去！」，也可以再拖动');
  $('traySlot').classList.add('empty'); $('traySlot').classList.remove('picked');
}
function clearPreview() { const el = $('previewOrn'); if (el) el.remove(); setHint(''); }
function relPos(clientX, clientY) {
  const r = $('stage').getBoundingClientRect();
  return { x: +((clientX - r.left) / r.width).toFixed(4), y: +((clientY - r.top) / r.height).toFixed(4), inside: clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom };
}
function setPos(p) { S.placing.pos = { x: Math.min(0.98, Math.max(0.02, p.x)), y: Math.min(0.98, Math.max(0.02, p.y)) }; drawPreview(); }

// 点树：直接把挂件放在这里
$('stage').addEventListener('click', e => {
  if (!S.placing || e.target.closest('#previewOrn')) return;
  const p = relPos(e.clientX, e.clientY); setPos(p); sfx.tap();
});
// 拖动：从托盘拖出，或拖动已放下的预览
let drag = null;
function beginDrag(ev, from) {
  if (!S.placing) return;
  ev.preventDefault();
  const ghost = document.createElement('img'); ghost.className = 'drag-ghost'; ghost.src = ornamentSrc(S.placing.deco.ornament_id);
  ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
  document.body.append(ghost);
  drag = { ghost, from, moved: false, x0: ev.clientX, y0: ev.clientY };
  if (from === 'preview') $('previewOrn').style.opacity = '.3';
}
addEventListener('pointermove', ev => {
  if (!drag) return;
  drag.ghost.style.left = ev.clientX + 'px'; drag.ghost.style.top = ev.clientY + 'px';
  if (Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) > 6) drag.moved = true;
}, { passive: true });
addEventListener('pointerup', ev => {
  if (!drag) return;
  const d = drag; drag = null; d.ghost.remove();
  const prev = $('previewOrn'); if (prev) prev.style.opacity = '';
  if (!d.moved) return; // 只是点了一下，交给 click 处理
  const p = relPos(ev.clientX, ev.clientY);
  if (p.inside) { setPos(p); sfx.tap(); }
  else if (d.from === 'tray') setHint('拖到树上再松手哦');
});
addEventListener('pointercancel', () => { if (drag) { drag.ghost.remove(); drag = null; const p = $('previewOrn'); if (p) p.style.opacity = ''; } });
$('traySlot').addEventListener('pointerdown', ev => { if (S.placing && !S.placing.pos) beginDrag(ev, 'tray'); });

$('autoPlace').addEventListener('click', () => {
  if (!S.placing) return;
  const from = S.placing.pos || { x: 0.5, y: 0.55 };
  const s = CANOPY.suggest(S.decos, from.x + (Math.random() - 0.5) * 0.3, from.y + (Math.random() - 0.5) * 0.3);
  if (!s) { toast('树上已经挂满啦，找不到空位了'); return; }
  setPos(s); sfx.tap();
});

let submitting = false;
$('confirmPlace').addEventListener('click', async () => {
  if (!S.placing || !S.placing.pos || submitting) return;
  submitting = true; $('confirmPlace').disabled = true; $('confirmPlace').textContent = '正在挂上去…';
  const { x, y } = S.placing.pos;
  let r = await API.place(S.treeId, visitorToken(), x, y);
  $('confirmPlace').textContent = '挂上去！'; submitting = false;
  if (!r || !r.ok) {
    if (r && (r.error === 'crowded' || r.error === 'outside')) {
      const fresh = await API.getTree(S.treeId, visitorToken()); if (fresh && fresh.ok) S.decos = fresh.decorations;
      renderOrnaments();
      if (r.suggest) { setPos(r.suggest); toast('这个位置刚被别人占了，帮你挪到旁边的空位，再点一次「挂上去！」'); }
      else toast('树上已经挂满啦，找不到空位了');
      return;
    }
    if (r && r.error === 'no_draw') { S.placing = null; $('tray').hidden = true; clearPreview(); refreshTree(); }
    toast(errText(r)); $('confirmPlace').disabled = false; return;
  }
  const d = r.decoration;
  S.placing = null; $('tray').hidden = true; clearPreview();
  await refreshTree();
  renderOrnaments(d.id);
  sfx.drop(); setTimeout(sfx.done, 350);
  $('stage').classList.remove('lights-on'); void $('stage').offsetWidth; $('stage').classList.add('lights-on');
  const el = $('ornLayer').querySelector(`[data-id="${CSS.escape(String(d.id))}"]`); if (el) sparkles(el, 10);
  await sleep(reduceMotion ? 100 : 1100);
  const t = S.tree;
  openModal(`<div class="big-emoji">🎄✨</div><h2>装饰成功！</h2>
    <p><b style="color:var(--ink)">${esc(d.visitor_name)}给${esc(t.owner_name)}的圣诞树挂上了${ornUnit(d.ornament_id)}${esc(ornName(d.ornament_id))}！</b></p>
    <p>这棵圣诞树因为你变得更加特别啦！</p>
    <div class="btns"><button class="btn primary" data-close>看看完整的圣诞树</button>
    <button class="btn soft" id="shareAfter">分享给其他朋友</button>
    <button class="btn ghost" data-go="create">我也要创建圣诞树</button></div>`);
  $('shareAfter').onclick = () => shareTree(t.id, t.owner_name);
});

function sparkles(anchor, n) {
  if (reduceMotion) return;
  const r = anchor.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span'); s.className = 'sparkle'; s.textContent = i % 3 ? '✦' : '✨';
    s.style.left = cx + 'px'; s.style.top = cy + 'px'; s.style.color = i % 2 ? '#ffe38a' : '#fff';
    const a = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 60;
    s.style.setProperty('--dx', Math.cos(a) * dist + 'px'); s.style.setProperty('--dy', Math.sin(a) * dist + 'px');
    document.body.append(s); setTimeout(() => s.remove(), 1100);
  }
}

// ---------- 主人管理 ----------
async function openAdmin() {
  openModal('<p>正在读取…</p>');
  const r = await API.adminGet(S.treeId, S.token);
  if (!r || !r.ok) { $('modal').innerHTML = `<button class="close" type="button" data-close>×</button><h2>无法管理</h2><p>${esc(errText(r))}</p>`; return; }
  const t = r.tree, s = r.stats;
  const list = r.decorations.slice().reverse().map(d => `<li><img src="${ornamentSrc(d.ornament_id)}" alt="">
      <div class="meta"><b>${esc(d.visitor_name)} · ${esc(ornName(d.ornament_id))}</b>${fmtDate(d.placed_at)} ${d.placed_at ? new Date(d.placed_at).toTimeString().slice(0, 5) : ''}</div>
      <button class="btn danger small" data-remove="${esc(d.id)}" data-label="${esc(d.visitor_name)}的${esc(ornName(d.ornament_id))}">删除</button></li>`).join('');
  openModal(`<h2>⚙️ 管理我的圣诞树</h2>
    <div class="admin-stats"><div><b>${s.placed}</b><span>树上的挂件</span></div><div><b>${s.participants}</b><span>参与人数</span></div><div><b>${s.pending}</b><span>抽了还没挂</span></div></div>
    <label class="switch-row"><span>允许朋友继续装饰<br><small style="color:var(--ink-soft)">关闭后朋友只能看，不能抽盲盒</small></span><input type="checkbox" id="enabledToggle" ${t.decoration_enabled ? 'checked' : ''}></label>
    <p class="section-title">树的名字</p>
    <div class="row"><input id="renameInput" maxlength="20" value="${esc(t.owner_name)}"><button class="btn soft small" id="renameBtn">保存</button></div>
    <p class="section-title">链接</p>
    <div class="btns" style="margin-top:4px"><button class="btn soft small" id="copyVisitor">复制邀请链接</button><button class="btn soft small" id="copyAdmin">复制管理链接（只给自己）</button><button class="btn soft small" id="saveImg">🖼️ 保存纪念图</button></div>
    <p class="section-title">挂件记录（${s.placed}）</p>
    ${list ? `<ul class="admin-list">${list}</ul>` : '<p>还没有朋友来挂装饰。</p>'}
    <p class="section-title" style="color:var(--red-dark)">危险操作</p>
    <button class="btn danger block" id="deleteTreeBtn">删除这棵圣诞树</button>`);
  const m = $('modal');
  $('enabledToggle').onchange = async e => {
    const r2 = await API.adminUpdate(S.treeId, S.token, { enabled: e.target.checked });
    if (!r2 || !r2.ok) { toast(errText(r2)); e.target.checked = !e.target.checked; return; }
    toast(e.target.checked ? '已允许朋友装饰' : '已暂停装饰，朋友现在只能看'); refreshTree(true);
  };
  $('renameBtn').onclick = async () => {
    const n = $('renameInput').value.trim(); if (nameLen(n) < 1 || nameLen(n) > 20) { toast(ERR.bad_name); return; }
    const r2 = await API.adminUpdate(S.treeId, S.token, { name: n });
    if (!r2 || !r2.ok) { toast(errText(r2)); return; }
    rememberTree(S.treeId, n, S.token); toast('名字已更新'); refreshTree(true);
  };
  $('copyVisitor').onclick = () => copyText(visitorLink(S.treeId), '邀请链接已复制');
  $('copyAdmin').onclick = () => copyText(adminLink(S.treeId, S.token), '管理链接已复制，请存好，不要发给别人');
  $('saveImg').onclick = () => saveImage();
  m.querySelectorAll('[data-remove]').forEach(b => b.onclick = async () => {
    if (!confirm(`确定要删除「${b.dataset.label}」吗？删除后不能恢复。`)) return;
    const r2 = await API.adminRemove(S.treeId, S.token, b.dataset.remove);
    if (!r2 || !r2.ok) { toast(errText(r2)); return; }
    toast('已删除这件挂件'); await refreshTree(true); openAdmin();
  });
  $('deleteTreeBtn').onclick = async () => {
    const typed = prompt(`删除后整棵树和所有朋友的装饰都会消失，不能恢复。\n确定要删除的话，请输入树的名字「${t.owner_name}」：`);
    if (typed == null) return;
    if (typed.trim() !== t.owner_name) { toast('名字不对，没有删除'); return; }
    const r2 = await API.adminDeleteTree(S.treeId, S.token);
    if (!r2 || !r2.ok) { toast(errText(r2)); return; }
    forgetTree(S.treeId); closeModal(); toast('圣诞树已删除'); navTo('');
  };
}

// ---------- 纪念图 ----------
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
async function saveImage() {
  toast('正在生成纪念图…', 1500);
  const W = 1080, H = 1500, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const bg = ART_READY.background ? await loadImg('art/background.jpg') : null;
  if (bg) { const s = Math.max(W / bg.width, H / bg.height); x.drawImage(bg, (W - bg.width * s) / 2, 0, bg.width * s, bg.height * s); }
  else {
    const g = x.createRadialGradient(W / 2, 0, 50, W / 2, H * 0.4, H); g.addColorStop(0, '#34507a'); g.addColorStop(0.45, '#23395a'); g.addColorStop(1, '#16243a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 90; i++) { x.beginPath(); x.arc(Math.random() * W, Math.random() * H, 1.5 + Math.random() * 4, 0, 7); x.fill(); }
  }
  const t = S.tree;
  x.fillStyle = '#fff7ea'; x.textAlign = 'center';
  x.font = 'bold 64px "PingFang SC","Microsoft YaHei",sans-serif'; x.fillText(`🎄 ${t.owner_name}的圣诞树`, W / 2, 120);
  const tw = 780, th = 1170, tx = (W - tw) / 2, ty = 170;
  const tree = await loadImg(treeSrc()); if (tree) x.drawImage(tree, tx, ty, tw, th);
  const size = tw * 0.12;
  for (const d of S.decos) {
    const im = await loadImg(ornamentSrc(d.ornament_id)); if (!im) continue;
    x.drawImage(im, tx + d.x * tw - size / 2, ty + d.y * th - size / 2, size, size);
  }
  const friends = new Set(S.decos.map(d => d.visitor_name)).size;
  x.font = '36px "PingFang SC","Microsoft YaHei",sans-serif'; x.fillStyle = '#f0e4cf';
  x.fillText(friends ? `${friends} 位朋友一起装饰 · ${S.decos.length} 件装饰 · ${yearOf(t.created_at)}` : `圣诞盲盒树 · ${yearOf(t.created_at)}`, W / 2, H - 70);
  let url;
  try { url = c.toDataURL('image/png'); } catch (e) { toast('生成图片失败'); return; }
  openModal(`<h2>🖼️ 纪念图</h2><img src="${url}" alt="圣诞树纪念图" style="width:100%;border-radius:14px;margin:8px 0">
    <p>手机上可以长按图片保存到相册。</p>
    <div class="btns"><a class="btn primary" href="${url}" download="${esc(t.owner_name)}的圣诞树.png">下载图片</a></div>`);
}

// ---------- 启动 ----------
syncSoundBtn();
addEventListener('popstate', route);
if (API.MOCK) console.info('[圣诞盲盒树] 模拟模式：数据只存在这个浏览器');
route();
})();
