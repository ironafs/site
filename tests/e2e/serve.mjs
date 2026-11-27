import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';

const root = fileURLToPath(new URL('../../dist/', import.meta.url));
const csp = "default-src 'self'; script-src 'self' https://www.googletagmanager.com; style-src 'self'; img-src 'self' data: https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com; font-src 'self'; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const headers = {
  'Content-Security-Policy': csp,
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// Caddy encodes text responses in production. The network budgets should see comparable transfer sizes.
const compressible = new Set(['.html', '.js', '.css', '.svg', '.xml', '.txt', '.json']);

function acceptsGzip(header = '') {
  const codings = new Map();
  for (const value of header.toLowerCase().split(',')) {
    const [coding, parameter] = value.split(';');
    const quality = parameter === undefined ? 1 : Number(/^\s*q\s*=\s*(\d+(?:\.\d*)?)\s*$/.exec(parameter)?.[1]);
    codings.set(coding.trim(), quality);
  }
  const quality = codings.get('gzip') ?? codings.get('*') ?? 0;
  return quality > 0 && quality <= 1;
}

createServer(async (request, response) => {
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);

  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(root, `.${pathname}`);
    const inside = path === resolve(root) || path.startsWith(`${resolve(root)}${sep}`);
    let file;
    let info;
    for (const candidate of inside ? [path, resolve(path, 'index.html')] : []) {
      try {
        const entry = await stat(candidate);
        if (entry.isFile()) { file = candidate; info = entry; break; }
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      }
    }
    if (!file) {
      file = resolve(root, '404.html');
      info = await stat(file);
      response.statusCode = 404;
    }

    const extension = extname(file);
    const canEncode = compressible.has(extension) && info.size >= 512;
    response.setHeader('Content-Type', types[extension] || 'application/octet-stream');
    response.setHeader('Accept-Ranges', 'bytes');
    if (canEncode) response.setHeader('Vary', 'Accept-Encoding');
    let start = 0;
    let end = info.size - 1;
      if (request.headers.range && response.statusCode === 200) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (range && (range[1] || range[2])) {
        start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
        end = range[1] && range[2] ? Math.min(Number(range[2]), end) : end;
      }
      if (!range || (!range[1] && !range[2]) || start > end || start >= info.size) {
        response.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
        response.end();
        return;
      }
      response.statusCode = 206;
      response.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
    }
    const gzip = canEncode && !request.headers.range && acceptsGzip(request.headers['accept-encoding']);
    if (gzip) {
      response.setHeader('Content-Encoding', 'gzip');
      response.removeHeader('Accept-Ranges');
    } else {
      response.setHeader('Content-Length', Math.max(0, end - start + 1));
    }
    if (request.method === 'HEAD' || info.size === 0) response.end();
    else {
      const stream = createReadStream(file, { start, end });
      pipeline(gzip ? [stream, createGzip(), response] : [stream, response], () => {});
    }
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 500, { 'Content-Type': types['.txt'] });
    response.end(error instanceof URIError ? 'Bad request' : 'Unable to serve the production build');
  }
}).listen(Number(process.env.PORT || 4321), '127.0.0.1');
