import { HOST, TOKEN, DEFAULT_PROJECT, ORGANIZATION, AUTH_SCHEME } from './config.mjs';

const log = (m) => process.stderr.write(`[sonarqube-mcp] ${m}\n`);
const authHeader = () =>
  AUTH_SCHEME === 'bearer'
    ? `Bearer ${TOKEN}`
    : `Basic ${Buffer.from(TOKEN + ':').toString('base64')}`;

export const sonarGet = async (path) => {
  if (!TOKEN) throw new Error('SONARQUBE_TOKEN is not set');
  const res = await fetch(`${HOST}${path}`, { headers: { authorization: authHeader() } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const detail = typeof body === 'object' ? JSON.stringify(body) : body;
    if (res.status === 403 && path.startsWith('/api/hotspots/')) {
      throw new Error('SonarQube 403: security hotspots require a User token (squ_ prefix) with Browse permission. Project/Global analysis tokens (sqp_/sqa_) cannot read hotspots.');
    }
    throw new Error(`SonarQube ${res.status}: ${detail}`);
  }
  return body;
};

export const orgQuery = () => ORGANIZATION ? `&organization=${encodeURIComponent(ORGANIZATION)}` : '';

export const resolveProjectKey = (args) => args.projectKey || DEFAULT_PROJECT || (() => { throw new Error('projectKey required — set SONARQUBE_PROJECT or pass projectKey'); })();

export const maybeTruncated = (data) => {
  if (data.paging) data._truncated = data.paging.total > data.paging.pageSize;
  return data;
};

export { HOST, log };
