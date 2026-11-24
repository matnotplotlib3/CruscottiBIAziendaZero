import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const configPath = path.join(root, 'config.local.json');
if (!fs.existsSync(configPath)) throw new Error('Crea config.local.json da config.example.json prima di leggere i dataset AWS.');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const aws = process.env.AWS_CLI_PATH || config.awsCliPath || 'aws';
const profile = process.env.AWS_PROFILE || config.awsProfile;
const region = process.env.AWS_REGION || config.region || 'eu-central-1';
const account = process.env.AWS_ACCOUNT_ID || config.accountId;
if (!account) throw new Error('accountId mancante in config.local.json');
const files = fs.readdirSync(path.join(root, 'data')).filter(name => name.endsWith('.csv')).sort();

function call(command, args) {
  const cliArgs = ['quicksight', command, ...args, '--aws-account-id', account, '--region', region, '--output', 'json'];
  if (profile) cliArgs.push('--profile', profile);
  const output = execFileSync(aws, cliArgs, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  return JSON.parse(output);
}

const list = call('list-data-sets', []).DataSetSummaries;
const usedByAnalysis = new Map();
if (config.analysisId) {
  const analysis = call('describe-analysis-definition', ['--analysis-id', config.analysisId]);
  for (const entry of analysis.Definition.DataSetIdentifierDeclarations || []) usedByAnalysis.set(entry.Identifier, entry.DataSetArn);
}
const datasets = [];
for (const name of files) {
  const matches = list.filter(row => row.Name === name);
  if (!matches.length) throw new Error(`Dataset QuickSight assente: ${name}`);
  const override = config.datasetIds?.[name];
  const selected = override ? matches.find(row => row.DataSetId === override)
    : matches.find(row => row.Arn === usedByAnalysis.get(name)) || (matches.length === 1 ? matches[0] : null);
  if (!selected) throw new Error(`Più dataset con nome ${name}: indica l'ID giusto in datasetIds di config.local.json.`);
  const response = call('describe-data-set', ['--data-set-id', selected.DataSetId]);
  datasets.push({ name, id: selected.DataSetId, arn: selected.Arn, columns: response.DataSet.OutputColumns.map(({ Name, Type }) => ({ name: Name, type: Type })) });
  process.stdout.write(`Verificato ${name}: ${response.DataSet.OutputColumns.length} colonne\n`);
}
fs.writeFileSync(path.join(here, 'schemas.snapshot.json'), JSON.stringify({ account, region, datasets }, null, 2) + '\n');
