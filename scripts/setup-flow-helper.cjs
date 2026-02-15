function shouldClearInstallState(action) {
  const normalized = String(action || '').trim().toLowerCase();
  return normalized === 'restart' || normalized === 'full';
}

module.exports = {
  shouldClearInstallState,
};
