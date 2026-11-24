const labels = {
  'control-tower': 'Control Tower',
  strutture: 'Strutture e titoli',
  autorizzazione: 'Autorizzazione',
  accreditamento: 'Accreditamento',
  visite: 'Visite e valutatori'
};
const colors = ['#17669f','#20a2a9','#e9a348','#cd6870','#8177ba','#80b46d'];
const state = { view: 'control-tower', mode: 'preview', ulss: '', type: '', search: '', bootstrap: null, data: null, displayedRows: [], embedContext: null, embedExperience: null, renderId: 0 };
const main = document.getElementById('main');
const dialog = document.getElementById('detailDialog');

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const formatNumber = value => typeof value === 'number' ? new Intl.NumberFormat('it-IT').format(value) : escapeHtml(value);

async function getJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Richiesta non riuscita');
  return result;
}

function option(value, selected, label = value) { return `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`; }

function chartBars(chart) {
  const values = chart.values.slice(0, 7);
  const max = Math.max(1, ...values.map(item => item[1]));
  if (!values.length) return '<div class="empty">Nessun dato nel perimetro selezionato</div>';
  return `<div class="bar-list">${values.map(([name, value]) => `<div class="bar-row"><span class="bar-label" title="${escapeHtml(name)}">${escapeHtml(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, value/max*100)}%"></div></div><span class="bar-value">${formatNumber(value)}</span></div>`).join('')}</div>`;
}

function chartDonut(chart) {
  let values = chart.values.slice(0, 5);
  const other = chart.values.slice(5).reduce((sum, item) => sum + item[1], 0);
  if (other) values = [...values, ['Altri', other]];
  const total = values.reduce((sum, item) => sum + item[1], 0);
  if (!total) return '<div class="empty">Nessun dato nel perimetro selezionato</div>';
  let offset = 0;
  const arcs = values.map(([name, value], i) => {
    const length = value / total * 100;
    const part = `<circle cx="88" cy="88" r="60" fill="none" stroke="${colors[i]}" stroke-width="25" stroke-dasharray="${length} ${100-length}" stroke-dashoffset="${-offset}" pathLength="100" transform="rotate(-90 88 88)"><title>${escapeHtml(name)}: ${value}</title></circle>`;
    offset += length;
    return part;
  }).join('');
  return `<div class="donut-layout"><svg class="donut-graphic" viewBox="0 0 176 176" role="img" aria-label="${escapeHtml(chart.title)}">${arcs}<circle cx="88" cy="88" r="43" fill="#fff"/><text x="88" y="83" text-anchor="middle" font-size="25" font-weight="800" fill="#163b56">${formatNumber(total)}</text><text x="88" y="103" text-anchor="middle" font-size="11" fill="#8295a3">totale</text></svg><div class="donut-legend">${values.map(([name, value], i) => `<div class="legend-item"><span class="legend-swatch" style="background:${colors[i]}"></span><span>${escapeHtml(name)}</span><b>${formatNumber(value)}</b></div>`).join('')}</div></div>`;
}

function chartPanel(chart, className = '') {
  return `<article class="panel ${className}"><div class="panel-head"><div><h2>${escapeHtml(chart.title)}</h2><div class="panel-sub">Conteggio sui dati sintetici filtrati</div></div></div><div class="chart">${chart.type === 'donut' ? chartDonut(chart) : chartBars(chart)}</div></article>`;
}

function statusClass(value) {
  return /fuori|scadut|grave|annull|blocc/i.test(value) ? 'danger' : /attesa|sosp|rischio|integraz|pianificat/i.test(value) ? 'alert' : '';
}

