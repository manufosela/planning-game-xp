export function shouldSetupPushToken({ firebaseUseEmulators = false, permission = '' } = {}) {
  if (firebaseUseEmulators) return false;
  return permission === 'granted';
}
