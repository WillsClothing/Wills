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

-- ---------- Product colours ------------------------------------------
-- products.colors: [{"name": "Black", "hex": "#111111"}, ...] chosen per product.
-- store_settings.custom_colors: colours the admin added beyond the built-in palette.
alter table public.products add column if not exists colors jsonb not null default '[]'::jsonb;
alter table public.store_settings add column if not exists custom_colors jsonb not null default '[]'::jsonb;

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

-- ---------- Variants (size + colour), SKUs and EAN-13 barcodes ------
-- See supabase/variants.sql for the reasoning behind the formats.
alter table public.products      add column if not exists sku     text;
alter table public.product_sizes add column if not exists color   text not null default '';
alter table public.product_sizes add column if not exists sku     text not null default '';
alter table public.product_sizes add column if not exists barcode text;

-- A size can now appear once per colour.
alter table public.product_sizes drop constraint if exists product_sizes_product_id_size_key;
create unique index if not exists product_sizes_variant_key on public.product_sizes (product_id, size, color);
create unique index if not exists product_sizes_barcode_key on public.product_sizes (barcode) where barcode is not null;
create unique index if not exists products_sku_key on public.products (sku) where sku is not null;

create sequence if not exists public.product_sku_seq start 1001;
create sequence if not exists public.barcode_seq start 1;

-- Appends the EAN-13 check digit to a 12-digit body.
create or replace function public.ean13(p_body text)
returns text language plpgsql immutable as $$
declare
  s int := 0;
begin
  for i in 1..12 loop
    s := s + substr(p_body, i, 1)::int * (case when i % 2 = 0 then 3 else 1 end);
  end loop;
  return p_body || ((10 - s % 10) % 10)::text;
end;
$$;

-- Three-letter colour code used in SKUs.
create or replace function public.color_code(p_color text)
returns text language sql immutable as $$
  select case lower(trim(coalesce(p_color, '')))
    when '' then ''
    when 'black' then 'BLK'        when 'white' then 'WHT'       when 'off white' then 'OWH'
    when 'beige' then 'BGE'        when 'sand' then 'SND'        when 'brown' then 'BRN'
    when 'charcoal' then 'CHR'     when 'grey' then 'GRY'        when 'gray' then 'GRY'
    when 'navy' then 'NVY'         when 'royal blue' then 'RBL'  when 'sky blue' then 'SKY'
    when 'bottle green' then 'BGN' when 'olive' then 'OLV'       when 'sage' then 'SGE'
    when 'maroon' then 'MRN'       when 'red' then 'RED'         when 'pink' then 'PNK'
    when 'lavender' then 'LAV'     when 'mustard' then 'MUS'     when 'orange' then 'ORG'
    else upper(left(regexp_replace(p_color, '[^A-Za-z0-9]', '', 'g'), 3))
  end;
$$;

-- Product SKU, set once when the product is created (kept if the name or type changes later).
create or replace function public.products_set_sku()
returns trigger language plpgsql as $$
begin
  if new.sku is null or new.sku = '' then
    new.sku := 'WC-'
      || coalesce(nullif(upper(left(regexp_replace(new.category, '[^A-Za-z]', '', 'g'), 3)), ''), 'GEN')
      || '-' || nextval('public.product_sku_seq');
  end if;
  return new;
end;
$$;
drop trigger if exists products_sku on public.products;
create trigger products_sku before insert or update on public.products
  for each row execute function public.products_set_sku();

-- Variant SKU follows the size and colour; the barcode is issued once and never changes.
create or replace function public.product_sizes_set_codes()
returns trigger language plpgsql as $$
declare
  v_sku text;
begin
  select sku into v_sku from public.products where id = new.product_id;
  new.sku := concat_ws('-', v_sku,
    nullif(public.color_code(new.color), ''),
    nullif(upper(regexp_replace(new.size, '[^A-Za-z0-9]', '', 'g')), ''));
  if new.barcode is null or new.barcode = '' then
    new.barcode := public.ean13('200' || lpad(nextval('public.barcode_seq')::text, 9, '0'));
  end if;
  return new;
end;
$$;
drop trigger if exists product_sizes_codes on public.product_sizes;
create trigger product_sizes_codes before insert or update of size, color, product_id on public.product_sizes
  for each row execute function public.product_sizes_set_codes();

