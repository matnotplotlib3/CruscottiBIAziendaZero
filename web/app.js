const labels = {
  'control-tower': 'Control Tower',
  strutture: 'Strutture e titoli',
  autorizzazione: 'Autorizzazione',
  accreditamento: 'Accreditamento',
  visite: 'Visite e valutatori',
  workspace: 'La mia scrivania'
};
const colors = ['#17669f','#20a2a9','#e9a348','#cd6870','#8177ba','#80b46d'];
const state = { view: 'control-tower', mode: 'preview', ulss: '', type: '', search: '', assignee: '', workspaceStatus: 'open', bootstrap: null, data: null, displayedRows: [], embedContext: null, embedExperience: null, renderId: 0 };
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

function metricCards(data) {
  return `<section class="kpis kpis--${state.view}" aria-label="Indicatori principali">${data.kpis.map(([label, value, note, tone]) => `<article class="kpi-card ${tone}"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value">${formatNumber(value)}</div><div class="kpi-note">${escapeHtml(note)}</div></article>`).join('')}</section>`;
}

function panel(title, subtitle, content, className = '') {
  return `<article class="panel feature-panel ${className}"><div class="panel-head"><div><h2>${escapeHtml(title)}</h2><div class="panel-sub">${escapeHtml(subtitle)}</div></div></div>${content}</article>`;
}

function queue(items, formatter = item => item.value) {
  return `<div class="priority-list">${items.length ? items.map((item, index) => `<button class="priority-item" data-focus-id="${escapeHtml(item.id)}"><span class="priority-rank">${index + 1}</span><span class="priority-main"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.category)}</small></span><span class="priority-end"><strong>${escapeHtml(formatter(item))}</strong><small>${escapeHtml(item.detail)}</small></span></button>`).join('') : '<div class="empty">Nessun elemento nel perimetro selezionato</div>'}</div>`;
}

function domainSections(data) {
  const focus = data.focus;
  if (state.view === 'control-tower') return `<section class="domain-grid domain-grid--control" aria-label="Rischio e carichi">${panel('Priorità da presidiare', 'Pratiche aperte ordinate per scadenza SLA', queue(focus.urgent, item => `${item.value} gg`), 'feature-panel--lead')}${chartPanel(data.charts[1])}${chartPanel(data.charts[0])}${chartPanel(data.charts[2])}</section>`;
  if (state.view === 'strutture') {
    const max = Math.max(1, ...focus.territories.map(item => item.structures));
    const territory = `<div class="territory-list">${focus.territories.map(item => `<div class="territory-row"><span>${escapeHtml(item.label)}</span><div class="territory-track"><span style="width:${item.structures / max * 100}%"></span></div><strong>${formatNumber(item.structures)}</strong><small>${item.expiring} titoli in scadenza</small></div>`).join('')}</div>`;
    const horizon = `<div class="horizon">${focus.horizon.map(([label, value]) => `<div class="horizon-cell"><strong>${formatNumber(value)}</strong><span>${escapeHtml(label)}</span></div>`).join('')}</div>`;
    return `<section class="domain-grid domain-grid--strutture" aria-label="Territorio e scadenze">${panel('Copertura territoriale', 'Strutture per ULSS e titoli da rinnovare', territory, 'feature-panel--lead')}${panel('Orizzonte dei titoli', 'Scadenze rispetto al 22 novembre 2026', horizon, 'feature-panel--horizon')}${chartPanel({ ...data.charts[1], type: 'bar' })}</section>`;
  }
  if (state.view === 'autorizzazione') {
    const phases = `<div class="phase-flow">${focus.phases.map(([label, value]) => `<div class="phase-step"><strong>${formatNumber(value)}</strong><span>${escapeHtml(label)}</span></div>`).join('')}</div>`;
    return `<section class="domain-grid domain-grid--autorizzazione" aria-label="Avanzamento istruttorie">${panel('Dove sono le pratiche', 'Distribuzione per fase corrente', phases, 'feature-panel--lead')}${panel('Durata media per fase', 'Giorni dalle fasi storiche collegate', chartBars({ values: focus.phaseDurations }), 'feature-panel--duration')}${panel('Scadenze più vicine', 'Pratiche aperte da esaminare', queue(focus.queue, item => `${item.value} gg`))}</section>`;
  }
  if (state.view === 'accreditamento') {
    const max = Math.max(1, ...focus.entities.map(item => item.received + item.pending));
    const entities = `<div class="opinion-matrix"><div class="matrix-key"><span>Ricevuti</span><span>Pendenti</span></div>${focus.entities.map(item => `<div class="opinion-row"><strong>${escapeHtml(item.label)}</strong><div class="opinion-track" style="--matrix-width:${(item.received + item.pending) / max * 100}%"><span style="flex:${item.received};background:#1e9699"></span><span style="flex:${item.pending};background:#d58b38"></span></div><small>${item.pending} pendenti</small></div>`).join('')}</div>`;
    return `<section class="domain-grid domain-grid--accreditamento" aria-label="Pareri e rinnovi">${panel('Pareri per ente', 'Ricevuti e ancora in attesa', entities, 'feature-panel--lead')}${panel('Rinnovi in agenda', 'Richieste ordinate per scadenza', queue(focus.renewals))}${chartPanel(data.charts[0])}</section>`;
  }
  const schedule = `<div class="schedule-list">${focus.schedule.length ? focus.schedule.map(item => `<button class="schedule-item" data-focus-id="${escapeHtml(item.id)}"><time datetime="${escapeHtml(item.date)}">${escapeHtml(new Date(`${item.date}T00:00:00`).toLocaleDateString('it-IT', { day:'2-digit', month:'short' }))}</time><span><strong>${escapeHtml(item.structure)}</strong><small>${escapeHtml(item.label)} · ${escapeHtml(item.status)}</small></span></button>`).join('') : '<div class="empty">Nessuna visita futura nel perimetro selezionato</div>'}</div>`;
  const capacity = `<div class="capacity-list">${focus.capacity.map(item => `<div class="capacity-row"><span>${escapeHtml(item.label)}</span><div class="capacity-track"><span style="width:${Math.min(100, item.saturation)}%"></span></div><strong>${item.saturation}%</strong></div>`).join('')}</div>`;
  return `<section class="domain-grid domain-grid--visite" aria-label="Agenda e valutatori">${panel('Agenda visite', 'Date pianificate dopo il 22 novembre 2026', schedule, 'feature-panel--lead')}${panel('Impegno valutatori', 'Saturazione della capacità dichiarata', capacity)}${panel('Non conformità aperte', 'Rilievi per gravità', chartBars({ values: focus.severity }))}</section>`;
}

