-- 圣诞盲盒树 · 数据库（2026-11-16 第一版）
-- 放在口袋全宇宙同一个 Supabase 项目里，所有表和函数都以 xmas_ 开头，不碰游戏原有数据。
-- 用法：Supabase → SQL Editor → 整段粘贴运行。可以重复运行（不会删数据）。
--
-- 安全设计：
--   * 两张表都开启 RLS 且不给任何策略 → 网页上的匿名 key 不能直接读写表。
--   * 网页只能调用下面这些 xmas_ 函数（security definer），所有规则都在服务器上检查：
--     抽盲盒结果由服务器随机、刷新不会变；一个浏览器在一棵树上只能抽一次；
--     管理操作必须带主人凭据（数据库里只存它的 sha256，不存明文）。

-- ---------- 表 ----------
create table if not exists public.xmas_trees (
  id                 text primary key,
  owner_name         text not null check (char_length(owner_name) between 1 and 20),
  admin_hash         text not null,
  created_at         timestamptz not null default now(),
  decoration_enabled boolean not null default true,
  tree_theme         text not null default 'classic',
  status             text not null default 'active' check (status in ('active'))
);

create table if not exists public.xmas_decorations (
  id           uuid primary key default gen_random_uuid(),
  tree_id      text not null references public.xmas_trees(id) on delete cascade,
  visitor_name text not null check (char_length(visitor_name) between 1 and 20),
  visitor_hash text not null,
  ornament_id  text not null,
  rarity       text not null check (rarity in ('common','special','rare')),
  position_x   real,
  position_y   real,
  drawn_at     timestamptz not null default now(),
  placed_at    timestamptz,
  expires_at   timestamptz not null default now() + interval '7 days',
  status       text not null default 'drawn' check (status in ('drawn','placed','cancelled'))
);

create index if not exists xmas_decorations_tree_idx on public.xmas_decorations (tree_id, status);
-- 同一个浏览器（匿名参与凭据）在同一棵树上同时只能有一条「已抽取 / 已挂上」记录
create unique index if not exists xmas_one_per_visitor on public.xmas_decorations (tree_id, visitor_hash)
  where status in ('drawn','placed');

alter table public.xmas_trees enable row level security;
alter table public.xmas_decorations enable row level security;
revoke all on public.xmas_trees from anon, authenticated;
revoke all on public.xmas_decorations from anon, authenticated;

-- ---------- 内部工具函数（网页不能直接调用） ----------
create or replace function public._xmas_hash(t text) returns text
language sql immutable as $$ select encode(sha256(convert_to(coalesce(t,''), 'UTF8')), 'hex') $$;

-- 树冠有效区域：坐标是相对圣诞树画框的 0–1（画框宽:高 = 2:3）。
-- 改了圣诞树图片的形状，要同时改 app.js 里的 CANOPY 和这里。
create or replace function public._xmas_in_canopy(x real, y real) returns boolean
language sql immutable as $$
  select y between 0.18 and 0.80
     and abs(x - 0.5) <= 0.03 + (y - 0.17) * 0.55
$$;

-- 两件挂件之间的最小距离（按画框宽度计，纵向乘 1.5 换算成同一比例）
create or replace function public._xmas_too_close(p_tree text, x real, y real) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.xmas_decorations d
     where d.tree_id = p_tree and d.status = 'placed'
       and sqrt(power(d.position_x - x, 2) + power((d.position_y - y) * 1.5, 2)) < 0.075)
$$;

-- 找离 (x,y) 最近的空位；树挂满了返回 null
create or replace function public._xmas_suggest(p_tree text, x real, y real) returns jsonb
language plpgsql stable as $$
declare gx real; gy real; best jsonb := null; bestd real := 1e9; d real;
begin
  gy := 0.16;
  while gy <= 0.82 loop
    gx := 0.06;
    while gx <= 0.94 loop
      if public._xmas_in_canopy(gx, gy) and not public._xmas_too_close(p_tree, gx, gy) then
        d := power(gx - x, 2) + power((gy - y) * 1.5, 2);
        if d < bestd then bestd := d; best := jsonb_build_object('x', round(gx::numeric, 3), 'y', round(gy::numeric, 3)); end if;
      end if;
      gx := gx + 0.02;
    end loop;
    gy := gy + 0.02;
  end loop;
  return best;
end $$;

create or replace function public._xmas_admin_ok(p_tree text, p_token text) returns boolean
language sql stable as $$
  select exists (select 1 from public.xmas_trees t
                  where t.id = p_tree and char_length(coalesce(p_token,'')) >= 32
                    and t.admin_hash = public._xmas_hash(p_token))
$$;

create or replace function public._xmas_deco_json(d public.xmas_decorations, with_private boolean default false) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', d.id, 'ornament_id', d.ornament_id, 'rarity', d.rarity,
    'x', d.position_x, 'y', d.position_y, 'visitor_name', d.visitor_name,
    'status', d.status, 'drawn_at', d.drawn_at, 'placed_at', d.placed_at)
