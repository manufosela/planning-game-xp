import { describe, it, expect } from 'vitest';
import { shouldSetupPushToken } from '../../public/js/utils/push-runtime-helper.js';

describe('push-runtime-helper', () => {
  it('should disable push token setup when emulators are enabled', () => {
    expect(shouldSetupPushToken({ firebaseUseEmulators: true, permission: 'granted' })).toBe(false);
  });

  it('should enable push token setup when permission is granted and no emulators', () => {
    expect(shouldSetupPushToken({ firebaseUseEmulators: false, permission: 'granted' })).toBe(true);
  });

  it('should disable push token setup when permission is not granted', () => {
    expect(shouldSetupPushToken({ firebaseUseEmulators: false, permission: 'denied' })).toBe(false);
  });
});
