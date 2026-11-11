// Entry: build state, wire each part once, listen.
import fs from 'node:fs';
import { createApp } from './src/app.js';
import { loadConfig } from './src/config.js';
import { createLibrary } from './src/library.js';
import { createMcp } from './src/mcp.js';

const config = loadConfig();
fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
const library = createLibrary({ dir: config.dataDir });
const server = createApp({ mcp: createMcp({ library }), dataDir: config.dataDir });

server.listen(config.port, '127.0.0.1', () => {
  const { address, port } = server.address();
  console.log(`code-library listening on ${address}:${port} (data: ${config.dataDir})`);
});

function shutdown() {
  server.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
