import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, describe, it } from 'node:test';

describe('index.mjs HTTP transport', () => {
  /** @type {import('node:child_process').ChildProcess} */
  let proc;

  after(() => {
    if (proc && !proc.killed) proc.kill();
  });

  it('starts HTTP server when SONARQUBE_TRANSPORT=http', async () => {
    proc = spawn('node', ['src/index.mjs'], {
      env: {
        ...process.env,
        SONARQUBE_TRANSPORT: 'http',
        SONARQUBE_HTTP_PORT: '0',
        SONARQUBE_HTTP_HOST: '127.0.0.1',
        SONARQUBE_URL: 'http://test:9000',
        SONARQUBE_TOKEN: 'squ_testtoken',
        SONARQUBE_PROJECT: 'testproj',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stderrLines = [];
    proc.stderr.on('data', (chunk) => {
      stderrLines.push(chunk.toString());
    });

    const stderrText = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `timeout waiting for server. stderr: ${stderrLines.join('')}`,
          ),
        );
      }, 5000);
      proc.stderr.on('data', () => {
        const text = stderrLines.join('');
        const match = text.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });
    });

    const port = Number.parseInt(stderrText, 10);
    assert.ok(port > 0, `expected valid port, got ${port}`);

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.token, 'set');

    proc.kill();
  });

  it('reports token=set and project in stderr', async () => {
    proc = spawn('node', ['src/index.mjs'], {
      env: {
        ...process.env,
        SONARQUBE_URL: 'http://test:9000',
        SONARQUBE_TOKEN: 'squ_testtoken',
        SONARQUBE_PROJECT: 'myproj',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stderrLines = [];
    proc.stderr.on('data', (chunk) => {
      stderrLines.push(chunk.toString());
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`timeout. stderr: ${stderrLines.join('')}`));
      }, 5000);
      proc.stderr.on('data', () => {
        const text = stderrLines.join('');
        if (text.includes('ready')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    const text = stderrLines.join('');
    assert.match(text, /token=set/);
    assert.match(text, /project=myproj/);

    proc.stdin.end();
    await new Promise((r) => setTimeout(r, 100));
    if (!proc.killed) proc.kill();
  });

  it('reports token=MISSING when no token', async () => {
    proc = spawn('node', ['src/index.mjs'], {
      env: {
        ...process.env,
        SONARQUBE_URL: 'http://test:9000',
        SONARQUBE_PROJECT: 'testproj',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stderrLines = [];
    proc.stderr.on('data', (chunk) => {
      stderrLines.push(chunk.toString());
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`timeout. stderr: ${stderrLines.join('')}`));
      }, 5000);
      proc.stderr.on('data', () => {
        const text = stderrLines.join('');
        if (text.includes('ready')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    const text = stderrLines.join('');
    assert.match(text, /token=MISSING/);

    proc.stdin.end();
    await new Promise((r) => setTimeout(r, 100));
    if (!proc.killed) proc.kill();
  });
});
