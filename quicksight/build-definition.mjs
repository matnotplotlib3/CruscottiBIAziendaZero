import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(here, '..', 'config.local.json');
if (!fs.existsSync(configPath)) throw new Error('Crea config.local.json da config.example.json prima di generare la definizione QuickSight.');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const dashboardId = config.dashboards?.['control-tower'];
if (!config.analysisId || !dashboardId || !config.userArn) throw new Error('analysisId, dashboards.control-tower e userArn sono obbligatori in config.local.json.');
const snapshot = JSON.parse(fs.readFileSync(path.join(here, 'schemas.snapshot.json'), 'utf8'));
const byName = new Map(snapshot.datasets.map(item => [item.name, item]));
const dataset = {
  ct: 'vw_bi_control_tower_sintesi_mock.csv',
  phases: 'vw_bi_control_tower_storico_fasi_mock.csv',
  deadlines: 'vw_bi_control_tower_scadenze_mock.csv',
  structures: 'vw_bi_strutture_anagrafica_mock.csv',
  units: 'vw_bi_strutture_sedi_udo_mock.csv',
  titles: 'vw_bi_strutture_titoli_scadenze_mock.csv',
  requests: 'vw_bi_accreditamenti_pareri_rinnovi_mock.csv',
  opinions: 'vw_bi_accreditamenti_pareri_mock.csv',
  visits: 'vw_bi_visite_mock.csv',
  assignments: 'vw_bi_visite_valutatori_mock.csv',
  evaluators: 'vw_bi_valutatori_capacita_mock.csv',
  nc: 'vw_bi_non_conformita_mock.csv',
  prescriptions: 'vw_bi_prescrizioni_mock.csv'
};

const definition = {
  DataSetIdentifierDeclarations: snapshot.datasets.map(({ name, arn }) => ({ Identifier: name, DataSetArn: arn })),
  Sheets: [],
  FilterGroups: []
};

function col(ds, name) {
  const item = byName.get(ds);
  if (!item?.columns.some(column => column.name === name)) throw new Error(`Colonna assente in ${ds}: ${name}`);
  return { DataSetIdentifier: ds, ColumnName: name };
}
function kind(ds, name) { return byName.get(ds).columns.find(column => column.name === name).type; }
function fieldId(visualId, name, role) { return `${visualId}-${name}-${role}`.replace(/[^a-zA-Z0-9_-]/g, '-'); }
function dimension(ds, name, visualId) {
  const base = { FieldId: fieldId(visualId, name, 'dim'), Column: col(ds, name) };
  const type = kind(ds, name);
  if (type === 'STRING') return { CategoricalDimensionField: base };
  if (type === 'DATETIME') return { DateDimensionField: base };
  return { NumericalDimensionField: base };
}
function measure(ds, name, visualId, aggregation = 'COUNT') {
  const base = { FieldId: fieldId(visualId, name, 'val'), Column: col(ds, name) };
  if (kind(ds, name) === 'STRING') return { CategoricalMeasureField: { ...base, AggregationFunction: aggregation } };
  return { NumericalMeasureField: { ...base, AggregationFunction: { SimpleNumericalAggregation: aggregation } } };
}
function title(text) { return { Visibility: 'VISIBLE', FormatText: { PlainText: text } }; }
function subtitle(text) { return { Visibility: 'VISIBLE', FormatText: { PlainText: text } }; }