$$;

-- ---------- 网页调用的函数 ----------

-- 创建圣诞树：返回树 ID 和主人管理凭据（明文只在这一次返回）
create or replace function public.xmas_create_tree(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_name text := btrim(coalesce(p_name,'')); v_id text; v_token text;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 20 then
    return jsonb_build_object('ok', false, 'error', 'bad_name');
  end if;
  if (select count(*) from xmas_trees where created_at > now() - interval '1 minute') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  loop
    v_id := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    exit when not exists (select 1 from xmas_trees where id = v_id);
  end loop;
  insert into xmas_trees (id, owner_name, admin_hash) values (v_id, v_name, _xmas_hash(v_token));
  return jsonb_build_object('ok', true, 'tree_id', v_id, 'admin_token', v_token, 'owner_name', v_name);
end $$;

-- 读取一棵树（任何人可读）：树信息 + 已挂上的装饰；带 p_visitor 时顺便返回「我」的抽取记录
create or replace function public.xmas_get_tree(p_tree text, p_visitor text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t xmas_trees; v_mine jsonb := null; v_decos jsonb; d xmas_decorations;
begin
  select * into t from xmas_trees where id = p_tree;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select coalesce(jsonb_agg(_xmas_deco_json(x) order by x.placed_at), '[]'::jsonb) into v_decos
    from xmas_decorations x where x.tree_id = p_tree and x.status = 'placed';
  if char_length(coalesce(p_visitor,'')) >= 24 then
    select * into d from xmas_decorations
     where tree_id = p_tree and visitor_hash = _xmas_hash(p_visitor)
       and (status = 'placed' or (status = 'drawn' and expires_at > now()))
     limit 1;
    if found then v_mine := _xmas_deco_json(d); end if;
  end if;
  return jsonb_build_object('ok', true,
    'tree', jsonb_build_object('id', t.id, 'owner_name', t.owner_name, 'created_at', t.created_at,
                               'decoration_enabled', t.decoration_enabled, 'tree_theme', t.tree_theme),
    'decorations', v_decos, 'mine', v_mine);
end $$;

-- 拆盲盒：服务器随机（普通 70% / 特别 25% / 稀有 5%），同一浏览器重复调用返回同一个结果
create or replace function public.xmas_draw(p_tree text, p_name text, p_visitor text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t xmas_trees; d xmas_decorations; v_name text := btrim(coalesce(p_name,'')); v_hash text;
  r double precision; v_rarity text; v_pool text[]; v_orn text;
begin
  select * into t from xmas_trees where id = p_tree for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if char_length(coalesce(p_visitor,'')) < 24 then return jsonb_build_object('ok', false, 'error', 'bad_visitor'); end if;
  v_hash := _xmas_hash(p_visitor);

  select * into d from xmas_decorations where tree_id = p_tree and visitor_hash = v_hash and status in ('drawn','placed') limit 1;
  if found then
    if d.status = 'placed' then
      return jsonb_build_object('ok', false, 'error', 'already_placed', 'decoration', _xmas_deco_json(d));
    elsif d.expires_at > now() then
      return jsonb_build_object('ok', true, 'resumed', true, 'decoration', _xmas_deco_json(d));
    else
      update xmas_decorations set status = 'cancelled' where id = d.id;
    end if;
  end if;

  if not t.decoration_enabled then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if char_length(v_name) < 1 or char_length(v_name) > 20 then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  if (select count(*) from xmas_decorations where tree_id = p_tree and drawn_at > now() - interval '10 minutes') >= 40 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;

  r := random();
  if r < 0.70 then
    v_rarity := 'common';  v_pool := array['red_ball','blue_ball','candy_cane','snowflake','gold_bell','pinecone'];
  elsif r < 0.95 then
    v_rarity := 'special'; v_pool := array['gingerbread','red_bow','teddy','stocking','mini_gift','snowman'];
  else
    v_rarity := 'rare';    v_pool := array['glow_star','crystal_reindeer','crescent_moon'];
  end if;
  v_orn := v_pool[1 + floor(random() * array_length(v_pool, 1))::int];

  insert into xmas_decorations (tree_id, visitor_name, visitor_hash, ornament_id, rarity)
  values (p_tree, v_name, v_hash, v_orn, v_rarity) returning * into d;
  return jsonb_build_object('ok', true, 'resumed', false, 'decoration', _xmas_deco_json(d));
end $$;

-- 挂上去：检查树冠范围和拥挤程度；不合适时返回最近的空位建议
create or replace function public.xmas_place(p_tree text, p_visitor text, p_x real, p_y real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t xmas_trees; d xmas_decorations; v_hash text;
begin
  select * into t from xmas_trees where id = p_tree for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if char_length(coalesce(p_visitor,'')) < 24 then return jsonb_build_object('ok', false, 'error', 'bad_visitor'); end if;
  v_hash := _xmas_hash(p_visitor);

  select * into d from xmas_decorations where tree_id = p_tree and visitor_hash = v_hash and status in ('drawn','placed') limit 1;
  if not found or (d.status = 'drawn' and d.expires_at <= now()) then
    return jsonb_build_object('ok', false, 'error', 'no_draw');
  end if;
  if d.status = 'placed' then  -- 重复提交：直接返回已保存的结果
    return jsonb_build_object('ok', true, 'repeated', true, 'decoration', _xmas_deco_json(d));
  end if;
  if not t.decoration_enabled then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if p_x is null or p_y is null or not _xmas_in_canopy(p_x, p_y) then
    return jsonb_build_object('ok', false, 'error', 'outside', 'suggest', _xmas_suggest(p_tree, coalesce(p_x,0.5), coalesce(p_y,0.5)));
  end if;
  if _xmas_too_close(p_tree, p_x, p_y) then
    return jsonb_build_object('ok', false, 'error', 'crowded', 'suggest', _xmas_suggest(p_tree, p_x, p_y));
  end if;

  update xmas_decorations set position_x = p_x, position_y = p_y, placed_at = now(), status = 'placed'
   where id = d.id returning * into d;
  return jsonb_build_object('ok', true, 'repeated', false, 'decoration', _xmas_deco_json(d));
end $$;

-- ---------- 主人管理（都要主人凭据） ----------
create or replace function public.xmas_admin_get(p_tree text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t xmas_trees;
begin
  if not _xmas_admin_ok(p_tree, p_token) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into t from xmas_trees where id = p_tree;
  return jsonb_build_object('ok', true,
    'tree', jsonb_build_object('id', t.id, 'owner_name', t.owner_name, 'created_at', t.created_at,
                               'decoration_enabled', t.decoration_enabled, 'tree_theme', t.tree_theme),
    'stats', jsonb_build_object(
       'placed', (select count(*) from xmas_decorations where tree_id = p_tree and status = 'placed'),
       'pending', (select count(*) from xmas_decorations where tree_id = p_tree and status = 'drawn' and expires_at > now()),
       'participants', (select count(distinct visitor_hash) from xmas_decorations where tree_id = p_tree and status in ('drawn','placed'))),
    'decorations', (select coalesce(jsonb_agg(_xmas_deco_json(x) order by x.placed_at), '[]'::jsonb)
                      from xmas_decorations x where x.tree_id = p_tree and x.status = 'placed'));
end $$;

create or replace function public.xmas_admin_remove(p_tree text, p_token text, p_decoration uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not _xmas_admin_ok(p_tree, p_token) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  update xmas_decorations set status = 'cancelled' where id = p_decoration and tree_id = p_tree and status = 'placed';
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.xmas_admin_update(p_tree text, p_token text, p_name text default null, p_enabled boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_name text := btrim(coalesce(p_name,''));
begin
  if not _xmas_admin_ok(p_tree, p_token) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_name is not null then
    if char_length(v_name) < 1 or char_length(v_name) > 20 then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
    update xmas_trees set owner_name = v_name where id = p_tree;
  end if;
  if p_enabled is not null then update xmas_trees set decoration_enabled = p_enabled where id = p_tree; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.xmas_admin_delete_tree(p_tree text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not _xmas_admin_ok(p_tree, p_token) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  delete from xmas_trees where id = p_tree;  -- 装饰记录跟着一起删除（on delete cascade）
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 权限 ----------
revoke execute on function public._xmas_hash(text) from public, anon, authenticated;
revoke execute on function public._xmas_in_canopy(real, real) from public, anon, authenticated;
revoke execute on function public._xmas_too_close(text, real, real) from public, anon, authenticated;
revoke execute on function public._xmas_suggest(text, real, real) from public, anon, authenticated;
revoke execute on function public._xmas_admin_ok(text, text) from public, anon, authenticated;
revoke execute on function public._xmas_deco_json(public.xmas_decorations, boolean) from public, anon, authenticated;

grant execute on function public.xmas_create_tree(text) to anon, authenticated;
grant execute on function public.xmas_get_tree(text, text) to anon, authenticated;
grant execute on function public.xmas_draw(text, text, text) to anon, authenticated;
grant execute on function public.xmas_place(text, text, real, real) to anon, authenticated;
grant execute on function public.xmas_admin_get(text, text) to anon, authenticated;
grant execute on function public.xmas_admin_remove(text, text, uuid) to anon, authenticated;
grant execute on function public.xmas_admin_update(text, text, text, boolean) to anon, authenticated;
grant execute on function public.xmas_admin_delete_tree(text, text) to anon, authenticated;

-- 让 PostgREST 立刻认出新函数
notify pgrst, 'reload schema';

-- 检查：应该列出 8 个 xmas_ 函数
select proname from pg_proc where proname like 'xmas\_%' order by proname;
