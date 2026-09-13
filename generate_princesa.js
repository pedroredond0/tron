const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'ui', 'icons', 'princesa');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Colors: 
// Primary: #ff1493 (DeepPink)
// Secondary: #ffb6c1 (LightPink) 
// Accent: #ff69b4 (HotPink)

const icons = {
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" fill="#ffb6c1" stroke="#ff1493" stroke-width="1.5"/><path d="M2 10h20" stroke="#ff1493" stroke-width="1.5"/>',
  pdf: '<rect width="14" height="20" x="5" y="2" rx="2" fill="#fff0f5" stroke="#ff1493" stroke-width="1.5"/><path d="M5 8h14M8 12h8M8 16h4" stroke="#ff1493" stroke-width="1.5" stroke-linecap="round"/><text x="12" y="15" font-size="6" fill="#c71585" font-family="sans-serif" font-weight="bold" text-anchor="middle">PDF</text>',
  document: '<rect width="14" height="20" x="5" y="2" rx="2" fill="#fff0f5" stroke="#ff69b4" stroke-width="1.5"/><path d="M9 8h6M9 12h6M9 16h4" stroke="#ff1493" stroke-width="1.5" stroke-linecap="round"/>',
  spreadsheet: '<rect width="14" height="20" x="5" y="2" rx="2" fill="#fff0f5" stroke="#ff69b4" stroke-width="1.5"/><path d="M5 8h14M5 14h14M9 8v14" stroke="#ff1493" stroke-width="1.5"/>',
  presentation: '<rect width="18" height="14" x="3" y="4" rx="2" fill="#fff0f5" stroke="#ff69b4" stroke-width="1.5"/><path d="M8 21h8M12 18v3M3 10h18" stroke="#ff1493" stroke-width="1.5"/>',
  archive: '<rect width="16" height="18" x="4" y="4" rx="2" fill="#ffb6c1" stroke="#ff1493" stroke-width="1.5"/><rect width="18" height="4" x="3" y="4" rx="1" fill="#ff69b4" stroke="#ff1493" stroke-width="1.5"/><path d="M10 12h4" stroke="#ff1493" stroke-width="2" stroke-linecap="round"/>',
  code: '<path d="m10 8-4 4 4 4M14 8l4 4-4 4" stroke="#ff1493" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  binary: '<rect width="14" height="20" x="5" y="2" rx="2" fill="#333" stroke="#ff1493" stroke-width="1.5"/><text x="12" y="14" font-size="10" fill="#ff69b4" font-family="monospace" font-weight="bold" text-anchor="middle">01</text>',
  text: '<rect width="14" height="20" x="5" y="2" rx="2" fill="#fff0f5" stroke="#ff69b4" stroke-width="1.5"/><path d="M8 8h8M8 12h8M8 16h8" stroke="#ff1493" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="2 2"/>',
  image: '<rect width="18" height="14" x="3" y="5" rx="2" fill="#fff0f5" stroke="#ff69b4" stroke-width="1.5"/><circle cx="8" cy="9" r="2" fill="#ff1493"/><path d="m21 13-4-4-5 5-2-2-7 7" stroke="#ff1493" stroke-width="1.5" fill="none"/>',
  audio: '<path d="M9 18V5l12-2v13" stroke="#ff1493" stroke-width="1.5" fill="none"/><circle cx="6" cy="18" r="3" fill="#ffb6c1" stroke="#ff1493" stroke-width="1.5"/><circle cx="18" cy="16" r="3" fill="#ffb6c1" stroke="#ff1493" stroke-width="1.5"/>',
  video: '<rect width="16" height="12" x="2" y="6" rx="2" fill="#fff0f5" stroke="#ff69b4" stroke-width="1.5"/><path d="m18 10 4-2v8l-4-2" stroke="#ff1493" stroke-width="1.5" fill="#ffb6c1"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#ffb6c1" stroke="#ff1493" stroke-width="1.5"/><path d="M9 22V12h6v10" fill="#fff0f5" stroke="#ff1493" stroke-width="1.5"/>',
  desktop: '<rect width="18" height="14" x="3" y="4" rx="2" fill="#fff0f5" stroke="#ff69b4" stroke-width="1.5"/><path d="M8 22h8M12 18v4" stroke="#ff1493" stroke-width="1.5"/>',
  network: '<circle cx="12" cy="16" r="3" fill="#ffb6c1" stroke="#ff1493" stroke-width="1.5"/><circle cx="5" cy="6" r="3" fill="#ffb6c1" stroke="#ff1493" stroke-width="1.5"/><circle cx="19" cy="6" r="3" fill="#ffb6c1" stroke="#ff1493" stroke-width="1.5"/><path d="M12 13V9M5 9v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" stroke="#ff1493" stroke-width="1.5" fill="none"/>',
  drive: '<rect width="18" height="14" x="3" y="5" rx="2" fill="#ffb6c1" stroke="#ff1493" stroke-width="1.5"/><path d="M6 12h.01M10 12h.01" stroke="#ff1493" stroke-width="3" stroke-linecap="round"/>',
  cdrom: '<circle cx="12" cy="12" r="9" fill="#fff0f5" stroke="#ff69b4" stroke-width="1.5"/><circle cx="12" cy="12" r="2" fill="#ff1493" stroke="#ff1493" stroke-width="1.5"/>',
  music: '<path d="M9 18V5l12-2v13" stroke="#ff1493" stroke-width="1.5" fill="none"/><circle cx="6" cy="18" r="3" fill="#ffb6c1" stroke="#ff1493" stroke-width="1.5"/><circle cx="18" cy="16" r="3" fill="#ffb6c1" stroke="#ff1493" stroke-width="1.5"/>'
};

for (const [name, content] of Object.entries(icons)) {
  const svg = \<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\</svg>\;
  fs.writeFileSync(path.join(outDir, \\.svg\), svg);
}
console.log('Princess icons generated.');
