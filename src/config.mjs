export const HOST = (process.env.SONARQUBE_URL ?? 'http://localhost:9000').replace(/\/$/, '');
export const TOKEN = process.env.SONARQUBE_TOKEN ?? '';
export const DEFAULT_PROJECT = process.env.SONARQUBE_PROJECT ?? '';
export const ORGANIZATION = process.env.SONARQUBE_ORGANIZATION ?? '';
export const AUTH_SCHEME = process.env.SONARQUBE_AUTH_SCHEME ?? 'basic';
export const DEFAULT_METRIC_KEYS = 'bugs,vulnerabilities,code_smells,security_hotspots,coverage,duplicated_lines_density,ncloc,reliability_rating,security_rating,sqale_rating';
