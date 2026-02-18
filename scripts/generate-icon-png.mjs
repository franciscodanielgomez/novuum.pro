/**
 * Genera assets/logo.png (1024x1024) desde static/icon.svg para Tauri.
 * Ejecutar: node scripts/generate-icon-png.mjs
 * Luego: npm run desktop:icons
 */
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'static', 'icon.svg');
const outPath = join(root, 'assets', 'logo.png');

const svg = readFileSync(svgPath);
if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true });

await sharp(svg)
  .resize(1024, 1024)
  .png()
  .toFile(outPath);

console.log('Generated', outPath);
