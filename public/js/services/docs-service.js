/**
 * Documentation Service
 * Handles CRUD operations for documentation via DAL
 */

import { dalService } from './dal-service.js';

class DocsService {
  constructor() {
    this.cache = new Map();
    this.listeners = new Map();
    this.initialized = false;
  }

  /**
   * Get Firebase Auth module (only for currentUser).
   */
  async _getAuth() {
    const module = await import(
      /* @vite-ignore */ `${window.location.origin}/firebase-config.js`
    );
    return module.auth;
  }

  /**
   * Get all documents
   * @returns {Promise<Array>} Array of documents
   */
  async getAllDocs() {
    try {
      const data = await dalService.docs.getAllDocsGlobal();

      if (!data) {
        return [];
      }

      const docs = Object.entries(data).map(([key, val]) => ({
        id: key,
        ...val
      }));

      // Sort by section and order
      docs.sort((a, b) => {
        if (a.section !== b.section) {
          return (a.section || '').localeCompare(b.section || '');
        }
        return (a.order || 0) - (b.order || 0);
      });

      // Update cache
      docs.forEach(doc => this.cache.set(doc.id, doc));

      return docs;
    } catch (error) {
      console.error('Error getting documents:', error);
      throw error;
    }
  }

  /**
   * Get a single document by ID
   * @param {string} docId - Document ID
   * @returns {Promise<Object|null>} Document or null
   */
  async getDoc(docId) {
    // Check cache first
    if (this.cache.has(docId)) {
      return this.cache.get(docId);
    }

    try {
      const data = await dalService.docs.getDocGlobal(docId);

      if (!data) {
        return null;
      }

      const doc = { id: docId, ...data };
      this.cache.set(docId, doc);
      return doc;
    } catch (error) {
      console.error('Error getting document:', error);
      throw error;
    }
  }

  /**
   * Get document by path
   * @param {string} path - Document path (e.g., "/git/workflow")
   * @returns {Promise<Object|null>} Document or null
   */
  async getDocByPath(path) {
    const docs = await this.getAllDocs();
    return docs.find(doc => doc.path === path) || null;
  }

