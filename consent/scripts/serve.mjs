// Kleiner Server für die Demo: liefert consent/ aus und nimmt Nachweise unter /api/consent an.
// Die Nachweise landen nur im Speicher und auf der Konsole, ohne IP.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 4400);
const proofs = [];

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const stubPage = (title) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;padding:2rem">` +
  `<h1>${title}</h1><p>Platzhalter in der Demo.</p><p><a href="/demo/">Zurück zur Demo</a></p>`;

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/api/consent' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const proof = JSON.parse(body);
      proofs.push({ receivedAt: new Date().toISOString(), ...proof });
      console.log('Nachweis', JSON.stringify(proof));
      res.writeHead(204).end();
    } catch {
      res.writeHead(400).end();
    }
    return;
  }
  if (url.pathname === '/api/consent') {
    res.writeHead(200, { 'Content-Type': types['.json'], 'Cache-Control': 'no-store' }).end(JSON.stringify(proofs));
    return;
  }
  if (url.pathname === '/') {
    res.writeHead(302, { Location: '/demo/' }).end();
    return;
  }
  if (url.pathname === '/datenschutz' || url.pathname === '/impressum') {
    const title = url.pathname === '/datenschutz' ? 'Datenschutzerklärung' : 'Impressum';
    res.writeHead(200, { 'Content-Type': types['.html'] }).end(stubPage(title));
    return;
  }

  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, relative.endsWith('/') ? `${relative}index.html` : relative);
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(content);
  } catch {
    res.writeHead(404).end('Nicht gefunden');
  }
}).listen(port, () => console.log(`Demo: http://localhost:${port}/demo/`));
