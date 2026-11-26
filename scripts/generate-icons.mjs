// Script para generar todos los iconos PWA y screenshots base del manifest
// Ejecutar con: node scripts/generate-icons.mjs

import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SVG_SOURCE = resolve(ROOT, 'public/icons/icon-source.svg');
const BADGE_SVG_SOURCE = resolve(ROOT, 'public/icons/badge-source.svg');
const OUTPUT_DIR = resolve(ROOT, 'public/icons');
const SCREENSHOTS_DIR = resolve(ROOT, 'public/screenshots');

mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const svgBuffer = readFileSync(SVG_SOURCE);
const badgeSvgBuffer = readFileSync(BADGE_SVG_SOURCE);

const standardIcons = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-180-apple.png', size: 180 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'favicon-16.png', size: 16 },
  { name: 'shortcut-new.png', size: 96 },
  { name: 'shortcut-tasks.png', size: 96 },
];

const maskableIcons = [
  { name: 'icon-192-maskable.png', size: 192 },
  { name: 'icon-512-maskable.png', size: 512 },
];

console.log('Generando iconos PWA para VistaSatPRO...');

for (const icon of standardIcons) {
  await sharp(svgBuffer)
    .resize(icon.size, icon.size)
    .png()
    .toFile(resolve(OUTPUT_DIR, icon.name));
}

// Badge monocromo transparente para barra de notificaciones Android
await sharp(badgeSvgBuffer)
  .resize(72, 72)
  .png()
  .toFile(resolve(OUTPUT_DIR, 'badge-72.png'));

await sharp(badgeSvgBuffer)
  .resize(96, 96)
  .png()
  .toFile(resolve(OUTPUT_DIR, 'badge-96.png'));

for (const icon of maskableIcons) {
  const innerSize = Math.round(icon.size * 0.72);
  const padding = Math.round((icon.size - innerSize) / 2);

  const innerPng = await sharp(svgBuffer)
    .resize(innerSize, innerSize)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: icon.size,
      height: icon.size,
      channels: 4,
      background: { r: 0, g: 33, b: 105, alpha: 1 },
    },
  })
    .composite([{ input: innerPng, top: padding, left: padding }])
    .png()
    .toFile(resolve(OUTPUT_DIR, icon.name));
}

// Screenshots base para manifest.webmanifest (evitar 404 en validación PWA)
const mobileSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844">
  <rect width="390" height="844" fill="#F8F7F7"/>
  <rect width="390" height="72" fill="#002169"/>
  <text x="24" y="45" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#FFFFFF">VistaSatPRO</text>
  <rect x="20" y="96" width="350" height="120" rx="12" fill="#FFFFFF"/>
  <rect x="20" y="96" width="6" height="120" fill="#CF095E"/>
  <text x="42" y="130" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#222222">VS-2026-0001 · Urgente</text>
  <text x="42" y="160" font-family="Arial, sans-serif" font-size="14" fill="#666666">Revisión equipo climatización</text>
  <rect x="20" y="236" width="350" height="120" rx="12" fill="#FFFFFF"/>
  <rect x="20" y="236" width="6" height="120" fill="#004876"/>
  <text x="42" y="270" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#222222">VS-2026-0002 · En Proceso</text>
  <text x="42" y="300" font-family="Arial, sans-serif" font-size="14" fill="#666666">Mantenimiento terminal TPV</text>
  <rect y="780" width="390" height="64" fill="#FFFFFF"/>
</svg>`);

const desktopSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
  <rect width="1280" height="800" fill="#F8F7F7"/>
  <rect width="260" height="800" fill="#002169"/>
  <text x="28" y="54" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#FFFFFF">VistaSatPRO</text>
  <rect x="300" y="40" width="215" height="110" rx="12" fill="#FFFFFF"/>
  <rect x="540" y="40" width="215" height="110" rx="12" fill="#FFFFFF"/>
  <rect x="780" y="40" width="215" height="110" rx="12" fill="#FFFFFF"/>
  <rect x="1020" y="40" width="215" height="110" rx="12" fill="#FFFFFF"/>
  <rect x="300" y="180" width="935" height="560" rx="12" fill="#FFFFFF"/>
</svg>`);

await sharp(mobileSvg).png().toFile(resolve(SCREENSHOTS_DIR, 'mobile-tasks.png'));
await sharp(desktopSvg).png().toFile(resolve(SCREENSHOTS_DIR, 'desktop-dashboard.png'));

console.log('Iconos y screenshots generados correctamente.');
