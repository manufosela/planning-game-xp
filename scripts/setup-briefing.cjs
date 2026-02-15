const { execSync } = require('child_process');

function detectFirebaseCliInstalled(deps = {}) {
  const run = deps.execSync || execSync;
  try {
    run('firebase --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function padRight(text, width) {
  const value = String(text || '');
  if (value.length >= width) return value.slice(0, width);
  return value + ' '.repeat(width - value.length);
}

function center(text, width) {
  const value = String(text || '');
  if (value.length >= width) return value.slice(0, width);
  const left = Math.floor((width - value.length) / 2);
  const right = width - value.length - left;
  return `${' '.repeat(left)}${value}${' '.repeat(right)}`;
}

function box(contentLines, width = 72, title = 'PLANNING GAME XP - SETUP WIZARD') {
  const top = `╔${'═'.repeat(width)}╗`;
  const titleLine = `║${center(title, width)}║`;
  const divider = `╠${'═'.repeat(width)}╣`;
  const body = contentLines.map((line) => `║${padRight(line, width)}║`);
  const bottom = `╚${'═'.repeat(width)}╝`;
  return [top, titleLine, divider, ...body, bottom];
}

function buildSetupBriefingLines({ firebaseCliInstalled = false, repoUrl = '' } = {}) {
  const cliMark = firebaseCliInstalled ? '✓' : '☐';
  const lines = [
    ' === OBLIGATORIO ===',
    '  ☐ Proyecto Firebase creado',
    `  ${cliMark} Firebase CLI instalado`,
    '  ☐ Auth de Firebase habilitada',
    '',
    '  Crear proyecto: https://console.firebase.google.com/',
    '  Auth (setup): https://firebase.google.com/docs/auth/web/start',
    '',
    ' === DECISIONES ===',
    '  1. Proveedor de autenticación (Google / Microsoft / GitHub / GitLab)',
    '  2. Nombre de organización',
    '  3. Notificaciones (solo push o push + email)',
    '  4. Integraciones (MCP / Karajan / Bridge)',
    '',
    ` INFO: ${repoUrl || './INSTALL.md'}`,
  ];

  return box(lines);
}

module.exports = {
  buildSetupBriefingLines,
  detectFirebaseCliInstalled,
};
