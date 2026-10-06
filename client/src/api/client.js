const rawApiUrl = import.meta.env.VITE_API_URL;
const API_BASE = rawApiUrl ? `${rawApiUrl.replace(/\/$/, '')}/api` : '/api';

export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('nandini_token');
  const headers = {
    ...(options.headers || {})
  };

  // Only set application/json if body is not FormData and not explicitly defined
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    // Handle excel or blob responses
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('spreadsheetml')) {
      if (!res.ok) throw new Error('Failed to generate excel file');
      return await res.blob();
    }

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const errorMsg = data?.error || (res.status === 401 ? 'Session expired. Please log in again.' : 'Unable to complete request. Please try again.');
      throw new Error(errorMsg);
    }

    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Unable to load data. Please check your connection and try again.');
    }
    throw err;
  }
}

export const api = {
  get: (url) => apiRequest(url, { method: 'GET' }),
  post: (url, body) => apiRequest(url, { method: 'POST', body: JSON.stringify(body) }),
  put: (url, body) => apiRequest(url, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (url, body) => apiRequest(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (url) => apiRequest(url, { method: 'DELETE' }),
  upload: (url, formData) => apiRequest(url, { method: 'POST', body: formData }),
  getBlob: (url) => apiRequest(url, { method: 'GET' })
};

