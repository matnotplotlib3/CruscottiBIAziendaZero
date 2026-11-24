import fs from 'node:fs';
import path from 'node:path';

const files = {
  procedures: 'vw_bi_control_tower_sintesi_mock.csv',
  phases: 'vw_bi_control_tower_storico_fasi_mock.csv',
  deadlines: 'vw_bi_control_tower_scadenze_mock.csv',
  structures: 'vw_bi_strutture_anagrafica_mock.csv',
  units: 'vw_bi_strutture_sedi_udo_mock.csv',
  titles: 'vw_bi_strutture_titoli_scadenze_mock.csv',
  accreditations: 'vw_bi_accreditamenti_pareri_rinnovi_mock.csv',
  opinions: 'vw_bi_accreditamenti_pareri_mock.csv',
  visits: 'vw_bi_visite_mock.csv',
  assignments: 'vw_bi_visite_valutatori_mock.csv',
  evaluators: 'vw_bi_valutatori_capacita_mock.csv',
  nonConformities: 'vw_bi_non_conformita_mock.csv',
  prescriptions: 'vw_bi_prescrizioni_mock.csv'
};

export function parseCsv(input) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header = [], ...body] = rows;
  return body.map(values => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));
}

export function loadData(folder) {
  return Object.fromEntries(Object.entries(files).map(([key, file]) => {
    const text = fs.readFileSync(path.join(folder, file), 'utf8').replace(/^\uFEFF/, '');
    return [key, parseCsv(text)];
  }));
}

const number = value => Number(value) || 0;
const distinct = (rows, field) => new Set(rows.map(row => row[field]).filter(Boolean)).size;
const countBy = (rows, field) => Object.entries(rows.reduce((out, row) => {
  const key = row[field] || 'Non disponibile';
  out[key] = (out[key] || 0) + 1;
  return out;
}, {})).sort((a, b) => b[1] - a[1]);
const average = (rows, field) => rows.length ? Math.round(rows.reduce((sum, row) => sum + number(row[field]), 0) / rows.length) : 0;
const active = value => !/chius|conclus|annull|scadut/i.test(value || '');

