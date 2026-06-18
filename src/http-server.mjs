import http from 'node:http';
import { z } from 'zod';
import { getHostUrl, getToken, log } from './api.mjs';

const allowedOrigin = process.env.SONARQUBE_HTTP_ALLOWED_ORIGINS || '';

const cors = () => allowedOrigin ? {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
} : {};

const sendJson = (res, status, data, headers) => {
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

const parseJson = async (req) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
};

const handleRequest = async (req, res, tools, toolMap, schemas, host, port) => {
  const url = new URL(req.url || '/', `http://${host}:${port}`);
  const corsHeaders = cors();

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  const send = (status, data) => sendJson(res, status, data, corsHeaders);

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

const handleToolExecution = async (toolName, req, res, send, toolMap, schemas) => {
  const tool = toolMap.get(toolName);
  if (!tool) { send(404, { error: `Unknown tool: ${toolName}` }); return; }
  const body = await parseJson(req);
  if (!body) { send(400, { error: 'Invalid JSON body' }); return; }
  try {
    const params = schemas[toolName].parse(body);
    const data = await tool.handler(params);
    send(200, typeof data === 'string' ? { result: data } : data);
  } catch (e) {
    send(400, { error: (/** @type {Error} */ (e)).message });
  }
};

export const startHttpServer = async (tools) => {
  const host = process.env.SONARQUBE_HTTP_HOST || '127.0.0.1';
  const port = Number.parseInt(process.env.SONARQUBE_HTTP_PORT || '8080', 10);

  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const schemas = {};
  for (const t of tools) schemas[t.name] = z.object(t.schema).strict();

  const server = http.createServer((req, res) => {
    handleRequest(req, res, tools, toolMap, schemas, host, port);
  });

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      log(`HTTP server listening on http://${host}:${port}`);
      log(`  GET  /health          — health check`);
      log(`  GET  /tools           — list tools`);
      log(`  POST /tools/:name     — execute a tool`);
      resolve(server);
    });
    server.on('error', reject);
  });
};
