// ============================================================
// HOLGERS KELLER — Whisky, Spirituosen & Wein
// ============================================================

const KATEGORIEN = {
  Wein: ['Rotwein', 'Weißwein', 'Rosé', 'Schaumwein', 'Süßwein'],
  Spirituose: ['Whisky', 'Rum', 'Gin', 'Cognac & Brandy', 'Vodka', 'Tequila & Mezcal', 'Likör', 'Sonstige Spirituosen']
};
const ALLE_KATEGORIEN = [...KATEGORIEN.Wein, ...KATEGORIEN.Spirituose];
const kategorieFarben = {
  'Rotwein': '#7B2D3E', 'Weißwein': '#C9A646', 'Rosé': '#D98A8A', 'Schaumwein': '#B8943C', 'Süßwein': '#9C6B30',
  'Whisky': '#B7762C', 'Rum': '#8A4B1F', 'Gin': '#4F8A8B', 'Cognac & Brandy': '#9A5B2E', 'Vodka': '#7C8EA3',
  'Tequila & Mezcal': '#6B8E4E', 'Likör': '#A0527C', 'Sonstige Spirituosen': '#6F6A5E'
};
const GROESSEN = {
  Wein: [0.2, 0.375, 0.75, 1.5, 3, 4.5, 6],
  Spirituose: [0.05, 0.2, 0.35, 0.5, 0.7, 1, 1.5, 1.75, 3]
};

// ---------- Helfer ----------
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hauptVon = k => KATEGORIEN.Wein.includes(k) ? 'Wein' : 'Spirituose';
const round2 = v => Math.round(v * 100) / 100;
const fmtL = v => round2(Number(v)).toString().replace('.', ',') + ' L';
const heute = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in lokaler Zeit
const num = v => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);
const stars = n => `<span class="stars">${'★'.repeat(n || 0)}<span class="off">${'★'.repeat(5 - (n || 0))}</span></span>`;

let allBottles = [];
let allLocations = [];
let allTastings = [];
let flightIds = [];            // Reihenfolge der geplanten Verkostung (Flaschen-IDs)
let currentFlightId = null;
let storyData = null;
let storyIndex = 0;
let editingBottleId = null;
let editingTastingId = null;
let fillBottleId = null;
let collapsed = {};

const locName = id => allLocations.find(l => l.id === id)?.name || null;
const bottleById = id => allBottles.find(b => b.id === id);
const isSpirit = b => b.hauptkategorie === 'Spirituose';
const color = b => kategorieFarben[b.kategorie] || '#7B2D3E';

const BUCKET = 'etiketten';
const photoUrl = path => supabaseClient.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
const photoOf = (b, typ) => (b.bottle_photos || []).find(p => p.typ === typ);
const thumbOf = b => { const p = photoOf(b, 'etikett') || (b.bottle_photos || [])[0]; return p ? photoUrl(p.storage_path) : null; };

function openModal(id) { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }
document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
document.querySelectorAll('.modal').forEach(m => m.addEventListener('mousedown', e => { if (e.target === m) closeModal(m.id); }));
window.closeModal = closeModal;

function gotoTab(name) { document.querySelector(`.tab[data-tab="${name}"]`).click(); }
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  tab.classList.add('active');
  $('view-' + tab.dataset.tab).classList.add('active');
  if (tab.dataset.tab === 'archiv') renderArchiv();
  if (tab.dataset.tab === 'flight') { renderFlightPool(); renderFlightOrder(); loadSavedFlights(); }
}));

