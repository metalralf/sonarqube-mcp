#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { z } from 'zod';
import { TOOL_CONFIGS } from './handlers.mjs';
import { getHostUrl, getToken, log } from './api.mjs';

const server = new McpServer({ name: 'sonarqube-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });

for (const { name, description, schema, handler } of TOOL_CONFIGS) {
  server.registerTool(name, { description, inputSchema: z.object(schema).strict() }, async (params) => {
    const data = await handler(params);
    return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
  });
}

await server.connect(new StdioServerTransport());
const defaultProject = process.env.SONARQUBE_PROJECT ?? '';
log(`ready — host=${getHostUrl()} project=${defaultProject || '(none)'} token=${getToken() ? 'set' : 'MISSING'}`);
