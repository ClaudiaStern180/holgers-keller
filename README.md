# Holgers Keller – Whisky, Spirituosen & Wein

Fork der Cantina Claudia. Ohne Etiketten-Scan und Wunschliste, dafür mit Spirituosen (Füllstand in 0,1-L-Schritten), einfachen Lagerorten, Login und Verkostungsplaner inkl. Story.

## Einrichtung (einmalig)

1. **Supabase**: neues Projekt anlegen → *SQL Editor* → Inhalt von `supabase/schema.sql` einfügen und ausführen.
2. **Benutzer**: *Authentication → Users → Add user* (E-Mail + Passwort) für Holger und für dich anlegen (Haken „Auto Confirm User“ setzen).
   Danach *Authentication → Sign In / Providers → Email*: „Allow new users to sign up“ **ausschalten**.
3. **config.js**: `SUPABASE_URL` und `SUPABASE_ANON_KEY` eintragen (*Project Settings → API*).
4. **Vercel**: Ordner als neues Projekt deployen (GitHub-Repo oder `vercel` CLI). Unter *Settings → Environment Variables* setzen:
   - `ANTHROPIC_API_KEY` (dein Key – Kosten laufen zunächst über dich)
   - `SUPABASE_URL` und `SUPABASE_ANON_KEY` (wie in config.js)
   - optional `ANTHROPIC_MODEL` (Standard: `claude-sonnet-5-5`)
   Danach einmal neu deployen.
5. **Deployment Protection**: Holger hat keinen Vercel-Account. Unter *Settings → Deployment Protection* die Production-Domain **nicht** hinter Vercel-Login legen – der Schutz läuft über den App-Login.

## Installieren auf dem Handy

- Android (Holger): in Chrome öffnen → Menü ⋮ → „App installieren“ / „Zum Startbildschirm“.
- iPad (Test): in Safari öffnen → Teilen → „Zum Home-Bildschirm“.

## Kosten später an Holger übergeben

Nur der API-Key wird für die Story-Funktion gebraucht. Holger legt bei console.anthropic.com einen eigenen Key an; du tauschst `ANTHROPIC_API_KEY` in Vercel aus und deployst neu. Supabase und Vercel lassen sich über *Transfer project* bzw. *Transfer ownership* an ihn übertragen.

## Wie Spirituosen gezählt werden

- Jede Spirituosen-Flasche ist ein eigener Eintrag mit eigenem Füllstand (beim Anlegen kann man „Anzahl identischer Flaschen“ angeben).
- „Füllstand“ ändern protokolliert die entnommene Menge im Archiv; bei 0 L wandert die Flasche ins Archiv.
- Wein läuft wie bei dir: Anzahl Flaschen, Trinkfenster-Ampel, Auslagern.