function kpi(id, label, ds, field, aggregation, detail) {
  return { KPIVisual: {
    VisualId: id, Title: title(label), Subtitle: subtitle(detail),
    ChartConfiguration: {
      FieldWells: { Values: [measure(ds, field, id, aggregation)] }
    }
  } };
}
function bar(id, label, ds, category, value, orientation = 'HORIZONTAL', aggregation = 'COUNT', color = '#237DA2') {
  const categoryField = dimension(ds, category, id);
  const valueField = measure(ds, value, id, aggregation);
  const valueId = Object.values(valueField)[0].FieldId;
  return { BarChartVisual: {
    VisualId: id, Title: title(label),
    ChartConfiguration: {
      FieldWells: { BarChartAggregatedFieldWells: { Category: [categoryField], Values: [valueField] } },
      Orientation: orientation, BarsArrangement: 'CLUSTERED',
      DataLabels: { Visibility: 'VISIBLE', Overlap: 'DISABLE_OVERLAP' },
      SortConfiguration: { CategorySort: [{ FieldSort: { FieldId: valueId, Direction: 'DESC' } }] },
      VisualPalette: { ChartColor: color }
    }
  } };
}
function donut(id, label, ds, category, value, aggregation = 'COUNT') {
  return { PieChartVisual: {
    VisualId: id, Title: title(label),
    ChartConfiguration: {
      FieldWells: { PieChartAggregatedFieldWells: { Category: [dimension(ds, category, id)], Values: [measure(ds, value, id, aggregation)] } },
      DonutOptions: { ArcOptions: { ArcThickness: 'MEDIUM' } },
      DataLabels: { Visibility: 'VISIBLE', LabelContent: 'PERCENT', Overlap: 'DISABLE_OVERLAP' }
    }
  } };
}
function line(id, label, ds, date, value, aggregation = 'COUNT') {
  return { LineChartVisual: {
    VisualId: id, Title: title(label),
    ChartConfiguration: {
      FieldWells: { LineChartAggregatedFieldWells: { Category: [dimension(ds, date, id)], Values: [measure(ds, value, id, aggregation)] } },
      DataLabels: { Visibility: 'VISIBLE', Overlap: 'DISABLE_OVERLAP' },
      VisualPalette: { ChartColor: '#247E9A' }
    }
  } };
}
const tableLabels = {
  numero_procedimento: 'Pratica', tipologia_procedimento: 'Tipo', struttura_id: 'Struttura',
  stato_corrente: 'Stato', fase_corrente: 'Fase', data_scadenza_sla: 'Scadenza SLA',
  struttura_nome: 'Struttura', tipologia_struttura: 'Tipologia', natura_giuridica: 'Natura',
  stato_struttura: 'Stato', comune_principale: 'Comune', ulss: 'ULSS',
  richiesta_id: 'Richiesta', tipo_richiesta: 'Tipo', stato_richiesta: 'Stato',
  data_scadenza_procedimento: 'Scadenza', visita_id: 'Visita', tipo_visita: 'Tipo',
  stato_visita: 'Stato', data_pianificata: 'Data visita', esito_visita: 'Esito', giorni_netti: 'Giorni netti',
  parere_id: 'Parere', ente_parere: 'Ente', stato_parere: 'Stato parere', data_termine: 'Termine',
  assegnazione_id: 'Assegnazione', valutatore_id: 'Valutatore', stato_conferma: 'Conferma', ore_stimate: 'Ore previste',
  titolo_id: 'Titolo', tipo_titolo: 'Tipo titolo', stato_titolo: 'Stato titolo', data_scadenza: 'Scadenza'
};
function table(id, label, ds, columns) {
  return { TableVisual: {
    VisualId: id, Title: title(label),
    ChartConfiguration: {
      FieldWells: { TableUnaggregatedFieldWells: { Values: columns.map(name => ({
        FieldId: fieldId(id, name, 'col'), Column: col(ds, name),
        ...(kind(ds, name) === 'DATETIME' ? { FormatConfiguration: { DateTimeFormatConfiguration: { DateTimeFormat: 'dd/MM/yyyy' } } } : {})
      })) } },
      FieldOptions: { SelectedFieldOptions: columns.map(name => ({ FieldId: fieldId(id, name, 'col'), CustomLabel: tableLabels[name] || name })) },
      TableOptions: {
        HeaderStyle: { BackgroundColor: '#18334D', FontConfiguration: { FontColor: '#FFFFFF' }, Height: 36 },
        CellStyle: { Height: 31 },
        RowAlternateColorOptions: { Status: 'ENABLED', RowAlternateColors: ['#F1F6FA'] }
      }
    }
  } };
}
function textBox(id, heading, description) {
  const content = `<text-box><inline font-size="22px"><b>${heading}</b></inline><br/><inline font-size="13px">${description} · dati sintetici aggiornati al 22/11/2026</inline></text-box>`;
  return { SheetTextBoxId: id, Content: content };
}
function element(id, type, column, span, row, height, background) {
  const result = { ElementId: id, ElementType: type, ColumnIndex: column, ColumnSpan: span, RowIndex: row, RowSpan: height };
  if (background) {
    result.BackgroundStyle = { Visibility: 'VISIBLE', Color: background };
    result.BorderRadius = '8px';
    result.Padding = '10px';
  }
  return result;
}
const layouts = {
  'az-control-tower': { charts: [[0, 21, 12, 13], [21, 15, 12, 13], [0, 36, 26, 11]], detail: [0, 36, 38, 17] },
  'az-strutture': { charts: [[0, 36, 12, 12], [0, 18, 25, 13], [18, 18, 25, 13]], extras: [[0, 36, 39, 15]], detail: [0, 36, 55, 17] },
  'az-autorizzazione': { charts: [[0, 36, 12, 13], [0, 20, 26, 13], [20, 16, 26, 13]], detail: [0, 36, 40, 17] },
  'az-accreditamento': { charts: [[0, 20, 12, 13], [20, 16, 12, 13], [0, 36, 26, 12]], extras: [[0, 36, 39, 15]], detail: [0, 36, 55, 17] },
  'az-visite': { charts: [[0, 36, 12, 13], [0, 18, 26, 13], [18, 18, 26, 13]], extras: [[0, 36, 40, 14]], detail: [0, 36, 55, 17] }
};
function sheet(id, name, heading, description, kpis, charts, detail, extras = []) {
  const visuals = [...kpis, ...charts, detail, ...extras];
  const headerId = `${id}-header`;
  const elements = [element(headerId, 'TEXT_BOX', 0, 36, 0, 4, '#EAF3F8')];
  kpis.forEach((item, index) => elements.push(element(Object.values(item)[0].VisualId, 'VISUAL', index * 9, 9, 5, 6, '#F6F9FC')));
  const placement = layouts[id];
  charts.forEach((item, index) => elements.push(element(Object.values(item)[0].VisualId, 'VISUAL', ...placement.charts[index], '#FFFFFF')));
  elements.push(element(Object.values(detail)[0].VisualId, 'VISUAL', ...placement.detail, '#FFFFFF'));
  extras.forEach((item, index) => elements.push(element(Object.values(item)[0].VisualId, 'VISUAL', ...placement.extras[index], '#FFFFFF')));
  definition.Sheets.push({
    SheetId: id, Name: name, Title: heading, ContentType: 'INTERACTIVE',
    TextBoxes: [textBox(headerId, heading, description)], Visuals: visuals,
    Layouts: [{ Configuration: { GridLayout: { Elements: elements, CanvasSizeOptions: { ScreenCanvasSizeOptions: { ResizeOption: 'RESPONSIVE' } } } } }]
  });
}
function categoryFilter(id, ds, column, values, sheetId, visualIds, match = 'CONTAINS') {
  definition.FilterGroups.push({
    FilterGroupId: id, CrossDataset: 'SINGLE_DATASET', Status: 'ENABLED',
    Filters: [{ CategoryFilter: {
      FilterId: `${id}-filter`, Column: col(ds, column),
      Configuration: { FilterListConfiguration: { MatchOperator: match, CategoryValues: values, NullOption: 'NON_NULLS_ONLY' } }
    } }],
    ScopeConfiguration: { SelectedSheets: { SheetVisualScopingConfigurations: [{ SheetId: sheetId, Scope: visualIds ? 'SELECTED_VISUALS' : 'ALL_VISUALS', ...(visualIds ? { VisualIds: visualIds } : {}) }] } }
  });
}