function previewPage(data) {
  const ulss = state.bootstrap.filters.ulss;
  const types = state.bootstrap.filters.types;
  const toolbar = `<div class="toolbar"><div class="field"><label for="ulss">Territorio ULSS</label><select id="ulss">${option('', state.ulss, 'Tutte le ULSS')}${ulss.map(item => option(item, state.ulss)).join('')}</select></div>${state.view === 'control-tower' ? `<div class="field"><label for="type">Tipologia procedimento</label><select id="type">${option('', state.type, 'Tutte le tipologie')}${types.map(item => option(item, state.type)).join('')}</select></div>` : ''}<span class="data-line">Aggiornamento dataset: ${escapeHtml(data.updatedAt)} · dati sintetici</span></div>`;
  const tableTitle = { 'control-tower':'Registro procedimenti', strutture:'Anagrafica strutture', autorizzazione:'Pratiche di autorizzazione', accreditamento:'Domande e rinnovi', visite:'Piano visite' }[state.view];
  const table = `<section class="panel table-panel"><div class="panel-head"><div><h2>${tableTitle}</h2><div class="panel-sub">Seleziona una riga per esplorare i collegamenti</div></div><div class="head-actions"><div class="field"><label for="tableSearch">Cerca nella tabella</label><input id="tableSearch" type="search" placeholder="Cerca nei risultati…" value="${escapeHtml(state.search)}"></div><button class="outline-button" id="exportButton">Esporta CSV</button></div></div><div class="table-wrap"><table class="table"><thead><tr>${data.columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody id="tableBody"></tbody></table></div><div class="table-foot" id="tableCount"></div></section>`;
  return `${pageHeader(data)}${toolbar}${metricCards(data)}${domainSections(data)}${table}<div class="footnote">I valori sono calcolati dal backend sui CSV sintetici; le definizioni finali dei KPI e gli SLA vanno validati con il cliente.</div>`;
}