  /**
   * Save a document (create or update)
   * @param {Object} doc - Document data
   * @returns {Promise<Object>} Saved document with ID
   */
  async saveDoc(doc) {
    try {
      const auth = await this._getAuth();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error('User must be authenticated to save documents');
      }

      const now = new Date().toISOString();
      const isNew = !doc.id;
      let docId = doc.id;
      let previousDoc = null;

      if (!isNew) {
        previousDoc = await dalService.docs.getDocGlobal(docId);
      }

      const docData = {
        title: doc.title || 'Sin título',
        content: doc.content || '',
        path: doc.path || `/${docId}`,
        section: doc.section || 'general',
        order: doc.order || 0,
        updatedAt: now,
        updatedBy: currentUser.email
      };

      if (isNew) {
        docData.createdAt = now;
        docData.createdBy = currentUser.email;
        docId = await dalService.docs.createDocGlobal(docData);
      } else {
        // Preserve creation info
        docData.createdAt = previousDoc?.createdAt || now;
        docData.createdBy = previousDoc?.createdBy || currentUser.email;
        await dalService.docs.setDocGlobal(docId, docData);
      }

      // Save history
      await this.saveHistory(docId, docData, isNew ? 'create' : 'update', currentUser.email);

      // Update cache
      const savedDoc = { id: docId, ...docData };
      this.cache.set(docId, savedDoc);

      return savedDoc;
    } catch (error) {
      console.error('Error saving document:', error);
      throw error;
    }
  }

  /**
   * Delete a document (soft delete - moves to trash)
   * @param {string} docId - Document ID
   * @returns {Promise<boolean>} Success
   */
  async deleteDoc(docId) {
    try {
      const auth = await this._getAuth();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error('User must be authenticated to delete documents');
      }

      // Get document data before deletion
      const docData = await dalService.docs.getDocGlobal(docId);

      if (!docData) {
        return false;
      }

      // Move to trash
      await dalService.docs.setDocTrash(docId, {
        ...docData,
        deletedAt: new Date().toISOString(),
        deletedBy: currentUser.email
      });

      // Save history
      await this.saveHistory(docId, docData, 'delete', currentUser.email);

      // Delete from main location
      await dalService.docs.removeDocGlobal(docId);

      // Remove from cache
      this.cache.delete(docId);

      return true;
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  }

  /**
   * Save document history entry
   * @param {string} docId - Document ID
   * @param {Object} docData - Document data
   * @param {string} action - Action type (create, update, delete)
   * @param {string} userEmail - User email
   */
  async saveHistory(docId, docData, action, userEmail) {
    try {
      await dalService.docs.pushDocHistory(docId, {
        title: docData.title,
        content: docData.content,
        timestamp: new Date().toISOString(),
        changedBy: userEmail,
        action: action
      });
    } catch (error) {
      console.error('Error saving history:', error);
      // Don't throw - history is secondary
    }
  }

  /**
   * Get document history
   * @param {string} docId - Document ID
   * @returns {Promise<Array>} History entries sorted by timestamp desc
   */
  async getDocHistory(docId) {
    try {
      const data = await dalService.docs.getDocHistory(docId);

      if (!data) {
        return [];
      }

      const history = Object.entries(data).map(([key, val]) => ({
        id: key,
        ...val
      }));

      // Sort by timestamp descending (most recent first)
      history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return history;
    } catch (error) {
      console.error('Error getting history:', error);
      throw error;
    }
  }

  /**
   * Restore a document from history
   * @param {string} docId - Document ID
   * @param {string} historyId - History entry ID to restore
   * @returns {Promise<Object>} Restored document
   */
  async restoreFromHistory(docId, historyId) {
    try {
      const auth = await this._getAuth();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error('User must be authenticated to restore documents');
      }

      // Get history entry
      const historyEntry = await dalService.docs.getDocHistoryEntry(docId, historyId);

      if (!historyEntry) {
        throw new Error('History entry not found');
      }

      // Get current document to preserve some fields
      const currentDoc = await this.getDoc(docId);

      // Save restored version
      return await this.saveDoc({
        id: docId,
        title: historyEntry.title,
        content: historyEntry.content,
        path: currentDoc?.path || `/${docId}`,
        section: currentDoc?.section || 'general',
        order: currentDoc?.order || 0
      });
    } catch (error) {
      console.error('Error restoring from history:', error);
      throw error;
    }
  }

  /**
   * Subscribe to document changes
   * @param {string} docId - Document ID (or null for all docs)
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribeToDoc(docId, callback) {
    return dalService.docs.subscribeToDocGlobal(docId, (data) => {
      if (docId) {
        const doc = data ? { id: docId, ...data } : null;
        if (doc) this.cache.set(docId, doc);
        callback(doc);
      } else {
        const docs = [];
        if (data) {
          Object.entries(data).forEach(([key, val]) => {
            const doc = { id: key, ...val };
            docs.push(doc);
            this.cache.set(doc.id, doc);
          });
        }
        callback(docs);
      }
    });
  }

  /**
   * Get sections with their documents (grouped)
   * @returns {Promise<Object>} Sections with documents
   */
  async getDocsGroupedBySections() {
    const docs = await this.getAllDocs();
    const sections = {};

    docs.forEach(doc => {
      const section = doc.section || 'general';
      if (!sections[section]) {
        sections[section] = [];
      }
      sections[section].push(doc);
    });

    return sections;
  }

  /**
   * Get all sections
   * @returns {Promise<Array>} Array of sections sorted by order
   */
  async getAllSections() {
    try {
      const data = await dalService.docs.getAllSectionsGlobal();

      if (!data) {
        return [];
      }

      const sections = Object.entries(data).map(([key, val]) => ({
        id: key,
        ...val
      }));

      // Sort by order
      sections.sort((a, b) => (a.order || 0) - (b.order || 0));

      return sections;
    } catch (error) {
      console.error('Error getting sections:', error);
      throw error;
    }
  }

  /**
   * Save a section (create or update)
   * @param {Object} section - Section data
   * @returns {Promise<Object>} Saved section with ID
   */
  async saveSection(section) {
    try {
      const auth = await this._getAuth();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error('User must be authenticated to save sections');
      }

      const now = new Date().toISOString();
      const isNew = !section.id;
      let sectionId = section.id;

      if (isNew) {
        // Generate a section ID based on slug
        sectionId = `section_${this.slugify(section.name)}`;
      }

      const sectionData = {
        name: section.name || 'Nueva sección',
        slug: section.slug || this.slugify(section.name),
        order: section.order ?? 0,
        updatedAt: now,
        updatedBy: currentUser.email
      };

      if (isNew) {
        sectionData.createdAt = now;
        sectionData.createdBy = currentUser.email;
      }

      await dalService.docs.setSectionGlobal(sectionId, sectionData);

      return { id: sectionId, ...sectionData };
    } catch (error) {
      console.error('Error saving section:', error);
      throw error;
    }
  }

  /**
   * Delete a section
   * @param {string} sectionId - Section ID
   * @returns {Promise<boolean>} Success
   */
  async deleteSection(sectionId) {
    try {
      const auth = await this._getAuth();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error('User must be authenticated to delete sections');
      }

      await dalService.docs.removeSectionGlobal(sectionId);

      return true;
    } catch (error) {
      console.error('Error deleting section:', error);
      throw error;
    }
  }

  /**
   * Get the next available order number for a section
   * @param {string} sectionSlug - Section slug
   * @returns {Promise<number>} Next order number
   */
  async getNextOrderForSection(sectionSlug) {
    const docs = await this.getAllDocs();
    const sectionDocs = docs.filter(d => d.section === sectionSlug);

    if (sectionDocs.length === 0) {
      return 0;
    }

    const maxOrder = Math.max(...sectionDocs.map(d => d.order || 0));
    return maxOrder + 1;
  }

  /**
   * Convert string to slug
   * @param {string} text - Text to slugify
   * @returns {string} Slug
   */
  slugify(text) {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Get initial sections for migration
   */
  getInitialSections() {
    return [
      { name: 'Git', slug: 'git', order: 0 },
      { name: 'Deploy', slug: 'deploy', order: 1 },
      { name: 'IA', slug: 'ai', order: 2 },
      { name: 'PlanningGame', slug: 'planninggame', order: 3 }
    ];
  }

  /**
   * Migrate initial sections to Firebase
   * @returns {Promise<number>} Number of sections created
   */
  async migrateInitialSections() {
    try {
      const auth = await this._getAuth();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error('User must be authenticated to migrate sections');
      }

      const initialSections = this.getInitialSections();
      const now = new Date().toISOString();
      let count = 0;

      for (const section of initialSections) {
        const sectionId = `section_${section.slug}`;
        await dalService.docs.setSectionGlobal(sectionId, {
          ...section,
          createdAt: now,
          createdBy: currentUser.email,
          updatedAt: now,
          updatedBy: currentUser.email
        });

        count++;
      }

      return count;
    } catch (error) {
      console.error('Error migrating sections:', error);
      throw error;
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Initial documentation content for migration
   */
  getInitialDocs() {
    return [
      {
        title: 'Visión general',
        path: '/git/overview',
        section: 'git',
        order: 0,
        content: `# Git

Guía oficial de cómo trabajamos con Git en el equipo.

## Contenido

- [Flujo de trabajo](#/git/workflow)
- [Calidad en PR](#/git/pr-quality-gates)
- [Plan de transición](#/git/transition)`
      },
      {
        title: 'Flujo de trabajo',
        path: '/git/workflow',
        section: 'git',
        order: 1,
        content: `# Flujo de trabajo Git

Trabajamos con **Trunk-Based Development**.

## Principios

- Una única rama principal: \`main\`
- \`main\` siempre debe ser desplegable
- Todo cambio entra por Pull Request
- Las ramas de trabajo son cortas

## Ramas

- \`feature/<ticket>-<descripcion>\`
- \`fix/<ticket>-<descripcion>\`
- \`chore/<descripcion>\`

## Pull Requests

- PR obligatoria hacia \`main\`
- Revisión automática por IA
- Revisión humana obligatoria
- Merge solo cuando todo está en OK

## Hotfix

Un hotfix no es un flujo especial. Es un fix normal que entra en \`main\` y se libera como versión.

## Entornos

Los entornos no son ramas. DEV, PRE y PRO son decisiones de despliegue, no ramas Git.`
      },
      {
        title: 'Calidad en PR',
        path: '/git/pr-quality-gates',
        section: 'git',
        order: 2,
        content: `# Calidad y requisitos de PR

Para que una PR pueda mergearse a \`main\` debe cumplir:

## Requisitos obligatorios

- Build correcta
- Lint correcto
- Tests correctos
- Revisión IA: OK
- Revisión humana: OK
- Conversaciones resueltas

## Qué revisa la IA

- Bugs evidentes
- Problemas de seguridad
- Problemas de rendimiento obvios
- Complejidad innecesaria
- Código duplicado

## Qué revisa el humano

- Correctitud funcional
- Diseño y mantenibilidad
- Impacto en el sistema
- Riesgos y trade-offs

## Urgencias

En casos críticos se puede reducir el alcance, pero nunca se elimina la revisión humana ni la de IA.`
      },
      {
        title: 'Plan de transición',
        path: '/git/transition',
        section: 'git',
        order: 3,
        content: `# Plan de transición

Objetivo: pasar a trunk-based sin romper el delivery.

## Fase 1

- PR obligatoria
- Protección de \`main\`
- Checks automáticos

## Fase 2

- Eliminar ramas por entorno
- Todo fix entra en \`main\`

## Fase 3

- Endurecer calidad
- IA como check obligatorio

## Escalabilidad

Este modelo funciona con equipos de 10–12 personas porque reduce coordinación y dependencias humanas.`
      },
      {
        title: 'Visión general',
        path: '/deploy/overview',
        section: 'deploy',
        order: 0,
        content: `# Despliegues

Guías de despliegue independientes del flujo Git.

## Contenido

- [Vercel](#/deploy/vercel)`
      },
      {
        title: 'Vercel',
        path: '/deploy/vercel',
        section: 'deploy',
        order: 1,
        content: `# Despliegue en Vercel

Esta guía define un modelo ideal de despliegue en Vercel.

## Principios

- Despliegues explícitos
- Producción trazable
- Rollback posible

## Entornos

- **DEV**: integración continua
- **PRE**: validación controlada
- **PRO**: solo versiones aprobadas

## Requisitos para desplegar

- Código aprobado en \`main\`
- Calidad verificada
- Responsabilidad clara de quién despliega`
      },
      {
        title: 'Visión general',
        path: '/ai/overview',
        section: 'ai',
        order: 0,
        content: `# IA en el flujo de desarrollo

Uso de inteligencia artificial para revisar Pull Requests.

## Contenido

- [Revisión de PR con IA](#/ai/pr-review-openai)`
      },
      {
        title: 'Revisión PR',
        path: '/ai/pr-review-openai',
        section: 'ai',
        order: 1,
        content: `# Revisión de PR con IA

La IA revisa todas las Pull Requests.

## Rol de la IA

- Analiza el diff
- Detecta problemas
- Emite OK o NOK

## Rol del humano

- Toma la decisión final
- Evalúa contexto y producto

## Política

- IA OK + Humano OK = merge permitido
- IA NOK = la PR no puede mergearse`
      },
      {
        title: 'Visión general',
        path: '/planninggame/overview',
        section: 'planninggame',
        order: 0,
        content: `# PlanningGame

Integración futura entre PlanningGame, GitHub y despliegues.

## Contenido

- [Documento de integración](#/planninggame/integration)`
      },
      {
        title: 'Integración',
        path: '/planninggame/integration',
        section: 'planninggame',
        order: 1,
        content: `# Integración con PlanningGame

Este documento describe una integración futura.

## Objetivo

- Vincular tickets con PRs
- Visualizar estado de calidad
- Conocer qué versión está en cada entorno

## Fases

1. Visibilidad
2. Gobernanza
3. Acciones

*No se implementa código aún.*`
      }
    ];
  }

  /**
   * Migrate initial documentation to Firebase
   * @returns {Promise<number>} Number of documents created
   */
  async migrateInitialDocs() {
    try {
      const auth = await this._getAuth();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error('User must be authenticated to migrate documents');
      }

      const initialDocs = this.getInitialDocs();
      const now = new Date().toISOString();
      let count = 0;

      for (let i = 0; i < initialDocs.length; i++) {
        const doc = initialDocs[i];
        const docId = `doc_${String(i + 1).padStart(3, '0')}`;

        await dalService.docs.setDocGlobal(docId, {
          ...doc,
          createdAt: now,
          createdBy: currentUser.email,
          updatedAt: now,
          updatedBy: currentUser.email
        });

        count++;
      }

      // Clear cache to reload
      this.clearCache();

      return count;
    } catch (error) {
      console.error('Error migrating documents:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const docsService = new DocsService();