// ---------- Auswahllisten ----------
function kategorieOptionsHtml(selected, leer) {
  return (leer ? `<option value="">${leer}</option>` : '') +
    Object.entries(KATEGORIEN).map(([h, ks]) =>
      `<optgroup label="${h === 'Wein' ? 'Wein' : 'Spirituosen'}">${ks.map(k =>
        `<option value="${esc(k)}" ${k === selected ? 'selected' : ''}>${esc(k)}</option>`).join('')}</optgroup>`).join('');
}
function locationOptionsHtml(selected, leer) {
  return `<option value="">${leer}</option>` +
    allLocations.map(l => `<option value="${l.id}" ${l.id === selected ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
}
function fuellstandWerte(vol) {
  vol = round2(vol);
  const werte = [vol];
  for (let t = Math.floor(vol * 10 + 1e-9); t >= 1; t--) {
    const w = t / 10;
    if (Math.abs(w - vol) > 1e-9) werte.push(w);
  }
  werte.push(0);
  return werte;
}
function fuellstandOptionsHtml(vol, selected) {
  return fuellstandWerte(vol).map((w, i) =>
    `<option value="${w}" ${selected != null && Math.abs(w - selected) < 1e-9 ? 'selected' : ''}>${i === 0 ? 'Voll · ' : w === 0 ? 'Leer · ' : ''}${fmtL(w)}</option>`).join('');
}

function initSelects() {
  $('bf-kategorie').innerHTML = kategorieOptionsHtml('Whisky');
  $('tf-kategorie').innerHTML = kategorieOptionsHtml('', 'Kategorie wählen');
  $('flight-filter-kat').innerHTML = kategorieOptionsHtml('', 'Alle Kategorien');
  updateFilterOptions();
}
function updateFilterOptions() {
  const haupt = $('filter-haupt').value;
  const katSel = $('filter-kat'), ortSel = $('filter-ort');
  const katAlt = katSel.value, ortAlt = ortSel.value;
  const kats = haupt ? KATEGORIEN[haupt] : ALLE_KATEGORIEN;
  katSel.innerHTML = '<option value="">Alle Kategorien</option>' + kats.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
  if (kats.includes(katAlt)) katSel.value = katAlt;
  ortSel.innerHTML = locationOptionsHtml('', 'Alle Lagerorte') + '<option value="__none">Ohne Lagerort</option>';
  if ([...ortSel.options].some(o => o.value === ortAlt)) ortSel.value = ortAlt;
}

// ============================================================
// LOGIN
// ============================================================
let appStarted = false;
function showLogin() { $('login').classList.remove('hidden'); }
async function startApp() {
  $('login').classList.add('hidden');
  if (appStarted) return;
  appStarted = true;
  initSelects();
  await loadLocations();
  await loadBottles();
  loadTastings();
  loadSavedFlights();
}
$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('login-error').textContent = '';
  const { error } = await supabaseClient.auth.signInWithPassword({ email: $('login-email').value.trim(), password: $('login-pass').value });
  if (error) { $('login-error').textContent = 'Anmeldung fehlgeschlagen: ' + error.message; return; }
  $('login-pass').value = '';
  startApp();
});
$('btn-logout').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  location.reload();
});
async function authHeader() {
  const { data } = await supabaseClient.auth.getSession();
  return data?.session ? { Authorization: 'Bearer ' + data.session.access_token } : {};
}

// ============================================================
// DATEN LADEN
// ============================================================
async function loadLocations() {
  const { data, error } = await supabaseClient.from('locations').select('*').order('sort_order').order('name');
  if (error) console.error(error);
  allLocations = data || [];
}
async function loadBottles() {
  const { data, error } = await supabaseClient.from('bottles').select('*, bottle_photos(storage_path, typ)').order('created_at', { ascending: false });
  if (error) { console.error(error); alert('Bestand konnte nicht geladen werden: ' + error.message); return; }
  allBottles = data || [];
  renderAll();
}
function renderAll() {
  updateFilterOptions();
  renderCellar();
  renderStorage();
  renderStats();
  renderFlightPool();
  renderFlightOrder();
}

// ============================================================
// BESTAND
// ============================================================
function trinkStatus(b) {
  const jahr = new Date().getFullYear();
  if (!b.trink_ab || !b.trink_bis) return { farbe: '#A6926A', label: 'Kein Trinkfenster' };
  if (jahr < b.trink_ab) return { farbe: '#C9A646', label: 'Noch warten' };
  if (jahr > b.trink_bis) return { farbe: '#9B3B3B', label: 'Über Höhepunkt' };
  if (b.trink_bis - jahr <= 1) return { farbe: '#D98A33', label: 'Bald trinken' };
  return { farbe: '#5C7A4F', label: 'Optimal' };
}
function pill(label, c) {
  return `<span class="pill" style="background:${c}22;color:${c};border:1px solid ${c}55"><span class="dot" style="background:${c}"></span>${esc(label)}</span>`;
}
function fillPct(b) {
  const vol = Number(b.flaschengroesse_l) || 0.7;
  return Math.max(0, Math.min(100, Math.round((Number(b.fuellstand_l ?? vol) / vol) * 100)));
}
function fillHtml(b) {
  const vol = Number(b.flaschengroesse_l) || 0.7;
  const cur = Number(b.fuellstand_l ?? vol);
  return `<div class="fill-bar"><div style="width:${fillPct(b)}%"></div></div>
          <div class="fill-label"><span>${fmtL(cur)} von ${fmtL(vol)}</span><span>${fillPct(b)} %</span></div>`;
}
function subline(b) {
  return isSpirit(b)
    ? [b.produzent, b.alter_jahre ? b.alter_jahre + ' J.' : null, b.jahrgang].filter(Boolean).join(' · ')
    : [b.produzent, b.jahrgang].filter(Boolean).join(' · ');
}
function sizeBadge(b) {
  const std = isSpirit(b) ? 0.7 : 0.75;
  return Math.abs(Number(b.flaschengroesse_l) - std) > 1e-9 ? `<span class="size-badge">${fmtL(b.flaschengroesse_l)}</span>` : '';
}

function cardHtml(b) {
  const spirit = isSpirit(b);
  const inFlight = flightIds.includes(b.id);
  const thumb = thumbOf(b);
  let mid;
  if (spirit) {
    const offen = fillPct(b) < 100;
    mid = `<div>${pill(offen ? 'Angebrochen' : 'Ungeöffnet', offen ? '#D98A33' : '#5C7A4F')}${fillPct(b) <= 20 ? pill('Fast leer', '#9B3B3B') : ''}</div>${fillHtml(b)}`;
  } else {
    const st = trinkStatus(b);
    mid = `<div>${pill(st.label, st.farbe)}${b.anzahl === 1 ? pill('Letzte', '#9B3B3B') : ''}</div>`;
  }
  return `
  <div class="bottle-card" onclick="showDetail('${b.id}')">
    <div class="bottle-card-top">
      ${thumb ? `<img src="${thumb}" class="bottle-thumb" alt="" loading="lazy" />` : ''}
      <div style="flex:1;min-width:0">
        <div class="bottle-name">${esc(b.name)}${sizeBadge(b)}</div>
        <div class="bottle-sub">${esc(subline(b))}</div>
      </div>
      <button class="btn-add-flight ${inFlight ? 'active' : ''}" title="Zur Verkostung hinzufügen" onclick="event.stopPropagation(); addToFlight('${b.id}')">🥂+</button>
    </div>
    ${mid}
    <div class="bottle-meta">📍 ${esc(locName(b.location_id) || 'Kein Lagerort')}</div>
    <div class="bottle-foot">
      <span style="color:var(--muted)">${spirit ? '' : b.anzahl + '× Flasche' + (b.anzahl > 1 ? 'n' : '')}</span>
      <span style="font-weight:600">${b.kaufpreis != null ? '€ ' + b.kaufpreis : ''}</span>
    </div>
  </div>`;
}

function renderCellar() {
  const search = $('search').value.toLowerCase();
  const haupt = $('filter-haupt').value, kat = $('filter-kat').value, ort = $('filter-ort').value;

  const filtered = allBottles.filter(b => {
    if (b.anzahl <= 0) return false; // Verbrauchtes nur im Archiv
    if (haupt && b.hauptkategorie !== haupt) return false;
    if (kat && b.kategorie !== kat) return false;
    if (ort === '__none' && b.location_id) return false;
    if (ort && ort !== '__none' && b.location_id !== ort) return false;
    if (search) {
      const fields = [b.name, b.produzent, b.region, b.land, b.fassart, b.kategorie, ...(b.rebsorten || [])];
      if (!fields.filter(Boolean).some(f => f.toLowerCase().includes(search))) return false;
    }
    return true;
  });

  const grid = $('bottle-grid');
  if (!filtered.length) {
    grid.innerHTML = `<div style="text-align:center;padding:40px;color:#A6926A">${allBottles.some(b => b.anzahl > 0) ? 'Nichts gefunden.' : 'Noch nichts eingelagert – oben auf „+ Einlagern“ tippen.'}</div>`;
    return;
  }

  const groups = {};
  filtered.forEach(b => (groups[b.kategorie] = groups[b.kategorie] || []).push(b));
  const keys = [...ALLE_KATEGORIEN.filter(k => groups[k]), ...Object.keys(groups).filter(k => !ALLE_KATEGORIEN.includes(k))];

  grid.innerHTML = keys.map(k => {
    const items = groups[k];
    const count = items.reduce((s, b) => s + b.anzahl, 0);
    const isC = !!collapsed[k];
    const byRegion = {};
    items.forEach(b => { const r = b.region || b.land || 'Ohne Region'; (byRegion[r] = byRegion[r] || []).push(b); });
    const regionKeys = Object.keys(byRegion).sort((a, b) => byRegion[b].length - byRegion[a].length || a.localeCompare(b));

    const regionsHtml = regionKeys.map(r => {
      const list = byRegion[r].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      const subKey = `${k}|${r}`;
      const subC = !!collapsed[subKey];
      const subCount = list.reduce((s, b) => s + b.anzahl, 0);
      return `
      <div>
        <button class="cellar-subgroup-header" data-toggle="${esc(subKey)}">
          <span>${esc(r)} <span class="cellar-group-count">${subCount} Flasche${subCount !== 1 ? 'n' : ''}</span></span>
          <span class="cellar-group-arrow">${subC ? '▸' : '▾'}</span>
        </button>
        <div class="bottle-grid" style="${subC ? 'display:none' : ''}">${list.map(cardHtml).join('')}</div>
      </div>`;
    }).join('');

    return `
    <div class="cellar-group">
      <button class="cellar-group-header" data-toggle="${esc(k)}">
        <span class="cellar-group-title"><span class="color-chip" style="background:${kategorieFarben[k] || '#7B2D3E'}"></span>${esc(k)}<span class="cellar-group-count">${count} Flasche${count !== 1 ? 'n' : ''}</span></span>
        <span class="cellar-group-arrow">${isC ? '▸' : '▾'}</span>
      </button>
      <div style="${isC ? 'display:none' : ''}">${regionsHtml}</div>
    </div>`;
  }).join('');

  grid.querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', () => {
    collapsed[btn.dataset.toggle] = !collapsed[btn.dataset.toggle];
    renderCellar();
  }));
}
$('search').addEventListener('input', renderCellar);
$('filter-haupt').addEventListener('change', () => { updateFilterOptions(); renderCellar(); });
$('filter-kat').addEventListener('change', renderCellar);
$('filter-ort').addEventListener('change', renderCellar);

// ---------- Detailansicht ----------
function detailRows(rows) {
  return rows.map(([l, v]) => `<div><b>${l}:</b> ${v ? esc(v) : '–'}</div>`).join('');
}
window.showDetail = function (id) {
  const b = bottleById(id);
  if (!b) return;
  const spirit = isSpirit(b);
  const preis = b.kaufpreis != null ? '€ ' + b.kaufpreis : null;
  const rows = spirit ? [
    ['Destillerie/Marke', b.produzent], ['Land / Region', [b.land, b.region].filter(Boolean).join(' · ')],
    ['Alter', b.alter_jahre ? b.alter_jahre + ' Jahre' : null], ['Jahr', b.jahrgang],
    ['Fassart', b.fassart], ['Alkohol', b.alkoholgehalt ? b.alkoholgehalt + ' %' : null],
    ['Flaschengröße', fmtL(b.flaschengroesse_l)], ['Lagerort', locName(b.location_id)],
    ['Kaufpreis', preis], ['Kaufdatum', b.kaufdatum], ['Händler', b.haendler]
  ] : [
    ['Weingut', b.produzent], ['Jahrgang', b.jahrgang],
    ['Rebsorte', (b.rebsorten || []).join(', ')], ['Land / Region', [b.land, b.region].filter(Boolean).join(' · ')],
    ['Lage', b.appellation], ['Alkohol', b.alkoholgehalt ? b.alkoholgehalt + ' %' : null],
    ['Trinkfenster', b.trink_ab || b.trink_bis ? `${b.trink_ab || '?'} – ${b.trink_bis || '?'}` : null], ['Lagerpotenzial', b.lagerpotenzial],
    ['Lagerort', locName(b.location_id)], ['Anzahl', String(b.anzahl)], ['Flaschengröße', fmtL(b.flaschengroesse_l)],
    ['Kaufpreis', preis], ['Kaufdatum', b.kaufdatum], ['Händler', b.haendler]
  ];
  const leer = b.anzahl <= 0;
  const vorne = photoOf(b, 'etikett'), hinten = photoOf(b, 'rueckseite');
  const fotos = (vorne || hinten) ? `<div class="detail-photos">${[vorne, hinten].map(p => `<div>${p
    ? `<a href="${photoUrl(p.storage_path)}" target="_blank" rel="noopener"><img src="${photoUrl(p.storage_path)}" alt="Etikett" /></a>`
    : '<span class="hint" style="margin:0">Kein Foto</span>'}</div>`).join('')}</div>` : '';
  const aktion = leer ? '' : spirit
    ? `<button onclick="openFill('${b.id}')" class="btn-primary btn-green" style="flex:1">🥃 Füllstand</button>`
    : `<button onclick="auslagernBottle('${b.id}')" class="btn-primary btn-green" style="flex:1">🍷 Auslagern</button>`;

  $('modal-detail-content').innerHTML = `
    <button class="modal-close" onclick="closeModal('modal-detail')">&times;</button>
    <h2>${esc(b.name)}</h2>
    <div style="color:var(--muted);margin-bottom:10px">${esc(subline(b))}</div>
    <div>${pill(b.kategorie, color(b))}${leer ? pill('Verbraucht', '#8A7B5E') : (!spirit ? (() => { const s = trinkStatus(b); return pill(s.label, s.farbe); })() : '')}</div>
    ${spirit && !leer ? `<div style="margin-top:10px">${fillHtml(b)}</div>` : ''}
    <div class="detail-grid">${detailRows(rows)}</div>
    ${b.notizen ? `<div class="note-box"><b>Notizen:</b> ${esc(b.notizen)}</div>` : ''}
    ${fotos}
    <div class="btn-row">
      <button onclick="editBottle('${b.id}')" class="btn-primary btn-dark" style="flex:1">Bearbeiten</button>
      ${aktion}
      <button onclick="deleteBottle('${b.id}')" class="btn-primary btn-red" style="flex:1">Löschen</button>
    </div>`;
  openModal('modal-detail');
};

// ---------- Wein auslagern ----------
window.auslagernBottle = async function (id) {
  const b = bottleById(id);
  if (!b) return;
  let n = 1;
  if (b.anzahl > 1) n = parseInt(prompt(`Wie viele Flaschen von „${b.name}“ auslagern? (max. ${b.anzahl})`, '1') || '0', 10);
  if (!n || n <= 0 || n > b.anzahl) { if (b.anzahl > 1) alert('Ungültige Menge.'); return; }
  const anlass = prompt('Anlass (optional):') || null;
  const { error: logErr } = await supabaseClient.from('consumption_log').insert({ bottle_id: id, anzahl: n, consumed_at: heute(), anlass });
  if (logErr) { alert('Fehler beim Protokollieren: ' + logErr.message); return; }
  const { error } = await supabaseClient.from('bottles').update({ anzahl: b.anzahl - n }).eq('id', id);
  if (error) { alert('Fehler: ' + error.message); return; }
  closeModal('modal-detail');
  if (b.anzahl - n === 0) alert(`„${b.name}“ ist jetzt verbraucht und im Archiv.`);
  loadBottles();
};

// ---------- Spirituose: Füllstand ändern ----------
window.openFill = function (id) {
  const b = bottleById(id);
  if (!b) return;
  fillBottleId = id;
  const vol = Number(b.flaschengroesse_l) || 0.7;
  $('fill-name').textContent = `${b.name} · aktuell ${fmtL(b.fuellstand_l ?? vol)} von ${fmtL(vol)}`;
  $('fill-select').innerHTML = fuellstandOptionsHtml(vol, Number(b.fuellstand_l ?? vol));
  $('fill-anlass').value = '';
  closeModal('modal-detail');
  openModal('modal-fill');
};
$('btn-fill-save').addEventListener('click', async () => {
  const b = bottleById(fillBottleId);
  if (!b) return;
  const vol = Number(b.flaschengroesse_l) || 0.7;
  const alt = Number(b.fuellstand_l ?? vol);
  const neu = parseFloat($('fill-select').value);
  const diff = round2(alt - neu);
  if (Math.abs(diff) < 1e-9) { closeModal('modal-fill'); return; }
  if (diff > 0) {
    const { error: logErr } = await supabaseClient.from('consumption_log').insert({
      bottle_id: b.id, anzahl: neu === 0 ? 1 : 0, menge_l: diff, consumed_at: heute(), anlass: $('fill-anlass').value.trim() || null
    });
    if (logErr) { alert('Fehler beim Protokollieren: ' + logErr.message); return; }
  }
  const { error } = await supabaseClient.from('bottles').update({ fuellstand_l: neu, anzahl: neu > 0 ? 1 : 0 }).eq('id', b.id);
  if (error) { alert('Fehler: ' + error.message); return; }
  closeModal('modal-fill');
  if (neu === 0) alert(`„${b.name}“ ist leer und jetzt im Archiv.`);
  loadBottles();
});

window.deleteBottle = async function (id) {
  const b = bottleById(id);
  if (!confirm(`„${b?.name}“ wirklich endgültig löschen?`)) return;
  const paths = (b?.bottle_photos || []).map(p => p.storage_path);
  const { error } = await supabaseClient.from('bottles').delete().eq('id', id);
  if (error) { alert('Fehler beim Löschen: ' + error.message); return; }
  removeUnreferenced(paths).catch(console.error);
  flightIds = flightIds.filter(x => x !== id);
  closeModal('modal-detail');
  loadBottles();
};

// ============================================================
// EINLAGERN / BEARBEITEN
// ============================================================
function ensureOption(sel, val, label) {
  if (![...sel.options].some(o => Math.abs(parseFloat(o.value) - val) < 1e-9)) {
    const o = document.createElement('option');
    o.value = val; o.textContent = label;
    sel.appendChild(o);
  }
}
function setFormHaupt(h) {
  const form = $('form-bottle');
  form.dataset.haupt = h;
  const sel = $('bf-groesse');
  const cur = parseFloat(sel.value);
  const list = GROESSEN[h];
  const val = list.includes(cur) ? cur : (h === 'Wein' ? 0.75 : 0.7);
  sel.innerHTML = list.map(g => `<option value="${g}" ${g === val ? 'selected' : ''}>${fmtL(g)}</option>`).join('');
  $('lbl-produzent').textContent = h === 'Wein' ? 'Weingut' : 'Destillerie / Marke';
  $('lbl-jahrgang').textContent = h === 'Wein' ? 'Jahrgang' : 'Destilliert / abgefüllt (Jahr)';
  refreshFuellstand(NaN);
}
function refreshFuellstand(selected) {
  const vol = parseFloat($('bf-groesse').value) || 0.7;
  $('bf-fuellstand').innerHTML = fuellstandOptionsHtml(vol, isNaN(selected) ? null : selected);
}
$('bf-kategorie').addEventListener('change', () => setFormHaupt(hauptVon($('bf-kategorie').value)));
$('bf-groesse').addEventListener('change', () => {
  const wasFull = $('bf-fuellstand').selectedIndex <= 0;
  refreshFuellstand(wasFull ? NaN : parseFloat($('bf-fuellstand').value));
});

// ---------- Etiketten-Fotos & KI-Auslesen ----------
function setupPhotoPreview(inputId, previewId) {
  $(inputId).addEventListener('change', e => {
    const file = e.target.files[0];
    const img = $(previewId);
    if (!file) { img.classList.add('hidden'); return; }
    img.src = URL.createObjectURL(file);
    img.classList.remove('hidden');
  });
}
setupPhotoPreview('foto-vorne', 'preview-vorne');
setupPhotoPreview('foto-hinten', 'preview-hinten');

// Große Handy-/iPad-Fotos verkleinern und als JPEG liefern
function resizeToBlob(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Bild konnte nicht verarbeitet werden')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden')); };
    img.src = url;
  });
}
const blobToBase64 = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

function applyScan(r) {
  const el = $('form-bottle').elements;
  if (r.kategorie && ALLE_KATEGORIEN.includes(r.kategorie)) {
    $('bf-kategorie').value = r.kategorie;
    setFormHaupt(hauptVon(r.kategorie));
  }
  const fill = (name, v) => { if (v != null && v !== '' && !el[name].value) el[name].value = v; };
  fill('name', r.name); fill('produzent', r.produzent); fill('jahrgang', r.jahrgang); fill('alter_jahre', r.alter_jahre);
  fill('rebsorte', Array.isArray(r.rebsorten) ? r.rebsorten.join(', ') : r.rebsorten);
  fill('land', r.land); fill('region', r.region); fill('appellation', r.appellation); fill('fassart', r.fassart);
  fill('alkoholgehalt', r.alkoholgehalt); fill('trink_ab', r.trink_ab); fill('trink_bis', r.trink_bis);
  fill('lagerpotenzial', r.lagerpotenzial);
  const vol = num(r.flaschengroesse_l);
  if (vol && vol > 0 && vol <= 6) {
    const wasFull = $('bf-fuellstand').selectedIndex <= 0;
    ensureOption(el.flaschengroesse_l, vol, fmtL(vol));
    el.flaschengroesse_l.value = String(vol);
    refreshFuellstand(wasFull ? NaN : parseFloat($('bf-fuellstand').value));
  }
  // Preisschätzung nur als Hinweis, nicht als Wert (sonst verfälscht sie die Statistik)
  if (r.geschaetzter_preis && !el.kaufpreis.value) el.kaufpreis.placeholder = `ca. ${r.geschaetzter_preis} € (geschätzt)`;
}

$('btn-ki-scan').addEventListener('click', async () => {
  const files = [$('foto-vorne').files[0], $('foto-hinten').files[0]].filter(Boolean);
  if (!files.length) { alert('Bitte zuerst mindestens ein Etikettenfoto aufnehmen oder auswählen.'); return; }
  const status = $('ki-status'), btn = $('btn-ki-scan');
  status.textContent = '⏳ Etikett wird ausgelesen…';
  btn.disabled = true;
  try {
    const images = [];
    for (const f of files) images.push({ media_type: 'image/jpeg', data: await blobToBase64(await resizeToBlob(f, 1200, 0.8)) });
    const res = await fetch('/api/recognize-label', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ images })
    });
    const r = await res.json().catch(() => ({ error: 'Serverfehler (' + res.status + ')' }));
    if (!res.ok || r.error) throw new Error(r.error || 'Fehler ' + res.status);
    applyScan(r);
    status.textContent = '✓ Ausgelesen – bitte kurz prüfen.';
  } catch (err) {
    console.error(err);
    status.textContent = '⚠️ ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

// Nur Dateien löschen, auf die keine Flasche mehr verweist
async function removeUnreferenced(paths) {
  const gone = [];
  for (const p of [...new Set(paths.filter(Boolean))]) {
    const { data } = await supabaseClient.from('bottle_photos').select('id').eq('storage_path', p);
    if (!data || !data.length) gone.push(p);
  }
  if (gone.length) await supabaseClient.storage.from(BUCKET).remove(gone);
}

async function savePhotos(ids, editing) {
  for (const [inputId, typ] of [['foto-vorne', 'etikett'], ['foto-hinten', 'rueckseite']]) {
    const file = $(inputId).files[0];
    if (!file) continue;
    const blob = await resizeToBlob(file);
    const path = `${ids[0]}/${typ}-${Date.now()}.jpg`;
    const { error: upErr } = await supabaseClient.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
    if (upErr) throw upErr;
    let oldPaths = [];
    if (editing) {
      oldPaths = (bottleById(ids[0])?.bottle_photos || []).filter(p => p.typ === typ).map(p => p.storage_path);
      await supabaseClient.from('bottle_photos').delete().eq('bottle_id', ids[0]).eq('typ', typ);
    }
    const { error: dbErr } = await supabaseClient.from('bottle_photos').insert(ids.map(id => ({ bottle_id: id, storage_path: path, typ })));
    if (dbErr) throw dbErr;
    await removeUnreferenced(oldPaths);
  }
}

function openBottleForm(b) {
  const form = $('form-bottle');
  form.reset();
  ['preview-vorne', 'preview-hinten'].forEach(id => $(id).classList.add('hidden'));
  $('ki-status').textContent = '';
  form.elements.kaufpreis.placeholder = '';
  $('photo-edit-hint').classList.toggle('hidden', !b || !(b.bottle_photos || []).length);
  editingBottleId = b ? b.id : null;
  $('bottle-modal-title').textContent = b ? 'Bearbeiten' : 'Neu einlagern';
  $('fld-anzahl-neu').classList.toggle('hidden', !!b);
  $('bf-ort').innerHTML = locationOptionsHtml(b?.location_id, 'Kein Lagerort');
  const kat = b?.kategorie || 'Whisky';
  $('bf-kategorie').innerHTML = kategorieOptionsHtml(kat);
  setFormHaupt(hauptVon(kat));
  if (b) {
    const el = form.elements;
    el.name.value = b.name || '';
    el.produzent.value = b.produzent || '';
    el.jahrgang.value = b.jahrgang ?? '';
    el.alter_jahre.value = b.alter_jahre ?? '';
    el.fassart.value = b.fassart || '';
    el.rebsorte.value = (b.rebsorten || []).join(', ');
    el.land.value = b.land || '';
    el.region.value = b.region || '';
    el.appellation.value = b.appellation || '';
    el.alkoholgehalt.value = b.alkoholgehalt ?? '';
    ensureOption(el.flaschengroesse_l, Number(b.flaschengroesse_l), fmtL(b.flaschengroesse_l));
    el.flaschengroesse_l.value = Number(b.flaschengroesse_l);
    if (isSpirit(b)) refreshFuellstand(Number(b.fuellstand_l ?? b.flaschengroesse_l));
    el.anzahl.value = b.anzahl;
    el.kaufdatum.value = b.kaufdatum || '';
    el.kaufpreis.value = b.kaufpreis ?? '';
    el.haendler.value = b.haendler || '';
    el.trink_ab.value = b.trink_ab ?? '';
    el.trink_bis.value = b.trink_bis ?? '';
    el.lagerpotenzial.value = b.lagerpotenzial || '';
    el.notizen.value = b.notizen || '';
  }
  openModal('modal-bottle');
}
$('btn-add-bottle').addEventListener('click', () => openBottleForm(null));
window.editBottle = function (id) {
  const b = bottleById(id);
  if (!b) return;
  closeModal('modal-detail');
  openBottleForm(b);
};

$('form-bottle').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const f = new FormData(e.target);
  const kategorie = f.get('kategorie');
  const haupt = hauptVon(kategorie);
  const wein = haupt === 'Wein';
  btn.disabled = true; btn.textContent = 'Speichert…';

  const payload = {
    hauptkategorie: haupt,
    kategorie,
    name: f.get('name').trim(),
    produzent: f.get('produzent') || null,
    jahrgang: num(f.get('jahrgang')),
    land: f.get('land') || null,
    region: f.get('region') || null,
    alkoholgehalt: num(f.get('alkoholgehalt')),
    flaschengroesse_l: num(f.get('flaschengroesse_l')),
    location_id: f.get('location_id') || null,
    kaufdatum: f.get('kaufdatum') || null,
    kaufpreis: num(f.get('kaufpreis')),
    haendler: f.get('haendler') || null,
    notizen: f.get('notizen') || null,
    rebsorten: wein && f.get('rebsorte') ? f.get('rebsorte').split(',').map(s => s.trim()).filter(Boolean) : null,
    appellation: wein ? (f.get('appellation') || null) : null,
    trink_ab: wein ? num(f.get('trink_ab')) : null,
    trink_bis: wein ? num(f.get('trink_bis')) : null,
    lagerpotenzial: wein ? (f.get('lagerpotenzial') || null) : null,
    alter_jahre: wein ? null : num(f.get('alter_jahre')),
    fassart: wein ? null : (f.get('fassart') || null),
    fuellstand_l: wein ? null : num(f.get('fuellstand_l')),
  };
  payload.anzahl = wein ? Math.max(0, parseInt(f.get('anzahl'), 10) || 0) : (payload.fuellstand_l > 0 ? 1 : 0);

  let error, ids = [];
  const editing = !!editingBottleId;
  if (editing) {
    ({ error } = await supabaseClient.from('bottles').update(payload).eq('id', editingBottleId));
    ids = [editingBottleId];
  } else {
    const n = wein ? 1 : Math.max(1, Math.min(50, parseInt(f.get('anzahl_neu'), 10) || 1));
    if (wein && payload.anzahl < 1) payload.anzahl = 1;
    let inserted;
    ({ data: inserted, error } = await supabaseClient.from('bottles').insert(Array.from({ length: n }, () => ({ ...payload }))).select());
    ids = (inserted || []).map(x => x.id);
  }
  if (!error && ids.length) {
    try { await savePhotos(ids, editing); }
    catch (err) { console.error(err); alert('Gespeichert, aber das Foto konnte nicht hochgeladen werden: ' + (err.message || err)); }
  }
  btn.disabled = false; btn.textContent = 'Speichern';
  if (error) { alert('Fehler beim Speichern: ' + error.message); return; }
  editingBottleId = null;
  closeModal('modal-bottle');
  loadBottles();
});

// ============================================================
// LAGERORTE
// ============================================================
function renderStorage() {
  const container = $('storage-map');
  const stored = allBottles.filter(b => b.anzahl > 0);
  const blocks = allLocations.map(l => ({ id: l.id, name: l.name, items: stored.filter(b => b.location_id === l.id) }));
  const ohne = stored.filter(b => !b.location_id || !allLocations.some(l => l.id === b.location_id));
  if (ohne.length) blocks.push({ id: null, name: 'Ohne Lagerort', items: ohne });
  if (!blocks.length) { container.innerHTML = '<p class="hint">Noch keine Lagerorte angelegt.</p>'; return; }

  container.innerHTML = blocks.map(bl => {
    const total = bl.items.reduce((s, b) => s + b.anzahl, 0);
    return `
    <div class="location-block">
      <div class="location-head">
        <div class="location-title">${esc(bl.name)} <span>(${total})</span></div>
        ${bl.id ? `<div><button class="icon-btn" onclick="renameLocation('${bl.id}')">✎</button> <button class="icon-btn" onclick="deleteLocation('${bl.id}')">🗑</button></div>` : ''}
      </div>
      ${bl.items.length ? bl.items.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(b => `
        <div class="storage-row" onclick="showDetail('${b.id}')">
          <span class="storage-dot" style="background:${color(b)}"></span>
          <span class="nm">${esc(b.name)} <span class="meta">${esc(subline(b))}</span></span>
          <span class="meta">${isSpirit(b) ? fmtL(b.fuellstand_l ?? b.flaschengroesse_l) : b.anzahl + '×'}</span>
        </div>`).join('') : '<div class="empty-note">Noch nichts hier eingelagert.</div>'}
    </div>`;
  }).join('');
}
$('btn-add-location').addEventListener('click', async () => {
  const name = (prompt('Name des neuen Lagerorts:') || '').trim();
  if (!name) return;
  const sort = (allLocations.reduce((m, l) => Math.max(m, l.sort_order || 0), 0)) + 10;
  const { error } = await supabaseClient.from('locations').insert({ name, sort_order: sort });
  if (error) { alert('Fehler: ' + error.message); return; }
  await loadLocations(); renderAll();
});
window.renameLocation = async function (id) {
  const l = allLocations.find(x => x.id === id);
  const name = (prompt('Neuer Name:', l?.name || '') || '').trim();
  if (!name) return;
  const { error } = await supabaseClient.from('locations').update({ name }).eq('id', id);
  if (error) { alert('Fehler: ' + error.message); return; }
  await loadLocations(); renderAll();
};
window.deleteLocation = async function (id) {
  const l = allLocations.find(x => x.id === id);
  const n = allBottles.filter(b => b.location_id === id && b.anzahl > 0).length;
  if (!confirm(`Lagerort „${l?.name}“ löschen?${n ? `\n${n} Eintrag/Einträge verlieren dadurch nur ihren Lagerort und bleiben erhalten.` : ''}`)) return;
  const { error } = await supabaseClient.from('locations').delete().eq('id', id);
  if (error) { alert('Fehler: ' + error.message); return; }
  await loadLocations(); await loadBottles();
};

// ============================================================
// STATISTIKEN
// ============================================================
function showStatDetail(label, bottles) {
  document.querySelector('.stat-detail-panel')?.remove();
  const panel = document.createElement('div');
  panel.className = 'stat-detail-panel';
  panel.innerHTML = `
    <div class="stat-detail-header">
      <span>${esc(label)} <span style="color:var(--muted);font-weight:400">(${bottles.length} Einträge · ${bottles.reduce((s, b) => s + b.anzahl, 0)} Flaschen)</span></span>
      <button onclick="document.querySelector('.stat-detail-panel').remove()">✕</button>
    </div>
    ${[...bottles].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(b => `
      <div class="stat-detail-row" onclick="showDetail('${b.id}')">
        <span class="storage-dot" style="background:${color(b)}"></span>
        <span style="flex:1;font-weight:500">${esc(b.name)}</span>
        <span style="color:var(--muted);font-size:12px">${esc(b.jahrgang || '')}</span>
        <span style="font-weight:600;font-size:12px">${b.kaufpreis != null ? '€' + b.kaufpreis : ''}</span>
      </div>`).join('')}`;
  $('view-stats').appendChild(panel);
}

function renderStats() {
  const stock = allBottles.filter(b => b.anzahl > 0);
  const flaschen = stock.reduce((s, b) => s + b.anzahl, 0);
  const wert = stock.reduce((s, b) => s + b.anzahl * (b.kaufpreis || 0), 0);
  const avg = flaschen ? (wert / flaschen).toFixed(2) : '0.00';
  const vorrat = stock.filter(isSpirit).reduce((s, b) => s + Number(b.fuellstand_l ?? b.flaschengroesse_l ?? 0), 0);

  $('stat-cards').innerHTML = `
    <div class="stat-card"><div class="label">Flaschen</div><div class="value">${flaschen}</div></div>
    <div class="stat-card"><div class="label">Bestandswert</div><div class="value">€ ${wert.toFixed(0)}</div></div>
    <div class="stat-card"><div class="label">Ø Preis/Flasche</div><div class="value">€ ${avg}</div></div>
    <div class="stat-card"><div class="label">Verschiedene</div><div class="value">${stock.length}</div></div>
    <div class="stat-card"><div class="label">Spirituosen-Vorrat</div><div class="value">${round2(vorrat).toString().replace('.', ',')} L</div></div>`;

  function byField(get) {
    const map = {};
    stock.forEach(b => { const k = get(b) || '–'; (map[k] = map[k] || { count: 0, bottles: [] }); map[k].count += b.anzahl; map[k].bottles.push(b); });
    return Object.entries(map).map(([label, v]) => ({ label, ...v })).sort((a, b) => b.count - a.count);
  }
  const groups = [
    { title: 'Nach Kategorie', data: byField(b => b.kategorie), color: k => kategorieFarben[k] || '#7B2D3E' },
    { title: 'Nach Land', data: byField(b => b.land), color: () => '#B7762C' },
    { title: 'Nach Region', data: byField(b => b.region), color: () => '#C9A646' },
  ];
  $('stat-bars').innerHTML = groups.map((g, gi) => {
    const max = Math.max(...g.data.map(x => x.count), 1);
    return `<div><div style="font-size:13px;font-weight:700;margin-bottom:10px">${g.title}</div>
      ${g.data.map((d, i) => `
        <div class="bar-row" data-g="${gi}" data-i="${i}">
          <div class="label-row"><span>${esc(d.label)}</span><span style="font-weight:600">${d.count}</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${(d.count / max) * 100}%;background:${g.color(d.label)}"></div></div>
        </div>`).join('') || '<div class="hint">Keine Daten</div>'}</div>`;
  }).join('');
  $('stat-bars').querySelectorAll('.bar-row').forEach(el => el.addEventListener('click', () => {
    const g = groups[+el.dataset.g], d = g.data[+el.dataset.i];
    showStatDetail(`${g.title}: ${d.label}`, d.bottles);
  }));

  // Preis-Histogramm
  const priced = stock.filter(b => b.kaufpreis > 0);
  const hist = $('stat-histogram');
  if (!priced.length) { hist.innerHTML = ''; return; }
  const buckets = [['< 20 €', 0, 20], ['20–40 €', 20, 40], ['40–60 €', 40, 60], ['60–100 €', 60, 100], ['100–200 €', 100, 200], ['> 200 €', 200, Infinity]]
    .map(([label, min, max]) => {
      const bottles = priced.filter(b => b.kaufpreis >= min && b.kaufpreis < max);
      return { label, bottles, count: bottles.reduce((s, b) => s + b.anzahl, 0) };
    }).filter(b => b.count > 0);
  const maxC = Math.max(...buckets.map(b => b.count), 1);
  hist.innerHTML = `<div style="font-size:13px;font-weight:700;margin-bottom:14px">Preisverteilung (Flaschen)</div>
    <div class="histogram">${buckets.map((bk, i) => `
      <div class="hist-col" data-h="${i}">
        <div class="hist-count">${bk.count}</div>
        <div class="hist-bar-wrap"><div class="hist-bar" style="height:${Math.round((bk.count / maxC) * 120)}px"></div></div>
        <div class="hist-label">${bk.label}</div>
      </div>`).join('')}</div>`;
  hist.querySelectorAll('.hist-col').forEach(el => el.addEventListener('click', () => {
    const bk = buckets[+el.dataset.h];
    showStatDetail(`Preis ${bk.label}`, bk.bottles);
  }));
}

// ============================================================
// VERKOSTUNGSNOTIZEN
// ============================================================
async function loadTastings() {
  const { data, error } = await supabaseClient.from('tastings').select('*').order('verkostungsdatum', { ascending: false });
  if (error) console.error(error);
  allTastings = data || [];
  renderTastings();
}
function renderTastings() {
  $('tastings-list').innerHTML = allTastings.map(t => `
    <div class="bottle-card" style="margin-bottom:10px" onclick="showTastingDetail('${t.id}')">
      <div style="display:flex;justify-content:space-between;gap:10px">
        <div style="min-width:0">
          <div class="bottle-name">${esc(t.name)} <span style="color:var(--muted);font-weight:400">${t.jahrgang ? '· ' + esc(t.jahrgang) : ''}</span></div>
          <div class="bottle-sub">${esc([t.produzent, t.kategorie].filter(Boolean).join(' · '))}</div>
          ${t.anlass ? `<div class="bottle-sub">📌 ${esc(t.anlass)}</div>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div class="bottle-sub">${esc(t.verkostungsdatum)}</div>
          ${stars(t.bewertung)}
        </div>
      </div>
      ${t.notizen ? `<div class="tasting-text">${esc(t.notizen)}</div>` : ''}
    </div>`).join('') || '<p class="hint">Noch keine Verkostungsnotizen.</p>';
}
window.showTastingDetail = function (id) {
  const t = allTastings.find(x => x.id === id);
  if (!t) return;
  const block = (l, v) => v ? `<div class="note-box"><b>${l}:</b> ${esc(v)}</div>` : '';
  $('modal-detail-content').innerHTML = `
    <button class="modal-close" onclick="closeModal('modal-detail')">&times;</button>
    <h2>${esc(t.name)}</h2>
    <div style="color:var(--muted)">${esc([t.produzent, t.jahrgang].filter(Boolean).join(' · '))}</div>
    <div style="margin-top:6px">${stars(t.bewertung)}</div>
    <div class="detail-grid">${detailRows([
      ['Datum', t.verkostungsdatum], ['Anlass', t.anlass], ['Kategorie', t.kategorie],
      ['Land / Region', [t.land, t.region].filter(Boolean).join(' · ')],
      ['Preis', t.kaufpreis != null ? '€ ' + t.kaufpreis : null], ['Händler', t.haendler]])}</div>
    ${block('Nase', t.nase)}${block('Gaumen', t.gaumen)}${block('Abgang', t.abgang)}${block('Notizen', t.notizen)}
    <div class="btn-row">
      <button onclick="editTasting('${t.id}')" class="btn-primary btn-dark" style="flex:1">✏️ Bearbeiten</button>
      <button onclick="deleteTasting('${t.id}');closeModal('modal-detail')" class="btn-primary btn-red" style="flex:1">✕ Löschen</button>
    </div>`;
  openModal('modal-detail');
};
function setStars(n) {
  $('tasting-bewertung-val').value = n || '';
  document.querySelectorAll('#star-picker .star').forEach((s, i) => s.classList.toggle('active', i < (n || 0)));
}
document.querySelectorAll('#star-picker .star').forEach(s => s.addEventListener('click', () => {
  const v = parseInt(s.dataset.val, 10);
  setStars(parseInt($('tasting-bewertung-val').value, 10) === v ? 0 : v);
}));

function openTastingForm(t) {
  const form = $('form-tasting');
  form.reset();
  editingTastingId = t ? t.id : null;
  $('tasting-modal-title').textContent = t ? 'Notiz bearbeiten' : 'Verkostungsnotiz';
  $('tf-kategorie').innerHTML = kategorieOptionsHtml(t?.kategorie || '', 'Kategorie wählen');
  const sel = $('tasting-from-cellar');
  sel.innerHTML = '<option value="">– auswählen –</option>' + allBottles.filter(b => b.anzahl > 0)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map(b => `<option value="${b.id}">${esc(b.name)}${b.jahrgang ? ' · ' + esc(b.jahrgang) : ''}${b.produzent ? ' (' + esc(b.produzent) + ')' : ''}</option>`).join('');
  $('tasting-from-cellar').closest('.box-sand').classList.toggle('hidden', !!t);
  form.elements.verkostungsdatum.value = t?.verkostungsdatum || heute();
  if (t) {
    const el = form.elements;
    ['name', 'produzent', 'land', 'region', 'anlass', 'haendler', 'nase', 'gaumen', 'abgang', 'notizen'].forEach(k => el[k].value = t[k] || '');
    el.jahrgang.value = t.jahrgang ?? '';
    el.kaufpreis.value = t.kaufpreis ?? '';
  }
  setStars(t?.bewertung || 0);
  openModal('modal-tasting');
}
$('btn-add-tasting').addEventListener('click', () => openTastingForm(null));
window.editTasting = function (id) {
  const t = allTastings.find(x => x.id === id);
  if (!t) return;
  closeModal('modal-detail');
  openTastingForm(t);
};
$('tasting-from-cellar').addEventListener('change', function () {
  const b = bottleById(this.value);
  if (!b) return;
  const el = $('form-tasting').elements;
  el.name.value = b.name || '';
  el.produzent.value = b.produzent || '';
  el.kategorie.value = b.kategorie || '';
  el.jahrgang.value = b.jahrgang ?? '';
  el.land.value = b.land || '';
  el.region.value = b.region || '';
  el.kaufpreis.value = b.kaufpreis ?? '';
  el.haendler.value = b.haendler || '';
});
window.deleteTasting = async function (id) {
  if (!confirm('Diese Verkostungsnotiz wirklich löschen?')) return;
  const { error } = await supabaseClient.from('tastings').delete().eq('id', id);
  if (error) { alert('Fehler: ' + error.message); return; }
  loadTastings();
};
$('form-tasting').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const f = new FormData(e.target);
  const payload = {
    bottle_id: $('tasting-from-cellar').value || null,
    name: f.get('name').trim(),
    produzent: f.get('produzent') || null,
    kategorie: f.get('kategorie') || null,
    jahrgang: num(f.get('jahrgang')),
    land: f.get('land') || null,
    region: f.get('region') || null,
    verkostungsdatum: f.get('verkostungsdatum'),
    anlass: f.get('anlass') || null,
    kaufpreis: num(f.get('kaufpreis')),
    haendler: f.get('haendler') || null,
    bewertung: num(f.get('bewertung')),
    nase: f.get('nase') || null,
    gaumen: f.get('gaumen') || null,
    abgang: f.get('abgang') || null,
    notizen: f.get('notizen') || null,
  };
  if (editingTastingId) delete payload.bottle_id; // Verknüpfung beim Bearbeiten nicht überschreiben
  btn.disabled = true; btn.textContent = 'Speichert…';
  const { error } = editingTastingId
    ? await supabaseClient.from('tastings').update(payload).eq('id', editingTastingId)
    : await supabaseClient.from('tastings').insert(payload);
  btn.disabled = false; btn.textContent = 'Notiz speichern';
  if (error) { alert('Fehler: ' + error.message); return; }
  editingTastingId = null;
  closeModal('modal-tasting');
  loadTastings();
});

