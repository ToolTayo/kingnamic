import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const files = [];
async function walk(dir, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix + entry.name;
    if (entry.isDirectory()) await walk(join(dir, entry.name), rel + '/');
    else if (rel !== 'sw.js') files.push(rel);
  }
}
await walk('dist');
const hash = createHash('sha256'); for (const file of files) hash.update(await readFile(join('dist', file)));
const version = 'kingnamic-' + hash.digest('hex').slice(0, 12);
// The cache contains only the generated public static assets. Ignore Vary for
// these: preview's CORS header differs between precache and module requests.
await writeFile('dist/sw.js', `const CACHE=${JSON.stringify(version)};const ASSETS=${JSON.stringify(files.map(f => './' + f))};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kingnamic-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.open(CACHE).then(async c=>{if(e.request.mode==='navigate'){try{const r=await fetch(e.request);if(r.ok)return r;}catch{}return await c.match('./index.html');}return await c.match(e.request,{ignoreVary:true})||fetch(e.request);}));});
`);
console.log('Offline cache:', version, files.length, 'files');
