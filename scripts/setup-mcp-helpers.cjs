/**
 * Shared helpers for MCP setup (used by setup.cjs and setup-mcp.cjs).
 *
 * Provides fetchUsers() and setupMcpUser() for generating mcp.user.json
 * with developer identity (developerId, stakeholderId, name, email).
 */

const fs = require('fs');
const path = require('path');

/**
 * Fetch users from centralized /users/ model in Firebase RTDB.
 * Returns an array of { devId, stakeholderId, name, email }.
 * Falls back to /projects/ if /users/ is empty (legacy).
 */
async function fetchUsers(keyPath, databaseURL) {
  let admin;
  try {
    admin = require('firebase-admin');
  } catch {
    return null; // firebase-admin not available
  }

  const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const app = admin.initializeApp({
    credential: admin.credential.cert(sa),
    databaseURL
  }, 'setup-mcp-user-' + Date.now());

  try {
    const db = app.database();

    // Try centralized /users/ model first
    const usersSnapshot = await db.ref('/users').once('value');
    const usersData = usersSnapshot.val();

    if (usersData) {
      const users = [];
      for (const [, userData] of Object.entries(usersData)) {
        if (!userData || typeof userData !== 'object') continue;
        if (!userData.developerId) continue;
        if (userData.active === false) continue;
        users.push({
          devId: userData.developerId,
          stakeholderId: userData.stakeholderId || null,
          name: userData.name || '',
          email: (userData.email || '').toLowerCase()
        });
      }
      if (users.length > 0) return users;
    }

    // Fallback: read from /projects/ (legacy, no stakeholder info)
    const projSnapshot = await db.ref('/projects').once('value');
    const projects = projSnapshot.val();
    if (!projects) return [];

    const users = [];
    const seen = new Set();
    for (const [, projData] of Object.entries(projects)) {
      const devs = projData.developers || {};
      for (const [devId, devData] of Object.entries(devs)) {
        if (seen.has(devId)) continue;
        seen.add(devId);
        if (devData && typeof devData === 'object') {
          users.push({
            devId,
            stakeholderId: null,
            name: devData.name || devData.displayName || '',
            email: (devData.email || '').toLowerCase()
          });
        }
      }
    }
    return users;
  } finally {
    await app.delete();
  }
}

/**
 * Setup mcp.user.json interactively during MCP installation.
 *
 * @param {object} options
 * @param {Function} options.question - async (prompt, defaultValue?) => string
 * @param {Function} options.print - (message) => void
 * @param {string} options.instanceDir - path to instance directory
 * @param {string} options.keyPath - path to serviceAccountKey.json
 * @param {string} options.databaseURL - Firebase RTDB URL
 */
async function setupMcpUser({ question, print, instanceDir, keyPath, databaseURL }) {
  const mcpUserPath = path.join(instanceDir, 'mcp.user.json');

  print('\n=== Configuracion de identidad MCP ===\n');

  // Check existing config
  if (fs.existsSync(mcpUserPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(mcpUserPath, 'utf8'));
      print('Configuracion actual encontrada:');
      print(`  Developer: ${existing.name || existing.developerName || 'N/A'} (${existing.developerId || 'N/A'})`);
      print(`  Email: ${existing.email || existing.developerEmail || 'N/A'}`);
      if (existing.stakeholderId) print(`  Stakeholder: ${existing.stakeholderId}`);
      const update = await question('Actualizar configuracion? (s/N)', 'N');
      if (update.toLowerCase() !== 's') {
        print('  Manteniendo configuracion actual.');
        return;
      }
    } catch {
      // Corrupted file, regenerate
    }
  }

  // Ask for email
  const email = await question('Tu email de desarrollador');
  if (!email) {
    print('  Email vacio, saltando configuracion de identidad.');
    return;
  }

  // Try to find user in Firebase
  let matchedUser = null;
  print('  Buscando usuario en Firebase...');

  try {
    const users = await fetchUsers(keyPath, databaseURL);
    if (users && users.length > 0) {
      const normalizedEmail = email.toLowerCase().trim();
      matchedUser = users.find(d => d.email === normalizedEmail);

      if (matchedUser) {
        const stkLabel = matchedUser.stakeholderId ? `, stakeholder: ${matchedUser.stakeholderId}` : '';
        print(`  Encontrado: ${matchedUser.name} (${matchedUser.devId}${stkLabel})`);
      } else {
        print('  Email no encontrado en la lista de usuarios.');
        print('  Usuarios disponibles:');
        for (const u of users) {
          const stkLabel = u.stakeholderId ? `, ${u.stakeholderId}` : '';
          print(`    ${u.devId}: ${u.name} (${u.email || 'sin email'}${stkLabel})`);
        }
        const devId = await question('Introduce tu developer ID (ej: dev_001)');
        if (devId) {
          const found = users.find(u => u.devId === devId);
          matchedUser = {
            devId,
            stakeholderId: found ? found.stakeholderId : null,
            name: found ? found.name : '',
            email: normalizedEmail
          };
        }
      }
    }
  } catch (error) {
    print(`  No se pudo conectar a Firebase: ${error.message}`);
    print('  Puedes configurar manualmente mas tarde.');
  }

  if (!matchedUser) {
    const devId = await question('Developer ID (ej: dev_001)');
    const name = await question('Tu nombre');
    if (devId) {
      matchedUser = { devId, stakeholderId: null, name, email: email.toLowerCase().trim() };
    }
  }

  if (matchedUser) {
    const userData = {
      developerId: matchedUser.devId,
      stakeholderId: matchedUser.stakeholderId || null,
      name: matchedUser.name,
      email: matchedUser.email || email.toLowerCase().trim()
    };
    fs.writeFileSync(mcpUserPath, JSON.stringify(userData, null, 2) + '\n');
    print(`  mcp.user.json generado en: ${mcpUserPath}`);
    print(`  Developer: ${userData.name} (${userData.developerId})`);
    if (userData.stakeholderId) {
      print(`  Stakeholder: ${userData.stakeholderId}`);
    }
  } else {
    print('  Saltando generacion de mcp.user.json.');
  }
}

module.exports = { fetchUsers, setupMcpUser };
