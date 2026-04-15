import { supabase } from './supabase';

const LEGACY_TOKEN_STORAGE_KEY = 'caderno_token';
const DEFAULT_THEME = 'light';
const DEFAULT_PAGE_CONTENT = { type: 'doc', content: [{ type: 'paragraph' }] };
const DEFAULT_PAGE_SETTINGS = { sheetStyle: 'lined', showMargin: true };
const MAX_HISTORY_ENTRIES = 50;
const AVATAR_PALETTE = ['#4f46e5', '#2563eb', '#0f766e', '#b45309', '#be185d', '#7c3aed'];

function clearLegacyToken() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
}

function normalizeErrorMessage(error, fallback = 'Erro desconhecido') {
  const message = error?.message || error?.error_description || error?.hint || '';
  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return 'Email ou senha incorretos';
  }

  if (normalized.includes('email not confirmed')) {
    return 'Confirme seu email no Supabase para entrar.';
  }

  if (normalized.includes('user already registered')) {
    return 'Este email ja esta cadastrado';
  }

  if (normalized.includes('duplicate key')) {
    return 'Este registro ja existe';
  }

  if (normalized.includes('row level security')) {
    return 'Voce nao tem permissao para acessar este dado';
  }

  return message || fallback;
}

function sanitizeName(value, fallback = 'Usuario') {
  const trimmed = String(value || '').trim();

  if (!trimmed) {
    return fallback;
  }

  return trimmed.slice(0, 100);
}

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeSheetStyle(value) {
  if (value === 'grid' || value === 'squared') {
    return 'grid';
  }

  if (value === 'plain' || value === 'blank') {
    return 'plain';
  }

  return 'lined';
}

function mapSheetStyleToTheme(sheetStyle) {
  if (sheetStyle === 'plain') {
    return 'blank';
  }

  if (sheetStyle === 'grid') {
    return 'squared';
  }

  return 'lined';
}

function normalizePageSettings(pageTheme, rawSettings) {
  const parsed = parseJson(rawSettings, {});

  return {
    sheetStyle: normalizeSheetStyle(parsed.sheetStyle || pageTheme),
    showMargin: typeof parsed.showMargin === 'boolean' ? parsed.showMargin : true,
  };
}

function serializePageSettings(pageTheme, rawSettings) {
  return JSON.stringify(normalizePageSettings(pageTheme, rawSettings));
}

function extractTextFromNode(node) {
  let text = '';

  if (node?.text) {
    text += `${node.text} `;
  }

  if (Array.isArray(node?.content)) {
    node.content.forEach((child) => {
      text += extractTextFromNode(child);
    });
  }

  return text;
}

function countWords(content) {
  const parsed = parseJson(content, DEFAULT_PAGE_CONTENT);
  const text = Array.isArray(parsed?.content)
    ? parsed.content.map((node) => extractTextFromNode(node)).join(' ')
    : '';

  return text.trim().split(/\s+/).filter(Boolean).length;
}

function toDatabaseDate(value) {
  if (!value) {
    return 0;
  }

  const normalized = String(value).includes('T')
    ? String(value)
    : `${String(value).replace(' ', 'T')}Z`;
  const parsed = Date.parse(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function todayKey() {
  return new Date().toISOString().split('T')[0];
}

function hashString(value) {
  return Array.from(String(value || '')).reduce((accumulator, character) => (
    ((accumulator << 5) - accumulator) + character.charCodeAt(0)
  ), 0);
}

function getAvatarColor(seed) {
  const index = Math.abs(hashString(seed)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}

function parsePreferences(preferences) {
  return parseJson(preferences, {});
}

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarColor: user.avatar_color,
    theme: user.theme || DEFAULT_THEME,
    preferences: parsePreferences(user.preferences),
    createdAt: user.created_at,
  };
}

function buildPageResponse(page) {
  return {
    ...page,
    page_settings: normalizePageSettings(page.page_theme, page.page_settings),
  };
}

function applyFilters(query, filters = {}) {
  let nextQuery = query;

  Object.entries(filters).forEach(([column, value]) => {
    if (value === undefined) {
      return;
    }

    if (value === null) {
      nextQuery = nextQuery.is(column, null);
      return;
    }

    if (Array.isArray(value)) {
      nextQuery = nextQuery.in(column, value);
      return;
    }

    nextQuery = nextQuery.eq(column, value);
  });

  return nextQuery;
}

async function fetchMany(table, {
  filters = {},
  select = '*',
  orderBy,
  ascending = true,
  limit,
} = {}) {
  let query = applyFilters(supabase.from(table).select(select), filters);

  if (orderBy) {
    query = query.order(orderBy, { ascending });
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

async function fetchOne(table, filters, select = '*') {
  const { data, error } = await applyFilters(
    supabase.from(table).select(select),
    filters,
  ).maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data || null;
}

async function insertOne(table, values, select = '*') {
  const { data, error } = await supabase
    .from(table)
    .insert(values)
    .select(select)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function updateOne(table, filters, values, select = '*') {
  const { data, error } = await applyFilters(
    supabase.from(table).update(values).select(select),
    filters,
  ).single();

  if (error) {
    throw error;
  }

  return data;
}

async function deleteMany(table, filters) {
  const { error } = await applyFilters(supabase.from(table).delete(), filters);

  if (error) {
    throw error;
  }
}

async function getMaxOrderIndex(table, filters) {
  const rows = await fetchMany(table, {
    filters,
    select: 'order_index',
    orderBy: 'order_index',
    ascending: false,
    limit: 1,
  });

  return Number(rows[0]?.order_index || 0);
}

async function requireSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(normalizeErrorMessage(error, 'Nao foi possivel recuperar a sessao'));
  }

  if (!data.session?.user) {
    throw new Error('Sessao expirada');
  }

  return data.session;
}

async function requireUserId() {
  const session = await requireSession();
  return session.user.id;
}

export {
  DEFAULT_PAGE_CONTENT,
  DEFAULT_PAGE_SETTINGS,
  DEFAULT_THEME,
  MAX_HISTORY_ENTRIES,
  buildPageResponse,
  clearLegacyToken,
  countWords,
  deleteMany,
  fetchMany,
  fetchOne,
  getAvatarColor,
  getMaxOrderIndex,
  insertOne,
  mapSheetStyleToTheme,
  normalizeErrorMessage,
  normalizePageSettings,
  normalizeSheetStyle,
  parseJson,
  parsePreferences,
  requireSession,
  requireUserId,
  sanitizeName,
  serializePageSettings,
  serializeUser,
  toDatabaseDate,
  todayKey,
  updateOne,
};