function workspacePage(data) {
  const rows = state.workspaceStatus === 'open' ? data.actions.filter(item => !item.completed) : data.actions;
  const summary = [
    ['Da fare', data.summary.open, 'Attività assegnate'],
    ['Scadute', data.summary.overdue, 'Richiedono attenzione'],
    ['Entro 7 giorni', data.summary.due7, 'Scadenze imminenti'],
    ['Completate', data.summary.completed, 'Nel campione demo']
  ];
  const cards = rows.map(item => `<article class="task-card ${item.urgency === 'Scaduta' ? 'task-card--overdue' : ''}"><div class="task-top"><span class="task-kind">${escapeHtml(item.action)}</span><span class="task-urgency">${escapeHtml(item.urgency)}</span></div><h2>${escapeHtml(item.procedureNumber)}</h2><p>${escapeHtml(item.structure)} · ${escapeHtml(item.ulss)}</p><div class="task-bottom"><span>Scadenza <strong>${escapeHtml(item.dueDate ? new Date(`${item.dueDate}T00:00:00`).toLocaleDateString('it-IT') : 'da definire')}</strong></span><span>Priorità <strong>${escapeHtml(item.priority)}</strong></span><button class="outline-button" data-procedure-id="${escapeHtml(item.procedureId)}">Apri pratica</button></div></article>`).join('');
  return `<div class="workspace-page"><div class="eyebrow">Operatività / area personale</div><div class="page-head"><div><h1>La mia scrivania</h1><p>Attività, scadenze e pratiche assegnate nel campione sintetico</p></div><div class="workspace-profile field"><label for="assignee">Profilo dimostrativo</label><select id="assignee">${data.profiles.map(name => option(name, data.assignee)).join('')}</select></div></div><div class="workspace-notice">Simulazione riferita a <strong>${escapeHtml(data.assignee)}</strong> al ${escapeHtml(new Date(`${data.asOf}T00:00:00`).toLocaleDateString('it-IT'))}. Il profilo è selezionabile per la demo; l'accesso per utente e ruolo richiede autenticazione e autorizzazioni backend.</div><section class="workspace-summary" aria-label="Riepilogo attività">${summary.map(([label, value, note]) => `<div><span>${escapeHtml(label)}</span><strong>${formatNumber(value)}</strong><small>${escapeHtml(note)}</small></div>`).join('')}</section><div class="workspace-content"><section class="workspace-tasks"><div class="workspace-section-head"><div><h2>Le attività assegnate</h2><p>Una riga per azione operativa, ordinata per scadenza</p></div><div class="segmented" role="group" aria-label="Stato attività"><button data-workspace-status="open" class="${state.workspaceStatus === 'open' ? 'selected' : ''}" aria-pressed="${state.workspaceStatus === 'open'}">Da fare</button><button data-workspace-status="all" class="${state.workspaceStatus === 'all' ? 'selected' : ''}" aria-pressed="${state.workspaceStatus === 'all'}">Tutte</button></div></div><div class="task-list">${cards || '<div class="empty">Nessuna attività nel profilo selezionato</div>'}</div></section>${panel('Tipi di attività', 'Azioni aperte del profilo selezionato', chartBars({ values: data.byType }), 'workspace-aside')}</div></div>`;
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
    if (view === 'workspace') {
      const data = await getJson(`/api/workspace?assignee=${encodeURIComponent(state.assignee)}`);
      if (renderId !== state.renderId) return;
      state.assignee = data.assignee;
      main.innerHTML = workspacePage(data);
      document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
      document.getElementById('assignee').onchange = event => { state.assignee = event.target.value; render(); };
      document.querySelectorAll('[data-workspace-status]').forEach(button => button.onclick = () => { state.workspaceStatus = button.dataset.workspaceStatus; render(); });
      document.querySelectorAll('[data-procedure-id]').forEach(button => button.onclick = async () => {
        const procedureId = button.dataset.procedureId;
        state.view = 'control-tower'; state.mode = 'preview'; state.ulss = ''; state.type = ''; state.search = '';
        await render();
        const row = state.data?.rows.find(item => item.procedimento_id === procedureId);
        if (row) showDetail(row);
      });
      return;
    }
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
      document.querySelectorAll('[data-focus-id]').forEach(button => button.onclick = () => {
        const id = button.dataset.focusId;
        const key = { 'control-tower':'procedimento_id', autorizzazione:'procedimento_id', accreditamento:'richiesta_id', visite:'visita_id' }[state.view];
        const row = state.data.rows.find(item => item[key] === id);
        if (row) showDetail(row);
      });
      tableRows();
    } else if (state.bootstrap.quicksight.dashboards.includes(view)) {
      try {
        const result = await getJson(`/api/embed/${view}`);
        if (renderId !== state.renderId) return;
        if (!window.QuickSightEmbedding?.createEmbeddingContext) throw new Error('Client QuickSight non disponibile.');
        document.getElementById('quickPanel').innerHTML = '<div class="embed-guidance"><strong>Filtri del foglio</strong><span>Usa i controlli sopra i visual QuickSight per filtrare l’intero cruscotto selezionato.</span></div><div id="embedContainer" class="embed-container" aria-label="Dashboard QuickSight"></div><div id="embedMessage" class="embed-message" role="status"></div>';
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
        document.getElementById('quickPanel').innerHTML = `<div class="error-message">${escapeHtml(error.message)}</div>`;
      }
    } else document.getElementById('backToPreview').onclick = () => { state.mode = 'preview'; render(); };
  } catch (error) { main.innerHTML = `<div class="error-message">Impossibile caricare il cruscotto: ${escapeHtml(error.message)}</div>`; }
}

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.view; state.search = ''; state.type = ''; document.getElementById('sidebar').classList.remove('open'); render(); window.scrollTo(0, 0); }));
document.getElementById('menuButton').onclick = () => document.getElementById('sidebar').classList.toggle('open');
document.getElementById('closeDialog').onclick = () => dialog.close();
state.bootstrap = await getJson('/api/bootstrap');
render();
