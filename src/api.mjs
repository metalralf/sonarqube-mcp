// @ts-check
const env = (/** @type {string} */ name, /** @type {string} */ fallback = '') => /** @type {string} */ (process.env[name] ?? fallback);

/** @returns {string} */
export const getHostUrl = () => env('SONARQUBE_URL', 'http://localhost:9000').replace(/\/$/, '');
/** @returns {string} */
export const getToken = () => env('SONARQUBE_TOKEN');

/** @returns {number} */
const getApiTimeout = () => Number.parseInt(env('SONARQUBE_API_TIMEOUT', '5000'), 10);

/** @param {string} m */
const log = (m) => process.stderr.write(`[sonarqube-mcp] ${m}\n`);

/** @returns {string} */
const authHeader = () => {
  const scheme = env('SONARQUBE_AUTH_SCHEME');
  const token = getToken();
  return scheme === 'bearer'
    ? `Bearer ${token}`
    : `Basic ${Buffer.from(token + ':').toString('base64')}`;
};

/** @returns {string} */
const instanceHint = () => {
  const url = getHostUrl();
  try {
    const { hostname } = new URL(url);
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      return `Is SonarQube running? Start it with:\n  docker run -d --name sonarqube -p 9000:9000 sonarqube:community\n\nOr check your SONARQUBE_URL=${url}`;
    }
    return `Is the server at ${url} reachable? Check network, firewall, or DNS.`;
  } catch {
    return `SONARQUBE_URL="${url}" is not a valid URL. Set SONARQUBE_URL=http://your-server:9000`;
  }
};

/**
 * @typedef {Object} ServerHealth
 * @property {boolean} reachable
 * @property {number} [status]
 * @property {string} [health]
 * @property {string} [error]
 * @property {string} [hint]
 */

/** @returns {Promise<ServerHealth>} */
export const sonarCheckServer = async () => {
  try {
    const res = await fetch(`${getHostUrl()}/api/system/health`, { headers: { authorization: authHeader() }, signal: AbortSignal.timeout(getApiTimeout()) });
    if (!res.ok) return { reachable: true, status: res.status };
    const body = await res.json();
    return { reachable: true, health: (/** @type {any} */ (body)).health };
  } catch (/** @type {unknown} */ e) {
    return { reachable: false, error: (/** @type {Error} */ (e)).message, hint: instanceHint() };
  }
};

/**
 * @param {string} path
 * @param {string} body
 * @returns {Promise<any>}
 */
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
    const detail = typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed);
    throw new Error(`SonarQube ${res.status}: ${detail}`);
  }
  return /** @type {any} */ (parsed);
};

/**
 * @param {string} path
 * @returns {Promise<any>}
 */
export const sonarGet = async (path) => {
  if (!getToken()) throw new Error('SONARQUBE_TOKEN is not set');
  let res;
  try {
    res = await fetch(`${getHostUrl()}${path}`, { headers: { authorization: authHeader() } });
  } catch (/** @type {unknown} */ e) {
    throw new Error(`Cannot reach SonarQube at ${getHostUrl()} (${(/** @type {Error} */ (e)).message}).\n\n${instanceHint()}`);
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const detail = typeof body === 'object' ? JSON.stringify(body) : String(body);
    if (res.status === 403 && path.startsWith('/api/hotspots/')) {
      throw new Error('SonarQube 403: security hotspots require a User token (squ_ prefix) with Browse permission. Project/Global analysis tokens (sqp_/sqa_) cannot read hotspots.');
    }
    throw new Error(`SonarQube ${res.status}: ${detail}`);
  }
  return /** @type {any} */ (body);
};

/** @returns {string} */
export const orgQuery = () => {
  const org = env('SONARQUBE_ORGANIZATION');
  return org ? `&organization=${encodeURIComponent(org)}` : '';
};

/**
 * @param {{ projectKey?: string }} [args]
 * @returns {string}
 */
export const resolveProjectKey = (args = {}) => {
  const defaultProject = env('SONARQUBE_PROJECT');
  if (args.projectKey) return args.projectKey;
  if (defaultProject) return defaultProject;
  throw new Error('projectKey required — set SONARQUBE_PROJECT or pass projectKey');
};

/**
 * @template T
 * @param {T & { paging?: { total: number; pageSize: number } }} data
 * @returns {T & { _truncated?: boolean }}
 */
export const maybeTruncated = (data) => {
  const d = /** @type {T & { paging?: { total: number; pageSize: number }; _truncated?: boolean }} */ (data);
  if (d.paging) d._truncated = d.paging.total > d.paging.pageSize;
  return d;
};

export { log };
