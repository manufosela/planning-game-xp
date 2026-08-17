/**
 * Mock for Firebase services used in testing
 */

// In-memory data store for tests
let mockRtdbData = {};
let mockFirestoreData = {};

/**
 * Reset all mock data (call in beforeEach)
 */
export function resetMockData() {
  mockRtdbData = {};
  mockFirestoreData = {};
}

/**
 * Set mock RTDB data for testing
 * Uses nested structure to properly resolve sub-paths
 * @param {string} path - Database path (e.g., "/cards/TestProject/TASKS_TestProject")
 * @param {any} data - Data to set
 */
export function setMockRtdbData(path, data) {
  const parts = path.split('/').filter(p => p);
  if (parts.length === 0) {
    Object.assign(mockRtdbData, data);
    return;
  }

  let current = mockRtdbData;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = data;
}

/**
 * Get mock RTDB data (for assertions)
 * @param {string} path - Database path
 * @returns {any} Data at path
 */
export function getMockRtdbData(path) {
  const flat = mockRtdbData[path];
  if (flat !== undefined) return flat;
  return getNestedValue(mockRtdbData, path);
}

/**
 * Set mock Firestore data for testing
 * @param {string} collection - Collection name
 * @param {string} doc - Document ID
 * @param {any} data - Data to set
 */
export function setMockFirestoreData(collection, doc, data) {
  if (!mockFirestoreData[collection]) {
    mockFirestoreData[collection] = {};
  }
  mockFirestoreData[collection][doc] = data;
}

/**
 * Get nested value from object using path
 * @param {Object} obj - Object to traverse
 * @param {string} path - Path like "/a/b/c"
 * @returns {any} Value at path or undefined
 */
function getNestedValue(obj, path) {
  const parts = path.split('/').filter(p => p);
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Set nested value in object using path
 * @param {Object} obj - Object to modify
 * @param {string} path - Path like "/a/b/c"
 * @param {any} value - Value to set
 */
function setNestedValue(obj, path, value) {
  const parts = path.split('/').filter(p => p);
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

// Mock database reference
class MockRef {
  constructor(path) {
    this.path = path;
    this._lastPushKey = null;
  }

  // Minimal query-chain support (orderByChild().equalTo().limitToFirst())
  // used by syncProjectRolesToUsers — resolves to "no match" which is the
  // safe default for unit tests. PMC-BUG-0008.
  orderByChild() { return this; }
  equalTo() { return this; }
  limitToFirst() {
    return {
      once: async () => ({ val: () => null, exists: () => false })
    };
  }

  async once(eventType) {
    // First try exact path match
    let data = mockRtdbData[this.path];

    // If not found, try nested path resolution
    if (data === undefined) {
      data = getNestedValue(mockRtdbData, this.path);
    }

    return {
      val: () => data,
      exists: () => data !== undefined && data !== null
    };
  }

  push() {
    const key = `-mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this._lastPushKey = key;
    const parentPath = this.path;
    return {
      key,
      set: async (data) => {
        setNestedValue(mockRtdbData, `${parentPath}/${key}`, data);
      }
    };
  }

  async set(data) {
    setNestedValue(mockRtdbData, this.path, data);
  }

  async remove() {
    setNestedValue(mockRtdbData, this.path, null);
  }

  async update(data) {
    // Get current data at path
    let current = mockRtdbData[this.path];
    if (current === undefined) {
      current = getNestedValue(mockRtdbData, this.path);
    }

    if (!current) {
      current = {};
    }

    // Merge data
    Object.assign(current, data);

    // Update in mock store - need to set it back at the nested path
    setNestedValue(mockRtdbData, this.path, current);
  }
}

// Mock Firestore document reference
class MockDocRef {
  constructor(collection, docId) {
    this.collection = collection;
    this.docId = docId;
  }

  async get() {
    const data = mockFirestoreData[this.collection]?.[this.docId];
    return {
      exists: data !== undefined,
      data: () => data
    };
  }
}

// Mock Firestore collection reference
class MockCollectionRef {
  constructor(name) {
    this.name = name;
  }

  doc(docId) {
    return new MockDocRef(this.name, docId);
  }
}

// Mock database instance
const mockDb = {
  ref: (path) => new MockRef(path)
};

// Mock Firestore instance
const mockFirestore = {
  collection: (name) => new MockCollectionRef(name),
  runTransaction: async (callback) => {
    // Simple transaction mock
    const transaction = {
      get: async (docRef) => {
        const data = mockFirestoreData[docRef.collection]?.[docRef.docId];
        return {
          exists: data !== undefined,
          data: () => data
        };
      },
      set: (docRef, data, options) => {
        if (!mockFirestoreData[docRef.collection]) {
          mockFirestoreData[docRef.collection] = {};
        }
        if (options?.merge) {
          mockFirestoreData[docRef.collection][docRef.docId] = {
            ...mockFirestoreData[docRef.collection][docRef.docId],
            ...data
          };
        } else {
          mockFirestoreData[docRef.collection][docRef.docId] = data;
        }
      }
    };
    return await callback(transaction);
  }
};

/**
 * Mock getDatabase function
 */
export function getDatabase() {
  return mockDb;
}

/**
 * Mock getFirestore function
 */
export function getFirestore() {
  return mockFirestore;
}
