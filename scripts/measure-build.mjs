import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else { const bytes = await readFile(path); files.push({ file: path.replaceAll('\\', '/'), bytes: bytes.length, gzipBytes: gzipSync(bytes).length }); }
  }
}
await walk('dist');
const result = { files, rawBytes: files.reduce((n, f) => n + f.bytes, 0), gzipBytes: files.reduce((n, f) => n + f.gzipBytes, 0) };
await writeFile(`docs/evidence/${process.env.REVIEW_LABEL ?? 'experience'}-build-size.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
