// Vercel Serverless Function: erzeugt eine "Tasting Story" für eine geplante Verkostung.
// Nur für angemeldete Nutzer (Supabase-Login) – so kann niemand fremdes deinen API-Key verbrauchen.
//
// Umgebungsvariablen (in Vercel unter Settings > Environment Variables):
//   ANTHROPIC_API_KEY   (Pflicht)  – dein API-Key von console.anthropic.com
//   SUPABASE_URL        (Pflicht)  – wie in config.js
//   SUPABASE_ANON_KEY   (Pflicht)  – wie in config.js
//   ANTHROPIC_MODEL     (optional) – Standard: claude-sonnet-5-5

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST erlaubt' });

  try {
    // 1) Login prüfen
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Nicht angemeldet' });
    const who = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
    });
    if (!who.ok) return res.status(401).json({ error: 'Nicht angemeldet' });

    // 2) Eingabe prüfen
    const { titel, wines } = req.body || {};
    if (!Array.isArray(wines) || wines.length < 2 || wines.length > 12) {
      return res.status(400).json({ error: 'Bitte 2 bis 12 Einträge auswählen.' });
    }
    const liste = wines.map((w, i) => {
      const teile = [
        w.name,
        w.produzent && `von ${w.produzent}`,
        w.kategorie && `(${w.kategorie})`,
        w.jahrgang && `Jahr/Jahrgang ${w.jahrgang}`,
        w.alter_jahre && `${w.alter_jahre} Jahre gereift`,
        [w.region, w.land].filter(Boolean).join(', '),
        w.fassart && `Fass: ${w.fassart}`,
        w.rebsorten && w.rebsorten.length && `Rebsorten: ${w.rebsorten.join(', ')}`,
        w.alkoholgehalt && `${w.alkoholgehalt} % vol.`
      ].filter(Boolean);
      return `${i + 1}. ${teile.join(' · ')}`;
    }).join('\n');

    const prompt = `Du bist ein sympathischer, kenntnisreicher Sommelier und Whisky-Experte und führst durch eine Verkostung mit dem Titel "${titel || 'Verkostung'}". Die Reihenfolge ist bereits festgelegt:

${liste}

Schreibe auf Deutsch eine kurze, lebendige Story für den Abend. Erfinde keine konkreten Fakten (Preise, Auszeichnungen, Zitate), wenn du dir nicht sicher bist; bleibe dann allgemein.

Antworte AUSSCHLIESSLICH mit gültigem JSON in genau dieser Form, ohne Markdown und ohne Text davor oder danach:
{
  "einleitung": "2-3 Sätze zur Begrüßung und zum roten Faden der Reihenfolge",
  "weine": [
    {
      "erwartung": "2-3 Sätze: was uns bei diesem Eintrag erwartet",
      "verkostungstipps": "1-2 Sätze: worauf bei Nase, Gaumen und Abgang zu achten ist",
      "storytelling": "2-3 Sätze: Geschichte oder Hintergrund zu Herkunft/Hersteller",
      "uebergang": "1 Satz: Überleitung zum nächsten Eintrag (beim ersten Eintrag leer lassen)"
    }
  ],
  "abschluss": "2-3 Sätze Fazit und Schlusswort"
}
Das Array "weine" muss genau ${wines.length} Objekte in der vorgegebenen Reihenfolge enthalten.`;

    // 3) Claude fragen
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || 'Fehler bei der KI-Anfrage' });

    const text = (data.content || []).map(c => c.text || '').join('').trim()
      .replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const story = JSON.parse(text);
    if (!Array.isArray(story.weine) || story.weine.length !== wines.length) {
      return res.status(502).json({ error: 'Die Story war unvollständig – bitte nochmal versuchen.' });
    }
    return res.status(200).json(story);
  } catch (err) {
    return res.status(500).json({ error: 'Story konnte nicht erzeugt werden: ' + err.message });
  }
};
