-- =============================================================================
-- Migration 04: condições de pagamento padrão (editáveis em Configurações)
-- offset_days é contado a partir do vencimento do sinal (1ª parcela).
-- Ex.: sinal 01/11 + 30 dias = 01/12; + 60 dias = 31/12.
-- =============================================================================
insert into public.payment_conditions (name, description, items, is_default) values
  ('Sinal 50% + 50%',
   'Sinal de 50% e o restante (50%) em 30 dias',
   '[{"label":"Sinal","percent":50,"offset_days":0},
     {"label":"2ª parcela","percent":50,"offset_days":30}]'::jsonb, true),
  ('Sinal + 30 + 60 dias',
   'Sinal de 50% + 25% em 30 dias + 25% em 60 dias',
   '[{"label":"Sinal","percent":50,"offset_days":0},
     {"label":"2ª parcela","percent":25,"offset_days":30},
     {"label":"3ª parcela","percent":25,"offset_days":60}]'::jsonb, true),
  ('Sinal + 30 + 60 + 90 dias',
   'Sinal de 40% + 20% em 30, 60 e 90 dias',
   '[{"label":"Sinal","percent":40,"offset_days":0},
     {"label":"2ª parcela","percent":20,"offset_days":30},
     {"label":"3ª parcela","percent":20,"offset_days":60},
     {"label":"4ª parcela","percent":20,"offset_days":90}]'::jsonb, true),
  ('Sinal + 45 + 90 dias',
   'Sinal de 40% + 30% em 45 dias + 30% em 90 dias',
   '[{"label":"Sinal","percent":40,"offset_days":0},
     {"label":"2ª parcela","percent":30,"offset_days":45},
     {"label":"3ª parcela","percent":30,"offset_days":90}]'::jsonb, true)
on conflict (name) do nothing;