export function buildView(data, view, filters = {}) {
  const structureMap = new Map(data.structures.map(row => [row.struttura_id, row]));
  const allowed = id => !filters.ulss || structureMap.get(id)?.ulss === filters.ulss;
  const procedures = data.procedures.filter(row => allowed(row.struttura_id) && (!filters.type || row.tipologia_procedimento === filters.type));
  const structures = data.structures.filter(row => !filters.ulss || row.ulss === filters.ulss);
  const titles = data.titles.filter(row => allowed(row.struttura_id));
  const accreditations = data.accreditations.filter(row => allowed(row.struttura_id));
  const visits = data.visits.filter(row => allowed(row.struttura_id));
  const visitIds = new Set(visits.map(row => row.visita_id));
  const nc = data.nonConformities.filter(row => visitIds.has(row.visita_id));
  const ncIds = new Set(nc.map(row => row.nc_id));
  const prescriptions = data.prescriptions.filter(row => ncIds.has(row.nc_id));
  const risk = procedures.filter(row => /fuori|alto|medio/i.test(row.classe_rischio_sla));
  const base = { view, filters, updatedAt: '2026-11-22 06:00', synthetic: true };
  if (view === 'control-tower') return {
    ...base, title: 'Direzionale e Control Tower',
    subtitle: 'Stato dei procedimenti, tempi, rischio SLA e priorità operative',
    kpis: [
      ['Procedimenti', distinct(procedures, 'procedimento_id'), 'Numero di pratiche', 'blue'],
      ['Aperti', procedures.filter(row => active(row.stato_corrente)).length, 'In gestione', 'blue'],
      ['A rischio SLA', risk.length, 'Fuori SLA, rischio alto o medio', 'red'],
      ['Tempo medio netto', average(procedures, 'giorni_netti') + ' gg', 'Sospensioni escluse', 'teal']
    ],
    charts: [
      { title: 'Procedimenti per stato', type: 'bar', values: countBy(procedures, 'stato_corrente') },
      { title: 'Rischio SLA', type: 'donut', values: countBy(procedures, 'classe_rischio_sla') },
      { title: 'Carico per ufficio', type: 'bar', values: countBy(procedures, 'ufficio') }
    ],
    columns: [['numero_procedimento','Pratica'],['tipologia_procedimento','Tipologia'],['struttura_nome','Struttura'],['stato_corrente','Stato'],['fase_corrente','Fase'],['data_scadenza_sla','Scadenza SLA']],
    rows: procedures.map(row => ({ ...row, struttura_nome: structureMap.get(row.struttura_id)?.struttura_nome || row.struttura_id }))
  };
  if (view === 'strutture') return {
    ...base, title: 'Strutture, UdO, Titoli e Scadenze',
    subtitle: 'Perimetro autorizzato e titoli, con conteggi distinti per struttura',
    kpis: [
      ['Strutture', distinct(structures, 'struttura_id'), 'Anagrafica', 'blue'],
      ['Sedi e UdO', distinct(data.units.filter(row => allowed(row.struttura_id)), 'udo_id'), 'Unità di offerta', 'teal'],
      ['Titoli', distinct(titles, 'titolo_id'), 'Titoli registrati', 'blue'],
      ['In scadenza 60 gg', titles.filter(row => row.flag_in_scadenza_60gg === 'Sì').length, 'Titoli da presidiare', 'amber']
    ],
    charts: [
      { title: 'Strutture per ULSS', type: 'bar', values: countBy(structures, 'ulss') },
      { title: 'Stato dei titoli', type: 'donut', values: countBy(titles, 'stato_titolo') },
      { title: 'Tipologia struttura', type: 'bar', values: countBy(structures, 'tipologia_struttura') }
    ],
    columns: [['struttura_nome','Struttura'],['ulss','ULSS'],['tipologia_struttura','Tipologia'],['stato_struttura','Stato'],['titoli','Titoli']],
    rows: structures.map(row => ({ ...row, titoli: titles.filter(item => item.struttura_id === row.struttura_id).length }))
  };
  if (view === 'autorizzazione') {
    const rows = procedures.filter(row => /autorizzazione/i.test(row.tipologia_procedimento));
    return {
      ...base, title: 'Autorizzazione all’Esercizio',
      subtitle: 'Istruttorie, fasi, sospensioni e tempi del procedimento',
      kpis: [
        ['Procedimenti AU', distinct(rows, 'procedimento_id'), 'Nel perimetro selezionato', 'blue'],
        ['Aperti', rows.filter(row => active(row.stato_corrente)).length, 'In corso', 'blue'],
        ['Tempo medio netto', average(rows, 'giorni_netti') + ' gg', 'Sospensioni escluse', 'teal'],
        ['Fuori SLA', rows.filter(row => /fuori/i.test(row.classe_rischio_sla)).length, 'Da esaminare', 'red']
      ],
      charts: [
        { title: 'Fase corrente', type: 'bar', values: countBy(rows, 'fase_corrente') },
        { title: 'Stato del procedimento', type: 'donut', values: countBy(rows, 'stato_corrente') },
        { title: 'Carico per ufficio', type: 'bar', values: countBy(rows, 'ufficio') }
      ],
      columns: [['numero_procedimento','Pratica'],['struttura_nome','Struttura'],['fase_corrente','Fase'],['stato_corrente','Stato'],['giorni_netti','Giorni netti'],['data_scadenza_sla','SLA']],
      rows: rows.map(row => ({ ...row, struttura_nome: structureMap.get(row.struttura_id)?.struttura_nome || row.struttura_id }))
    };
  }
  if (view === 'accreditamento') {
    const ids = new Set(accreditations.map(row => row.richiesta_id));
    const opinions = data.opinions.filter(row => ids.has(row.richiesta_id));
    return {
      ...base, title: 'Accreditamento, Pareri e Rinnovi',
      subtitle: 'Domande, rinnovi, pareri pendenti e avanzamento',
      kpis: [
        ['Richieste', distinct(accreditations, 'richiesta_id'), 'Accreditamenti e rinnovi', 'blue'],
        ['Rinnovi', accreditations.filter(row => /rinnovo/i.test(row.tipo_richiesta)).length, 'Titoli da rinnovare', 'teal'],
        ['Pareri pendenti', opinions.filter(row => !row.data_ricezione).length, 'Richiesti e non ricevuti', 'amber'],
        ['Integrazioni aperte', accreditations.filter(row => row.flag_integrazione_aperta === 'Sì').length, 'Riscontro necessario', 'red']
      ],
      charts: [
        { title: 'Stato richieste', type: 'bar', values: countBy(accreditations, 'stato_richiesta') },
        { title: 'Tipologia richiesta', type: 'donut', values: countBy(accreditations, 'tipo_richiesta') },
        { title: 'Pareri per ente', type: 'bar', values: countBy(opinions, 'ente_parere') }
      ],
      columns: [['richiesta_id','Richiesta'],['struttura_nome','Struttura'],['tipo_richiesta','Tipologia'],['stato_richiesta','Stato'],['fase_corrente','Fase'],['data_scadenza_procedimento','Scadenza']],
      rows: accreditations.map(row => ({ ...row, struttura_nome: structureMap.get(row.struttura_id)?.struttura_nome || row.struttura_id }))
    };
  }
  if (view === 'visite') {
    const linkedAssignments = data.assignments.filter(row => visitIds.has(row.visita_id));
    return {
      ...base, title: 'Visite, Valutatori, NC e Prescrizioni',
      subtitle: 'Pianificazione visite, capacità valutatori ed esiti di verifica',
      kpis: [
        ['Visite', distinct(visits, 'visita_id'), 'Pianificate e svolte', 'blue'],
        ['Valutatori', distinct(linkedAssignments, 'valutatore_id'), 'Assegnati alle visite', 'teal'],
        ['NC aperte', nc.filter(row => active(row.stato_nc)).length, 'Non conformità', 'red'],
        ['Prescrizioni', distinct(prescriptions, 'prescrizione_id'), 'Azioni correttive', 'amber']
      ],
      charts: [
        { title: 'Stato delle visite', type: 'bar', values: countBy(visits, 'stato_visita') },
        { title: 'Esito visite', type: 'donut', values: countBy(visits, 'esito_visita') },
        { title: 'Gravità NC', type: 'bar', values: countBy(nc, 'gravita') }
      ],
      columns: [['visita_id','Visita'],['struttura_nome','Struttura'],['tipo_visita','Tipologia'],['stato_visita','Stato'],['data_pianificata','Pianificata'],['esito_visita','Esito']],
      rows: visits.map(row => ({ ...row, struttura_nome: structureMap.get(row.struttura_id)?.struttura_nome || row.struttura_id }))
    };
  }
  throw new Error('Vista sconosciuta');
}