// ============================================================
// VERKOSTUNG PLANEN
// ============================================================
function selectionChanged() {
  // Die Story gehört zu einer bestimmten Reihenfolge – nach Änderungen gilt sie nicht mehr.
  storyData = null;
  currentFlightId = null;
  renderFlightOrder();
  renderFlightPool();
  renderCellar();
  updateFlightBar();
}
window.addToFlight = function (id) {
  if (flightIds.includes(id)) flightIds = flightIds.filter(x => x !== id);
  else flightIds.push(id);
  selectionChanged();
};
function updateFlightBar() {
  let bar = $('flight-bar');
  if (!flightIds.length) { bar?.remove(); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'flight-bar';
    bar.innerHTML = `<span id="fb-count"></span><span class="names" id="fb-names"></span>
      <button id="fb-go">Planen →</button>
      <button id="fb-clear" style="background:none;opacity:.7;font-size:18px;padding:0 4px">✕</button>`;
    document.body.appendChild(bar);
    $('fb-go').addEventListener('click', () => gotoTab('flight'));
    $('fb-clear').addEventListener('click', () => { flightIds = []; selectionChanged(); });
  }
  $('fb-count').textContent = `🥂 ${flightIds.length}`;
  $('fb-names').textContent = flightIds.map(id => bottleById(id)?.name?.split(' ')[0]).filter(Boolean).join(', ');
}

