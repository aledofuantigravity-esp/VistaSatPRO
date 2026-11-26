// Script para generar todos los iconos PWA desde el SVG fuente
// Ejecutar con: node scripts/generate-icons.mjs
// Requiere: npm install sharp (solo para desarrollo)

import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SVG_SOURCE = resolve(ROOT, 'public/icons/icon-source.svg');
const OUTPUT_DIR = resolve(ROOT, 'public/icons');

mkdirSync(OUTPUT_DIR, { recursive: true });

const svgBuffer = readFileSync(SVG_SOURCE);

// Iconos estándar (fondo transparente, con padding)
const standardIcons = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-180-apple.png', size: 180 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'favicon-16.png', size: 16 },
  { name: 'shortcut-new.png', size: 96 },
  { name: 'shortcut-tasks.png', size: 96 },
  { name: 'badge-72.png', size: 72 },
];

// Iconos maskable (fondo sólido #002169, sin padding extra)
const maskableIcons = [
  { name: 'icon-192-maskable.png', size: 192 },
  { name: 'icon-512-maskable.png', size: 512 },
];

console.log('🎨 Generando iconos PWA para VistaSatPRO...\n');

for (const icon of standardIcons) {
  await sharp(svgBuffer)
    .resize(icon.size, icon.size)
    .png()
    .toFile(resolve(OUTPUT_DIR, icon.name));
  console.log(`  ✅ ${icon.name} (${icon.size}x${icon.size})`);
}

for (const icon of maskableIcons) {
  // Maskable: área segura del 80% — el icono ocupa el 72% del canvas total
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
      background: { r: 0, g: 33, b: 105, alpha: 1 }, // #002169
    },
  })
    .composite([{ input: innerPng, top: padding, left: padding }])
    .png()
    .toFile(resolve(OUTPUT_DIR, icon.name));
  console.log(`  ✅ ${icon.name} (${icon.size}x${icon.size} maskable)`);
}

console.log('\n🏁 Iconos generados correctamente en public/icons/');
console.log('💡 Recuerda añadir screenshots en public/screenshots/ para el manifest.');
