-- =====================================================================
-- Wills Clothing – Supabase schema
-- Run this whole file once in Supabase Dashboard → SQL Editor → New query.
-- It is safe to re-run (uses IF NOT EXISTS / OR REPLACE where possible).
-- =====================================================================

-- ---------- Admins ---------------------------------------------------
-- Only users listed here can change products, stock, images or settings.
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- Products -------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  price       numeric(12, 2) not null check (price >= 0),
  category    text not null default '',
  -- available   = shown and orderable
  -- sold_out    = shown with a "Sold out" badge, cannot be ordered
  -- unavailable = hidden from the customer portal
  status      text not null default 'available'
              check (status in ('available', 'sold_out', 'unavailable')),
  images      text[] not null default '{}',   -- public image URLs, first = cover
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.product_sizes (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  size        text not null,
  stock       integer not null default 0 check (stock >= 0),
  sort_order  integer not null default 0,
  unique (product_id, size)
);
create index if not exists product_sizes_product_id_idx on public.product_sizes (product_id);

-- Audit trail of every manual stock change made by an admin.
create table if not exists public.inventory_log (
  id          bigint generated always as identity primary key,
  size_id     uuid references public.product_sizes (id) on delete set null,
  product_id  uuid references public.products (id) on delete set null,
  product_name text not null,
  size        text not null,
  change      integer not null,
  new_stock   integer not null,
  reason      text not null default '',
  admin_id    uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

-- ---------- Store settings (single row) -----------------------------
create table if not exists public.store_settings (
  id              integer primary key default 1 check (id = 1),
  store_name      text not null default 'Wills Clothing',
  whatsapp_number text not null default '',   -- international format, digits only, e.g. 94771234567
  currency        text not null default 'Rs.',
  bank_details    text not null default '',   -- shown to customers who pick bank transfer
  delivery_note   text not null default '',
  updated_at      timestamptz not null default now()
);
insert into public.store_settings (id) values (1) on conflict (id) do nothing;

-- ---------- updated_at trigger --------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.store_settings;
create trigger settings_touch before update on public.store_settings
  for each row execute function public.touch_updated_at();

-- ---------- Stock adjustment (admin only) ---------------------------
-- Adds `delta` (negative for sales, positive for restocks) to a size's stock
-- and records it in inventory_log. Stock can never go below zero.
create or replace function public.adjust_stock(p_size_id uuid, p_delta integer, p_reason text default '')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old integer;
  v_new integer;
  v_size text;
  v_product uuid;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can change stock';
  end if;

  select stock into v_old from public.product_sizes where id = p_size_id for update;
  if v_old is null then
    raise exception 'Size not found';
  end if;

  update public.product_sizes
     set stock = greatest(v_old + p_delta, 0)
   where id = p_size_id
  returning stock, size, product_id into v_new, v_size, v_product;

  select name into v_name from public.products where id = v_product;

  insert into public.inventory_log (size_id, product_id, product_name, size, change, new_stock, reason)
  values (p_size_id, v_product, coalesce(v_name, ''), v_size, v_new - v_old, v_new, coalesce(p_reason, ''));

  return v_new;
end;
$$;

revoke all on function public.adjust_stock(uuid, integer, text) from public, anon;
grant execute on function public.adjust_stock(uuid, integer, text) to authenticated;

-- ---------- Row level security --------------------------------------
-- Customers (anonymous visitors) can only READ. Every write requires is_admin().
alter table public.admins         enable row level security;
alter table public.products       enable row level security;
alter table public.product_sizes  enable row level security;
alter table public.inventory_log  enable row level security;
alter table public.store_settings enable row level security;

drop policy if exists "admins read own row" on public.admins;
create policy "admins read own row" on public.admins
  for select using (user_id = auth.uid());

drop policy if exists "public reads visible products" on public.products;
create policy "public reads visible products" on public.products
  for select using (status <> 'unavailable' or public.is_admin());

drop policy if exists "admins write products" on public.products;
create policy "admins write products" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public reads sizes" on public.product_sizes;
create policy "public reads sizes" on public.product_sizes
  for select using (
    exists (select 1 from public.products p
            where p.id = product_id and (p.status <> 'unavailable' or public.is_admin()))
  );

drop policy if exists "admins write sizes" on public.product_sizes;
create policy "admins write sizes" on public.product_sizes
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins read log" on public.inventory_log;
create policy "admins read log" on public.inventory_log
  for select using (public.is_admin());

drop policy if exists "admins write log" on public.inventory_log;
create policy "admins write log" on public.inventory_log
  for insert with check (public.is_admin());

drop policy if exists "public reads settings" on public.store_settings;
create policy "public reads settings" on public.store_settings
  for select using (true);

drop policy if exists "admins update settings" on public.store_settings;
create policy "admins update settings" on public.store_settings
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------- Image storage -------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "public reads product images" on storage.objects;
create policy "public reads product images" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "admins upload product images" on storage.objects;
create policy "admins upload product images" on storage.objects
  for insert with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "admins update product images" on storage.objects;
create policy "admins update product images" on storage.objects
  for update using (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "admins delete product images" on storage.objects;
create policy "admins delete product images" on storage.objects
  for delete using (bucket_id = 'product-images' and public.is_admin());

-- ---------- Live updates on the customer portal ---------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.products;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.product_sizes;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.store_settings;
  exception when duplicate_object then null;
  end;
end $$;

-- =====================================================================
-- AFTER creating your admin user (Authentication → Users → Add user),
-- make them an administrator by running (replace the email):
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'you@example.com';
-- =====================================================================
