#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { TOOLS } from './tools.mjs';
import { HANDLERS } from './handlers.mjs';
import { HOST, log } from './api.mjs';
import { DEFAULT_PROJECT, TOKEN } from './config.mjs';

const server = new McpServer({ name: 'sonarqube-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });

server.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const handler = HANDLERS[req.params.name];
  if (!handler) {
    return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }], isError: true };
  }
  try {
    const data = await handler(req.params.arguments ?? {});
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return { content: [{ type: 'text', text }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
log(`ready — host=${HOST} project=${DEFAULT_PROJECT || '(none)'} token=${TOKEN ? 'set' : 'MISSING'}`);
