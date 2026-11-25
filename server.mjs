import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadData, buildView, buildDetail, buildWorkspace, filtersFor, VIEW_IDS } from './lib/data.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const data = loadData(path.join(root, 'data'));
const port = Number(process.env.PORT || 4173);
const host = '127.0.0.1';
const configPath = path.join(root, 'config.local.json');
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
const execFileAsync = promisify(execFile);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(body));
}

async function embedUrl(view) {
  const dashboardId = config.dashboards?.[view];
  if (!dashboardId || !config.accountId || !config.userArn) throw new Error('Dashboard QuickSight non configurata per questa vista.');
  const awsCli = config.awsCliPath || process.env.AWS_CLI_PATH || 'aws';
  const args = [
    'quicksight', 'generate-embed-url-for-registered-user',
    '--aws-account-id', config.accountId,
    '--user-arn', config.userArn,
    '--experience-configuration', `Dashboard={InitialDashboardId=${dashboardId}}`,
    '--allowed-domains', `http://localhost:${port}`,
    '--session-lifetime-in-minutes', '60',
    '--region', config.region || 'eu-central-1',
    '--output', 'json'
  ];
  if (config.awsProfile) args.push('--profile', config.awsProfile);
  let stdout;
  try {
    ({ stdout } = await execFileAsync(awsCli, args, { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 }));
  } catch (error) {
    const detail = `${error.stderr || ''} ${error.message || ''}`;
    if (/token has expired|refresh failed|UnauthorizedSSOTokenError|SSO session/i.test(detail)) {
      throw new Error(`Sessione AWS scaduta. Esegui aws sso login --profile "${config.awsProfile || 'NOME_PROFILO'}" in un altro terminale, poi riprova.`);
    }
    if (/AccessDenied|not authorized|UnsupportedUserEdition/i.test(detail)) throw new Error('Accesso QuickSight non consentito: verifica i permessi di embedding e la condivisione della dashboard.');
    throw new Error('Impossibile aprire QuickSight. Verifica la connessione AWS e riprova.');
  }
  const result = JSON.parse(stdout);
  if (!result.EmbedUrl) throw new Error('QuickSight non ha restituito un URL incorporabile.');
  return result.EmbedUrl;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://localhost:${port}`);
  try {
    if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(request.headers.host)) return json(response, 403, { error: 'Host non consentito' });
    if (request.headers.origin && request.headers.origin !== `http://localhost:${port}` && request.headers.origin !== `http://127.0.0.1:${port}`) return json(response, 403, { error: 'Origine non consentita' });
    if (!['GET', 'HEAD'].includes(request.method)) return json(response, 405, { error: 'Metodo non consentito' });
    if (url.pathname === '/api/bootstrap') {
      return json(response, 200, { apiVersion: 2, views: VIEW_IDS, filters: filtersFor(data), quicksight: { configured: Boolean(config.accountId && config.userArn), dashboards: Object.keys(config.dashboards || {}), sheets: config.sheets || {} } });
    }
    if (url.pathname === '/api/workspace') {
      return json(response, 200, buildWorkspace(data, url.searchParams.get('assignee')));
    }
    if (url.pathname.startsWith('/api/views/')) {
      const view = url.pathname.split('/').pop();
      if (!VIEW_IDS.includes(view)) return json(response, 404, { error: 'Vista sconosciuta' });
      const filters = { ulss: url.searchParams.get('ulss') || '', type: url.searchParams.get('type') || '' };
      return json(response, 200, buildView(data, view, filters));
    }
    if (url.pathname.startsWith('/api/embed/')) {
      const view = url.pathname.split('/').pop();
      if (!VIEW_IDS.includes(view) && view !== 'workspace') return json(response, 404, { error: 'Vista sconosciuta' });
      if (!config.dashboards?.[view]) return json(response, 409, { error: 'Dashboard QuickSight non ancora configurata per questa vista.' });
      try { return json(response, 200, { url: await embedUrl(view) }); }
      catch (error) { return json(response, 503, { error: error.message, code: error.name || 'EmbedError' }); }
    }
    if (url.pathname.startsWith('/api/detail/')) {
      const [, , , view, id] = url.pathname.split('/');
      if (!VIEW_IDS.includes(view) || !id) return json(response, 404, { error: 'Record non trovato' });
      const detail = buildDetail(data, view, decodeURIComponent(id));
      return detail ? json(response, 200, detail) : json(response, 404, { error: 'Record non trovato' });
    }
    const relative = url.pathname === '/' ? '/index.html' : url.pathname;
    const webRoot = path.join(root, 'web');
    const file = path.resolve(webRoot, '.' + relative);
    if (!file.startsWith(webRoot + path.sep)) return json(response, 403, { error: 'Accesso negato' });
    const stat = await fs.promises.stat(file).catch(() => null);
    if (!stat?.isFile()) return json(response, 404, { error: 'Pagina non trovata' });
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    if (request.method === 'HEAD') return response.end();
    fs.createReadStream(file).pipe(response);
  } catch (error) {
    json(response, 500, { error: error.message });
  }
});

server.listen(port, host, () => console.log(`Demo BI disponibile su http://localhost:${port}`));
