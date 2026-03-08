import { dalService } from './dal-service.js';
import { decodeEmailFromFirebase } from '../utils/email-sanitizer.js';
import { normalizeDeveloperEntry } from '../utils/developer-normalizer.js';
import { developerDirectory } from '../config/developer-directory.js';

/**
 * Servicio centralizado para cargar y resolver el directorio de usuarios desde /data/usersDirectory
 */
class UserDirectoryService {
  constructor() {
    this._byEmail = {};
    this._byAlias = {};
    this._byCanonical = {};
    this._canonicalNameMap = new Map();
    this._loaded = false;
    this._loadingPromise = null;
  }

  async load(force = false) {
    if (this._loaded && !force) {
      return this._byEmail;
    }
    if (this._loadingPromise && !force) {
      return this._loadingPromise;
    }

    this._loadingPromise = dalService.config.getUsersDirectory()
      .then(raw => {
        this._process(raw || {});
        this._loaded = true;
        this._loadingPromise = null;
        return this._byEmail;
      })
      .catch(error => {
        this._byEmail = {};
        this._byAlias = {};
        this._loaded = false;
        this._loadingPromise = null;
        throw error;
      });

    return this._loadingPromise;
  }

  _process(raw) {
    const byEmail = {};
    const byAlias = {};
    const byCanonical = {};
    const directoryNameMap = this._buildDirectoryNameMap();
    const canonicalNameMap = new Map();

    const toEmail = (value) => {
      if (!value) return '';
      if (value.includes('|') || value.includes('!')) {
        try {
          return decodeEmailFromFirebase(value).toLowerCase();
        } catch {
          return value.toLowerCase();
        }
      }
      return value.toLowerCase();
    };

    Object.entries(raw).forEach(([key, entry]) => {
      const decodedKey = toEmail(key);
      const email = toEmail(entry?.email) || decodedKey;
      if (!email) return;
      const aliases = Array.isArray(entry?.aliases) ? entry.aliases : [];
      const name = entry?.name 
        || this._findNameFromDirectory(email, aliases, directoryNameMap)
        || this._deriveName(email) 
        || '';
      const normalized = {
        name,
        email,
        aliases: aliases.map(toEmail).filter(Boolean),
        roles: {
          developer: entry?.roles?.developer || [],
          stakeholder: entry?.roles?.stakeholder || []
        },
        isAdmin: !!entry?.isAdmin,
        isSuperAdmin: !!entry?.isSuperAdmin
      };
      byEmail[email] = normalized;
      normalized.aliases.forEach(alias => {
        if (alias && !byAlias[alias]) {
          byAlias[alias] = normalized;
        }
      });

      // Unificar alternativas de email (por ejemplo #ext# o dominios onmicrosoft) usando clave canónica
      const canonicalKey = this._canonicalKey(email);
      if (canonicalKey) {
        if (!byCanonical[canonicalKey]) {
          byCanonical[canonicalKey] = {
            name: normalized.name,
            email: normalized.email,
            aliases: new Set([normalized.email, ...normalized.aliases]),
            roles: normalized.roles,
            isAdmin: normalized.isAdmin,
            isSuperAdmin: normalized.isSuperAdmin
          };
        } else {
          const target = byCanonical[canonicalKey];
          if (!target.name && normalized.name) target.name = normalized.name;
          if (!target.email && normalized.email) target.email = normalized.email;
          normalized.aliases.forEach(a => target.aliases.add(a));
          target.aliases.add(normalized.email);
        }
      }

      // Construir mapa de nombre por claves derivadas
      this._allKeysForIdentifier(email, aliases).forEach(key => {
        if (!canonicalNameMap.has(key) && name) {
          canonicalNameMap.set(key, name);
        }
      });
    });

    // Convertir sets a arrays y propagar aliases/roles fusionados a byEmail/byAlias
    Object.values(byCanonical).forEach(entry => {
      entry.aliases = Array.from(entry.aliases).filter(Boolean);
      if (!entry.name) {
        entry.name = this._deriveName(entry.email || entry.aliases[0]) || entry.email || '';
      }
      const allKeys = [entry.email, ...entry.aliases].filter(Boolean);
      allKeys.forEach(key => {
        if (key && !byEmail[key]) {
          byEmail[key] = {
            ...entry,
            aliases: entry.aliases
          };
        } else if (byEmail[key]) {
          // Asegurar que el entry ya existente hereda aliases unificados
          byEmail[key].aliases = entry.aliases;
          if (!byEmail[key].name) {
            byEmail[key].name = entry.name;
          }
        }
        if (key && !byAlias[key]) {
          byAlias[key] = byEmail[key] || entry;
        }
      });
    });

    this._byEmail = byEmail;
    this._byAlias = byAlias;
    this._byCanonical = byCanonical;
    this._canonicalNameMap = canonicalNameMap;
  }

