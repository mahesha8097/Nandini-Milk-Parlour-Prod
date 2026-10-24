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

    let data = null;
    try {
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        // text is not json
      }
    } catch {
      // response body could not be read
    }

    if (!res.ok) {
      let errorMsg = data?.error || data?.message || data?.details;
      if (!errorMsg) {
        if (res.status === 401) {
          errorMsg = 'Invalid username or password or session expired.';
        } else if (res.status === 403) {
          errorMsg = 'Access denied. You do not have permission.';
        } else if (res.status === 404) {
          errorMsg = 'Requested resource was not found.';
        } else if (res.status >= 500) {
          errorMsg = 'Server is currently starting up or experiencing high traffic. Please try again.';
        } else {
          errorMsg = 'Unable to complete request. Please try again.';
        }
      }
      const errorObj = new Error(errorMsg);
      if (data && typeof data === 'object') {
        Object.assign(errorObj, data);
      }
      throw errorObj;
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
  get: (url, options = {}) => {
    let finalUrl = url;
    if (options.params) {
      const searchParams = new URLSearchParams();
      for (const [key, val] of Object.entries(options.params)) {
        if (val !== undefined && val !== null && val !== '') {
          searchParams.append(key, val);
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + qs;
      }
    }
    return apiRequest(finalUrl, { ...options, method: 'GET' });
  },
  post: (url, body) => apiRequest(url, { method: 'POST', body: JSON.stringify(body) }),
  put: (url, body) => apiRequest(url, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (url, body) => apiRequest(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (url) => apiRequest(url, { method: 'DELETE' }),
  upload: (url, formData) => apiRequest(url, { method: 'POST', body: formData }),
  getBlob: (url) => apiRequest(url, { method: 'GET' })
};

