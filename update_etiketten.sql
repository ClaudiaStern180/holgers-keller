-- ============================================================
-- Update: Etiketten-Fotos (Vorder-/Rückseite)
-- Im Supabase SQL Editor einmal komplett ausführen.
-- ============================================================

-- Tabelle für die Foto-Zuordnung
create table if not exists bottle_photos (
  id            uuid primary key default gen_random_uuid(),
  bottle_id     uuid not null references bottles(id) on delete cascade,
  storage_path  text not null,
  typ           text not null check (typ in ('etikett', 'rueckseite')),
  created_at    timestamptz not null default now()
);
alter table bottle_photos enable row level security;
create policy "nur_angemeldet" on bottle_photos for all to authenticated using (true) with check (true);

-- Speicher-Bucket für die Bilder (öffentlich lesbar, nur Angemeldete dürfen schreiben)
insert into storage.buckets (id, name, public)
values ('etiketten', 'etiketten', true)
on conflict (id) do nothing;

create policy "etiketten_lesen"    on storage.objects for select to authenticated using (bucket_id = 'etiketten');
create policy "etiketten_hochladen" on storage.objects for insert to authenticated with check (bucket_id = 'etiketten');
create policy "etiketten_aendern"  on storage.objects for update to authenticated using (bucket_id = 'etiketten');
create policy "etiketten_loeschen" on storage.objects for delete to authenticated using (bucket_id = 'etiketten');