function renderFlightPool() {
  const pool = $('flight-pool-list');
  const kat = $('flight-filter-kat').value;
  const list = allBottles
    .filter(b => b.anzahl > 0 && !flightIds.includes(b.id))
    .filter(b => !kat || b.kategorie === kat)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  pool.innerHTML = list.map(b => `
    <div class="drag-card" draggable="true" data-id="${b.id}">
      <span class="storage-dot" style="background:${color(b)}"></span>
      <span class="nm">${esc(b.name)} <span style="color:var(--muted);font-size:12px">${esc(subline(b))}</span></span>
      <button data-add="${b.id}" aria-label="Hinzufügen">+</button>
    </div>`).join('') || '<div class="empty-note" style="text-align:center;padding:12px">Nichts (mehr) verfügbar.</div>';
  pool.querySelectorAll('.drag-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ from: 'pool', id: card.dataset.id }));
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
  pool.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => addToFlight(btn.dataset.add)));
}
$('flight-filter-kat').addEventListener('change', renderFlightPool);

function renderFlightOrder() {
  const list = $('flight-order-list');
  const bottles = flightIds.map(bottleById).filter(Boolean);
  list.innerHTML = bottles.map((b, i) => `
    <div class="order-card" draggable="true" data-index="${i}">
      <span class="pos">${i + 1}</span>
      <span class="nm">${esc(b.name)} <span style="color:var(--muted);font-size:12px">${esc(subline(b))}</span></span>
      <button data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">▲</button>
      <button data-down="${i}" ${i === bottles.length - 1 ? 'disabled' : ''} aria-label="Nach unten">▼</button>
      <button data-remove="${i}" aria-label="Entfernen">✕</button>
    </div>`).join('') || '<div class="empty-note" style="text-align:center;padding:18px">Noch nichts ausgewählt – links auf + tippen.</div>';

  const many = bottles.length >= 2;
  $('btn-generate-story').classList.toggle('hidden', !many);
  $('btn-upload-story').classList.toggle('hidden', !many);
  $('btn-clear-flight').classList.toggle('hidden', !bottles.length);

  const move = (from, to) => { const [m] = flightIds.splice(from, 1); flightIds.splice(to, 0, m); selectionChanged(); };
  list.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => move(+b.dataset.up, +b.dataset.up - 1)));
  list.querySelectorAll('[data-down]').forEach(b => b.addEventListener('click', () => move(+b.dataset.down, +b.dataset.down + 1)));
  list.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => { flightIds.splice(+b.dataset.remove, 1); selectionChanged(); }));
  list.querySelectorAll('.order-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ from: 'order', index: +card.dataset.index }));
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
}
const orderListEl = $('flight-order-list');
orderListEl.addEventListener('dragover', e => { e.preventDefault(); orderListEl.classList.add('drag-over'); });
orderListEl.addEventListener('dragleave', () => orderListEl.classList.remove('drag-over'));
orderListEl.addEventListener('drop', e => {
  e.preventDefault();
  orderListEl.classList.remove('drag-over');
  let data;
  try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
  const over = e.target.closest('.order-card');
  const target = over ? +over.dataset.index : flightIds.length;
  if (data.from === 'pool') {
    if (!bottleById(data.id) || flightIds.includes(data.id)) return;
    flightIds.splice(target, 0, data.id);
  } else if (data.from === 'order') {
    const [m] = flightIds.splice(data.index, 1);
    flightIds.splice(data.index < target ? target - 1 : target, 0, m);
  }
  selectionChanged();
});
$('btn-clear-flight').addEventListener('click', () => { flightIds = []; $('flight-title').value = ''; selectionChanged(); });

