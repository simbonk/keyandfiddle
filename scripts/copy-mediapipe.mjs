// Copies the MediaPipe WASM runtime out of node_modules so it is served from
// our own domain (same version as the JS package, no third-party CDN needed).
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const dest = join(root, 'public/mediapipe/wasm');
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('copied MediaPipe wasm ->', dest);
