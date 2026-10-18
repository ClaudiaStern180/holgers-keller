-- ============================================================
-- Update: Aromen + Marktpreis
-- Im Supabase SQL Editor einmal komplett ausführen.
-- ============================================================
alter table bottles add column if not exists aromen            text;
alter table bottles add column if not exists aromen_quelle     text;      -- hersteller | web | ki | eigen
alter table bottles add column if not exists marktpreis        numeric(10,2);
alter table bottles add column if not exists marktpreis_datum  date;
alter table bottles add column if not exists marktpreis_quelle text;      -- Händler/Webseite bzw. 'eigen'