sheet('az-control-tower', '01 · Direzionale', 'Control Tower', 'Procedimenti, rischio SLA e priorità operative', [
  kpi('ct-total', 'Procedimenti', dataset.ct, 'procedimento_id', 'COUNT', 'Pratiche registrate'),
  kpi('ct-open', 'Aperti', dataset.ct, 'procedimento_id', 'COUNT', 'Pratiche in gestione'),
  kpi('ct-risk', 'A rischio SLA', dataset.ct, 'procedimento_id', 'COUNT', 'Fuori SLA o rischio alto/medio'),
  kpi('ct-days', 'Tempo medio netto', dataset.ct, 'giorni_netti', 'AVERAGE', 'Giorni, sospensioni escluse')
], [
  bar('ct-status', 'Procedimenti per stato', dataset.ct, 'stato_corrente', 'procedimento_id'),
  donut('ct-sla', 'Rischio SLA', dataset.ct, 'classe_rischio_sla', 'procedimento_id'),
  bar('ct-phases', 'Pratiche per fase', dataset.ct, 'fase_corrente', 'procedimento_id', 'HORIZONTAL', 'COUNT', '#4C94A8')
], table('ct-detail', 'Registro procedimenti', dataset.ct, ['numero_procedimento', 'tipologia_procedimento', 'struttura_id', 'stato_corrente', 'fase_corrente', 'data_scadenza_sla']));
categoryFilter('ct-open-only', dataset.ct, 'stato_corrente', ['Chiuso'], 'az-control-tower', ['ct-open'], 'DOES_NOT_CONTAIN');
categoryFilter('ct-risk-only', dataset.ct, 'classe_rischio_sla', ['Fuori SLA', 'Alto', 'Medio'], 'az-control-tower', ['ct-risk']);

