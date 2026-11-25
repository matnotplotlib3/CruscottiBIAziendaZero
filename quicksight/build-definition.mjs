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
  geo: 'vw_bi_strutture_sedi_geografia_mock_20261125.csv',
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
function dimension(ds, name, visualId, dateGranularity = 'DAY') {
  const base = { FieldId: fieldId(visualId, name, 'dim'), Column: col(ds, name) };
  const type = kind(ds, name);
  if (type === 'STRING') return { CategoricalDimensionField: base };
  if (type === 'DATETIME') return { DateDimensionField: { ...base, DateGranularity: dateGranularity, FormatConfiguration: { DateTimeFormat: dateGranularity === 'MONTH' ? 'MMM YYYY' : 'DD/MM/YYYY' } } };
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
      FieldWells: { Values: [measure(ds, field, id, aggregation)] },
      KPIOptions: { PrimaryValueFontConfiguration: { FontSize: { Absolute: '32px' } } }
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
function pie(id, label, ds, category, value, { donut = false, aggregation = 'COUNT' } = {}) {
  return { PieChartVisual: {
    VisualId: id, Title: title(label),
    ChartConfiguration: {
      FieldWells: { PieChartAggregatedFieldWells: { Category: [dimension(ds, category, id)], Values: [measure(ds, value, id, aggregation)] } },
      ...(donut ? { DonutOptions: { ArcOptions: { ArcThickness: 'MEDIUM' } } } : {}),
      DataLabels: { Visibility: 'VISIBLE', LabelContent: 'PERCENT', Overlap: 'DISABLE_OVERLAP' }
    }
  } };
}
function line(id, label, ds, date, value, aggregation = 'COUNT') {
  return { LineChartVisual: {
    VisualId: id, Title: title(label),
    ChartConfiguration: {
      FieldWells: { LineChartAggregatedFieldWells: { Category: [dimension(ds, date, id, 'MONTH')], Values: [measure(ds, value, id, aggregation)] } },
      DataLabels: { Visibility: 'VISIBLE', Overlap: 'DISABLE_OVERLAP' },
      VisualPalette: { ChartColor: '#247E9A' }
    }
  } };
}
function heatmap(id, label, ds, row, column, value, { dateGranularity = 'DAY', aggregation = 'COUNT' } = {}) {
  return { HeatMapVisual: {
    VisualId: id, Title: title(label),
    ChartConfiguration: {
      FieldWells: { HeatMapAggregatedFieldWells: {
        Rows: [dimension(ds, row, id)],
        Columns: [dimension(ds, column, id, dateGranularity)],
        Values: [measure(ds, value, id, aggregation)]
      } },
      DataLabels: { Visibility: 'VISIBLE', Overlap: 'DISABLE_OVERLAP' },
      ColorScale: { ColorFillType: 'GRADIENT', Colors: [{ Color: '#E8F3F7' }, { Color: '#17669F' }, { Color: '#12334F' }] }
    }
  } };
}
function treemap(id, label, ds, group, value, aggregation = 'COUNT') {
  return { TreeMapVisual: {
    VisualId: id, Title: title(label),
    ChartConfiguration: {
      FieldWells: { TreeMapAggregatedFieldWells: { Groups: [dimension(ds, group, id)], Sizes: [measure(ds, value, id, aggregation)] } },
      DataLabels: { Visibility: 'VISIBLE', Overlap: 'DISABLE_OVERLAP' }
    }
  } };
}
function sankey(id, label, ds, source, destination, value) {
  return { SankeyDiagramVisual: {
    VisualId: id, Title: title(label),
    ChartConfiguration: {
      FieldWells: { SankeyDiagramAggregatedFieldWells: {
        Source: [dimension(ds, source, id)], Destination: [dimension(ds, destination, id)],
        Weight: [measure(ds, value, id, 'COUNT')]
      } },
      DataLabels: { Visibility: 'VISIBLE', Overlap: 'DISABLE_OVERLAP' }
    }
  } };
}
function clickFilter(visualId, label, column, targets) {
  return { CustomActionId: `${visualId}-filter`, Name: label, Trigger: 'DATA_POINT_CLICK', Status: 'ENABLED',
    ActionOperations: [{ FilterOperation: {
      SelectedFieldsConfiguration: { SelectedFields: [fieldId(visualId, column, 'dim')] },
      TargetVisualsConfiguration: { SameSheetTargetVisualConfiguration: { TargetVisuals: targets } }
    } }]
  };
}
function filledMap(id, label, ds, place, value, targets) {
  // Il dataset usa il nuovo data prep, che non supporta le geo-gerarchie.
  // La corrispondenza sul visual disambigua le province del Veneto.
  const venetoProvinces = ['Belluno', 'Padova', 'Rovigo', 'Treviso', 'Venezia', 'Verona', 'Vicenza'];
  return { FilledMapVisual: {
    VisualId: id, Title: title(label), Subtitle: subtitle('Seleziona una provincia per filtrare i pin e le ULSS'),
    GeocodingPreferences: venetoProvinces.map(province => ({
      RequestKey: { County: province },
      Preference: { GeocoderHierarchy: { Country: 'Italy', State: 'Veneto', County: province } }
    })),
    Actions: [clickFilter(id, 'Esplora la provincia', place, targets)],
    ChartConfiguration: {
      FieldWells: { FilledMapAggregatedFieldWells: {
        Geospatial: [dimension(ds, place, id)], Values: [measure(ds, value, id, 'SUM')]
      } },
      MapStyleOptions: { BaseMapStyle: 'LIGHT_GRAY' },
      WindowOptions: { MapZoomMode: 'AUTO' }
    }
  } };
}
function sitePointMap(id, label, ds) {
  return { GeospatialMapVisual: {
    VisualId: id, Title: title(label),
    ChartConfiguration: {
      FieldWells: { GeospatialMapAggregatedFieldWells: {
        Geospatial: [dimension(ds, 'latitudine', id), dimension(ds, 'longitudine', id)],
        Colors: [dimension(ds, 'ulss_nome', id)],
        Values: [measure(ds, 'numero_sedi', id, 'SUM')]
      } },
      MapStyleOptions: { BaseMapStyle: 'LIGHT_GRAY' },
      PointStyleOptions: { SelectedPointStyle: 'POINT' },
      WindowOptions: { MapZoomMode: 'AUTO' },
      Tooltip: { SelectedTooltipType: 'BASIC', TooltipVisibility: 'VISIBLE' }
    }
  } };
}
function ulssTree(id, label, ds, targets) {
  const visual = treemap(id, label, ds, 'ulss_nome', 'numero_sedi', 'SUM');
  visual.TreeMapVisual.Actions = [clickFilter(id, 'Esplora la ULSS', 'ulss_nome', targets)];
  return visual;
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
  titolo_id: 'Titolo', tipo_titolo: 'Tipo titolo', stato_titolo: 'Stato titolo', data_scadenza: 'Scadenza',
  scadenza_id: 'Attività', procedimento_id: 'Pratica', tipo_azione: 'Azione',
  stato_azione: 'Stato attività', responsabile_azione: 'Profilo', priorita: 'Priorità',
  sede_id: 'ID sede', sede_nome: 'Sede', provincia: 'Provincia', comune: 'Comune',
  ulss_nome: 'ULSS', stato_sede: 'Stato sede'
};
const tableWidths = {
  numero_procedimento: '150px', tipologia_procedimento: '190px', struttura_id: '135px',
  stato_corrente: '130px', fase_corrente: '155px', data_scadenza_sla: '145px',
  struttura_nome: '260px', tipologia_struttura: '195px', natura_giuridica: '170px',
  comune_principale: '160px', ulss: '145px', richiesta_id: '155px',
  tipo_richiesta: '155px', stato_richiesta: '150px', visita_id: '145px',
  tipo_visita: '170px', data_pianificata: '145px', esito_visita: '155px',
  ente_parere: '185px', data_termine: '145px', data_scadenza: '145px',
  data_scadenza_procedimento: '145px', tipo_azione: '185px',
  responsabile_azione: '155px', priorita: '125px',
  sede_nome: '235px', provincia: '145px', comune: '155px', ulss_nome: '190px', stato_sede: '130px'
};
const tableStatusColors = {
  stato_corrente: { Chiuso: '#DCEFE9', Sospeso: '#F9E8D0' },
  stato_struttura: { Attiva: '#DCEFE9', Sospesa: '#F9E8D0', Cessata: '#F7E0E3' },
  stato_titolo: { Valido: '#DCEFE9', Sospeso: '#F9E8D0', Scaduto: '#F7E0E3' },
  stato_richiesta: { Conclusa: '#DCEFE9', Sospeso: '#F9E8D0' },
  stato_parere: { Ricevuto: '#DCEFE9', 'In attesa': '#F9E8D0', 'Mancante oltre termine': '#F7E0E3' },
  stato_visita: { Eseguita: '#DCEFE9', Pianificata: '#E1F0F8', Annullata: '#F7E0E3' },
  stato_azione: { Completata: '#DCEFE9', Scaduta: '#F7E0E3' },
  priorita: { Alta: '#F7E0E3', Media: '#F9E8D0', Ordinaria: '#E1F0F8' },
  stato_sede: { Attiva: '#DCEFE9', Sospesa: '#F9E8D0', Cessata: '#F7E0E3' }
};
function table(id, label, ds, columns) {
  const visual = { TableVisual: {
    VisualId: id, Title: title(label),
    ChartConfiguration: {
      FieldWells: { TableUnaggregatedFieldWells: { Values: columns.map(name => ({
        FieldId: fieldId(id, name, 'col'), Column: col(ds, name),
        ...(kind(ds, name) === 'DATETIME' ? { FormatConfiguration: { DateTimeFormatConfiguration: { DateTimeFormat: 'DD/MM/YYYY' } } } : {})
      })) } },
      FieldOptions: {
        SelectedFieldOptions: columns.map(name => ({ FieldId: fieldId(id, name, 'col'), CustomLabel: tableLabels[name] || name, Width: tableWidths[name] || '145px' })),
        PinnedFieldOptions: { PinnedLeftFields: [fieldId(id, columns[0], 'col')] }
      },
      TableOptions: {
        HeaderStyle: { BackgroundColor: '#14334F', FontConfiguration: { FontColor: '#FFFFFF', FontSize: { Absolute: '13px' } }, Height: 42, TextWrap: 'WRAP', VerticalTextAlignment: 'MIDDLE' },
        CellStyle: { BackgroundColor: '#FFFFFF', FontConfiguration: { FontColor: '#183B58', FontSize: { Absolute: '13px' } }, Height: 40, VerticalTextAlignment: 'MIDDLE', TextWrap: 'NONE' },
        RowAlternateColorOptions: { Status: 'ENABLED', RowAlternateColors: ['#EDF4F8'] }
      }
    }
  } };
  const rules = columns.flatMap(name => Object.entries(tableStatusColors[name] || {}).map(([value, color]) => ({
    Cell: { FieldId: fieldId(id, name, 'col'), TextFormat: {
      BackgroundColor: { Solid: { Expression: `{${name}} = '${value}'`, Color: color } }
    } }
  })));
  if (rules.length) visual.TableVisual.ConditionalFormatting = { ConditionalFormattingOptions: rules };
  return visual;
}
function textBox(id, heading, description) {
  const content = `<text-box><inline font-size="20px" color="#14334F"><b>${heading}</b></inline><br/><inline font-size="12px" color="#4B6780">${description} · dati sintetici aggiornati al 22/11/2026</inline></text-box>`;
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
  'az-control-tower': { charts: [[0, 14, 6, 17], [14, 22, 6, 17], [0, 36, 24, 11]], detail: [0, 36, 36, 17] },
  'az-strutture': { charts: [[0, 18, 6, 18], [18, 18, 6, 18], [0, 23, 25, 13], [23, 13, 25, 13]], extras: [[0, 36, 57, 15]], detail: [0, 36, 39, 17] },
  'az-autorizzazione': { charts: [[0, 36, 6, 16], [0, 21, 23, 13], [21, 15, 23, 13]], detail: [0, 36, 37, 17] },
  'az-accreditamento': { charts: [[0, 36, 6, 16], [0, 21, 23, 15], [21, 15, 23, 15]], extras: [[0, 36, 57, 15]], detail: [0, 36, 39, 17] },
  'az-visite': { charts: [[0, 36, 6, 17], [0, 14, 24, 13], [14, 22, 24, 13]], extras: [[0, 36, 55, 14]], detail: [0, 36, 38, 16] },
  'az-scrivania': { charts: [[0, 22, 27, 15], [22, 14, 27, 15]], detail: [0, 36, 6, 20] }
};
function sheet(id, name, heading, description, kpis, charts, detail, extras = []) {
  const visuals = [...kpis, ...charts, detail, ...extras];
  const headerId = `${id}-header`;
  const elements = [element(headerId, 'TEXT_BOX', 0, 36, 0, 2, '#EAF3F8')];
  kpis.forEach((item, index) => elements.push(element(Object.values(item)[0].VisualId, 'VISUAL', index * 9, 9, 2, 3, '#F6F9FC')));
  const placement = layouts[id];
  charts.forEach((item, index) => elements.push(element(Object.values(item)[0].VisualId, 'VISUAL', ...placement.charts[index], '#FFFFFF')));
  elements.push(element(Object.values(detail)[0].VisualId, 'VISUAL', ...placement.detail, '#FFFFFF'));
  extras.forEach((item, index) => elements.push(element(Object.values(item)[0].VisualId, 'VISUAL', ...placement.extras[index], '#FFFFFF')));
  definition.Sheets.push({
    SheetId: id, Name: name, ContentType: 'INTERACTIVE',
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
  treemap('ct-risk-tree', 'Composizione del rischio SLA', dataset.ct, 'classe_rischio_sla', 'procedimento_id'),
  bar('ct-status', 'Procedimenti per stato', dataset.ct, 'stato_corrente', 'procedimento_id'),
  line('ct-sla-timeline', 'Scadenze SLA per mese', dataset.ct, 'data_scadenza_sla', 'procedimento_id')
], table('ct-detail', 'Registro procedimenti', dataset.ct, ['numero_procedimento', 'tipologia_procedimento', 'struttura_id', 'stato_corrente', 'fase_corrente', 'data_scadenza_sla']));
categoryFilter('ct-open-only', dataset.ct, 'stato_corrente', ['Chiuso'], 'az-control-tower', ['ct-open'], 'DOES_NOT_CONTAIN');
categoryFilter('ct-risk-only', dataset.ct, 'classe_rischio_sla', ['Fuori SLA', 'Alto', 'Medio'], 'az-control-tower', ['ct-risk']);

sheet('az-strutture', '02 · Strutture', 'Strutture, sedi e titoli', 'Province venete, ULSS, sedi e scadenze dei titoli', [
  kpi('st-structures', 'Strutture', dataset.geo, 'struttura_id', 'DISTINCT_COUNT', 'Anagrafica'),
  kpi('st-sites', 'Sedi', dataset.geo, 'sede_id', 'DISTINCT_COUNT', 'Localizzate nel Veneto'),
  kpi('st-titles', 'Titoli', dataset.titles, 'titolo_id', 'DISTINCT_COUNT', 'Titoli registrati'),
  kpi('st-expiry', 'In scadenza 60 gg', dataset.titles, 'titolo_id', 'COUNT', 'Titoli da presidiare')
], [
  filledMap('st-province-map', 'Sedi per provincia', dataset.geo, 'provincia', 'numero_sedi', ['st-site-points', 'st-ulss-tree', 'st-sites-table']),
  sitePointMap('st-site-points', 'Pin delle singole sedi · colorati per ULSS', dataset.geo),
  ulssTree('st-ulss-tree', 'Distribuzione delle sedi per ULSS', dataset.geo, ['st-province-map', 'st-site-points', 'st-sites-table']),
  pie('st-title-status', 'Stato dei titoli', dataset.titles, 'stato_titolo', 'titolo_id')
], table('st-sites-table', 'Elenco sedi nel territorio selezionato', dataset.geo, ['sede_nome', 'struttura_nome', 'provincia', 'ulss_nome', 'comune', 'stato_sede']), [
  table('st-titles-table', 'Titoli e date di scadenza', dataset.titles, ['titolo_id', 'struttura_id', 'tipo_titolo', 'stato_titolo', 'data_scadenza'])
]);
categoryFilter('st-expiry-only', dataset.titles, 'flag_in_scadenza_60gg', ['Sì'], 'az-strutture', ['st-expiry']);

sheet('az-autorizzazione', '03 · Autorizzazione', 'Autorizzazione all’esercizio', 'Istruttorie, fasi, tempi netti e superamenti SLA', [
  kpi('au-total', 'Procedimenti AU', dataset.ct, 'procedimento_id', 'COUNT', 'Autorizzazione esercizio'),
  kpi('au-open', 'Aperti', dataset.ct, 'procedimento_id', 'COUNT', 'In gestione'),
  kpi('au-days', 'Tempo medio netto', dataset.ct, 'giorni_netti', 'AVERAGE', 'Giorni, sospensioni escluse'),
  kpi('au-overdue', 'Fuori SLA', dataset.ct, 'procedimento_id', 'COUNT', 'Da esaminare')
], [
  sankey('au-priority-flow', 'Priorità delle pratiche → fase corrente', dataset.ct, 'priorita', 'fase_corrente', 'procedimento_id'),
  line('au-trend', 'Avvio dei procedimenti nel tempo', dataset.ct, 'data_avvio', 'procedimento_id'),
  bar('au-office-days', 'Tempo medio netto per ufficio', dataset.ct, 'ufficio', 'giorni_netti', 'HORIZONTAL', 'AVERAGE', '#4C94A8')
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
  sankey('ac-request-flow', 'Tipo di richiesta → stato attuale', dataset.requests, 'tipo_richiesta', 'stato_richiesta', 'richiesta_id'),
  heatmap('ac-opinion-matrix', 'Pareri: ente × stato', dataset.opinions, 'ente_parere', 'stato_parere', 'parere_id'),
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
  heatmap('vi-calendar', 'Carico visite: tipo × mese', dataset.visits, 'tipo_visita', 'data_pianificata', 'visita_id', { dateGranularity: 'MONTH' }),
  pie('vi-gravity', 'Gravità non conformità', dataset.nc, 'gravita', 'nc_id', { donut: true }),
  line('vi-schedule', 'Visite pianificate nel tempo', dataset.visits, 'data_pianificata', 'visita_id')
], table('vi-detail', 'Piano visite', dataset.visits, ['visita_id', 'struttura_id', 'tipo_visita', 'stato_visita', 'data_pianificata', 'esito_visita']), [
  table('vi-assignments', 'Valutatori assegnati', dataset.assignments, ['assegnazione_id', 'visita_id', 'valutatore_id', 'stato_conferma', 'ore_stimate'])
]);
categoryFilter('vi-open-nc-only', dataset.nc, 'stato_nc', ['Chiusa'], 'az-visite', ['vi-nc'], 'DOES_NOT_CONTAIN');

sheet('az-scrivania', '06 · La mia scrivania', 'La mia scrivania', 'Attività e scadenze del profilo sintetico selezionato', [
  kpi('wk-open', 'Da fare', dataset.deadlines, 'scadenza_id', 'COUNT', 'Azioni non completate'),
  kpi('wk-overdue', 'Scadute', dataset.deadlines, 'scadenza_id', 'COUNT', 'Richiedono attenzione'),
  kpi('wk-urgent', 'Urgenti', dataset.deadlines, 'scadenza_id', 'COUNT', 'Contrassegnate come urgenti'),
  kpi('wk-completed', 'Completate', dataset.deadlines, 'scadenza_id', 'COUNT', 'Azioni concluse')
], [
  heatmap('wk-weekly-calendar', 'Agenda scadenze: settimane × priorità', dataset.deadlines, 'priorita', 'data_scadenza', 'scadenza_id', { dateGranularity: 'WEEK' }),
  line('wk-deadline-trend', 'Scadenze per mese', dataset.deadlines, 'data_scadenza', 'scadenza_id')
], table('wk-detail', 'Attività e scadenze', dataset.deadlines, [
  'scadenza_id', 'procedimento_id', 'tipo_azione', 'data_scadenza', 'stato_azione', 'priorita', 'responsabile_azione'
]));
categoryFilter('wk-open-only', dataset.deadlines, 'stato_azione', ['Completata'], 'az-scrivania', ['wk-open'], 'DOES_NOT_CONTAIN');
categoryFilter('wk-overdue-only', dataset.deadlines, 'stato_azione', ['Scaduta'], 'az-scrivania', ['wk-overdue']);
categoryFilter('wk-urgent-only', dataset.deadlines, 'flag_urgente', ['Sì'], 'az-scrivania', ['wk-urgent']);
categoryFilter('wk-completed-only', dataset.deadlines, 'stato_azione', ['Completata'], 'az-scrivania', ['wk-completed']);

// Questi controlli sono esposti sul foglio e filtrano tutti i visual applicabili.
// I controlli sulle chiavi condivise attraversano i dataset del rispettivo dominio.
function sheetControl(sheetId, id, ds, column, label, { type = 'MULTI_SELECT', defaultValues = [] } = {}) {
  const target = definition.Sheets.find(item => item.SheetId === sheetId);
  const filterId = `${id}-filter`;
  const controlId = `${id}-control`;
  definition.FilterGroups.push({
    FilterGroupId: id, CrossDataset: 'ALL_DATASETS', Status: 'ENABLED',
    Filters: [{ CategoryFilter: {
      FilterId: filterId, Column: col(ds, column),
      Configuration: { FilterListConfiguration: {
        MatchOperator: 'CONTAINS', NullOption: 'ALL_VALUES',
        ...(defaultValues.length ? { CategoryValues: defaultValues } : { SelectAllOptions: 'FILTER_ALL_VALUES' })
      } }
    } }],
    ScopeConfiguration: { SelectedSheets: { SheetVisualScopingConfigurations: [{ SheetId: sheetId, Scope: 'ALL_VISUALS' }] } }
  });
  target.FilterControls ||= [];
  target.FilterControls.push({ Dropdown: { FilterControlId: controlId, SourceFilterId: filterId, Title: label, Type: type } });
  const controls = target.FilterControls.map((control, index) => element(control.Dropdown.FilterControlId, 'FILTER_CONTROL', (index % 2) * 6, 6, Math.floor(index / 2), 1));
  target.SheetControlLayouts = [{ Configuration: { GridLayout: { Elements: controls, CanvasSizeOptions: { ScreenCanvasSizeOptions: { ResizeOption: 'RESPONSIVE' } } } } }];
}
sheetControl('az-control-tower', 'ct-type-control', dataset.ct, 'tipologia_procedimento', 'Tipologia procedimento');
sheetControl('az-control-tower', 'ct-status-control', dataset.ct, 'stato_corrente', 'Stato pratica');
sheetControl('az-strutture', 'st-province-control', dataset.geo, 'provincia', 'Provincia');
sheetControl('az-strutture', 'st-ulss-control', dataset.geo, 'ulss_nome', 'ULSS');
sheetControl('az-strutture', 'st-type-control', dataset.geo, 'tipologia_struttura', 'Tipologia struttura');
sheetControl('az-strutture', 'st-structure-control', dataset.geo, 'struttura_id', 'Struttura');
sheetControl('az-autorizzazione', 'au-phase-control', dataset.ct, 'fase_corrente', 'Fase pratica');
sheetControl('az-autorizzazione', 'au-office-control', dataset.ct, 'ufficio', 'Ufficio');
sheetControl('az-accreditamento', 'ac-request-control', dataset.requests, 'richiesta_id', 'Richiesta');
sheetControl('az-visite', 'vi-visit-control', dataset.visits, 'visita_id', 'Visita');
sheetControl('az-scrivania', 'wk-owner-control', dataset.deadlines, 'responsabile_azione', 'Profilo dimostrativo', { type: 'SINGLE_SELECT', defaultValues: ['S. Ferri'] });
sheetControl('az-scrivania', 'wk-action-control', dataset.deadlines, 'tipo_azione', 'Tipo di attività');
sheetControl('az-scrivania', 'wk-status-control', dataset.deadlines, 'stato_azione', 'Stato attività');

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
