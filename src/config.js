import path from 'node:path';

// cc passes PORT and CONDUCTOR_PLUGIN_DATA_DIR to the backend; cc never creates the data dir (server.js does).
// Port 0 binds an ephemeral port.
export function loadConfig(env = process.env) {
  const dataDir = env.CONDUCTOR_PLUGIN_DATA_DIR;
  if (!dataDir) throw new Error("CONDUCTOR_PLUGIN_DATA_DIR is not set: it names code-library's data directory");
  const port = env.PORT === undefined || env.PORT === '' ? 0 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`PORT is not a valid port: ${env.PORT}`);
  return { port, dataDir: path.resolve(dataDir) };
}
