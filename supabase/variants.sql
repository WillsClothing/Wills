-- =====================================================================
-- Wills Clothing – stock per size + colour, SKUs and barcodes
-- Run once in Supabase Dashboard → SQL Editor → New query, AFTER colors.sql.
-- Safe to re-run. (New setups get the same from schema.sql.)
--
-- Every sellable variant (one size in one colour) is a row in product_sizes
-- with its own stock, SKU and EAN-13 barcode.
--   Product SKU (style code):  WC-TSH-1001         (brand-type-number)
--   Variant SKU:                WC-TSH-1001-BLK-M   (style-colour-size)
--   Barcode: EAN-13 with prefix 200, the GS1 range reserved for in-store use,
--            so it never clashes with registered retail barcodes.
-- =====================================================================

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
