-- =====================================================================
-- Wills Clothing – size charts
-- Run once in Supabase Dashboard → SQL Editor → New query. Safe to re-run.
-- (New setups get the same from schema.sql.)
--
-- Each product can carry its own size chart, shown to customers under
-- "Fit & Sizing" → Size guide:
--   { "unit": "in" | "cm",
--     "columns": ["Chest", "Length", ...],
--     "rows": [{ "size": "M", "values": ["42", "28"] }, ...],
--     "note": "Relaxed fit. Model is 6'0\" and wears L.",
--     "image": "" }
-- =====================================================================

alter table public.products add column if not exists size_chart jsonb;
