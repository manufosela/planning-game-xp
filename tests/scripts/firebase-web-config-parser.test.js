import { describe, it, expect } from 'vitest';

const {
  parseFirebaseWebConfigInput,
} = await import('../../scripts/firebase-web-config-parser.cjs');

describe('parseFirebaseWebConfigInput', () => {
  it('should parse valid JSON config', () => {
    const input = JSON.stringify({
      apiKey: 'api-key',
      authDomain: 'my-project.firebaseapp.com',
      projectId: 'my-project',
      storageBucket: 'my-project.firebasestorage.app',
      messagingSenderId: '123456',
      appId: '1:123456:web:abcd',
      measurementId: 'G-ABCD1234',
    });

    const env = parseFirebaseWebConfigInput(input);

    expect(env.PUBLIC_FIREBASE_API_KEY).toBe('api-key');
    expect(env.PUBLIC_FIREBASE_PROJECT_ID).toBe('my-project');
    expect(env.PUBLIC_FIREBASE_DATABASE_URL).toBe('');
    expect(env.PUBLIC_FIREBASE_MEASUREMENT_ID).toBe('G-ABCD1234');
  });

  it('should parse firebaseConfig JS snippet', () => {
    const input = `
      const firebaseConfig = {
        apiKey: "api-key",
        authDomain: "my-project.firebaseapp.com",
        projectId: "my-project",
        storageBucket: "my-project.firebasestorage.app",
        messagingSenderId: "123456",
        appId: "1:123456:web:abcd",
      };
    `;

    const env = parseFirebaseWebConfigInput(input);

    expect(env.PUBLIC_FIREBASE_API_KEY).toBe('api-key');
    expect(env.PUBLIC_FIREBASE_PROJECT_ID).toBe('my-project');
    expect(env.PUBLIC_FIREBASE_DATABASE_URL).toBe('');
    expect(env.PUBLIC_FIREBASE_MEASUREMENT_ID).toBe('');
  });

  it('should throw when required key is missing', () => {
    const input = JSON.stringify({
      apiKey: 'api-key',
      projectId: 'my-project',
    });

    expect(() => parseFirebaseWebConfigInput(input)).toThrow('Faltan claves requeridas');
  });

  it('should recover values from loose key-value snippet without full object', () => {
    const input = `
      apiKey: "api-key",
      authDomain: "my-project.firebaseapp.com",
      projectId: "my-project",
      storageBucket: "my-project.firebasestorage.app",
      messagingSenderId: "123456",
      appId: "1:123456:web:abcd"
    `;

    const env = parseFirebaseWebConfigInput(input);

    expect(env.PUBLIC_FIREBASE_API_KEY).toBe('api-key');
    expect(env.PUBLIC_FIREBASE_PROJECT_ID).toBe('my-project');
  });
});
