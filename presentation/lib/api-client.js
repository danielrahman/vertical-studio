const DEFAULT_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

function getApiBaseUrl() {
  return String(process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

async function apiRequest(pathname, options = {}) {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${pathname}`;
  const headers = {
    'content-type': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: options.cache || 'no-store'
  });

  const isJson = String(response.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const error = new Error(
      payload && typeof payload === 'object' && payload.message
        ? payload.message
        : `API request failed (${response.status})`
    );
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

module.exports = {
  apiRequest,
  getApiBaseUrl
};
