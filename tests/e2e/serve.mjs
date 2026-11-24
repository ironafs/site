import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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

    response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    response.setHeader('Accept-Ranges', 'bytes');
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
    response.setHeader('Content-Length', Math.max(0, end - start + 1));
    if (request.method === 'HEAD' || info.size === 0) response.end();
    else {
      const stream = createReadStream(file, { start, end });
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    }
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 500, { 'Content-Type': types['.txt'] });
    response.end(error instanceof URIError ? 'Bad request' : 'Unable to serve the production build');
  }
}).listen(Number(process.env.PORT || 4321), '127.0.0.1');