$('btn-save-flight').addEventListener('click', async () => {
  const bottles = flightIds.map(bottleById).filter(Boolean);
  if (!bottles.length) { alert('Bitte mindestens einen Eintrag auswählen.'); return; }
  const titel = $('flight-title').value.trim() || 'Neue Verkostung';
  const { data: flight, error } = await supabaseClient.from('tasting_flights').insert({ titel, story: storyData || null }).select().single();
  if (error) { alert('Fehler: ' + error.message); return; }
  const items = bottles.map((b, i) => ({ flight_id: flight.id, bottle_id: b.id, position: i + 1 }));
  const { error: itemErr } = await supabaseClient.from('tasting_flight_items').insert(items);
  if (itemErr) { alert('Fehler beim Speichern der Reihenfolge: ' + itemErr.message); return; }
  currentFlightId = flight.id;
  loadSavedFlights();
});

async function loadSavedFlights() {
  const box = $('saved-flights-list');
  const { data: flights } = await supabaseClient.from('tasting_flights').select('*').order('created_at', { ascending: false });
  const { data: items } = await supabaseClient.from('tasting_flight_items').select('*');
  if (!flights || !flights.length) { box.innerHTML = '<p class="hint">Noch keine Verkostungen gespeichert.</p>'; return; }
  box.innerHTML = flights.map(f => {
    const its = (items || []).filter(i => i.flight_id === f.id).sort((a, b) => a.position - b.position);
    return `
    <div class="bottle-card" style="margin-bottom:12px;cursor:default">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div>
          <div class="bottle-name">${esc(f.titel)}</div>
          <div class="bottle-sub">${new Date(f.created_at).toLocaleDateString('de-DE')} · ${its.length} Einträge</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${f.story ? `<button onclick="showSavedStory('${f.id}')" class="btn-primary small btn-green">📖 Story</button>` : ''}
          <button onclick="loadFlightIntoBuilder('${f.id}')" class="btn-primary small btn-dark">▶ Laden</button>
          <button onclick="deleteFlight('${f.id}')" class="btn-primary small btn-light" style="color:var(--red)">✕</button>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
        ${its.map((it, i) => { const b = bottleById(it.bottle_id); return `
          <div style="display:flex;align-items:center;gap:5px;background:var(--sand);border-radius:6px;padding:4px 8px;font-size:12px">
            <span style="color:var(--muted);font-family:'Fraunces',serif">${i + 1}</span>
            <span class="storage-dot" style="background:${b ? color(b) : '#999'};width:6px;height:6px"></span>
            <span>${esc(b?.name || '(gelöscht)')}</span>
          </div>`; }).join('')}
      </div>
    </div>`;
  }).join('');
}
window.loadFlightIntoBuilder = async function (id) {
  const { data: items } = await supabaseClient.from('tasting_flight_items').select('*').eq('flight_id', id);
  const { data: flight } = await supabaseClient.from('tasting_flights').select('*').eq('id', id).single();
  flightIds = (items || []).sort((a, b) => a.position - b.position).map(i => i.bottle_id).filter(bid => bottleById(bid));
  selectionChanged();
  currentFlightId = id;
  storyData = flight?.story || null;
  $('flight-title').value = flight?.titel || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
window.showSavedStory = async function (id) {
  const { data: flight } = await supabaseClient.from('tasting_flights').select('*').eq('id', id).single();
  if (!flight?.story) return;
  openStory(flight.story, flight.titel);
};
window.deleteFlight = async function (id) {
  if (!confirm('Diese Verkostung wirklich löschen?')) return;
  await supabaseClient.from('tasting_flights').delete().eq('id', id);
  if (currentFlightId === id) currentFlightId = null;
  loadSavedFlights();
};

// ---------- Story ----------
function flightBottles() { return flightIds.map(bottleById).filter(Boolean); }

$('btn-generate-story').addEventListener('click', async () => {
  const bottles = flightBottles();
  if (bottles.length < 2) { alert('Bitte mindestens 2 Einträge auswählen.'); return; }
  const btn = $('btn-generate-story');
  btn.textContent = '⏳ Story wird geschrieben…'; btn.disabled = true;
  const titel = $('flight-title').value.trim() || 'Verkostung';
  try {
    const res = await fetch('/api/generate-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        titel,
        wines: bottles.map(b => ({
          name: b.name, produzent: b.produzent, kategorie: b.kategorie, jahrgang: b.jahrgang, alter_jahre: b.alter_jahre,
          land: b.land, region: b.region, fassart: b.fassart, alkoholgehalt: b.alkoholgehalt, rebsorten: b.rebsorten
        }))
      })
    });
    const story = await res.json();
    if (story.error) throw new Error(story.error);
    story.weine = story.weine.map((w, i) => ({ ...w, name: bottles[i].name, sub: subline(bottles[i]) }));
    storyData = story;
    if (currentFlightId) {
      await supabaseClient.from('tasting_flights').update({ story }).eq('id', currentFlightId);
      loadSavedFlights();
    }
    openStory(story, titel);
  } catch (err) {
    alert('Fehler: ' + err.message);
  } finally {
    btn.textContent = '✨ Story generieren'; btn.disabled = false;
  }
});

