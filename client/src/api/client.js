const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const TOKEN_STORAGE_KEY = 'caderno_token';

function getToken() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

function setToken(token) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function removeToken() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function parseResponseBody(response) {
  const rawBody = await response.text();

  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

async function request(endpoint, options = {}, config = {}) {
  const token = getToken();
  const headers = { ...options.headers };
  const isFormData = options.body instanceof FormData;

  if (!isFormData) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const requestOptions = {
    ...options,
    headers,
  };

  if (requestOptions.body && typeof requestOptions.body === 'object' && !isFormData) {
    requestOptions.body = JSON.stringify(requestOptions.body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, requestOptions);
  const data = await parseResponseBody(response);

  if (response.status === 401) {
    const isAuthRequest = endpoint.startsWith('/auth/login') || endpoint.startsWith('/auth/register');
    const shouldRedirect = token && !isAuthRequest && !config.suppressAuthRedirect;

    if (shouldRedirect) {
      removeToken();

      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }

    throw new Error(data?.error || (shouldRedirect ? 'Sessao expirada' : 'Nao autorizado'));
  }

  if (!response.ok) {
    throw new Error(data?.error || 'Erro desconhecido');
  }

  return data;
}

export const api = {
  register: (data) => request('/auth/register', { method: 'POST', body: data }, { suppressAuthRedirect: true }),
  login: (data) => request('/auth/login', { method: 'POST', body: data }, { suppressAuthRedirect: true }),
  getMe: () => request('/auth/me'),
  updateMe: (data) => request('/auth/me', { method: 'PATCH', body: data }),

  getWorkspace: () => request('/subjects/tree'),
  getNotebookList: () => request('/subjects'),
  createNotebook: (data) => request('/subjects', { method: 'POST', body: data }),
  updateNotebook: (id, data) => request(`/subjects/${id}`, { method: 'PUT', body: data }),
  deleteNotebook: (id) => request(`/subjects/${id}`, { method: 'DELETE' }),

  createSubject: (data) => request('/notebooks', { method: 'POST', body: data }),
  updateSubject: (id, data) => request(`/notebooks/${id}`, { method: 'PUT', body: data }),
  deleteSubject: (id) => request(`/notebooks/${id}`, { method: 'DELETE' }),

  getPage: (id) => request(`/pages/${id}`),
  createPage: (data) => request('/pages', { method: 'POST', body: data }),
  updatePage: (id, data) => request(`/pages/${id}`, { method: 'PUT', body: data }),
  autoSavePage: (id, data) => request(`/pages/${id}/autosave`, { method: 'PATCH', body: data }),
  deletePage: (id) => request(`/pages/${id}`, { method: 'DELETE' }),
  permanentDeletePage: (id) => request(`/pages/${id}/permanent`, { method: 'DELETE' }),
  restorePage: (id) => request(`/pages/${id}/restore`, { method: 'PATCH' }),
  toggleFavorite: (id) => request(`/pages/${id}/favorite`, { method: 'PATCH' }),
  togglePin: (id) => request(`/pages/${id}/pin`, { method: 'PATCH' }),
  duplicatePage: (id) => request(`/pages/${id}/duplicate`, { method: 'POST' }),
  getFavorites: () => request('/pages/user/favorites'),
  getRecent: () => request('/pages/user/recent'),
  searchPages: (query, filters = {}) => {
    const params = new URLSearchParams({ q: query, ...filters });
    return request(`/pages/user/search?${params.toString()}`);
  },

  getDashboard: () => request('/stats/dashboard'),
  startSession: (pageId) => request('/stats/session/start', { method: 'POST', body: { page_id: pageId } }),
  endSession: () => request('/stats/session/end', { method: 'POST' }),
};

export { getToken, setToken, removeToken };