sheet('az-strutture', '02 · Strutture', 'Strutture, UdO e titoli', 'Perimetro autorizzato, distribuzione territoriale e scadenze', [
  kpi('st-structures', 'Strutture', dataset.structures, 'struttura_id', 'DISTINCT_COUNT', 'Anagrafica'),
  kpi('st-udo', 'Unità di offerta', dataset.units, 'udo_id', 'DISTINCT_COUNT', 'UdO attive e registrate'),
  kpi('st-titles', 'Titoli', dataset.titles, 'titolo_id', 'DISTINCT_COUNT', 'Titoli registrati'),
  kpi('st-expiry', 'In scadenza 60 gg', dataset.titles, 'titolo_id', 'COUNT', 'Titoli da presidiare')
], [
  bar('st-ulss', 'Strutture per ULSS', dataset.structures, 'ulss', 'struttura_id'),
  bar('st-title-status', 'Stato dei titoli', dataset.titles, 'stato_titolo', 'titolo_id', 'HORIZONTAL', 'COUNT', '#228E87'),
  bar('st-types', 'Tipologia di struttura', dataset.structures, 'tipologia_struttura', 'struttura_id', 'HORIZONTAL', 'COUNT', '#4C94A8')
], table('st-detail', 'Anagrafica strutture', dataset.structures, ['struttura_nome', 'ulss', 'tipologia_struttura', 'natura_giuridica', 'stato_struttura', 'comune_principale']), [
  table('st-titles-table', 'Titoli e date di scadenza', dataset.titles, ['titolo_id', 'struttura_id', 'tipo_titolo', 'stato_titolo', 'data_scadenza'])
]);
categoryFilter('st-expiry-only', dataset.titles, 'flag_in_scadenza_60gg', ['Sì'], 'az-strutture', ['st-expiry']);

sheet('az-autorizzazione', '03 · Autorizzazione', 'Autorizzazione all’esercizio', 'Istruttorie, fasi, tempi netti e superamenti SLA', [
  kpi('au-total', 'Procedimenti AU', dataset.ct, 'procedimento_id', 'COUNT', 'Autorizzazione esercizio'),
  kpi('au-open', 'Aperti', dataset.ct, 'procedimento_id', 'COUNT', 'In gestione'),
  kpi('au-days', 'Tempo medio netto', dataset.ct, 'giorni_netti', 'AVERAGE', 'Giorni, sospensioni escluse'),
  kpi('au-overdue', 'Fuori SLA', dataset.ct, 'procedimento_id', 'COUNT', 'Da esaminare')
], [
  line('au-trend', 'Avvio dei procedimenti nel tempo', dataset.ct, 'data_avvio', 'procedimento_id'),
  bar('au-phase', 'Fase corrente', dataset.ct, 'fase_corrente', 'procedimento_id'),
  bar('au-priority', 'Priorità', dataset.ct, 'priorita', 'procedimento_id', 'HORIZONTAL', 'COUNT', '#4C94A8')
], table('au-detail', 'Pratiche di autorizzazione', dataset.ct, ['numero_procedimento', 'struttura_id', 'fase_corrente', 'stato_corrente', 'giorni_netti', 'data_scadenza_sla']));
categoryFilter('au-type-only', dataset.ct, 'tipologia_procedimento', ['Autorizzazione esercizio'], 'az-autorizzazione');
categoryFilter('au-open-only', dataset.ct, 'stato_corrente', ['Chiuso'], 'az-autorizzazione', ['au-open'], 'DOES_NOT_CONTAIN');
categoryFilter('au-sla-only', dataset.ct, 'classe_rischio_sla', ['Fuori SLA'], 'az-autorizzazione', ['au-overdue']);

