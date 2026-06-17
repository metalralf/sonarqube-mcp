import { sonarGet, orgQuery, resolveProjectKey, maybeTruncated, HOST } from './api.mjs';
import { DEFAULT_METRIC_KEYS } from './config.mjs';

const encode = (v) => encodeURIComponent(v);

export const HANDLERS = {
  sonar_search_projects: async (args) => {
    const params = new URLSearchParams({ ps: String(Math.min(Number(args.limit) || 50, 500)) });
    if (args.query) params.set('q', args.query);
    return maybeTruncated(await sonarGet(`/api/projects/search?${params.toString()}${orgQuery()}`));
  },

  sonar_quality_gate: async (args) => {
    const pk = resolveProjectKey(args);
    return sonarGet(`/api/qualitygates/project_status?projectKey=${encode(pk)}`);
  },

  sonar_measures: async (args) => {
    const pk = resolveProjectKey(args);
    const metricKeys = args.metricKeys || DEFAULT_METRIC_KEYS;
    return sonarGet(`/api/measures/component?component=${encode(pk)}&metricKeys=${encode(metricKeys)}`);
  },

  sonar_issues: async (args) => {
    const pk = resolveProjectKey(args);
    const params = new URLSearchParams({
      componentKeys: pk,
      resolved: String(Boolean(args.resolved)),
      ps: String(Math.min(Number(args.limit) || 30, 500)),
      s: 'SEVERITY',
      asc: 'false',
    });
    if (args.severities) params.set('severities', args.severities);
    if (args.types) params.set('types', args.types);
    return maybeTruncated(await sonarGet(`/api/issues/search?${params.toString()}`));
  },

  sonar_hotspots: async (args) => {
    const pk = resolveProjectKey(args);
    const params = new URLSearchParams({
      projectKey: pk,
      status: args.status || 'TO_REVIEW',
      ps: String(Math.min(Number(args.limit) || 30, 500)),
    });
    return maybeTruncated(await sonarGet(`/api/hotspots/search?${params.toString()}`));
  },

  sonar_rule: async (args) => {
    if (!args.ruleKey) throw new Error('ruleKey is required');
    return sonarGet(`/api/rules/show?key=${encode(args.ruleKey)}`);
  },

  sonar_source: async (args) => {
    if (!args.key) throw new Error('key (component key) is required');
    const params = new URLSearchParams({ key: args.key });
    if (args.from) params.set('from', String(args.from));
    if (args.to) params.set('to', String(args.to));
    return sonarGet(`/api/sources/lines?${params.toString()}`);
  },

  sonar_analysis_status: async (args) => {
    const pk = resolveProjectKey(args);
    const proj = await sonarGet(`/api/projects/search?q=${encode(pk)}&ps=1`).catch(() => null);
    if (!proj?.components?.length) {
      return { status: 'NOT_FOUND', message: `Project "${pk}" does not exist on ${HOST}. Run sonar-scanner first:\n\n  sonar-scanner -Dsonar.login=squ_...\n\nOr create it via the SonarQube UI, then run analysis.` };
    }
    const analyses = await sonarGet(`/api/project_analyses/search?project=${encode(pk)}&ps=1`).catch(() => null);
    if (!analyses?.analyses?.length) {
      return { status: 'NOT_ANALYZED', message: `Project "${pk}" exists but has no analysis data. Run sonar-scanner:\n\n  sonar-scanner -Dsonar.login=squ_...` };
    }
    const last = analyses.analyses[0];
    return { status: 'ANALYZED', lastAnalysis: last.date, projectUrl: `${HOST}/dashboard?id=${encode(pk)}`, message: `Project "${pk}" was last analyzed on ${last.date}.` };
  },

  sonar_raw: async (args) => {
    if (!args.path?.startsWith('/')) throw new Error('path must start with /');
    return sonarGet(args.path);
  },
};
