const env = (name, fallback = '') => process.env[name] ?? fallback;

export const getHostUrl = () => env('SONARQUBE_URL', 'http://localhost:9000').replace(/\/$/, '');
export const getToken = () => env('SONARQUBE_TOKEN');

const log = (m) => process.stderr.write(`[sonarqube-mcp] ${m}\n`);
const authHeader = () =>
  env('SONARQUBE_AUTH_SCHEME') === 'bearer'
    ? `Bearer ${getToken()}`
    : `Basic ${Buffer.from(getToken() + ':').toString('base64')}`;

export const sonarPost = async (path, body) => {
  if (!getToken()) throw new Error('SONARQUBE_TOKEN is not set');
  const res = await fetch(`${getHostUrl()}${path}`, {
    method: 'POST',
    headers: { authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!res.ok) {
    const detail = typeof parsed === 'object' ? JSON.stringify(parsed) : parsed;
    throw new Error(`SonarQube ${res.status}: ${detail}`);
  }
  return parsed;
};

export const sonarGet = async (path) => {
  if (!getToken()) throw new Error('SONARQUBE_TOKEN is not set');
  const res = await fetch(`${getHostUrl()}${path}`, { headers: { authorization: authHeader() } });
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

export const orgQuery = () => {
  const org = env('SONARQUBE_ORGANIZATION');
  return org ? `&organization=${encodeURIComponent(org)}` : '';
};

export const resolveProjectKey = (args) => {
  const defaultProject = env('SONARQUBE_PROJECT');
  if (args.projectKey) return args.projectKey;
  if (defaultProject) return defaultProject;
  throw new Error('projectKey required — set SONARQUBE_PROJECT or pass projectKey');
};

export const maybeTruncated = (data) => {
  if (data.paging) data._truncated = data.paging.total > data.paging.pageSize;
  return data;
};

export { log };