$('btn-upload-story').addEventListener('click', () => {
  const bottles = flightBottles();
  const ex = storyData?._custom ? storyData : null;
  $('custom-einleitung').value = ex?.einleitung || '';
  $('custom-abschluss').value = ex?.abschluss || '';
  $('custom-wine-fields').innerHTML = bottles.map((b, i) => `
    <label class="fld"><span>${i + 1}. ${esc(b.name)}</span>
      <textarea class="custom-wine-text short" data-index="${i}" placeholder="Erwartung, Tipps, Geschichte …">${esc(ex?.weine?.[i]?.text || '')}</textarea></label>`).join('');
  openModal('modal-upload-story');
});
function buildCustomStory() {
  const bottles = flightBottles();
  return {
    _custom: true,
    einleitung: $('custom-einleitung').value.trim(),
    abschluss: $('custom-abschluss').value.trim(),
    weine: [...document.querySelectorAll('.custom-wine-text')].map((el, i) => ({
      name: bottles[i]?.name || '', sub: bottles[i] ? subline(bottles[i]) : '', text: el.value.trim()
    }))
  };
}
$('btn-save-custom-story').addEventListener('click', async () => {
  const story = buildCustomStory();
  storyData = story;
  closeModal('modal-upload-story');
  if (currentFlightId) {
    const { error } = await supabaseClient.from('tasting_flights').update({ story }).eq('id', currentFlightId);
    if (error) { alert('Fehler: ' + error.message); return; }
    loadSavedFlights();
    alert('Story gespeichert!');
  } else {
    alert('Story vorgemerkt – sie wird mit „Verkostung speichern“ mitgespeichert.');
  }
});
$('btn-preview-custom-story').addEventListener('click', () => {
  const story = buildCustomStory();
  storyData = story;
  closeModal('modal-upload-story');
  openStory(story, $('flight-title').value.trim() || 'Meine Story');
});