function tableRows() {
  const data = state.data;
  const term = state.search.trim().toLocaleLowerCase('it');
  const rows = term ? data.rows.filter(row => data.columns.some(([key]) => String(row[key] || '').toLocaleLowerCase('it').includes(term))) : data.rows;
  state.displayedRows = rows;
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = rows.slice(0, 100).map((row, index) => `<tr data-index="${index}" tabindex="0" aria-label="Apri dettaglio ${escapeHtml(row[data.columns[0][0]])}">${data.columns.map(([key]) => `<td>${/(stato|esito|fase)/i.test(key) ? `<span class="status ${statusClass(row[key])}">${escapeHtml(row[key] || '—')}</span>` : escapeHtml(row[key] || '—')}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${data.columns.length}" class="empty">Nessun risultato</td></tr>`;
  document.getElementById('tableCount').textContent = `${rows.length} elementi · ${Math.min(rows.length, 100)} visualizzati`;
  tbody.querySelectorAll('tr[data-index]').forEach(tr => {
    tr.addEventListener('click', () => showDetail(rows[Number(tr.dataset.index)]));
    tr.addEventListener('keydown', event => { if (event.key === 'Enter') showDetail(rows[Number(tr.dataset.index)]); });
  });
}

async function showDetail(row) {
  const keys = { 'control-tower':'procedimento_id', strutture:'struttura_id', autorizzazione:'procedimento_id', accreditamento:'richiesta_id', visite:'visita_id' };
  const id = row[keys[state.view]];
  document.getElementById('detailContent').innerHTML = '<div class="loading">Caricamento del dettaglio…</div>';
  dialog.showModal();
  try {
  const detail = await getJson(`/api/detail/${state.view}/${encodeURIComponent(id)}`);
  const fields = Object.entries(detail.record).filter(([, value]) => value !== '' && value != null);
  const pretty = key => key.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
  document.getElementById('detailContent').innerHTML = `<div class="eyebrow">Drill-down del record</div><h2>${escapeHtml(row[state.data.columns[0][0]])}</h2><p class="panel-sub">Vista ${escapeHtml(labels[state.view])} · dati sintetici</p><div class="detail-grid">${fields.map(([key, value]) => `<div class="detail-field"><label>${escapeHtml(pretty(key))}</label><span>${escapeHtml(value)}</span></div>`).join('')}</div>${detail.sections.map(section => `<section class="detail-section"><h3>${escapeHtml(section.title)} <span>${section.rows.length}</span></h3>${section.rows.length ? `<div class="detail-table-wrap"><table class="table"><thead><tr>${section.columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${section.rows.map(item => `<tr>${section.columns.map(([key]) => `<td>${escapeHtml(item[key] || '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="panel-sub">Nessun elemento collegato</p>'}</section>`).join('')}`;
  } catch (error) { document.getElementById('detailContent').innerHTML = `<div class="error-message">${escapeHtml(error.message)}</div>`; }
}

function downloadCsv() {
  const { columns } = state.data;
  const cell = value => `"${String(value ?? '').replaceAll('"','""')}"`;
  const csv = [columns.map(([, label]) => cell(label)).join(','), ...state.displayedRows.map(row => columns.map(([key]) => cell(row[key])).join(','))].join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `demo-bi-${state.view}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function pageHeader(data) {
  const configured = state.bootstrap.quicksight.dashboards.includes(state.view);
  return `<div id="pageHeader"><div class="eyebrow">Governance degli accreditamenti / ${escapeHtml(labels[state.view])}</div><div class="page-head"><div><h1>${escapeHtml(data.title)}</h1><p>${escapeHtml(data.subtitle)}</p></div><div class="head-actions"><div class="mode-switch" role="group" aria-label="Modalità di visualizzazione"><button id="previewMode" class="${state.mode === 'preview' ? 'selected' : ''}" aria-pressed="${state.mode === 'preview'}">Dati demo</button><button id="quickMode" class="${state.mode === 'quicksight' ? 'selected' : ''}" aria-pressed="${state.mode === 'quicksight'}">QuickSight${configured ? '' : ' · da collegare'}</button></div></div></div></div>`;
}

function previewPage(data) {
  const ulss = state.bootstrap.filters.ulss;
  const types = state.bootstrap.filters.types;
  return `${pageHeader(data)}<div class="toolbar"><div class="field"><label for="ulss">Territorio ULSS</label><select id="ulss">${option('', state.ulss, 'Tutte le ULSS')}${ulss.map(item => option(item, state.ulss)).join('')}</select></div>${state.view === 'control-tower' ? `<div class="field"><label for="type">Tipologia procedimento</label><select id="type">${option('', state.type, 'Tutte le tipologie')}${types.map(item => option(item, state.type)).join('')}</select></div>` : ''}<span class="data-line">Aggiornamento dataset: ${escapeHtml(data.updatedAt)} · dati sintetici</span></div><section class="kpis" aria-label="Indicatori principali">${data.kpis.map(([label, value, note, tone]) => `<article class="kpi-card ${tone}"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value">${formatNumber(value)}</div><div class="kpi-note">${escapeHtml(note)}</div></article>`).join('')}</section><section class="chart-grid" aria-label="Analisi grafiche">${chartPanel(data.charts[0])}${chartPanel(data.charts[1])}</section>${chartPanel(data.charts[2], 'third-chart')}<section class="panel table-panel"><div class="panel-head"><div><h2>Dettaglio operativo</h2><div class="panel-sub">Seleziona una riga per esplorare il record</div></div><div class="head-actions"><div class="field"><label for="tableSearch">Cerca nella tabella</label><input id="tableSearch" type="search" placeholder="Pratica, struttura, stato…" value="${escapeHtml(state.search)}"></div><button class="outline-button" id="exportButton">Esporta CSV</button></div></div><div class="table-wrap"><table class="table"><thead><tr>${data.columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody id="tableBody"></tbody></table></div><div class="table-foot" id="tableCount"></div></section><div class="footnote">I valori sono calcolati dal backend sui CSV sintetici; le definizioni finali dei KPI e gli SLA vanno validati con il cliente.</div>`;
}

function quicksightPage(data) {
  const configured = state.bootstrap.quicksight.dashboards.includes(state.view);
  return `${pageHeader(data)}<section class="panel quicksight-panel" id="quickPanel"><div class="quicksight-intro"><div class="qs-icon">◫</div><h2>${configured ? 'Apertura della dashboard QuickSight' : 'Dashboard QuickSight da collegare'}</h2><p>${configured ? 'Apro la dashboard privata con i dati sintetici e seleziono la sezione richiesta.' : 'La dashboard QuickSight non è configurata in questo ambiente.'}</p>${configured ? '<div class="loading">Collegamento in corso…</div>' : '<button class="primary-button" id="backToPreview">Esplora i dati demo</button>'}</div></section>`;
}

function bindModeButtons() {
  document.getElementById('previewMode').onclick = () => { state.mode = 'preview'; state.embedExperience = null; render(); };
  document.getElementById('quickMode').onclick = () => { state.mode = 'quicksight'; render(); };
}

async function render() {
  const renderId = ++state.renderId;
  const { view, ulss, type } = state;
  const reuseEmbed = state.mode === 'quicksight' && state.embedExperience && document.getElementById('embedContainer');
  if (!reuseEmbed) main.innerHTML = '<div class="loading">Caricamento del cruscotto…</div>';
  try {
    const params = new URLSearchParams();
    if (ulss) params.set('ulss', ulss);
    if (view === 'control-tower' && type) params.set('type', type);
    const data = await getJson(`/api/views/${view}?${params}`);
    if (renderId !== state.renderId) return;
    state.data = data;
    if (reuseEmbed) {
      document.getElementById('pageHeader').outerHTML = pageHeader(state.data);
      document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
      bindModeButtons();
      await state.embedExperience.setSelectedSheetId(state.bootstrap.quicksight.sheets[view]);
      return;
    }
    main.innerHTML = state.mode === 'preview' ? previewPage(state.data) : quicksightPage(state.data);
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    bindModeButtons();
    if (state.mode === 'preview') {
      document.getElementById('ulss').onchange = event => { state.ulss = event.target.value; state.search = ''; render(); };
      if (view === 'control-tower') document.getElementById('type').onchange = event => { state.type = event.target.value; state.search = ''; render(); };
      document.getElementById('tableSearch').oninput = event => { state.search = event.target.value; tableRows(); };
      document.getElementById('exportButton').onclick = downloadCsv;
      tableRows();
    } else if (state.bootstrap.quicksight.dashboards.includes(view)) {
      try {
        const result = await getJson(`/api/embed/${view}`);
        if (renderId !== state.renderId) return;
        if (!window.QuickSightEmbedding?.createEmbeddingContext) throw new Error('Client QuickSight non disponibile.');
        document.getElementById('quickPanel').innerHTML = '<div id="embedContainer" class="embed-container" aria-label="Dashboard QuickSight"></div><div id="embedMessage" class="embed-message" role="status"></div>';
        state.embedContext ||= await window.QuickSightEmbedding.createEmbeddingContext();
        state.embedExperience = await state.embedContext.embedDashboard(
          { url: result.url, container: '#embedContainer', width: '100%', height: '1050px', withIframePlaceholder: true },
          { locale: 'it-IT', sheetOptions: { initialSheetId: state.bootstrap.quicksight.sheets[view], singleSheet: true }, toolbarOptions: { export: true, reset: true, undoRedo: true }, onMessage: event => {
            const message = document.getElementById('embedMessage');
            if (message && event.eventName === 'ERROR_OCCURRED') message.textContent = `QuickSight: ${event.message?.errorCode || 'errore di caricamento'}. Ricarica la pagina per ottenere una nuova sessione.`;
          } }
        );
      } catch (error) {
        state.embedExperience = null;
        document.getElementById('quickPanel').innerHTML = `<div class="error-message">${escapeHtml(error.message)}<br>Verifica accesso AWS, permessi di embedding e dominio localhost.</div>`;
      }
    } else document.getElementById('backToPreview').onclick = () => { state.mode = 'preview'; render(); };
  } catch (error) { main.innerHTML = `<div class="error-message">Impossibile caricare il cruscotto: ${escapeHtml(error.message)}</div>`; }
}

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.view; state.search = ''; state.type = ''; document.getElementById('sidebar').classList.remove('open'); render(); window.scrollTo(0, 0); }));
document.getElementById('menuButton').onclick = () => document.getElementById('sidebar').classList.toggle('open');
document.getElementById('closeDialog').onclick = () => dialog.close();
state.bootstrap = await getJson('/api/bootstrap');
render();
