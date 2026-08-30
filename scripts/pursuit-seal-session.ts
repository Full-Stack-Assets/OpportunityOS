import { createCipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function secretKey(): Buffer {
  const raw = process.env.PURSUIT_SECRET_KEY_BASE64;
  if (!raw) throw new Error('PURSUIT_SECRET_KEY_BASE64 is required');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('PURSUIT_SECRET_KEY_BASE64 must decode to exactly 32 bytes');
  return key;
}

const input = arg('input');
const output = arg('output') ?? '.local/ats-storage-state.enc';
if (!input) throw new Error('--input path to a Playwright storageState JSON file is required');

const plaintext = await readFile(input, 'utf8');
JSON.parse(plaintext);
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
const record = {
  iv: iv.toString('base64'),
  tag: cipher.getAuthTag().toString('base64'),
  ciphertext: ciphertext.toString('base64'),
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(record), { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ status: 'SEALED', output, plaintextPersistedByThisCommand: false }, null, 2)}\n`);
