import { CODES, CodedError } from './errors.js';

export const MAX_BODY_BYTES = 2 * 1024 * 1024;

// Status per refusal the HTTP layer raises itself.
export const HTTP_CODES = Object.freeze({ PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE', UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE' });

// The path of a request target, or null when the target is not a valid URL.
export function parsePathname(target) {
  try { return new URL(target, 'http://localhost').pathname; } catch { return null; }
}

export function sendJson(res, status, value) {
  if (res.headersSent) return res.end();
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}

const JSON_TYPE = /^application\/json\s*(;|$)/i;

export function requireJson(req) {
  if (!JSON_TYPE.test(req.headers['content-type'] ?? '')) {
    throw new CodedError(HTTP_CODES.UNSUPPORTED_MEDIA_TYPE, 'Content-Type must be application/json');
  }
}

// An empty body reads as {}.
export function readJsonBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) { done = true; reject(new CodedError(HTTP_CODES.PAYLOAD_TOO_LARGE, `body larger than ${limit} bytes`)); req.resume(); return; }
      chunks.push(c);
    });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
    req.on('end', () => {
      if (done) return;
      done = true;
      const text = Buffer.concat(chunks).toString('utf8');
      if (text === '') return resolve({});
      try { resolve(JSON.parse(text)); } catch { reject(new CodedError(CODES.BAD_REQUEST, 'body is not valid JSON')); }
    });
  });
}
