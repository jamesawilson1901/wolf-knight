// The overnight static server. python -m http.server stalled sockets under
// parallel GLB loads twice tonight and each stall wedged a room transition —
// this is a minimal streaming server with no keep-alive surprises.
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join, normalize } from 'path';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
createServer((req, res) => {
  try {
    const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([/\\])+/, '');
    const file = join(process.cwd(), path || 'index.html');
    const st = statSync(file.endsWith('/') ? file + 'index.html' : file);
    const target = st.isDirectory() ? join(file, 'index.html') : file;
    res.writeHead(200, { 'content-type': TYPES[extname(target)] || 'application/octet-stream',
      'cache-control': 'no-store', 'content-length': statSync(target).size });
    createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(8901, () => console.log('serving on 8901'));