function openStory(story, titel) {
  storyData = story;
  storyIndex = 0;
  $('story-title').textContent = titel || 'Verkostung';
  renderStoryPage(story);
  openModal('modal-story');
}
function renderStoryPage(story) {
  story = story || storyData;
  if (!story) return;
  const weine = story.weine || [];
  const total = weine.length + 2;
  const content = $('story-content');
  $('story-prev').style.visibility = storyIndex === 0 ? 'hidden' : 'visible';
  $('story-next').textContent = storyIndex === total - 1 ? 'Fertig ✓' : 'Weiter →';
  content.scrollTop = 0;

  if (storyIndex === 0) {
    $('story-progress').textContent = `Einführung · ${weine.length} Einträge`;
    content.innerHTML = `
      <div class="story-h">Willkommen zur Verkostung</div>
      <div class="story-p">${esc(story.einleitung || '–')}</div>
      <div class="story-box" style="margin-top:20px">
        <div class="story-label">Reihenfolge heute</div>
        ${weine.map((w, i) => `<div style="padding:6px 0"><b style="font-family:'Fraunces',serif;color:var(--amber);margin-right:10px">${i + 1}</b>${esc(w.name)}</div>`).join('')}
      </div>`;
  } else if (storyIndex <= weine.length) {
    const w = weine[storyIndex - 1];
    $('story-progress').textContent = `Nr. ${storyIndex} von ${weine.length}`;
    const sect = (label, text, boxed) => text ? `<div class="${boxed ? 'story-box' : ''}" style="margin-bottom:16px"><div class="story-label">${label}</div><div class="story-p" style="font-size:14px">${esc(text)}</div></div>` : '';
    content.innerHTML = `
      ${w.uebergang ? `<div class="story-box" style="font-style:italic;color:var(--muted);font-size:13px;border-left:3px solid var(--gold)">↩ ${esc(w.uebergang)}</div>` : ''}
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
        <div class="story-num">${storyIndex}</div>
        <div><div class="story-h" style="margin:0;font-size:20px">${esc(w.name)}</div><div class="bottle-sub">${esc(w.sub || '')}</div></div>
      </div>
      ${w.text ? `<div class="story-box story-p" style="font-size:14px;line-height:1.8">${esc(w.text)}</div>` : ''}
      ${sect('Was uns erwartet', w.erwartung)}
      ${sect('Worauf achten', w.verkostungstipps, true)}
      ${w.storytelling ? `<div class="story-p" style="font-size:13px;font-style:italic;color:var(--muted)">${esc(w.storytelling)}</div>` : ''}`;
  } else {
    $('story-progress').textContent = 'Abschluss';
    content.innerHTML = `
      <div class="story-h">🥃 Fazit der Verkostung</div>
      <div class="story-p">${esc(story.abschluss || '–')}</div>
      <div style="margin-top:24px;text-align:center;color:var(--muted);font-size:13px">Prost! 🥂</div>`;
  }
}
$('story-prev').addEventListener('click', () => { if (storyIndex > 0) { storyIndex--; renderStoryPage(); } });
$('story-next').addEventListener('click', () => {
  const total = (storyData?.weine?.length || 0) + 2;
  if (storyIndex < total - 1) { storyIndex++; renderStoryPage(); } else closeModal('modal-story');
});

