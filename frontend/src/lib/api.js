const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
      burn_threshold: 5
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to create secret link');
  }

  return response.json(); // returns { id, expires_at, remaining_views, burn_threshold }
}

export async function getPaste(id) {
  const response = await fetch(`${API_BASE}/paste/${id}`);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Paste not found or has been destroyed.');
  }

  return response.json(); // returns { id, ciphertext, iv, salt, remaining_views, expires_at }
}

export async function reportFailure(id) {
  const response = await fetch(`${API_BASE}/paste/${id}/report-failure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    }
  });

  if (!response.ok) {
    throw new Error('Failed to report decryption failure');
  }

  return response.json(); // returns { burned, attempts_remaining, message }
}
