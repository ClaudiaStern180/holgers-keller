// Vercel Serverless Function: sucht Marktpreis und/oder Aromen zu einer Flasche.
//  modus "web":    Websuche (Preis + Aromen laut Hersteller/Händler)
//  modus "profil": nur Aromen als KI-Einschätzung, ohne Websuche
// Nur für angemeldete Nutzer (Supabase-Login).
//
// Umgebungsvariablen: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, optional ANTHROPIC_MODEL
// Hinweis: Die Websuche muss in der Anthropic Console aktiviert sein (Einstellungen > Datenschutz > Websuche).

const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

async function claude(body) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || 'Fehler bei der KI-Anfrage');
  return data;
}

function beschreibung(p) {
  return [
    p.name,
    p.produzent && `Marke/Produzent: ${p.produzent}`,
    p.kategorie && `Kategorie: ${p.kategorie}`,
    p.alter_jahre && `${p.alter_jahre} Jahre`,
    p.jahrgang && `Jahr/Jahrgang: ${p.jahrgang}`,
    p.fassart && `Fassart: ${p.fassart}`,
    p.land && `Land: ${p.land}`,
    p.region && `Region: ${p.region}`,
    p.alkoholgehalt && `${p.alkoholgehalt} % vol.`,
    p.flaschengroesse_l && `Flaschengröße: ${p.flaschengroesse_l} l`
  ].filter(Boolean).join('; ');
}

function parseJson(text) {
  const t = (text || '').replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Keine auswertbare Antwort erhalten');
  return JSON.parse(t.slice(a, b + 1));
}

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
    const p = (req.body && req.body.flasche) || {};
    const modus = (req.body && req.body.modus) === 'profil' ? 'profil' : 'web';
    if (!p.name || String(p.name).length > 200) return res.status(400).json({ error: 'Bitte zuerst einen Namen eintragen.' });
    const wein = ['Rotwein', 'Weißwein', 'Rosé', 'Schaumwein', 'Süßwein'].includes(p.kategorie);

    // 3a) Nur Profil (ohne Websuche)
    if (modus === 'profil') {
      const data = await claude({
        model: MODEL(),
        max_tokens: 500,
        messages: [{ role: 'user', content: `Nenne das typische Aroma- bzw. Geschmacksprofil dieses Produkts: ${beschreibung(p)}.
Antworte AUSSCHLIESSLICH mit JSON: {"aromen": "5 bis 8 Stichwörter auf Deutsch, Komma-getrennt (Nase, Gaumen, Abgang gemischt)"}
Wenn du das Produkt nicht kennst und nur sehr allgemein raten könntest, antworte {"aromen": null}.` }]
      });
      const text = (data.content || []).map(c => c.text || '').join('');
      const j = parseJson(text);
      return res.status(200).json({ aromen: j.aromen || null, aromen_quelle: 'ki' });
    }

    // 3b) Websuche: Preis + Aromen
    const prompt = `Recherchiere im Internet zu diesem Produkt: ${beschreibung(p)}.

1) PREIS: Finde den aktuellen Flaschenpreis in Euro bei deutschen oder europäischen Händlern (${wein ? 'Weinhandel, Online-Shops, wine-searcher' : 'z. B. whisky.de, Whiskybase, Online-Shops'}) für genau diese Flasche (Größe beachten, Preis für EINE Flasche, keine Auktions-/Sammlerpreise, es sei denn, das Produkt ist nur dort erhältlich). Gib einen realistischen Mittelwert der gefundenen Angebote an.
2) AROMEN: Finde die Geschmacksbeschreibung des Herstellers (Tasting Notes: Nase, Gaumen, Abgang) bzw. eines seriösen Händlers und fasse sie in 5 bis 8 deutschen Stichwörtern zusammen.

Erfinde nichts. Wenn du das Produkt nicht eindeutig findest, setze die Werte auf null.
Antworte am Ende AUSSCHLIESSLICH mit JSON in dieser Form:
{"preis_eur": Zahl oder null, "preis_quelle": "Name oder Domain des Händlers/der Seite" oder null, "aromen": "Stichwörter, Komma-getrennt" oder null, "aromen_quelle": "hersteller" (Angabe stammt vom Hersteller/Destillerie/Weingut) oder "web" (von Händler/Testbericht) oder null}`;

    const messages = [{ role: 'user', content: prompt }];
    let data;
    for (let i = 0; i < 4; i++) {
      data = await claude({
        model: MODEL(),
        max_tokens: 1500,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4, user_location: { type: 'approximate', country: 'DE' } }],
        messages
      });
      if (data.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: data.content });
    }
    const texts = (data.content || []).filter(c => c.type === 'text').map(c => c.text);
    const j = parseJson(texts.join('\n'));
    const preis = Number(j.preis_eur);
    return res.status(200).json({
      preis_eur: Number.isFinite(preis) && preis > 0 && preis < 100000 ? Math.round(preis * 100) / 100 : null,
      preis_quelle: j.preis_quelle || null,
      aromen: j.aromen || null,
      aromen_quelle: j.aromen ? (j.aromen_quelle === 'hersteller' ? 'hersteller' : 'web') : null
    });
  } catch (err) {
    const m = String(err.message || err);
    const hinweis = /web.?search/i.test(m) ? ' (Websuche in der Anthropic Console aktivieren: Einstellungen → Datenschutz)' : '';
    return res.status(500).json({ error: 'Suche fehlgeschlagen: ' + m + hinweis });
  }
};
