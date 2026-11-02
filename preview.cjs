const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, 'src');
const port = Number(process.env.PORT || 4173);
const allowed = new Set(['index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'service-worker.js', 'icons/daymaker.svg', 'icons/daymaker-180.png', 'icons/daymaker-192.png', 'icons/daymaker-512.png', 'icons/daymaker-bold.svg', 'icons/daymaker-bold-180.png', 'icons/daymaker-bold-192.png', 'icons/daymaker-bold-512.png']);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
http.createServer((req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html'; }
  catch { res.writeHead(400); return res.end(); }
  if (!allowed.has(name)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream');
  if (name === 'service-worker.js') res.setHeader('Service-Worker-Allowed', '/');
  fs.createReadStream(path.join(root, name)).on('error', () => { res.writeHead(404); res.end(); }).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Daymaker PWA preview: http://localhost:${port}`));