  getUser(identifier) {
    const email = (identifier || '').toLowerCase();
    const direct = this._byEmail[email] || this._byAlias[email];
    if (direct) return direct;

    // Intentar coincidencia por clave canónica (para variantes de externos)
    const canonicalKey = this._canonicalKey(email);
    if (canonicalKey && this._byCanonical[canonicalKey]) {
      return this._byCanonical[canonicalKey];
    }

    // Intentar claves derivadas (limpias y locales)
    const derivedKeys = this._allKeysForIdentifier(identifier, []);
    for (const key of derivedKeys) {
      if (this._byEmail[key]) return this._byEmail[key];
      if (this._byAlias[key]) return this._byAlias[key];
      if (this._byCanonical[key]) return this._byCanonical[key];
    }
    return null;
  }

  getDisplay(identifier) {
    const entry = this.getUser(identifier);
    if (entry) {
      const name = entry.name || this._deriveName(entry.email);
      return {
        name: name || entry.email,
        email: entry.email,
        isAdmin: entry.isAdmin,
        isSuperAdmin: entry.isSuperAdmin,
        roles: entry.roles || { developer: [], stakeholder: [] }
      };
    }
    const normalized = normalizeDeveloperEntry({ email: identifier || '', name: identifier || '' });
    return {
      name: normalized.name || this._deriveName(identifier) || identifier,
      email: normalized.email || identifier,
      isAdmin: false,
      isSuperAdmin: false,
      roles: { developer: [], stakeholder: [] }
    };
  }

  /**
   * Resuelve nombre de display usando todas las fuentes (usersDirectory, developerDirectory, canónicos)
   */
  resolveDisplayName(identifier) {
    if (!identifier) return '';

    // 1) Entrada real en usersDirectory (sin fallback)
    const user = this.getUser(identifier);
    if (user?.name) return user.name;

    const derivedKeys = this._allKeysForIdentifier(identifier, []);
    for (const key of derivedKeys) {
      if (this._canonicalNameMap.has(key)) {
        return this._canonicalNameMap.get(key);
      }
    }

    const dirMap = this._buildDirectoryNameMap();
    for (const key of derivedKeys) {
      if (dirMap.has(key)) {
        return dirMap.get(key);
      }
    }

    return this._deriveName(identifier) || identifier;
  }

