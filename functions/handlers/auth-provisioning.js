/**
 * Handlers for auth-provisioning Cloud Functions.
 * - requestEmailAccess: creates pending email/password account requests
 * - provisionDemoData: provisions sample project & data for new demo users
 * - setEncodedEmailClaim: auto-provisions new users on Firebase Auth account creation
 *
 * Extracted from functions/index.js during monolith refactor.
 */
'use strict';

const { encodeEmailForFirebase } = require('../shared/email-utils.cjs');
const { isEmailPreAuthorized } = require('../shared/auth-utils.cjs');

/**
 * Handle a callable request to create a pending email/password account request.
 * Creates/updates a disabled Firebase Auth user and stores the request for approval.
 *
 * @param {object} payload - { fullName, email, password }
 * @param {object} deps - { admin, firestore, logger, DEMO_MODE, ALLOWED_SIGNUP_EMAIL_DOMAINS, ACCOUNT_REQUESTS_COLLECTION }
 * @returns {Promise<object>} { status: 'pending' }
 */
async function handleRequestEmailAccess(payload, deps) {
  const { admin, firestore, logger, ALLOWED_SIGNUP_EMAIL_DOMAINS, ACCOUNT_REQUESTS_COLLECTION } = deps;
  const functions = require('firebase-functions/v1');

  const error = (code, message) => {
    throw new functions.https.HttpsError(code, message);
  };

  const data = payload || {};
  const fullName = typeof data.fullName === 'string' ? data.fullName.trim() : '';
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const password = typeof data.password === 'string' ? data.password : '';

  if (!fullName || fullName.length < 3) {
    error('invalid-argument', 'Debes indicar tu nombre completo.');
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    error('invalid-argument', 'El correo electrónico no es válido.');
  }

  if (!password || password.length < 6) {
    error('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.');
  }

  const emailDomain = email.split('@')[1];
  if (!emailDomain || !ALLOWED_SIGNUP_EMAIL_DOMAINS.includes(emailDomain)) {
    error('failed-precondition', 'El dominio del correo no está autorizado.');
  }
  const encodedEmailKey = encodeEmailForFirebase(email);
  const requestRef = firestore.collection(ACCOUNT_REQUESTS_COLLECTION).doc(encodedEmailKey);

  let existingRequestData = null;
  try {
    const existingRequestSnap = await requestRef.get();
    if (existingRequestSnap.exists) {
      existingRequestData = existingRequestSnap.data();
      if (existingRequestData?.status === 'pending') {
        error('already-exists', 'Ya existe una solicitud pendiente para este correo.');
      }
    }
  } catch (requestError) {
    logger.error('Error checking existing account request', requestError);
    throw new functions.https.HttpsError('internal', 'No se pudo validar la solicitud existente.');
  }

  let userRecord = null;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
    if (userRecord && !userRecord.disabled) {
      error('already-exists', 'Este usuario ya tiene acceso activo.');
    }
  } catch (authError) {
    if (authError.code !== 'auth/user-not-found') {
      logger.error('Error retrieving user before account request', authError);
      throw new functions.https.HttpsError('internal', 'No se pudo validar el estado del usuario.');
    }
  }

  if (!userRecord) {
    try {
      userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: fullName,
        disabled: true
      });
    } catch (createError) {
      if (createError.code === 'auth/email-already-exists') {
        error('already-exists', 'Ya existe un usuario con este correo.');
      }
      logger.error('Error creating pending user', createError);
      throw new functions.https.HttpsError('internal', 'No se pudo crear la cuenta. Inténtalo más tarde.');
    }
  } else {
    try {
      await admin.auth().updateUser(userRecord.uid, {
        password,
        displayName: fullName,
        disabled: true
      });
    } catch (updateError) {
      logger.error(`Error updating existing disabled user ${userRecord.uid}`, updateError);
      throw new functions.https.HttpsError('internal', 'No se pudo actualizar la cuenta existente.');
    }
  }

  const encodedEmailClaim = encodeEmailForFirebase(email);
  const existingClaims = (userRecord && userRecord.customClaims) ? userRecord.customClaims : {};

  try {
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      ...existingClaims,
      encodedEmail: encodedEmailClaim,
      accountStatus: 'pending'
    });
  } catch (claimsError) {
    logger.error(`Error setting custom claims for ${userRecord.uid}`, claimsError);
    throw new functions.https.HttpsError('internal', 'No se pudo registrar la solicitud.');
  }

  const timestamps = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  try {
    await requestRef.set({
      uid: userRecord.uid,
      email,
      fullName,
      status: 'pending',
      ...timestamps,
      createdAt: existingRequestData?.createdAt || admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (writeError) {
    logger.error('Error storing account request', writeError);
    throw new functions.https.HttpsError('internal', 'No se pudo guardar la solicitud.');
  }

  logger.info('Nueva solicitud de acceso registrada', {
    email,
    uid: userRecord.uid
  });

  return {
    status: 'pending'
  };
}

/**
 * Provision demo data for a new user: creates a sample project with
 * example cards (tasks, bugs, epics, sprint) so users can explore
 * the app immediately after signup.
 *
 * Uses the user's email prefix as the project name to isolate data per user.
 * If the user already has a project, this is a no-op (idempotent).
 *
 * @param {string} email - User's email address
 * @param {string} encodedEmail - Firebase-encoded email
 * @param {object} deps - { db, logger }
 * @returns {Promise<void>}
 */
async function handleProvisionDemoData(email, encodedEmail, deps) {
  const { db, logger } = deps;
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const year = new Date().getFullYear();
  const userPrefix = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
  const projectId = `Demo_${userPrefix}`;
  const projectAbbr = 'DMO';
  const createdBy = email;

  // Check if user already has a project (idempotent)
  const existingProject = await db.ref(`/projects/${projectId}`).once('value');
  if (existingProject.exists()) {
    logger.info(`DEMO: Project ${projectId} already exists for ${email}, skipping provision`);
    return;
  }

  // 1. Create project
  const projectData = {
    name: projectId,
    abbreviation: projectAbbr,
    scoringSystem: '1-5',
    description: 'Sample demo project — explore tasks, bugs, sprints, and more!',
    stakeholders: [{ name: email.split('@')[0], email }],
    developers: [{ id: 'dev_demo', name: email.split('@')[0], email }],
    iaEnabled: false,
    createdAt: now,
    createdBy,
  };
  await db.ref(`/projects/${projectId}`).set(projectData);

  // 2. Create sprint
  const sprintStart = new Date();
  const sprintEnd = new Date(sprintStart.getTime() + 14 * 24 * 60 * 60 * 1000);
  const sprintRef = db.ref(`/cards/${projectId}/SPRINTS_${projectId}`).push();
  const sprintId = `${projectAbbr}-SPR-0001`;
  await sprintRef.set({
    cardId: sprintId,
    id: sprintRef.key,
    firebaseId: sprintRef.key,
    cardType: 'sprint-card',
    group: 'sprints',
    section: 'sprints',
    projectId,
    startDate: today,
    endDate: sprintEnd.toISOString().split('T')[0],
    businessPoints: 0,
    devPoints: 0,
    year,
    createdBy,
    createdAt: now,
    updatedAt: now,
  });

  // 3. Create epics
  const epics = [
    { title: 'Getting Started', desc: 'Onboarding and setup tasks' },
    { title: 'Core Features', desc: 'Main application functionality' },
  ];
  const epicIds = [];
  for (let i = 0; i < epics.length; i++) {
    const epicRef = db.ref(`/cards/${projectId}/EPICS_${projectId}`).push();
    const epicId = `${projectAbbr}-PCS-${String(i + 1).padStart(4, '0')}`;
    epicIds.push(epicId);
    await epicRef.set({
      cardId: epicId,
      id: epicRef.key,
      firebaseId: epicRef.key,
      cardType: 'epic-card',
      group: 'epics',
      section: 'epics',
      projectId,
      title: epics[i].title,
      description: epics[i].desc,
      year,
      createdBy,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 4. Create sample tasks (various statuses for demo)
  const tasks = [
    {
      title: 'Explore the Kanban board',
      status: 'To Do',
      devPoints: 1, businessPoints: 3,
      desc: { role: 'As a new user', goal: 'I want to see the Kanban board', benefit: 'To understand task workflow' },
    },
    {
      title: 'Try drag and drop between columns',
      status: 'To Do',
      devPoints: 1, businessPoints: 2,
      desc: { role: 'As a user', goal: 'I want to drag tasks between status columns', benefit: 'To learn how to update task status' },
    },
    {
      title: 'Create your first task',
      status: 'To Do',
      devPoints: 1, businessPoints: 4,
      desc: { role: 'As a user', goal: 'I want to create a new task', benefit: 'To start managing my work' },
    },
    {
      title: 'Review the sprint view',
      status: 'In Progress',
      devPoints: 2, businessPoints: 3,
      desc: { role: 'As a user', goal: 'I want to check the sprint planning view', benefit: 'To plan my work across sprints' },
      startDate: today,
    },
    {
      title: 'Check the dashboard',
      status: 'Done&Validated',
      devPoints: 1, businessPoints: 2,
      desc: { role: 'As a user', goal: 'I want to see the project dashboard', benefit: 'To get an overview of project health' },
      startDate: today,
      endDate: today,
    },
  ];

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const taskRef = db.ref(`/cards/${projectId}/TASKS_${projectId}`).push();
    const cardId = `${projectAbbr}-TSK-${String(i + 1).padStart(4, '0')}`;
    await taskRef.set({
      cardId,
      id: taskRef.key,
      firebaseId: taskRef.key,
      cardType: 'task-card',
      group: 'tasks',
      section: 'tasks',
      projectId,
      title: t.title,
      status: t.status,
      description: '',
      descriptionStructured: t.desc,
      sprint: sprintId,
      epic: epicIds[i < 3 ? 0 : 1],
      developer: t.status !== 'To Do' ? 'dev_demo' : '',
      validator: '',
      businessPoints: t.businessPoints,
      devPoints: t.devPoints,
      startDate: t.startDate || '',
      endDate: t.endDate || '',
      year,
      createdBy,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 5. Create sample bug
  const bugRef = db.ref(`/cards/${projectId}/BUGS_${projectId}`).push();
  await bugRef.set({
    cardId: `${projectAbbr}-BUG-0001`,
    id: bugRef.key,
    firebaseId: bugRef.key,
    cardType: 'bug-card',
    group: 'bugs',
    section: 'bugs',
    projectId,
    title: 'Sample bug: button alignment on mobile',
    status: 'Created',
    priority: 'USER EXPERIENCE ISSUE',
    description: 'The submit button overlaps with the form on small screens',
    registerDate: today,
    sprint: sprintId,
    year,
    createdBy,
    createdAt: now,
    updatedAt: now,
  });

  // 6. Create sample proposal
  const proposalRef = db.ref(`/cards/${projectId}/PROPOSALS_${projectId}`).push();
  await proposalRef.set({
    cardId: `${projectAbbr}-PRP-0001`,
    id: proposalRef.key,
    firebaseId: proposalRef.key,
    cardType: 'proposal-card',
    group: 'proposals',
    section: 'proposals',
    projectId,
    title: 'Add dark mode support',
    status: 'Proposed',
    description: '',
    descriptionStructured: {
      role: 'As a user',
      goal: 'I want a dark mode option',
      benefit: 'To reduce eye strain during night usage',
    },
    year,
    createdBy,
    createdAt: now,
    updatedAt: now,
  });

  // 7. Add user to appPerms for their demo project + shared demo project
  const sharedDemoProject = 'TaskFlow';
  const userProjects = [projectId];
  // If the shared demo project exists, also grant access
  const sharedSnap = await db.ref(`/projects/${sharedDemoProject}`).once('value');
  if (sharedSnap.exists()) {
    userProjects.push(sharedDemoProject);
  }
  await db.ref(`/data/appPerms/${encodedEmail}`).set({
    projects: userProjects,
    updatedAt: now,
  });

  logger.info(`DEMO: Provisioned sample data for ${email}`, {
    projectId,
    tasks: tasks.length,
    bugs: 1,
    proposals: 1,
    epics: epics.length,
  });
}

/**
 * Auto-provisions new users on Firebase Auth account creation.
 * - Sets `encodedEmail` custom claim (for security rules)
 * - Checks /data/allowedUsers and sets `allowed: true` if pre-authorized
 * - Gmail normalization: treats john.doe@gmail.com = johndoe@gmail.com
 * - In DEMO_MODE: auto-allows all users with role=demo claim
 *
 * @param {object} user - Firebase Auth UserRecord
 * @param {object} deps - { admin, db, logger, DEMO_MODE, provisionDemoData }
 * @returns {Promise<object|null>}
 */
async function handleSetEncodedEmailClaim(user, deps) {
  const { admin, db, logger, DEMO_MODE, provisionDemoData } = deps;

  if (!user.email) return null;

  const email = user.email.toLowerCase();
  const encodedEmail = encodeEmailForFirebase(email);

  try {
    const existingUserRecord = await admin.auth().getUser(user.uid);
    const currentClaims = existingUserRecord.customClaims || {};

    const newClaims = {
      ...currentClaims,
      encodedEmail,
    };

    if (DEMO_MODE) {
      // Demo instance: auto-allow all users with demo role
      newClaims.allowed = true;
      newClaims.role = 'demo';
      logger.info(`DEMO MODE: auto-allowing user ${email} with role=demo`, { uid: user.uid });
    } else {
      // Production: check if user is pre-authorized in /data/allowedUsers
      const isAllowed = await isEmailPreAuthorized(email, db);
      if (isAllowed) {
        newClaims.allowed = true;
        logger.info(`User ${email} is pre-authorized, setting allowed=true`, { uid: user.uid });
      } else {
        logger.info(`User ${email} is NOT pre-authorized`, { uid: user.uid });
      }
    }

    await admin.auth().setCustomUserClaims(user.uid, newClaims);
    logger.info(`Custom claims set for user ${user.uid}`, {
      encodedEmail,
      allowed: newClaims.allowed || false,
      role: newClaims.role || 'standard',
      demoMode: DEMO_MODE,
    });

    // Log the claim setting
    await db.ref(`/userClaimsLog/${user.uid}`).set({
      email,
      encodedEmail,
      allowed: newClaims.allowed || false,
      role: newClaims.role || 'standard',
      timestamp: Date.now(),
    });

    // Record first-login event in login history
    await db.ref(`/loginHistory/${encodedEmail}`).push({
      timestamp: new Date().toISOString(),
      email,
      displayName: user.displayName || '',
      provider: user.providerData?.[0]?.providerId || 'unknown',
      loginType: 'first-login',
      userAgent: 'server-side',
    });

    // Demo mode: provision sample project and data for new user
    if (DEMO_MODE) {
      try {
        await provisionDemoData(email, encodedEmail);
      } catch (provisionError) {
        // Non-fatal: user is still allowed, just without sample data
        logger.error(`DEMO MODE: Failed to provision demo data for ${email}`, provisionError);
      }
    }

    return { success: true, email, allowed: newClaims.allowed || false };
  } catch (error) {
    logger.error(`Failed to provision user ${user.uid}`, error);
    return null;
  }
}

module.exports = { handleRequestEmailAccess, handleProvisionDemoData, handleSetEncodedEmailClaim };
