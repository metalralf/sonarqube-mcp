import http from 'node:http';
import { z } from 'zod';
import { getHostUrl, getToken, log } from './api.mjs';

export const startHttpServer = async (tools) => {
  const host = process.env.SONARQUBE_HTTP_HOST || '127.0.0.1';
  const port = Number.parseInt(process.env.SONARQUBE_HTTP_PORT || '8080', 10);

  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const schemas = {};
  for (const t of tools) schemas[t.name] = z.object(t.schema).strict();

  const parseJson = async (req) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    try { return JSON.parse(body); } catch { return null; }
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${host}:${port}`);
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    const send = (status, data) => {
      res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    if (url.pathname === '/health' && req.method === 'GET') {
      send(200, { status: 'ok', host: getHostUrl(), token: getToken() ? 'set' : 'MISSING' });
      return;
    }

    if (url.pathname === '/tools' && req.method === 'GET') {
      send(200, tools.map((t) => ({ name: t.name, description: t.description })));
      return;
    }

    const toolMatch = url.pathname.match(/^\/tools\/(.+)$/);
    if (toolMatch && req.method === 'POST') {
      const toolName = toolMatch[1];
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
      return;
    }

    send(404, { error: 'Not found' });
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
