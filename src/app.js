import http from 'node:http';
import { CODES } from './errors.js';
import { parsePathname, readJsonBody, requireJson, sendJson, HTTP_CODES } from './http.js';

const STATUS = { [CODES.BAD_REQUEST]: 400, [HTTP_CODES.UNSUPPORTED_MEDIA_TYPE]: 415, [HTTP_CODES.PAYLOAD_TOO_LARGE]: 413 };

// Routes and guard. The plugin has no browser surface, so a request carrying an Origin header (which a browser always
// sends on a cross-site POST) is refused; cc's forward and the run module's fetch send none.
export function createApp({ mcp, dataDir }) {
  const routes = {
    '/api/health': { GET: async () => ({ ok: true }) },
    '/api/library-dir': { GET: async () => ({ dir: dataDir }) },
    '/api/mcp': {
      POST: async (req) => {
        requireJson(req);
        return mcp.handle(await readJsonBody(req));
      },
    },
  };

  return http.createServer(async (req, res) => {
    try {
      if (req.headers.origin !== undefined) return sendJson(res, 403, { error: 'browser requests are not accepted', code: 'FORBIDDEN' });
      const pathname = parsePathname(req.url);
      if (pathname === null) return sendJson(res, 400, { error: 'malformed request target', code: CODES.BAD_REQUEST });
      const route = Object.hasOwn(routes, pathname) ? routes[pathname] : null;
      if (!route) return sendJson(res, 404, { error: 'not found', code: 'NOT_FOUND' });
      const handler = Object.hasOwn(route, req.method) ? route[req.method] : null;
      if (!handler) return sendJson(res, 405, { error: `method ${req.method} not allowed`, code: 'METHOD_NOT_ALLOWED' });
      sendJson(res, 200, await handler(req));
    } catch (err) {
      const status = STATUS[err?.code] ?? 500;
      if (status === 500) console.error('code-library: request failed:', err);
      sendJson(res, status, { error: String(err?.message ?? err), code: err?.code ?? CODES.INTERNAL });
    }
  });
}