export function filtersFor(data) {
  return {
    ulss: [...new Set(data.structures.map(row => row.ulss).filter(Boolean))].sort(),
    types: [...new Set(data.procedures.map(row => row.tipologia_procedimento).filter(Boolean))].sort()
  };
}

export function buildDetail(data, view, id) {
  const sections = [];
  let record;
  if (view === 'control-tower' || view === 'autorizzazione') {
    record = data.procedures.find(row => row.procedimento_id === id);
    sections.push({ title: 'Fasi del procedimento', columns: [['fase','Fase'],['data_ingresso_fase','Ingresso'],['data_uscita_fase','Uscita'],['durata_giorni','Giorni']], rows: data.phases.filter(row => row.procedimento_id === id).sort((a,b) => Number(a.ordine_fase)-Number(b.ordine_fase)) });
    sections.push({ title: 'Scadenze e attività', columns: [['tipo_azione','Attività'],['data_scadenza','Scadenza'],['stato_azione','Stato'],['responsabile_azione','Responsabile']], rows: data.deadlines.filter(row => row.procedimento_id === id) });
  } else if (view === 'strutture') {
    record = data.structures.find(row => row.struttura_id === id);
    sections.push({ title: 'Sedi e unità di offerta', columns: [['sede_nome','Sede'],['udo_nome','UdO'],['tipologia_udo','Tipologia'],['capacita_posti','Posti']], rows: data.units.filter(row => row.struttura_id === id) });
    sections.push({ title: 'Titoli e scadenze', columns: [['numero_titolo','Titolo'],['tipo_titolo','Tipo'],['stato_titolo','Stato'],['data_scadenza','Scadenza']], rows: data.titles.filter(row => row.struttura_id === id) });
  } else if (view === 'accreditamento') {
    record = data.accreditations.find(row => row.richiesta_id === id);
    sections.push({ title: 'Pareri collegati', columns: [['ente_parere','Ente'],['tipo_parere','Tipo'],['data_termine','Termine'],['stato_parere','Stato']], rows: data.opinions.filter(row => row.richiesta_id === id) });
  } else if (view === 'visite') {
    record = data.visits.find(row => row.visita_id === id);
    const nc = data.nonConformities.filter(row => row.visita_id === id);
    const ncIds = new Set(nc.map(row => row.nc_id));
    sections.push({ title: 'Valutatori assegnati', columns: [['valutatore_id','Valutatore'],['ruolo_valutatore','Ruolo'],['competenza','Competenza'],['stato_conferma','Conferma']], rows: data.assignments.filter(row => row.visita_id === id) });
    sections.push({ title: 'Non conformità', columns: [['nc_id','NC'],['categoria_nc','Categoria'],['gravita','Gravità'],['stato_nc','Stato']], rows: nc });
    sections.push({ title: 'Prescrizioni', columns: [['prescrizione_id','ID'],['descrizione_prescrizione','Azione'],['data_scadenza','Scadenza'],['stato_prescrizione','Stato']], rows: data.prescriptions.filter(row => ncIds.has(row.nc_id)) });
  }
  if (!record) return null;
  return { record, sections };
}

export const VIEW_IDS = ['control-tower', 'strutture', 'autorizzazione', 'accreditamento', 'visite'];
