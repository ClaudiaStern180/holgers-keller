-- ============================================================
-- Holgers Keller — Datenbank-Schema (Supabase / Postgres)
-- Im Supabase-Dashboard unter "SQL Editor" einmal komplett ausführen.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Lagerorte (einfach: frei benennbare Orte) ----------
create table if not exists locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- Bestand: Wein UND Spirituosen in einer Tabelle ----------
create table if not exists bottles (
  id                uuid primary key default gen_random_uuid(),
  hauptkategorie    text not null check (hauptkategorie in ('Wein', 'Spirituose')),
  kategorie         text not null,          -- Rotwein, Whisky, Rum, ...
  name              text not null,
  produzent         text,                   -- Weingut bzw. Destillerie/Marke
  jahrgang          int,                    -- Wein: Jahrgang | Spirituose: Destillations-/Abfülljahr
  alter_jahre       int,                    -- nur Spirituosen: Age Statement
  rebsorten         text[],                 -- nur Wein
  land              text,
  region            text,
  appellation       text,                   -- nur Wein
  fassart           text,                   -- nur Spirituosen
  alkoholgehalt     numeric(4,1),
  flaschengroesse_l numeric(5,3) not null default 0.75,
  fuellstand_l      numeric(5,3),           -- nur Spirituosen: aktueller Füllstand in Litern
  anzahl            int not null default 1, -- Wein: Flaschen | Spirituose: 1 = vorhanden, 0 = leer/archiviert
  location_id       uuid references locations(id) on delete set null,
  kaufdatum         date,
  kaufpreis         numeric(8,2),
  haendler          text,
  trink_ab          int,                    -- nur Wein
  trink_bis         int,                    -- nur Wein
  lagerpotenzial    text,                   -- nur Wein
  notizen           text,
  created_at        timestamptz not null default now()
);

-- ---------- Verbrauchsprotokoll ----------
create table if not exists consumption_log (
  id           uuid primary key default gen_random_uuid(),
  bottle_id    uuid not null references bottles(id) on delete cascade,
  anzahl       int  not null default 0,     -- Wein: getrunkene Flaschen
  menge_l      numeric(5,3),                -- Spirituosen: entnommene Menge in Litern
  consumed_at  date not null default current_date,
  anlass       text,
  created_at   timestamptz not null default now()
);

-- ---------- Verkostungsnotizen ----------
create table if not exists tastings (
  id                uuid primary key default gen_random_uuid(),
  bottle_id         uuid references bottles(id) on delete set null,
  name              text not null,
  produzent         text,
  kategorie         text,
  jahrgang          int,
  land              text,
  region            text,
  verkostungsdatum  date not null default current_date,
  anlass            text,
  kaufpreis         numeric(8,2),
  haendler          text,
  bewertung         int check (bewertung between 1 and 5),
  nase              text,
  gaumen            text,
  abgang            text,
  notizen           text,
  created_at        timestamptz not null default now()
);

-- ---------- Verkostung planen (Flights) ----------
create table if not exists tasting_flights (
  id          uuid primary key default gen_random_uuid(),
  titel       text not null,
  story       jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists tasting_flight_items (
  id         uuid primary key default gen_random_uuid(),
  flight_id  uuid not null references tasting_flights(id) on delete cascade,
  bottle_id  uuid not null references bottles(id) on delete cascade,
  position   int  not null
);

-- ============================================================
-- Zugriffsschutz: nur angemeldete Nutzer (Holger, Claudia) dürfen lesen/schreiben.
-- Benutzer legst du im Dashboard unter Authentication > Users an
-- (und schaltest unter Authentication > Providers > Email "Allow new users to sign up" AUS).
-- ============================================================
alter table locations            enable row level security;
alter table bottles              enable row level security;
alter table consumption_log      enable row level security;
alter table tastings             enable row level security;
alter table tasting_flights      enable row level security;
alter table tasting_flight_items enable row level security;

create policy "nur_angemeldet" on locations            for all to authenticated using (true) with check (true);
create policy "nur_angemeldet" on bottles              for all to authenticated using (true) with check (true);
create policy "nur_angemeldet" on consumption_log      for all to authenticated using (true) with check (true);
create policy "nur_angemeldet" on tastings             for all to authenticated using (true) with check (true);
create policy "nur_angemeldet" on tasting_flights      for all to authenticated using (true) with check (true);
create policy "nur_angemeldet" on tasting_flight_items for all to authenticated using (true) with check (true);

-- ---------- Start-Lagerorte (in der App jederzeit änder- und erweiterbar) ----------
insert into locations (name, sort_order) values
  ('Weinkeller', 10),
  ('Vitrine',    20),
  ('Bar',        30),
  ('Regal',      40);
