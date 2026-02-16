const fs = require('fs');
const path = require('path');

function buildInstanceOverlayPairs(rootDir, instanceDir) {
  return [
    { from: path.join(instanceDir, '.firebaserc'), to: path.join(rootDir, '.firebaserc') },
    { from: path.join(instanceDir, '.env.dev'), to: path.join(rootDir, '.env.dev') },
    { from: path.join(instanceDir, '.env.pre'), to: path.join(rootDir, '.env.pre') },
    { from: path.join(instanceDir, '.env.prod'), to: path.join(rootDir, '.env.prod') },
    { from: path.join(instanceDir, 'functions', '.env'), to: path.join(rootDir, 'functions', '.env') },
    { from: path.join(instanceDir, 'public', 'theme-config.json'), to: path.join(rootDir, 'public', 'theme-config.json') },
  ];
}

function applyInstanceOverlays(rootDir, instanceDir) {
  const overlays = buildInstanceOverlayPairs(rootDir, instanceDir);
  const backups = [];

  for (const overlay of overlays) {
    if (!fs.existsSync(overlay.from)) continue;
    const toExists = fs.existsSync(overlay.to);
    backups.push({
      to: overlay.to,
      existed: toExists,
      content: toExists ? fs.readFileSync(overlay.to, 'utf8') : null,
    });
    fs.mkdirSync(path.dirname(overlay.to), { recursive: true });
    fs.copyFileSync(overlay.from, overlay.to);
  }

  return () => {
    for (let idx = backups.length - 1; idx >= 0; idx--) {
      const backup = backups[idx];
      if (backup.existed) {
        fs.writeFileSync(backup.to, backup.content, 'utf8');
      } else if (fs.existsSync(backup.to)) {
        fs.unlinkSync(backup.to);
      }
    }
  };
}

module.exports = {
  buildInstanceOverlayPairs,
  applyInstanceOverlays,
};
