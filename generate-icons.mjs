import sharp from 'sharp';
import { mkdirSync, existsSync } from 'fs';

// Garante que a pasta public existe
if (!existsSync('./public')) mkdirSync('./public');

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#43A047"/>
      <stop offset="100%" stop-color="#1B5E20"/>
    </linearGradient>
    <linearGradient id="leaf1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#A5D6A7"/>
      <stop offset="100%" stop-color="#66BB6A"/>
    </linearGradient>
    <linearGradient id="leaf2" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#C8E6C9"/>
      <stop offset="100%" stop-color="#81C784"/>
    </linearGradient>
  </defs>

  <!-- Fundo arredondado -->
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>

  <!-- Sol -->
  <circle cx="390" cy="110" r="58" fill="#FDD835" opacity="0.92"/>
  <circle cx="390" cy="110" r="42" fill="#FFEE58"/>

  <!-- Raios do sol -->
  <g stroke="#FDD835" stroke-width="10" stroke-linecap="round" opacity="0.7">
    <line x1="390" y1="38"  x2="390" y2="22"/>
    <line x1="390" y1="182" x2="390" y2="198"/>
    <line x1="318" y1="110" x2="302" y2="110"/>
    <line x1="462" y1="110" x2="478" y2="110"/>
    <line x1="340" y1="60"  x2="329" y2="49"/>
    <line x1="440" y1="160" x2="451" y2="171"/>
    <line x1="440" y1="60"  x2="451" y2="49"/>
    <line x1="340" y1="160" x2="329" y2="171"/>
  </g>

  <!-- Tronco / caule -->
  <rect x="238" y="270" width="36" height="160" rx="18" fill="#558B2F"/>

  <!-- Folha esquerda grande -->
  <ellipse cx="176" cy="300" rx="90" ry="38" fill="url(#leaf1)"
           transform="rotate(-35 176 300)"/>

  <!-- Folha direita grande -->
  <ellipse cx="336" cy="270" rx="90" ry="38" fill="url(#leaf2)"
           transform="rotate(35 336 270)"/>

  <!-- Folha esquerda pequena -->
  <ellipse cx="198" cy="220" rx="65" ry="28" fill="#81C784"
           transform="rotate(-25 198 220)"/>

  <!-- Folha direita pequena -->
  <ellipse cx="314" cy="200" rx="65" ry="28" fill="#A5D6A7"
           transform="rotate(25 314 200)"/>

  <!-- Broto do topo -->
  <ellipse cx="256" cy="185" rx="30" ry="48" fill="#66BB6A"/>
  <ellipse cx="256" cy="158" rx="20" ry="32" fill="#A5D6A7"/>

  <!-- Solo -->
  <ellipse cx="256" cy="435" rx="120" ry="22" fill="#33691E" opacity="0.6"/>

  <!-- Letras "AG" pequenas no canto inferior -->
  <text x="256" y="490" font-family="Arial, sans-serif" font-size="38"
        font-weight="bold" fill="white" text-anchor="middle"
        opacity="0.85">AGRO</text>
</svg>
`;

const sizes = [
  { size: 192, file: './public/icon-192x192.png' },
  { size: 512, file: './public/icon-512x512.png' },
];

for (const { size, file } of sizes) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(file);
  console.log(`✅ Gerado: ${file} (${size}x${size})`);
}

console.log('\n🎉 Ícones gerados com sucesso em /public!');
