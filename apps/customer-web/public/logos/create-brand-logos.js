const fs = require('fs');
const path = require('path');

const dir = 'apps/customer-web/public/logos';
fs.mkdirSync(dir, { recursive: true });

// 1. Vinamilk (Authentic Brand Identity)
const vinamilkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 64" fill="none">
  <rect width="240" height="64" rx="14" fill="#003580"/>
  <text x="120" y="44" text-anchor="middle" font-family="'Inter', -apple-system, 'Helvetica Neue', 'Arial Black', sans-serif" font-weight="900" font-size="28" fill="#FFFFFF" letter-spacing="3.5">VINAMILK</text>
  <circle cx="212" cy="24" r="3.5" fill="#FFCC00"/>
</svg>`;

// 2. TH true MILK (Authentic Brand Identity)
const thTrueMilkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 64" fill="none">
  <rect width="240" height="64" rx="14" fill="#00467F"/>
  <g transform="translate(18, 12)">
    <!-- TH letters -->
    <text x="0" y="34" font-family="'Inter', -apple-system, sans-serif" font-weight="900" font-size="34" fill="#FFFFFF" letter-spacing="1">TH</text>
    <!-- true MILK text -->
    <text x="64" y="22" font-family="'Georgia', serif" font-style="italic" font-weight="700" font-size="16" fill="#75C3F0" letter-spacing="1">true</text>
    <path d="M102 12 Q105 7 108 12 Q105 17 102 12 Z" fill="#FFD100"/>
    <text x="64" y="37" font-family="'Inter', -apple-system, sans-serif" font-weight="800" font-size="15" fill="#FFFFFF" letter-spacing="2.5">MILK</text>
    <!-- Natural flower/star accent -->
    <circle cx="180" cy="18" r="4" fill="#FFD100"/>
    <circle cx="187" cy="23" r="3" fill="#75C3F0"/>
  </g>
</svg>`;

// 3. TOMRA (Leader in RVM Reverse Vending Machines)
const tomraSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 64" fill="none">
  <rect width="240" height="64" rx="14" fill="#0A2540"/>
  <g transform="translate(24, 14)">
    <text x="0" y="32" font-family="'Inter', -apple-system, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="30" fill="#FFFFFF" letter-spacing="4">TOMRA</text>
    <circle cx="168" cy="24" r="6" fill="#00D4B2"/>
    <circle cx="184" cy="24" r="3.5" fill="#00A3FF"/>
  </g>
</svg>`;

// 4. Highlands Coffee (Authentic Iconic Brand Identity)
const highlandsSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 64" fill="none">
  <rect width="240" height="64" rx="14" fill="#B22830"/>
  <g transform="translate(20, 8)">
    <ellipse cx="24" cy="24" rx="20" ry="18" fill="none" stroke="#FFFFFF" stroke-width="2.5"/>
    <path d="M12 28 Q24 16 36 28" fill="none" stroke="#FFCC00" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M16 22 Q24 14 32 22" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
    <text x="56" y="24" font-family="'Inter', -apple-system, sans-serif" font-weight="900" font-size="15" fill="#FFFFFF" letter-spacing="1.5">HIGHLANDS</text>
    <text x="56" y="39" font-family="'Inter', -apple-system, sans-serif" font-weight="700" font-size="12.5" fill="#FFCC00" letter-spacing="3.5">COFFEE</text>
  </g>
</svg>`;

// 5. Circle K (Authentic Brand Identity)
const circleKSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 64" fill="none">
  <rect width="240" height="64" rx="14" fill="#EE2724"/>
  <rect y="50" width="240" height="14" rx="4" fill="#FFC72C"/>
  <g transform="translate(22, 10)">
    <circle cx="20" cy="20" r="18" fill="#FFFFFF"/>
    <path d="M15 10 L15 30 M15 20 L27 9 M18 17 L27 30" stroke="#EE2724" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="50" y="27" font-family="'Inter', -apple-system, sans-serif" font-weight="900" font-size="20" fill="#FFFFFF" letter-spacing="2">CIRCLE K</text>
  </g>
</svg>`;

// 6. Tetra Pak (Authentic Brand Identity)
const tetraPakSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 64" fill="none">
  <rect width="240" height="64" rx="14" fill="#003B71"/>
  <g transform="translate(18, 12)">
    <path d="M10 6 L32 20 L10 34 Z" fill="#0099FF"/>
    <path d="M10 6 L24 20 L10 20 Z" fill="#FFFFFF" opacity="0.9"/>
    <text x="44" y="27" font-family="'Inter', -apple-system, sans-serif" font-weight="800" font-size="21" fill="#FFFFFF" letter-spacing="1">Tetra Pak</text>
  </g>
</svg>`;

fs.writeFileSync(path.join(dir, 'vinamilk.svg'), vinamilkSvg.trim());
fs.writeFileSync(path.join(dir, 'th-true-milk.svg'), thTrueMilkSvg.trim());
fs.writeFileSync(path.join(dir, 'tomra.svg'), tomraSvg.trim());
fs.writeFileSync(path.join(dir, 'highlands.svg'), highlandsSvg.trim());
fs.writeFileSync(path.join(dir, 'circle-k.svg'), circleKSvg.trim());
fs.writeFileSync(path.join(dir, 'tetra-pak.svg'), tetraPakSvg.trim());

console.log('Created all brand SVGs!');
