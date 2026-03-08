/**
 * Tests for epic inference functions used by createTasksFromPlan.
 */
import { describe, it, expect } from 'vitest';

const { extractKeywords, findBestEpicMatch, extractPhaseKeywords } = await import('../../functions/helpers/epic-inference.js');

describe('Epic inference functions', () => {
  describe('extractKeywords', () => {
    it('should extract meaningful keywords from text', () => {
      const keywords = extractKeywords('Sistema de notificaciones por email');
      expect(keywords).toContain('sistema');
      expect(keywords).toContain('notificaciones');
      expect(keywords).toContain('email');
      expect(keywords).not.toContain('de');
      expect(keywords).not.toContain('por');
    });

    it('should filter stop words in Spanish', () => {
      const keywords = extractKeywords('La gestión de los usuarios del sistema');
      expect(keywords).not.toContain('la');
      expect(keywords).not.toContain('de');
      expect(keywords).not.toContain('los');
      expect(keywords).not.toContain('del');
      expect(keywords).toContain('gestión');
      expect(keywords).toContain('usuarios');
      expect(keywords).toContain('sistema');
    });

    it('should filter stop words in English', () => {
      const keywords = extractKeywords('The notification system for users');
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('for');
      expect(keywords).toContain('notification');
      expect(keywords).toContain('system');
      expect(keywords).toContain('users');
    });

    it('should filter short words (<=2 chars)', () => {
      const keywords = extractKeywords('UI de la app en Go');
      expect(keywords).not.toContain('ui');
      expect(keywords).not.toContain('go');
      expect(keywords).toContain('app');
    });

    it('should handle empty/null input', () => {
      expect(extractKeywords('')).toEqual([]);
      expect(extractKeywords(null)).toEqual([]);
      expect(extractKeywords(undefined)).toEqual([]);
    });

    it('should lowercase all keywords', () => {
      const keywords = extractKeywords('MCP Integration SERVER');
      expect(keywords).toContain('mcp');
      expect(keywords).toContain('integration');
      expect(keywords).toContain('server');
    });

    it('should strip special characters', () => {
      const keywords = extractKeywords('Bug-fix: módulo (v2.0)');
      expect(keywords).toContain('módulo');
      expect(keywords).not.toContain('v2.0');
      expect(keywords).not.toContain(':');
    });

    it('should handle accented characters', () => {
      const keywords = extractKeywords('Configuración de autenticación');
      expect(keywords).toContain('configuración');
      expect(keywords).toContain('autenticación');
    });
  });

  describe('findBestEpicMatch', () => {
    const existingEpics = [
      { firebaseId: '-abc1', cardId: 'PLN-PCS-0001', title: 'sistema de notificaciones' },
      { firebaseId: '-abc2', cardId: 'PLN-PCS-0002', title: 'gestión de usuarios y permisos' },
      { firebaseId: '-abc3', cardId: 'PLN-PCS-0003', title: 'reportes y métricas' },
      { firebaseId: '-abc4', cardId: 'PLN-PCS-0004', title: 'integración mcp server' }
    ];

    it('should match epic by keyword overlap', () => {
      const keywords = extractKeywords('Notificaciones push para el sistema');
      const match = findBestEpicMatch(keywords, existingEpics);
      expect(match).toBe('PLN-PCS-0001');
    });

    it('should match partial keyword overlaps', () => {
      const keywords = extractKeywords('Herramientas MCP para integración');
      const match = findBestEpicMatch(keywords, existingEpics);
      expect(match).toBe('PLN-PCS-0004');
    });

    it('should return null when no good match', () => {
      const keywords = extractKeywords('Despliegue Docker contenedores');
      const match = findBestEpicMatch(keywords, existingEpics);
      expect(match).toBeNull();
    });

    it('should return null for empty keywords', () => {
      expect(findBestEpicMatch([], existingEpics)).toBeNull();
    });

    it('should return null for empty epics', () => {
      const keywords = extractKeywords('Sistema de notificaciones');
      expect(findBestEpicMatch(keywords, [])).toBeNull();
    });

    it('should pick the best match when multiple overlap', () => {
      const keywords = extractKeywords('Gestión de permisos de usuario');
      const match = findBestEpicMatch(keywords, existingEpics);
      expect(match).toBe('PLN-PCS-0002');
    });

    it('should require at least 40% overlap to match', () => {
      // Only 'sistema' overlaps out of many keywords - below threshold
      const keywords = extractKeywords('análisis profundo del sistema completo de la aplicación web moderna');
      const match = findBestEpicMatch(keywords, existingEpics);
      expect(match).toBeNull();
    });

    it('should match with substring inclusion', () => {
      // 'notificacion' is substring of 'notificaciones'
      const keywords = ['notificacion', 'sistema'];
      const match = findBestEpicMatch(keywords, existingEpics);
      expect(match).toBe('PLN-PCS-0001');
    });
  });

  describe('extractPhaseKeywords', () => {
    it('should extract keywords from phase name', () => {
      const phase = { name: 'Sistema de autenticación', tasks: [] };
      const keywords = extractPhaseKeywords(phase);
      expect(keywords).toContain('sistema');
      expect(keywords).toContain('autenticación');
    });

    it('should include task title keywords', () => {
      const phase = {
        name: 'Backend',
        tasks: [
          { title: 'Crear endpoint de autenticación' },
          { title: 'Validar tokens JWT' }
        ]
      };
      const keywords = extractPhaseKeywords(phase);
      expect(keywords).toContain('backend');
      expect(keywords).toContain('endpoint');
      expect(keywords).toContain('autenticación');
      expect(keywords).toContain('tokens');
      expect(keywords).toContain('jwt');
    });

    it('should deduplicate keywords', () => {
      const phase = {
        name: 'Sistema notificaciones',
        tasks: [{ title: 'Configurar sistema notificaciones push' }]
      };
      const keywords = extractPhaseKeywords(phase);
      const systemCount = keywords.filter(k => k === 'sistema').length;
      expect(systemCount).toBe(1);
    });

    it('should handle empty phase', () => {
      expect(extractPhaseKeywords(null)).toEqual([]);
      expect(extractPhaseKeywords({})).toEqual([]);
    });

    it('should handle phase with no tasks', () => {
      const phase = { name: 'Infraestructura' };
      const keywords = extractPhaseKeywords(phase);
      expect(keywords).toContain('infraestructura');
    });

    it('should prioritize name keywords (appear first)', () => {
      const phase = {
        name: 'Seguridad',
        tasks: [{ title: 'Implementar firewall' }]
      };
      const keywords = extractPhaseKeywords(phase);
      expect(keywords[0]).toBe('seguridad');
    });

    it('should improve epic matching with task context', () => {
      const existingEpics = [
        { cardId: 'EPC-001', title: 'sistema notificaciones push' },
        { cardId: 'EPC-002', title: 'gestión usuarios permisos' }
      ];

      // Phase name alone ("Servicios") wouldn't match, but task titles add "notificaciones" and "push"
      const phaseWithTasks = {
        name: 'Servicios',
        tasks: [
          { title: 'Notificaciones push' },
          { title: 'Sistema alertas' }
        ]
      };
      const keywords = extractPhaseKeywords(phaseWithTasks);
      // keywords: ['servicios', 'notificaciones', 'push', 'sistema', 'alertas']
      // epic 'sistema notificaciones push' keywords: ['sistema', 'notificaciones', 'push']
      // overlap: 3/5 = 60% > 40% threshold
      const match = findBestEpicMatch(keywords, existingEpics);
      expect(match).toBe('EPC-001');
    });
  });
});
