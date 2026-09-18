import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const TARGET_DIRS = [
  path.resolve('apps/admin/public/assets/launcher'),
  path.resolve('apps/customer/public/assets/launcher'),
  path.resolve('backend/public/assets/launcher'),
];

// Helper to wrap raw simple-icon path into a styled colored SVG badge
function makeIconSvg(pathD, fill = '#ffffff', bg = '#0f172a', rx = 48) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <rect width="256" height="256" rx="${rx}" fill="${bg}"/>
    <g transform="translate(32, 32) scale(8)">
      <path fill="${fill}" d="${pathD}"/>
    </g>
  </svg>`;
}

function makeTextIconSvg(initials, subtext = '', bg = '#1e1b4b', color = '#ffffff') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bg}" />
        <stop offset="100%" stop-color="#09090b" />
      </linearGradient>
    </defs>
    <rect width="256" height="256" rx="52" fill="url(#g)" stroke="rgba(255,255,255,0.12)" stroke-width="4"/>
    <text x="128" y="${subtext ? '128' : '142'}" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${initials.length > 3 ? '44' : '56'}" font-weight="900" fill="${color}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1">${initials}</text>
    ${subtext ? `<text x="128" y="178" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" fill="rgba(255,255,255,0.75)" text-anchor="middle" dominant-baseline="middle" letter-spacing="2">${subtext}</text>` : ''}
  </svg>`;
}

const ICONS = [
  // Online Games
  { id: 'steam', filename: 'steam.webp', simpleIcon: 'steam', bg: '#171a21', fill: '#ffffff' },
  { id: 'valorant', filename: 'valorant.webp', simpleIcon: 'valorant', bg: '#ff4655', fill: '#ffffff' },
  { id: 'epicgames', filename: 'epicgames.webp', simpleIcon: 'epicgames', bg: '#121212', fill: '#ffffff' },
  { id: 'roblox', filename: 'roblox.webp', simpleIcon: 'roblox', bg: '#000000', fill: '#ffffff' },
  { id: 'dota2', filename: 'dota2.webp', simpleIcon: 'dota2', bg: '#e23528', fill: '#ffffff' },
  { id: 'lol', filename: 'lol.webp', simpleIcon: 'leagueoflegends', bg: '#091428', fill: '#c8aa6e' },
  { id: 'cs2', filename: 'cs2.webp', simpleIcon: 'counterstrike', bg: '#de9b35', fill: '#14171c' },
  { id: 'genshin', filename: 'genshin.webp', textInitials: 'GENSHIN', sub: 'IMPACT', bg: '#1e3a8a', fill: '#38bdf8' },
  { id: 'starrail', filename: 'starrail.webp', textInitials: 'STAR', sub: 'RAIL', bg: '#312e81', fill: '#a855f7' },
  { id: 'warzone', filename: 'warzone.webp', simpleIcon: 'battlenet', bg: '#0070bc', fill: '#ffffff' },
  { id: 'apex', filename: 'apex.webp', simpleIcon: 'ea', bg: '#ff4754', fill: '#ffffff' },

  // Offline Games
  { id: 'minecraft', filename: 'minecraft.webp', simpleIcon: 'minecraft', bg: '#629e44', fill: '#ffffff' },
  { id: 'gta5', filename: 'gta5.webp', textInitials: 'GTA V', sub: 'ROCKSTAR', bg: '#18181b', fill: '#22c55e' },
  { id: 'cyberpunk2077', filename: 'cyberpunk2077.webp', textInitials: 'CYBER', sub: '2077', bg: '#fcee0a', fill: '#000000' },
  { id: 'l4d2', filename: 'l4d2.webp', textInitials: 'L4D2', sub: 'VALVE', bg: '#18181b', fill: '#ef4444' },
  { id: 'nfs', filename: 'nfs.webp', textInitials: 'NFS', sub: 'RACING', bg: '#0369a1', fill: '#f59e0b' },
  { id: 'sf6', filename: 'sf6.webp', textInitials: 'SF6', sub: 'CAPCOM', bg: '#7c3aed', fill: '#facc15' },
  { id: 'tekken8', filename: 'tekken8.webp', textInitials: 'TEKKEN', sub: '8', bg: '#991b1b', fill: '#ffffff' },

  // Browsers
  { id: 'chrome', filename: 'chrome.webp', simpleIcon: 'googlechrome', bg: '#ffffff', fill: '#4285F4' },
  { id: 'edge', filename: 'edge.webp', simpleIcon: 'microsoftedge', bg: '#0078D7', fill: '#ffffff' },
  { id: 'brave', filename: 'brave.webp', simpleIcon: 'brave', bg: '#fb542b', fill: '#ffffff' },
  { id: 'firefox', filename: 'firefox.webp', simpleIcon: 'firefox', bg: '#ff7139', fill: '#ffffff' },
  { id: 'operagx', filename: 'operagx.webp', simpleIcon: 'opera', bg: '#fa1e4e', fill: '#ffffff' },

  // Office & Productivity
  { id: 'word', filename: 'word.webp', simpleIcon: 'microsoftword', bg: '#185abd', fill: '#ffffff' },
  { id: 'excel', filename: 'excel.webp', simpleIcon: 'microsoftexcel', bg: '#107c41', fill: '#ffffff' },
  { id: 'powerpoint', filename: 'powerpoint.webp', simpleIcon: 'microsoftpowerpoint', bg: '#c43e1c', fill: '#ffffff' },

  // Utilities & Chat
  { id: 'discord', filename: 'discord.webp', simpleIcon: 'discord', bg: '#5865f2', fill: '#ffffff' },
  { id: 'spotify', filename: 'spotify.webp', simpleIcon: 'spotify', bg: '#1db954', fill: '#ffffff' },
  { id: 'obs', filename: 'obs.webp', simpleIcon: 'obsstudio', bg: '#302c42', fill: '#ffffff' },
  { id: 'calculator', filename: 'calculator.webp', textInitials: 'CALC', sub: 'APP', bg: '#1e293b', fill: '#38bdf8' },
  { id: 'notepad', filename: 'notepad.webp', textInitials: 'NOTE', sub: 'PAD', bg: '#1e293b', fill: '#a3e635' },
  { id: 'vlc', filename: 'vlc.webp', simpleIcon: 'vlcmediaplayer', bg: '#ff8800', fill: '#ffffff' },
  { id: '7zip', filename: '7zip.webp', textInitials: '7-ZIP', sub: 'ARCHIVE', bg: '#000000', fill: '#ffffff' },

  // Emulators
  { id: 'ldplayer', filename: 'ldplayer.webp', textInitials: 'LDP', sub: 'EMULATOR', bg: '#f59e0b', fill: '#000000' },
  { id: 'bluestacks', filename: 'bluestacks.webp', textInitials: 'BLUE', sub: 'STACKS', bg: '#0284c7', fill: '#ffffff' },
  { id: 'nox', filename: 'nox.webp', textInitials: 'NOX', sub: 'PLAYER', bg: '#8b5cf6', fill: '#ffffff' },
  { id: 'pcsx2', filename: 'pcsx2.webp', textInitials: 'PCSX2', sub: 'PS2', bg: '#1e3a8a', fill: '#60a5fa' },
  { id: 'rpcs3', filename: 'rpcs3.webp', textInitials: 'RPCS3', sub: 'PS3', bg: '#1e1b4b', fill: '#f43f5e' },
  { id: 'ppsspp', filename: 'ppsspp.webp', textInitials: 'PPSSPP', sub: 'PSP', bg: '#047857', fill: '#34d399' },
];

async function ensureDirs() {
  for (const dir of TARGET_DIRS) {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function fetchSimpleIconPath(slug) {
  try {
    const url = `https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/${slug}.svg`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    const match = text.match(/<path[^>]*d="([^"]+)"/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function renderIcon(item) {
  let svgContent = null;
  if (item.simpleIcon) {
    const pathD = await fetchSimpleIconPath(item.simpleIcon);
    if (pathD) {
      svgContent = makeIconSvg(pathD, item.fill || '#ffffff', item.bg || '#1e293b', 52);
    }
  }

  if (!svgContent) {
    svgContent = makeTextIconSvg(
      item.textInitials || item.id.toUpperCase(),
      item.sub || '',
      item.bg || '#1e293b',
      item.fill || '#ffffff'
    );
  }

  const webpBuffer = await sharp(Buffer.from(svgContent))
    .resize(256, 256)
    .webp({ quality: 95 })
    .toBuffer();

  for (const dir of TARGET_DIRS) {
    const dest = path.join(dir, item.filename);
    await fs.writeFile(dest, webpBuffer);
  }
  console.log(`✓ Processed ${item.id} -> ${item.filename} (${webpBuffer.length} bytes)`);
}

async function main() {
  await ensureDirs();
  console.log(`Rendering ${ICONS.length} pristine game and application launcher icons...`);
  for (const icon of ICONS) {
    await renderIcon(icon);
  }
  console.log('All icons rendered and written to admin, customer, and backend public assets!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
