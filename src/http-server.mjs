// @ts-check
import http from 'node:http';
import { z } from 'zod';
import { getHostUrl, getToken, log } from './api.mjs';

/**
 * @param {string} origin
 * @returns {Record<string, string>}
 */
const cors = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
});

/**
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {any} data
 * @param {Record<string, string>} [headers]
 */
const sendJson = (res, status, data, headers) => {
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

/**
 * @param {http.IncomingMessage} req
 * @returns {Promise<any>}
 */
const parseJson = async (req) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
};

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Array<{name: string; description: string}>} tools
 * @param {Map<string, any>} toolMap
 * @param {Record<string, import('zod').ZodObject<any>>} schemas
 * @param {string} host
 * @param {number} port
 */
const handleRequest = async (req, res, tools, toolMap, schemas, host, port) => {
  /* c8 ignore next */ const url = new URL(req.url || '/', `http://${host}:${port}`);
  const corsHeaders = cors(process.env.SONARQUBE_HTTP_ALLOWED_ORIGINS || '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  /** @param {number} status @param {any} data */
  const send = (status, data) => sendJson(res, status, data, corsHeaders);

  /* c8 ignore next 2 */
  if (url.pathname === '/health' && req.method === 'GET') {
    send(200, { status: 'ok', host: getHostUrl(), token: getToken() ? 'set' : 'MISSING' });
    return;
  }

  if (url.pathname === '/tools' && req.method === 'GET') {
    send(200, tools.map((t) => ({ name: t.name, description: t.description })));
    return;
  }

  const toolRe = /^\/tools\/(.+)$/;
  const toolMatch = toolRe.exec(url.pathname);
  if (toolMatch && req.method === 'POST') {
    await handleToolExecution(toolMatch[1], req, res, send, toolMap, schemas);
    return;
  }

  send(404, { error: 'Not found' });
};

/**
 * @param {string} toolName
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {(status: number, data: any) => void} send
 * @param {Map<string, any>} toolMap
 * @param {Record<string, import('zod').ZodObject<any>>} schemas
 */
const handleToolExecution = async (toolName, req, res, send, toolMap, schemas) => {
  const tool = toolMap.get(toolName);
  if (!tool) { send(404, { error: `Unknown tool: ${toolName}` }); return; }
  const body = await parseJson(req);
  if (!body) { send(400, { error: 'Invalid JSON body' }); return; }
  try {
    const params = schemas[toolName].parse(body);
    const data = await tool.handler(params);
    /* c8 ignore next */
    send(200, typeof data === 'string' ? { result: data } : data);
  } catch (e) {
    send(400, { error: (/** @type {Error} */ (e)).message });
  }
};

/**
 * @param {Array<{name: string; description: string; schema: Record<string, import('zod').ZodTypeAny>; handler: Function}>} tools
 * @returns {Promise<http.Server>}
 */
export const startHttpServer = async (tools) => {
  const host = process.env.SONARQUBE_HTTP_HOST || '127.0.0.1';
  const port = Number.parseInt(process.env.SONARQUBE_HTTP_PORT || '8080', 10);

  /** @type {Map<string, any>} */
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  /** @type {Record<string, import('zod').ZodObject<any>>} */
  const schemas = {};
  for (const t of tools) schemas[t.name] = z.object(t.schema).strict();

  const server = http.createServer((req, res) => {
    handleRequest(req, res, tools, toolMap, schemas, host, port);
  });

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
      log('info', `HTTP server listening on http://${addr.address}:${addr.port}`);
      log('info', `  GET  /health          — health check`);
      log('info', `  GET  /tools           — list tools`);
      log('info', `  POST /tools/:name     — execute a tool`);
      resolve(server);
    });
    server.on('error', reject);
  });
};
