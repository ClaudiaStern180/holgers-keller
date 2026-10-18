// Vercel Serverless Function: liest ein Etikett (Wein oder Spirituose) per KI aus.
// Nur für angemeldete Nutzer (Supabase-Login).
//
// Umgebungsvariablen: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, optional ANTHROPIC_MODEL

const KATEGORIEN = [
  'Rotwein', 'Weißwein', 'Rosé', 'Schaumwein', 'Süßwein',
  'Whisky', 'Rum', 'Gin', 'Cognac & Brandy', 'Vodka', 'Tequila & Mezcal', 'Likör', 'Sonstige Spirituosen'
];

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

    // 2) Bilder prüfen
    const images = (req.body && req.body.images) || [];
    if (!Array.isArray(images) || images.length < 1 || images.length > 2) {
      return res.status(400).json({ error: 'Bitte 1 oder 2 Fotos senden.' });
    }
    const content = images.map(img => ({
      type: 'image',
      source: { type: 'base64', media_type: img.media_type || 'image/jpeg', data: img.data }
    }));
    content.push({
      type: 'text',
      text: `Das sind Fotos von einem Flaschenetikett (Vorder- und/oder Rückseite) – entweder Wein oder eine Spirituose (z. B. Whisky, Rum, Gin).
Lies alle erkennbaren Angaben aus. Erfinde nichts: Was nicht auf dem Etikett steht und was du nicht sicher weißt, bleibt null.

Antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Markdown und ohne Text davor oder danach, in genau dieser Form:
{
  "kategorie": eine von ${JSON.stringify(KATEGORIEN)},
  "name": "Produktname wie auf dem Etikett (z. B. 'Lagavulin 16' oder 'Barolo Riserva')",
  "produzent": "Weingut bzw. Destillerie/Marke",
  "jahrgang": Zahl (Wein: Jahrgang; Spirituose: nur ein auf dem Etikett genanntes Destillations- oder Abfülljahr),
  "alter_jahre": Zahl (nur Spirituosen mit Altersangabe, sonst null),
  "rebsorten": ["..."] (nur Wein, sonst null),
  "land": "...",
  "region": "... (bei Whisky z. B. Islay, Speyside)",
  "appellation": "... (nur Wein: Appellation/Lage)",
  "fassart": "... (nur Spirituosen, z. B. Sherry Cask)",
  "alkoholgehalt": Zahl in % vol.,
  "flaschengroesse_l": Zahl in Litern (z. B. 0.7),
  "trink_ab": Jahr (nur Wein, nur wenn eine seriöse Einschätzung möglich ist, sonst null),
  "trink_bis": Jahr (nur Wein, sonst null),
  "lagerpotenzial": "... (nur Wein, kurz, sonst null)",
  "geschaetzter_preis": Zahl in Euro (grobe Schätzung für eine Flasche, sonst null),
  "aromen": "Geschmacks-/Aromaangaben des Herstellers, NUR wenn sie auf Etikett oder Verpackung wörtlich genannt werden (z. B. 'Toffee, Leder, Rauch, Vanille'), als kurze Komma-Liste auf Deutsch; sonst null"
}`
    });

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
        max_tokens: 1200,
        messages: [{ role: 'user', content }]
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || 'Fehler bei der KI-Anfrage' });

    const text = (data.content || []).map(c => c.text || '').join('').trim()
      .replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const result = JSON.parse(text);
    if (!KATEGORIEN.includes(result.kategorie)) result.kategorie = null;
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Etikett konnte nicht ausgelesen werden: ' + err.message });
  }
};
