-- TULAY AI basket: how many separate items one request may hold (owner's decision 2026-11-17: 10).
insert into public.platform_settings (key, value, description) values
  ('ai_max_items', '10', 'Most separate items TULAY AI puts in one basket. Extra items in a request are dropped.');