// ============================================================
// ARCHIV
// ============================================================
async function renderArchiv() {
  const { data: logs, error } = await supabaseClient.from('consumption_log').select('*').order('consumed_at', { ascending: false });
  if (error) console.error(error);
  const archived = allBottles.filter(b => b.anzahl <= 0);
  const box = $('archiv-list');

  const logHtml = (logs || []).length ? `
    <div class="cellar-group">
      <div class="cellar-group-header" style="cursor:default"><span class="cellar-group-title">Verbrauchsprotokoll</span></div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
        ${logs.map(l => {
          const b = bottleById(l.bottle_id);
          const menge = l.menge_l != null ? `${fmtL(l.menge_l)} entnommen` : `${l.anzahl}× getrunken`;
          return `
          <div class="bottle-card" ${b ? `onclick="showDetail('${b.id}')"` : 'style="cursor:default"'}>
            <div style="display:flex;justify-content:space-between;gap:10px">
              <div style="min-width:0">
                <div style="font-weight:600">${esc(b?.name || '(gelöscht)')} <span style="color:var(--muted);font-weight:400">${b ? '· ' + esc(subline(b)) : ''}</span></div>
                ${l.anlass ? `<div class="bottle-sub">📌 ${esc(l.anlass)}</div>` : ''}
              </div>
              <div style="text-align:right;flex-shrink:0"><div style="font-size:13px;font-weight:600">${menge}</div><div class="bottle-sub">${esc(l.consumed_at)}</div></div>
            </div>
          </div>`; }).join('')}
      </div>
    </div>` : '';

  const doneHtml = archived.length ? `
    <div class="cellar-group" style="margin-top:20px">
      <div class="cellar-group-header" style="cursor:default"><span class="cellar-group-title">Komplett verbraucht<span class="cellar-group-count">${archived.length} Einträge</span></span></div>
      <div class="bottle-grid">
        ${archived.map(b => `
          <div class="bottle-card" style="opacity:.8" onclick="showDetail('${b.id}')">
            <div class="bottle-name">${esc(b.name)}${sizeBadge(b)}</div>
            <div class="bottle-sub">${esc(subline(b))}</div>
            <div>${pill(b.kategorie, color(b))}${pill('Verbraucht', '#8A7B5E')}</div>
          </div>`).join('')}
      </div>
    </div>` : '';

  box.innerHTML = (logHtml + doneHtml) || '<p class="hint">Noch nichts verbraucht.</p>';
}

// ============================================================
// START
// ============================================================
(async function init() {
  initSelects();
  const { data } = await supabaseClient.auth.getSession();
  if (data?.session) startApp(); else showLogin();
})();
