// 数据接口：正式版调用 Supabase 的 xmas_ 函数；?mock=1 时用浏览器本地的模拟数据库（规则和 SQL 一致，只用于试玩和测试）
(() => {
'use strict';
const cfg = window.XMAS_CONFIG || {};
const params = new URLSearchParams(location.search);
const MOCK = params.has('mock') || !cfg.supabaseUrl || !cfg.supabaseAnonKey;

// 树冠范围和最小间距（要和 supabase_setup.sql 保持一致）
const CANOPY = {
  inside(x, y) { return y >= 0.18 && y <= 0.80 && Math.abs(x - 0.5) <= 0.03 + (y - 0.17) * 0.55; },
  dist(a, b) { return Math.hypot(a.x - b.x, (a.y - b.y) * 1.5); },
  MIN: 0.075,
  tooClose(decos, x, y, ignoreId) { return decos.some(d => d.id !== ignoreId && d.x != null && CANOPY.dist(d, { x, y }) < CANOPY.MIN); },
  suggest(decos, x, y) {
    let best = null, bd = 1e9;
    for (let gy = 0.16; gy <= 0.8201; gy += 0.02) for (let gx = 0.06; gx <= 0.9401; gx += 0.02) {
      if (!CANOPY.inside(gx, gy) || CANOPY.tooClose(decos, gx, gy)) continue;
      const d = (gx - x) ** 2 + ((gy - y) * 1.5) ** 2;
      if (d < bd) { bd = d; best = { x: +gx.toFixed(3), y: +gy.toFixed(3) }; }
    }
    return best;
  }
};

async function rpc(fn, args) {
  let res;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl && setTimeout(() => ctl.abort(), 15000);
  try {
    res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${cfg.supabaseAnonKey}` },
      body: JSON.stringify(args),
      signal: ctl ? ctl.signal : undefined
    });
  } catch (e) { return { ok: false, error: 'network' }; }
  finally { if (timer) clearTimeout(timer); }
  if (!res.ok) return { ok: false, error: res.status === 404 ? 'not_installed' : 'server', status: res.status };
  try { return await res.json(); } catch (e) { return { ok: false, error: 'server' }; }
}

// ---------- 模拟数据库 ----------
const MOCK_KEY = 'xmas_mock_db_v1';
const POOL = {
  common: ['red_ball', 'blue_ball', 'candy_cane', 'snowflake', 'gold_bell', 'pinecone'],
  special: ['gingerbread', 'red_bow', 'teddy', 'stocking', 'mini_gift', 'snowman'],
  rare: ['glow_star', 'crystal_reindeer', 'crescent_moon']
};
const rid = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
const db = () => { try { return JSON.parse(localStorage.getItem(MOCK_KEY)) || { trees: {}, decos: [] }; } catch (e) { return { trees: {}, decos: [] }; } };
const put = d => localStorage.setItem(MOCK_KEY, JSON.stringify(d));
const now = () => new Date().toISOString();
const pub = d => ({ id: d.id, ornament_id: d.ornament_id, rarity: d.rarity, x: d.x, y: d.y, visitor_name: d.visitor_name, status: d.status, drawn_at: d.drawn_at, placed_at: d.placed_at });
const treeJson = t => ({ id: t.id, owner_name: t.owner_name, created_at: t.created_at, decoration_enabled: t.decoration_enabled, tree_theme: 'classic' });
const name20 = s => { s = String(s || '').trim(); return [...s].length >= 1 && [...s].length <= 20 ? s : null; };
const live = d => d.status === 'placed' || (d.status === 'drawn' && Date.parse(d.expires_at) > Date.now());
const sleep = ms => new Promise(r => setTimeout(r, ms));

const mock = {
  async xmas_create_tree({ p_name }) {
    await sleep(150); const n = name20(p_name); if (!n) return { ok: false, error: 'bad_name' };
    const d = db(), id = rid(5), token = rid(32);
    d.trees[id] = { id, owner_name: n, admin_hash: token, created_at: now(), decoration_enabled: true }; put(d);
    return { ok: true, tree_id: id, admin_token: token, owner_name: n };
  },
  async xmas_get_tree({ p_tree, p_visitor }) {
    await sleep(80); const d = db(), t = d.trees[p_tree]; if (!t) return { ok: false, error: 'not_found' };
    const mine = p_visitor ? d.decos.find(x => x.tree_id === p_tree && x.visitor_hash === p_visitor && live(x)) : null;
    return { ok: true, tree: treeJson(t), decorations: d.decos.filter(x => x.tree_id === p_tree && x.status === 'placed').map(pub), mine: mine ? pub(mine) : null };
  },
  async xmas_draw({ p_tree, p_name, p_visitor }) {
    await sleep(150); const d = db(), t = d.trees[p_tree]; if (!t) return { ok: false, error: 'not_found' };
    const ex = d.decos.find(x => x.tree_id === p_tree && x.visitor_hash === p_visitor && (x.status === 'drawn' || x.status === 'placed'));
    if (ex) {
      if (ex.status === 'placed') return { ok: false, error: 'already_placed', decoration: pub(ex) };
      if (live(ex)) return { ok: true, resumed: true, decoration: pub(ex) };
      ex.status = 'cancelled';
    }
    if (!t.decoration_enabled) return { ok: false, error: 'closed' };
    const n = name20(p_name); if (!n) return { ok: false, error: 'bad_name' };
    const r = Math.random(), rarity = r < 0.7 ? 'common' : r < 0.95 ? 'special' : 'rare', pool = POOL[rarity];
    const rec = { id: rid(8), tree_id: p_tree, visitor_name: n, visitor_hash: p_visitor, ornament_id: pool[Math.floor(Math.random() * pool.length)], rarity,
      x: null, y: null, drawn_at: now(), placed_at: null, expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), status: 'drawn' };
    d.decos.push(rec); put(d); return { ok: true, resumed: false, decoration: pub(rec) };
  },
  async xmas_place({ p_tree, p_visitor, p_x, p_y }) {
    await sleep(150); const d = db(), t = d.trees[p_tree]; if (!t) return { ok: false, error: 'not_found' };
    const rec = d.decos.find(x => x.tree_id === p_tree && x.visitor_hash === p_visitor && (x.status === 'drawn' || x.status === 'placed'));
    if (!rec || !live(rec)) return { ok: false, error: 'no_draw' };
    if (rec.status === 'placed') return { ok: true, repeated: true, decoration: pub(rec) };
    if (!t.decoration_enabled) return { ok: false, error: 'closed' };
    const placed = d.decos.filter(x => x.tree_id === p_tree && x.status === 'placed');
    if (p_x == null || p_y == null || !CANOPY.inside(p_x, p_y)) return { ok: false, error: 'outside', suggest: CANOPY.suggest(placed, p_x ?? 0.5, p_y ?? 0.5) };
    if (CANOPY.tooClose(placed, p_x, p_y)) return { ok: false, error: 'crowded', suggest: CANOPY.suggest(placed, p_x, p_y) };
    Object.assign(rec, { x: p_x, y: p_y, placed_at: now(), status: 'placed' }); put(d);
    return { ok: true, repeated: false, decoration: pub(rec) };
  },
  async xmas_admin_get({ p_tree, p_token }) {
    await sleep(80); const d = db(), t = d.trees[p_tree]; if (!t || t.admin_hash !== p_token) return { ok: false, error: 'forbidden' };
    const all = d.decos.filter(x => x.tree_id === p_tree);
    return { ok: true, tree: treeJson(t), stats: { placed: all.filter(x => x.status === 'placed').length, pending: all.filter(x => x.status === 'drawn' && live(x)).length,
      participants: new Set(all.filter(live).map(x => x.visitor_hash)).size }, decorations: all.filter(x => x.status === 'placed').map(pub) };
  },
  async xmas_admin_remove({ p_tree, p_token, p_decoration }) {
    const d = db(), t = d.trees[p_tree]; if (!t || t.admin_hash !== p_token) return { ok: false, error: 'forbidden' };
    const rec = d.decos.find(x => x.id === p_decoration && x.tree_id === p_tree && x.status === 'placed'); if (rec) rec.status = 'cancelled'; put(d); return { ok: true };
  },
  async xmas_admin_update({ p_tree, p_token, p_name, p_enabled }) {
    const d = db(), t = d.trees[p_tree]; if (!t || t.admin_hash !== p_token) return { ok: false, error: 'forbidden' };
    if (p_name != null) { const n = name20(p_name); if (!n) return { ok: false, error: 'bad_name' }; t.owner_name = n; }
    if (p_enabled != null) t.decoration_enabled = !!p_enabled; put(d); return { ok: true };
  },
  async xmas_admin_delete_tree({ p_tree, p_token }) {
    const d = db(), t = d.trees[p_tree]; if (!t || t.admin_hash !== p_token) return { ok: false, error: 'forbidden' };
    delete d.trees[p_tree]; d.decos = d.decos.filter(x => x.tree_id !== p_tree); put(d); return { ok: true };
  }
};

const call = (fn, args) => MOCK ? mock[fn](args) : rpc(fn, args);

window.XmasApi = {
  MOCK, CANOPY,
  createTree: name => call('xmas_create_tree', { p_name: name }),
  getTree: (tree, visitor) => call('xmas_get_tree', { p_tree: tree, p_visitor: visitor || null }),
  draw: (tree, name, visitor) => call('xmas_draw', { p_tree: tree, p_name: name, p_visitor: visitor }),
  place: (tree, visitor, x, y) => call('xmas_place', { p_tree: tree, p_visitor: visitor, p_x: x, p_y: y }),
  adminGet: (tree, token) => call('xmas_admin_get', { p_tree: tree, p_token: token }),
  adminRemove: (tree, token, id) => call('xmas_admin_remove', { p_tree: tree, p_token: token, p_decoration: id }),
  adminUpdate: (tree, token, fields) => call('xmas_admin_update', { p_tree: tree, p_token: token, p_name: fields.name ?? null, p_enabled: fields.enabled ?? null }),
  adminDeleteTree: (tree, token) => call('xmas_admin_delete_tree', { p_tree: tree, p_token: token })
};
})();