  _deriveName(email) {
    if (!email) return '';
    const cleanedEmail = this._decodeEmail(email);
    const local = (cleanedEmail.includes('@') ? cleanedEmail.split('@')[0] : cleanedEmail) || '';
    const normalized = local.replace('#ext#', '').replace(/[._!]/g, ' ');
    return normalized
      .split(' ')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  _canonicalKey(emailLike) {
    if (!emailLike) return '';
    const decoded = this._decodeEmail(emailLike);
    const lower = decoded.toLowerCase();
    const local = lower.split('@')[0] || lower;
    // Quitar sufijos #ext# y caracteres de separación para obtener clave estable
    const stripped = local.replace('#ext#', '');
    let cleaned = stripped.replace(/[^a-z0-9]/gi, '');
    if (cleaned.endsWith('ext')) {
      cleaned = cleaned.slice(0, -3);
    }
    return cleaned;
  }

  _decodeEmail(value) {
    if (!value) return '';
    if (value.includes('|') || value.includes('!') || value.includes('-')) {
      try {
        return decodeEmailFromFirebase(value);
      } catch {
        return value;
      }
    }
    return value;
  }

  _buildDirectoryNameMap() {
    const map = new Map();
    const register = (key, name) => {
      if (!key || !name) return;
      map.set(key.toLowerCase(), name);
    };

    developerDirectory.forEach(entry => {
      const name = entry.name || '';
      if (!name) return;
      const primary = entry.primaryEmail || '';
      const emails = entry.emails || [];
      const aliases = entry.aliases || [];
      const registerVariants = (value) => {
        if (!value) return;
        register(value, name);
        const decoded = this._decodeEmail(value);
        register(decoded, name);
        const local = (decoded.split('@')[0] || decoded).toLowerCase();
        register(local, name);
        const localLetters = local.replace(/[^a-z]/gi, '');
        register(localLetters, name);
        const cleaned = this._canonicalKey(decoded);
        register(cleaned, name);
      };
      registerVariants(primary);
      emails.forEach(registerVariants);
      aliases.forEach(registerVariants);
    });

    return map;
  }

  _findNameFromDirectory(email, aliases, nameMap) {
    const tryKeys = [];
    if (email) tryKeys.push(email);
    (aliases || []).forEach(a => tryKeys.push(a));

    for (const key of tryKeys) {
      if (!key) continue;
      const lower = key.toLowerCase();
      if (nameMap.has(lower)) {
        return nameMap.get(lower);
      }
      const canonical = this._canonicalKey(lower);
      if (canonical) {
        if (nameMap.has(canonical)) {
          return nameMap.get(canonical);
        }
        const cleanLower = canonical.replace(/[^a-z0-9]/gi, '');
        if (nameMap.has(cleanLower)) {
          return nameMap.get(cleanLower);
        }
      }

      // Buscar por fragmentos alfabéticos (ej. "dnfernandez maurerlabs com#ext#")
      const fragments = lower.split(/[^a-z]+/).filter(Boolean);
      for (const frag of fragments) {
        if (nameMap.has(frag)) {
          return nameMap.get(frag);
        }
      }
      const joined = fragments.join('');
      if (joined && nameMap.has(joined)) {
        return nameMap.get(joined);
      }
    }
    return '';
  }

  _allKeysForIdentifier(identifier, aliases = []) {
    const keys = new Set();
    const push = (v) => { if (v) keys.add(v.toLowerCase()); };

    const candidates = [identifier, ...aliases];
    candidates.forEach(val => {
      if (!val) return;
      const decoded = this._decodeEmail(val);
      push(val);
      push(decoded);
      const local = decoded.split('@')[0] || decoded;
      push(local);
      const cleaned = local.replace('#ext#', '').replace(/[^a-z0-9]/gi, '');
      push(cleaned);
      if (cleaned.endsWith('ext')) {
        push(cleaned.slice(0, -3));
      }
      // También probar recortar en espacios (por si llegan "dnfernandez maurerlabs com#ext#")
      local.split(' ').forEach(part => {
        const partial = part.replace('#ext#', '').replace(/[^a-z0-9]/gi, '');
        push(part);
        push(partial);
        if (partial.endsWith('ext')) {
          push(partial.slice(0, -3));
        }
      });

      // Intentar sintetizar emails a partir de fragmentos separados
      const fragments = decoded
        .replace('#ext#', '')
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map(f => f.toLowerCase());
      if (fragments.length) {
        const joined = fragments.join('');
        push(joined);
      }
      if (fragments.length >= 2) {
        const localPart = fragments[0];
        const domainParts = fragments.slice(1).filter(p => p !== 'ext');
        if (domainParts.length) {
          const emailCandidate = `${localPart}@${domainParts.join('.')}`;
          push(emailCandidate);
          const cleanedEmailCandidate = emailCandidate.replace(/[^a-z0-9@.]/gi, '');
          push(cleanedEmailCandidate);
          push(localPart);
          push(localPart.replace(/[^a-z]/gi, ''));
        }
      }
    });

    return Array.from(keys).filter(Boolean);
  }
}

export const userDirectoryService = new UserDirectoryService();
