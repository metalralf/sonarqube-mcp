// @ts-check
import { z } from 'zod';
import { sonarGet, sonarPost, sonarCheckServer, orgQuery, resolveProjectKey, maybeTruncated, getHostUrl } from './api.mjs';
export { sonarGet, sonarPost, sonarCheckServer, orgQuery, resolveProjectKey, maybeTruncated, getHostUrl };

/**
 * @param {string} v
 * @returns {string}
 */
export const encode = (v) => encodeURIComponent(v);

/**
 * @callback ToolHandler
 * @param {Object} params
 * @returns {Promise<any>}
 */

/**
 * @typedef {Object} ToolConfig
 * @property {string} name
 * @property {string} description
 * @property {Record<string, import('zod').ZodTypeAny>} schema
 * @property {ToolHandler} handler
 */

/**
 * @param {string} name
 * @param {string} description
 * @param {Record<string, import('zod').ZodTypeAny>} schema
 * @param {ToolHandler} handler
 * @returns {ToolConfig}
 */
export const tool = (name, description, schema, handler) => ({ name, description, schema, handler });

export const projectKey = /** @type {import('zod').ZodOptional<import('zod').ZodString>} */ (z.string().optional().describe('Project key (defaults to SONARQUBE_PROJECT)'));
export const componentKey = /** @type {import('zod').ZodString} */ (z.string().describe('Full component key (e.g. my-project:src/file.ts)'));
export const maxResults = /** @type {import('zod').ZodOptional<import('zod').ZodNumber>} */ (z.number().optional().describe('Max results (default 50, max 500)'));

/**
 * @param {string} key
 * @returns {void}
 */
export const requireKey = (key) => { if (!key) throw new Error('key (component key) is required'); };

/**
 * @param {string} key
 * @param {number | undefined} from
 * @param {number | undefined} to
 * @returns {URLSearchParams}
 */
export const componentParams = (key, from, to) => {
  const params = new URLSearchParams({ key });
  if (from) params.set('from', String(from));
  if (to) params.set('to', String(to));
  return params;
};

/**
 * @param {string} metricKey
 * @param {string} valueKey
 * @param {number} defaultThresh
 * @param {boolean} descend
 * @returns {ToolHandler}
 */
export const measureSearch = (metricKey, valueKey, defaultThresh, descend) => async ({ projectKey, threshold }) => {
  const key = resolveProjectKey({ projectKey });
  const t = threshold ?? defaultThresh;
  const data = await sonarGet(`/api/measures/search?projectKeys=${encode(key)}&metricKeys=${metricKey}&ps=500`);
  const extract = (/** @type {any} */ m) => ({ path: m.component.split(':').pop(), [valueKey]: Number.parseFloat(m.value) });
  const items = (data.measures || []).filter((/** @type {any} */ m) => m.value !== undefined && m.component !== key && m.component);
  const sorted = items.map(extract).filter((/** @type {any} */ f) => (descend ? f[valueKey] > t : f[valueKey] < t)).sort((/** @type {any} */ a, /** @type {any} */ b) => descend ? b[valueKey] - a[valueKey] : a[valueKey] - b[valueKey]);
  return { total: items.length, threshold: t, files: sorted };
};

/** @type {Record<string, string[]>} */
export const TOOL_CATEGORIES = {
  projects: ['sonar_search_projects', 'sonar_summary', 'sonar_analysis_status', 'sonar_project_details', 'sonar_projects_create'],
  issues: ['sonar_issues', 'sonar_issues_summary', 'sonar_new_issues', 'sonar_set_issue_status', 'sonar_issues_bulk_transition'],
  hotspots: ['sonar_hotspots', 'sonar_hotspot_details', 'sonar_change_hotspot_status'],
  quality: ['sonar_quality_gate', 'sonar_list_quality_gates', 'sonar_measures', 'sonar_search_metrics'],
  coverage: ['sonar_coverage_files', 'sonar_file_coverage_details'],
  duplications: ['sonar_search_duplicated_files', 'sonar_duplications'],
  history: ['sonar_metrics_history'],
  worst: ['sonar_worst_metrics'],
  scm: ['sonar_source', 'sonar_scm_info'],
  branches: ['sonar_list_branches', 'sonar_list_pull_requests'],
  admin: ['sonar_list_webhooks', 'sonar_list_languages', 'sonar_ping', 'sonar_setup_scanner', 'sonar_run_analysis'],
  rules: ['sonar_rule'],
  raw: ['sonar_raw'],
};

/** @type {Set<string>} */
export const READ_ONLY_TOOLS = new Set(['sonar_set_issue_status', 'sonar_change_hotspot_status', 'sonar_run_analysis', 'sonar_setup_scanner']);

/**
 * @param {ToolConfig[]} all
 * @returns {ToolConfig[]}
 */
export const filterTools = (all) => {
  const envToolsets = process.env.SONARQUBE_TOOLSETS || '';
  const readOnly = process.env.SONARQUBE_READ_ONLY === 'true';
  if (!envToolsets && !readOnly) return all;
  if (envToolsets) {
    const cats = envToolsets.split(',').map((s) => s.trim());
    const enabled = new Set(cats.flatMap((c) => TOOL_CATEGORIES[c] || []));
    if (enabled.size) return all.filter((t) => enabled.has(t.name) && !(readOnly && READ_ONLY_TOOLS.has(t.name)));
  }
  return readOnly ? all.filter((t) => !READ_ONLY_TOOLS.has(t.name)) : all;
};