sheet('az-accreditamento', '04 · Accreditamento', 'Accreditamento, pareri e rinnovi', 'Domande, pareri pendenti e integrazioni da seguire', [
  kpi('ac-requests', 'Richieste', dataset.requests, 'richiesta_id', 'DISTINCT_COUNT', 'Accreditamenti e rinnovi'),
  kpi('ac-renewals', 'Rinnovi', dataset.requests, 'richiesta_id', 'COUNT', 'Titoli da rinnovare'),
  kpi('ac-opinions', 'Pareri pendenti', dataset.opinions, 'parere_id', 'COUNT', 'Non ancora ricevuti'),
  kpi('ac-integrations', 'Integrazioni aperte', dataset.requests, 'richiesta_id', 'COUNT', 'Riscontro necessario')
], [
  bar('ac-status', 'Stato delle richieste', dataset.requests, 'stato_richiesta', 'richiesta_id'),
  bar('ac-entities', 'Pareri per ente', dataset.opinions, 'ente_parere', 'parere_id', 'HORIZONTAL', 'COUNT', '#B87924'),
  line('ac-trend', 'Richieste presentate nel tempo', dataset.requests, 'data_presentazione', 'richiesta_id')
], table('ac-detail', 'Domande e rinnovi', dataset.requests, ['richiesta_id', 'struttura_id', 'tipo_richiesta', 'stato_richiesta', 'fase_corrente', 'data_scadenza_procedimento']), [
  table('ac-opinion-detail', 'Pareri richiesti agli enti', dataset.opinions, ['parere_id', 'richiesta_id', 'ente_parere', 'stato_parere', 'data_termine'])
]);
categoryFilter('ac-renewals-only', dataset.requests, 'tipo_richiesta', ['Rinnovo'], 'az-accreditamento', ['ac-renewals']);
categoryFilter('ac-opinions-only', dataset.opinions, 'stato_parere', ['Mancante oltre termine', 'In attesa'], 'az-accreditamento', ['ac-opinions']);
categoryFilter('ac-integrations-only', dataset.requests, 'flag_integrazione_aperta', ['Sì'], 'az-accreditamento', ['ac-integrations']);

sheet('az-visite', '05 · Visite', 'Visite, valutatori e conformità', 'Pianificazione, capacità, rilievi e azioni correttive', [
  kpi('vi-visits', 'Visite', dataset.visits, 'visita_id', 'DISTINCT_COUNT', 'Pianificate e svolte'),
  kpi('vi-evaluators', 'Valutatori', dataset.assignments, 'valutatore_id', 'DISTINCT_COUNT', 'Assegnati alle visite'),
  kpi('vi-nc', 'NC aperte', dataset.nc, 'nc_id', 'COUNT', 'Non conformità da seguire'),
  kpi('vi-prescriptions', 'Prescrizioni', dataset.prescriptions, 'prescrizione_id', 'DISTINCT_COUNT', 'Azioni correttive')
], [
  line('vi-schedule', 'Calendario delle visite', dataset.visits, 'data_pianificata', 'visita_id'),
  bar('vi-gravity', 'Gravità non conformità', dataset.nc, 'gravita', 'nc_id', 'HORIZONTAL', 'COUNT', '#8A729F'),
  bar('vi-status', 'Stato delle visite', dataset.visits, 'stato_visita', 'visita_id')
], table('vi-detail', 'Piano visite', dataset.visits, ['visita_id', 'struttura_id', 'tipo_visita', 'stato_visita', 'data_pianificata', 'esito_visita']), [
  table('vi-assignments', 'Valutatori assegnati', dataset.assignments, ['assegnazione_id', 'visita_id', 'valutatore_id', 'stato_conferma', 'ore_stimate'])
]);
categoryFilter('vi-open-nc-only', dataset.nc, 'stato_nc', ['Chiusa'], 'az-visite', ['vi-nc'], 'DOES_NOT_CONTAIN');

