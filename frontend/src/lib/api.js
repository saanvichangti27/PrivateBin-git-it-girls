const API_BASE = 'http://localhost:8000';

export async function createPaste({ ciphertext, iv, salt, maxViews, expiresInSeconds }) {
  const response = await fetch(`${API_BASE}/paste`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ciphertext,
      iv,
      salt,
      ttl: expiresInSeconds || 86400, // default 24h if not specified
      max_views: maxViews,
      burn_threshold: 5,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to create secret link');
  }

  return response.json(); // returns { id, creator_token, expires_at, remaining_views, burn_threshold }
}

export async function getPaste(id) {
  const response = await fetch(`${API_BASE}/paste/${id}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const err = new Error(errorData.detail || 'Paste not found or has been destroyed.');
    err.status = response.status;
    throw err;
  }

  return response.json(); // returns { id, ciphertext, iv, salt, remaining_views, expires_at, is_locked }
}

export async function reportFailure(id) {
  const response = await fetch(`${API_BASE}/paste/${id}/report-failure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to report decryption failure');
  }

  return response.json(); // returns { burned, attempts_remaining, message }
}

export async function getAnalytics(id, token) {
  const response = await fetch(`${API_BASE}/paste/${id}/analytics?token=${encodeURIComponent(token)}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const err = new Error(errorData.detail || 'Failed to load security analytics.');
    err.status = response.status;
    throw err;
  }

  return response.json();
}

export async function toggleLock(id, token) {
  const response = await fetch(`${API_BASE}/paste/${id}/toggle-lock?token=${encodeURIComponent(token)}`, {
    method: 'POST',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to toggle lock status.');
  }

  return response.json();
}

export async function deletePaste(id, token) {
  const response = await fetch(`${API_BASE}/paste/${id}?token=${encodeURIComponent(token)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to delete paste.');
  }

  return response.json();
}
