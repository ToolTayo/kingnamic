import { mkdir } from 'node:fs/promises';

export default async function prepareEvidence() {
  await mkdir('docs/evidence', { recursive: true });
}
