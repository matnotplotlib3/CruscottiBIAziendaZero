import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Produce una richiesta completa: UpdateDataSet non accetta aggiornamenti parziali.
const here = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(here, '..', 'config.local.json'), 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(path.join(here, 'schemas.snapshot.json'), 'utf8'));
const profiles = {
  structures: { name: 'vw_bi_strutture_anagrafica_mock.csv', output: 'structures', roles: { comune_principale: 'CITY' } },
  sedi: { name: 'vw_bi_strutture_sedi_geografia_mock_20261125.csv', output: 'sedi', roles: {
    paese: 'COUNTRY', regione: 'STATE', provincia: 'COUNTY', comune: 'CITY',
    latitudine: 'LATITUDE', longitudine: 'LONGITUDE'
  } }
};
const selected = profiles[process.argv[2] || 'structures'];
if (!selected) throw new Error('Profilo geografico sconosciuto: usa structures o sedi.');
const dataset = snapshot.datasets.find(item => item.name === selected.name);
if (!dataset) throw new Error(`Dataset ${selected.name} non presente nello snapshot degli schemi.`);
const args = ['quicksight', 'describe-data-set', '--aws-account-id', snapshot.account,
  '--data-set-id', dataset.id, '--region', config.region || snapshot.region || 'eu-central-1',
  '--profile', config.awsProfile, '--output', 'json'];
const response = JSON.parse(execFileSync(config.awsCliPath || 'aws', args, { encoding: 'utf8', windowsHide: true }));
fs.writeFileSync(path.join(here, `${selected.output}-before.snapshot.json`), JSON.stringify(response, null, 2) + '\n');
const source = response.DataSet;
const semantic = structuredClone(source.SemanticModelConfiguration);
const table = Object.values(semantic.TableMap)[0];
const existing = table.SemanticMetadata?.ColumnMetadata || [];
const retained = existing.flatMap(entry => {
  const names = entry.ColumnNames.filter(name => !(name in selected.roles));
  return names.length ? [{ ...entry, ColumnNames: names }] : [];
});
table.SemanticMetadata = {
  ...table.SemanticMetadata,
  ColumnMetadata: [...retained, ...Object.entries(selected.roles).map(([name, role]) => ({
    ColumnNames: [name],
    ColumnProperties: [
      ...(existing.find(entry => entry.ColumnNames.includes(name))?.ColumnProperties || []).filter(property => !property.SemanticType),
      { SemanticType: { GeographicalRole: role } }
    ]
  }))]
};
const request = {
  AwsAccountId: snapshot.account,
  DataSetId: source.DataSetId,
  Name: source.Name,
  PhysicalTableMap: source.PhysicalTableMap,
  ImportMode: source.ImportMode,
  DataPrepConfiguration: source.DataPrepConfiguration,
  SemanticModelConfiguration: semantic
};
fs.writeFileSync(path.join(here, `${selected.output}-geo.request.json`), JSON.stringify(request, null, 2) + '\n');
console.log(`Richiesta geografica ${selected.output} pronta.`);