-- Give existing products and sizes their codes.
update public.products set sku = null where sku = '';
update public.products set sku = sku where sku is null;
update public.product_sizes set size = size where barcode is null or sku = '';

-- Stock log shows the colour next to the size, e.g. "M · Black".
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
  v_color text;
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
  returning stock, size, color, product_id into v_new, v_size, v_color, v_product;

  select name into v_name from public.products where id = v_product;

  insert into public.inventory_log (size_id, product_id, product_name, size, change, new_stock, reason)
  values (p_size_id, v_product, coalesce(v_name, ''),
          case when coalesce(v_color, '') <> '' then v_size || ' · ' || v_color else v_size end,
          v_new - v_old, v_new, coalesce(p_reason, ''));

  return v_new;
end;
$$;

revoke all on function public.adjust_stock(uuid, integer, text) from public, anon;
grant execute on function public.adjust_stock(uuid, integer, text) to authenticated;

-- ---------- Promotions (combo and special offers) -------------------------------
-- Shown on the shop only while active and inside their optional date range.
create table if not exists public.promotions (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default 'combo' check (kind in ('combo', 'special')),
  title         text not null,
  description   text not null default '',
  price         numeric(12, 2) not null check (price >= 0),   -- offer price
  compare_price numeric(12, 2) check (compare_price >= 0),    -- usual price, shown struck through
  product_ids   uuid[] not null default '{}',                 -- products included in the combo
  image         text not null default '',
  active        boolean not null default true,
  starts_on     date,
  ends_on       date,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

-- Offer type, for databases that created the table before it existed.
alter table public.promotions add column if not exists kind text not null default 'combo';
alter table public.promotions drop constraint if exists promotions_kind_check;
alter table public.promotions add constraint promotions_kind_check check (kind in ('combo', 'special'));

alter table public.promotions enable row level security;

drop policy if exists "public reads live promotions" on public.promotions;
create policy "public reads live promotions" on public.promotions
  for select using (
    public.is_admin()
    or (active
        and (starts_on is null or starts_on <= current_date)
        and (ends_on is null or ends_on >= current_date))
  );

drop policy if exists "admins write promotions" on public.promotions;
create policy "admins write promotions" on public.promotions
  for all using (public.is_admin()) with check (public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.promotions;
exception when duplicate_object then null;
end $$;

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

-- ---------- Invoices (same as invoices.sql) ----------------------
create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  seq              integer not null unique,            -- 1, 2, 3… with no gaps
  number           text not null unique,               -- WC-INV-0001
  customer_name    text not null default '',
  customer_phone   text not null default '',
  customer_address text not null default '',
  payment_method   text not null default 'cod' check (payment_method in ('cod', 'bank')),
  -- unpaid = payment still to be collected, paid = money received, cancelled = stock returned
  status           text not null default 'unpaid' check (status in ('unpaid', 'paid', 'cancelled')),
  -- What was sold, frozen at invoice time:
  -- [{ product_id, size_id, name, size, color, sku, qty, unit_price, line_total }]
  items            jsonb not null default '[]',
  subtotal         numeric(12, 2) not null default 0,
  discount         numeric(12, 2) not null default 0,
  total            numeric(12, 2) not null default 0,
  notes            text not null default '',
  admin_id         uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  paid_at          timestamptz,
  cancelled_at     timestamptz
);
create index if not exists invoices_created_at_idx on public.invoices (created_at desc);

alter table public.invoices enable row level security;
drop policy if exists "Admins manage invoices" on public.invoices;
create policy "Admins manage invoices" on public.invoices
  for all using (public.is_admin()) with check (public.is_admin());

-- Creates an invoice and takes its pieces out of stock in one step.
-- p_items: [{ "size_id": uuid, "qty": int, "unit_price": number }]
create or replace function public.create_invoice(
  p_customer jsonb,
  p_items jsonb,
  p_payment text default 'cod',
  p_discount numeric default 0,
  p_notes text default '',
  p_paid boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq      integer;
  v_number   text;
  v_item     jsonb;
  v_qty      integer;
  v_price    numeric;
  v_row      record;
  v_label    text;
  v_lines    jsonb := '[]';
  v_subtotal numeric := 0;
  v_discount numeric;
  v_id       uuid;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can create invoices';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item to the invoice';
  end if;

  -- Numbers run on without gaps (a failed invoice doesn't use one up), as invoices should.
  perform pg_advisory_xact_lock(hashtext('wills_invoice_number'));
  select coalesce(max(seq), 0) + 1 into v_seq from public.invoices;
  v_number := 'WC-INV-' || lpad(v_seq::text, 4, '0');

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::integer;
    if v_qty is null or v_qty < 1 then
      raise exception 'Each item needs a quantity of at least 1';
    end if;

    select s.id, s.size, s.color, s.sku, s.stock, s.product_id, p.name, p.price
      into v_row
      from public.product_sizes s
      join public.products p on p.id = s.product_id
     where s.id = (v_item ->> 'size_id')::uuid
       for update of s;
    if not found then
      raise exception 'An item on this invoice no longer exists. Remove it and try again.';
    end if;

    v_label := case when coalesce(v_row.color, '') <> '' then v_row.size || ' · ' || v_row.color else v_row.size end;
    if v_row.stock < v_qty then
      raise exception 'Only % left of % (%)', v_row.stock, v_row.name, v_label;
    end if;

    v_price := greatest(coalesce((v_item ->> 'unit_price')::numeric, v_row.price), 0);

    update public.product_sizes set stock = stock - v_qty where id = v_row.id;
    insert into public.inventory_log (size_id, product_id, product_name, size, change, new_stock, reason)
    values (v_row.id, v_row.product_id, v_row.name, v_label, -v_qty, v_row.stock - v_qty, 'Invoice ' || v_number);

    v_lines := v_lines || jsonb_build_object(
      'product_id', v_row.product_id, 'size_id', v_row.id, 'name', v_row.name,
      'size', v_row.size, 'color', coalesce(v_row.color, ''), 'sku', coalesce(v_row.sku, ''),
      'qty', v_qty, 'unit_price', v_price, 'line_total', v_price * v_qty);
    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  v_discount := least(greatest(coalesce(p_discount, 0), 0), v_subtotal);

  insert into public.invoices (seq, number, customer_name, customer_phone, customer_address, payment_method,
                               status, items, subtotal, discount, total, notes, paid_at)
  values (v_seq, v_number,
          trim(coalesce(p_customer ->> 'name', '')),
          trim(coalesce(p_customer ->> 'phone', '')),
          trim(coalesce(p_customer ->> 'address', '')),
          case when p_payment = 'bank' then 'bank' else 'cod' end,
          case when p_paid then 'paid' else 'unpaid' end,
          v_lines, v_subtotal, v_discount, v_subtotal - v_discount, coalesce(p_notes, ''),
          case when p_paid then now() end)
  returning id into v_id;

  return v_id;
end;
$$;

-- Cancels an invoice and puts its pieces back in stock.
create or replace function public.cancel_invoice(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv  public.invoices%rowtype;
  v_item jsonb;
  v_qty  integer;
  v_new  integer;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can cancel invoices';
  end if;

  select * into v_inv from public.invoices where id = p_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if v_inv.status = 'cancelled' then
    return;
  end if;

  for v_item in select value from jsonb_array_elements(v_inv.items) loop
    v_qty := (v_item ->> 'qty')::integer;
    update public.product_sizes set stock = stock + v_qty
     where id = (v_item ->> 'size_id')::uuid
    returning stock into v_new;
    -- A size deleted since the invoice was made has nothing to return to.
    if v_new is not null then
      insert into public.inventory_log (size_id, product_id, product_name, size, change, new_stock, reason)
      values ((v_item ->> 'size_id')::uuid, (v_item ->> 'product_id')::uuid, v_item ->> 'name',
              case when coalesce(v_item ->> 'color', '') <> '' then (v_item ->> 'size') || ' · ' || (v_item ->> 'color') else v_item ->> 'size' end,
              v_qty, v_new, 'Invoice ' || v_inv.number || ' cancelled');
    end if;
    v_new := null;
  end loop;

  update public.invoices set status = 'cancelled', cancelled_at = now() where id = p_id;
end;
$$;

revoke all on function public.create_invoice(jsonb, jsonb, text, numeric, text, boolean) from public, anon;
grant execute on function public.create_invoice(jsonb, jsonb, text, numeric, text, boolean) to authenticated;
revoke all on function public.cancel_invoice(uuid) from public, anon;
grant execute on function public.cancel_invoice(uuid) to authenticated;

-- ---------- Size charts (same as size_chart.sql) -------------------
alter table public.products add column if not exists size_chart jsonb;
