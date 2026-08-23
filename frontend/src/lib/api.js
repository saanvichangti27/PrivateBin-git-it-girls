/**
 * MOCK API - TEMP
 * This simulates a real backend using browser localStorage.
 * Replace these functions with real fetch() calls to Express later.
 */

const STORAGE_KEY = 'secureshare-pastes';

function loadPastes() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function savePastes(pastes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pastes));
}

/**
 * Creates a new paste.
 * @param {Object} data 
 * @param {string} data.ciphertext
 * @param {string} data.iv
 * @param {string} data.salt
 * @param {number} data.maxViews
 * @param {number} data.expiresInSeconds
 * @returns {Promise<{ id: string }>}
 */
export async function createPaste({ ciphertext, iv, salt, maxViews, expiresInSeconds }) {
  // Generate random alphanumeric ID (approx 10 chars)
  const id = Math.random().toString(36).substring(2, 12);
  const pastes = loadPastes();
  
  const expiresAt = expiresInSeconds 
    ? Date.now() + (expiresInSeconds * 1000) 
    : null;

  pastes[id] = {
    ciphertext,
    iv,
    salt,
    maxViews: maxViews ? Number(maxViews) : null,
    views: 0,
    expiresAt,
    createdAt: Date.now()
  };
  savePastes(pastes);

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 300));
  
  return { id };
}

/**
 * Retrieves a paste by ID.
 * Decrements view count if applicable.
 * @param {string} id
 * @returns {Promise<{ ciphertext: string, iv: string, salt: string }>}
 */
export async function getPaste(id) {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 300));

  const pastes = loadPastes();
  const paste = pastes[id];

  if (!paste) {
    throw new Error('Paste not found or has been destroyed.');
  }

  // Check expiration
  if (paste.expiresAt && Date.now() > paste.expiresAt) {
    delete pastes[id]; // Destroy it
    savePastes(pastes);
    throw new Error('This secret link has expired and was destroyed.');
  }

  // Check view limits
  if (paste.maxViews !== null) {
    if (paste.views >= paste.maxViews) {
      delete pastes[id];
      savePastes(pastes);
      throw new Error('This secret has reached its maximum view limit and was destroyed.');
    }
    paste.views += 1;
    
    // Destroy immediately after reading if it hit the limit just now
    if (paste.views >= paste.maxViews) {
        // We will return it this time, but delete it so it can't be fetched again.
        // Copy data before deleting
        const data = { ciphertext: paste.ciphertext, iv: paste.iv, salt: paste.salt };
        delete pastes[id];
        savePastes(pastes);
        return data;
    }
  }

  savePastes(pastes);

  return {
    ciphertext: paste.ciphertext,
    iv: paste.iv,
    salt: paste.salt
  };
}
