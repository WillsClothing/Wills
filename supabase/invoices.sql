-- =====================================================================
-- Wills Clothing – invoices
-- Run once in Supabase Dashboard → SQL Editor → New query, AFTER variants.sql.
-- Safe to re-run. (New setups get the same from schema.sql.)
--
-- Creating an invoice takes its pieces out of stock (per size + colour) in the
-- same step, and logs each one in the inventory log as "Invoice WC-INV-0001",
-- so stock, the log and the sales report always agree. Cancelling an invoice
-- puts the pieces back.
-- =====================================================================

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