// Questi controlli sono esposti sul foglio e filtrano tutti i visual applicabili.
// I controlli sulle chiavi condivise attraversano i dataset del rispettivo dominio.
function sheetControl(sheetId, id, ds, column, label) {
  const target = definition.Sheets.find(item => item.SheetId === sheetId);
  const filterId = `${id}-filter`;
  const controlId = `${id}-control`;
  definition.FilterGroups.push({
    FilterGroupId: id, CrossDataset: 'ALL_DATASETS', Status: 'ENABLED',
    Filters: [{ CategoryFilter: {
      FilterId: filterId, Column: col(ds, column),
      Configuration: { FilterListConfiguration: { MatchOperator: 'CONTAINS', SelectAllOptions: 'FILTER_ALL_VALUES', NullOption: 'ALL_VALUES' } }
    } }],
    ScopeConfiguration: { SelectedSheets: { SheetVisualScopingConfigurations: [{ SheetId: sheetId, Scope: 'ALL_VISUALS' }] } }
  });
  target.FilterControls ||= [];
  target.FilterControls.push({ Dropdown: { FilterControlId: controlId, SourceFilterId: filterId, Title: label, Type: 'MULTI_SELECT' } });
  const controls = target.FilterControls.map((control, index) => element(control.Dropdown.FilterControlId, 'FILTER_CONTROL', index * 6, 6, 0, 1));
  target.SheetControlLayouts = [{ Configuration: { GridLayout: { Elements: controls, CanvasSizeOptions: { ScreenCanvasSizeOptions: { ResizeOption: 'RESPONSIVE' } } } } }];
}
sheetControl('az-control-tower', 'ct-type-control', dataset.ct, 'tipologia_procedimento', 'Tipologia procedimento');
sheetControl('az-control-tower', 'ct-status-control', dataset.ct, 'stato_corrente', 'Stato pratica');
sheetControl('az-strutture', 'st-structure-control', dataset.structures, 'struttura_id', 'Struttura');
sheetControl('az-autorizzazione', 'au-phase-control', dataset.ct, 'fase_corrente', 'Fase pratica');
sheetControl('az-autorizzazione', 'au-office-control', dataset.ct, 'ufficio', 'Ufficio');
sheetControl('az-accreditamento', 'ac-request-control', dataset.requests, 'richiesta_id', 'Richiesta');
sheetControl('az-visite', 'vi-visit-control', dataset.visits, 'visita_id', 'Visita');

const ids = new Set();
for (const sheetDef of definition.Sheets) {
  for (const visual of sheetDef.Visuals) {
    const id = Object.values(visual)[0].VisualId;
    if (ids.has(id)) throw new Error(`VisualId duplicato: ${id}`);
    ids.add(id);
  }
}
function writeJson(filename, value) {
  const asciiJson = JSON.stringify(value, null, 2).replace(/[^\x00-\x7F]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
  fs.writeFileSync(path.join(here, filename), asciiJson + '\n', 'utf8');
}
writeJson('analysis-definition.generated.json', definition);
writeJson('update-analysis.request.json', { AwsAccountId: snapshot.account, AnalysisId: config.analysisId, Name: 'AZ | BI Accreditamenti - Demo completa', Definition: definition });
writeJson('create-dashboard.request.json', {
  AwsAccountId: snapshot.account, DashboardId: dashboardId, Name: 'AZ | Governance Accreditamenti - Demo BI', Definition: definition,
  Permissions: [{ Principal: config.userArn, Actions: ['quicksight:DescribeDashboard', 'quicksight:ListDashboardVersions', 'quicksight:QueryDashboard'] }]
});
writeJson('update-dashboard.request.json', {
  AwsAccountId: snapshot.account, DashboardId: dashboardId, Name: 'AZ | Governance Accreditamenti - Demo BI', Definition: definition
});
console.log(`${definition.Sheets.length} fogli, ${ids.size} visual, ${definition.FilterGroups.length} filtri generati`);
