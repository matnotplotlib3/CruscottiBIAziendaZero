import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Produce una richiesta completa: UpdateDataSet non accetta aggiornamenti parziali.
const here = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(here, '..', 'config.local.json'), 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(path.join(here, 'schemas.snapshot.json'), 'utf8'));
const dataset = snapshot.datasets.find(item => item.name === 'vw_bi_strutture_anagrafica_mock.csv');
if (!dataset) throw new Error('Dataset strutture non presente nello snapshot degli schemi.');
const args = ['quicksight', 'describe-data-set', '--aws-account-id', snapshot.account,
  '--data-set-id', dataset.id, '--region', config.region || snapshot.region || 'eu-central-1',
  '--profile', config.awsProfile, '--output', 'json'];
const response = JSON.parse(execFileSync(config.awsCliPath || 'aws', args, { encoding: 'utf8', windowsHide: true }));
fs.writeFileSync(path.join(here, 'structures-before.snapshot.json'), JSON.stringify(response, null, 2) + '\n');
const source = response.DataSet;
const semantic = structuredClone(source.SemanticModelConfiguration);
const table = Object.values(semantic.TableMap)[0];
const existing = table.SemanticMetadata?.ColumnMetadata || [];
const retained = existing.flatMap(entry => {
  const names = entry.ColumnNames.filter(name => name !== 'comune_principale');
  return names.length ? [{ ...entry, ColumnNames: names }] : [];
});
const cityProperties = existing.find(entry => entry.ColumnNames.includes('comune_principale'))?.ColumnProperties
  ?.filter(property => !property.SemanticType) || [];
table.SemanticMetadata = {
  ...table.SemanticMetadata,
  ColumnMetadata: [...retained, {
    ColumnNames: ['comune_principale'],
    ColumnProperties: [...cityProperties, { SemanticType: { GeographicalRole: 'CITY' } }]
  }]
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
fs.writeFileSync(path.join(here, 'structures-geo.request.json'), JSON.stringify(request, null, 2) + '\n');
console.log('Richiesta di geolocalizzazione dei comuni pronta.');
