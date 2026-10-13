-- =====================================================================
-- Wills Clothing – add combo offers / special promotions
-- For a database set up before promotions existed: run this file once in
-- Supabase Dashboard → SQL Editor → New query. Safe to re-run.
-- (New setups get the same table from schema.sql.)
-- =====================================================================

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
