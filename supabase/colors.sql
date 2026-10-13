-- =====================================================================
-- Wills Clothing – product colours
-- For a database set up before colours existed: run this file once in
-- Supabase Dashboard → SQL Editor → New query. Safe to re-run.
-- (New setups get the same columns from schema.sql.)
-- =====================================================================

-- Colours each product comes in: [{"name": "Black", "hex": "#111111"}, ...]
alter table public.products add column if not exists colors jsonb not null default '[]'::jsonb;

-- Colours the admin added beyond the built-in palette, reused across products.
alter table public.store_settings add column if not exists custom_colors jsonb not null default '[]'::jsonb;
