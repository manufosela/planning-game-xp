import { describe, it, expect } from 'vitest';
import { resolveMcpRegistration } from '../commands/init.js';

describe('resolveMcpRegistration', () => {
  describe('installed (any node_modules location)', () => {
    it('registers binary name for Linux global install (/usr/lib/node_modules)', () => {
      const result = resolveMcpRegistration(
        '/usr/lib/node_modules/planning-game-mcp/commands'
      );
      expect(result).toEqual({ command: 'planning-game-mcp', args: [] });
    });

    it('registers binary name for Homebrew global install (/opt/homebrew/lib/node_modules)', () => {
      const result = resolveMcpRegistration(
        '/opt/homebrew/lib/node_modules/planning-game-mcp/commands'
      );
      expect(result).toEqual({ command: 'planning-game-mcp', args: [] });
    });

    it('registers binary name for nvm global install', () => {
      const result = resolveMcpRegistration(
        '/home/user/.nvm/versions/node/v20.10.0/lib/node_modules/planning-game-mcp/commands'
      );
      expect(result).toEqual({ command: 'planning-game-mcp', args: [] });
    });

    it('registers binary name for npx cache', () => {
      const result = resolveMcpRegistration(
        '/home/user/.npm/_npx/abc123def/node_modules/planning-game-mcp/commands'
      );
      expect(result).toEqual({ command: 'planning-game-mcp', args: [] });
    });

    it('registers binary name for npm local install', () => {
      const result = resolveMcpRegistration(
        '/home/user/my-project/node_modules/planning-game-mcp/commands'
      );
      expect(result).toEqual({ command: 'planning-game-mcp', args: [] });
    });

    it('registers binary name for Windows global install', () => {
      const result = resolveMcpRegistration(
        'C:\\Users\\user\\AppData\\Roaming\\npm\\node_modules\\planning-game-mcp\\commands'
      );
      expect(result).toEqual({ command: 'planning-game-mcp', args: [] });
    });
  });

  describe('source dev (no node_modules in path)', () => {
    it('registers node + absolute path when running from source', () => {
      const result = resolveMcpRegistration(
        '/home/manu/ws_firebase/planning-game-xp/mcp/commands'
      );
      expect(result).toEqual({
        command: 'node',
        args: ['/home/manu/ws_firebase/planning-game-xp/mcp/index.js']
      });
    });

    it('does NOT match a directory named "node_modules_legacy" or similar', () => {
      const result = resolveMcpRegistration(
        '/home/user/my-node_modules-backup/mcp/commands'
      );
      expect(result.command).toBe('node');
    });
  });
});
