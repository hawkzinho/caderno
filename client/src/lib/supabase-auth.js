import { supabase } from './supabase';
import {
  DEFAULT_THEME,
  fetchOne,
  getAvatarColor,
  insertOne,
  normalizeErrorMessage,
  requireSession,
  sanitizeName,
  serializeUser,
  updateOne,
} from './supabase-data';

async function ensureProfile(authUser, overrides = {}) {
  const normalizedEmail = String(overrides.email || authUser?.email || '').trim().toLowerCase();
  const fallbackName = normalizedEmail ? normalizedEmail.split('@')[0] : 'Usuario';
  const name = sanitizeName(overrides.name || authUser?.user_metadata?.name, fallbackName);
  const existing = await fetchOne(
    'users',
    { id: authUser.id, deleted_at: null },
    'id, name, email, avatar_color, theme, preferences, created_at',
  );

  if (existing) {
    const updates = {};

    if (normalizedEmail && existing.email !== normalizedEmail) {
      updates.email = normalizedEmail;
    }

    if (!existing.name && name) {
      updates.name = name;
    }

    if (!existing.avatar_color) {
      updates.avatar_color = getAvatarColor(authUser.id);
    }

    if (!existing.theme) {
      updates.theme = DEFAULT_THEME;
    }

    if (!existing.preferences) {
      updates.preferences = '{}';
    }

    if (!Object.keys(updates).length) {
      return existing;
    }

    return updateOne(
      'users',
      { id: authUser.id },
      updates,
      'id, name, email, avatar_color, theme, preferences, created_at',
    );
  }

  return insertOne('users', {
    id: authUser.id,
    name,
    email: normalizedEmail,
    avatar_color: getAvatarColor(authUser.id),
    theme: DEFAULT_THEME,
    preferences: '{}',
    deleted_at: null,
  }, 'id, name, email, avatar_color, theme, preferences, created_at');
}

async function getMe() {
  const session = await requireSession();
  return serializeUser(await ensureProfile(session.user));
}

async function updateMe(data) {
  try {
    const session = await requireSession();
    const currentUser = await ensureProfile(session.user);
    const updates = {};

    if (data.name !== undefined) {
      updates.name = sanitizeName(data.name, currentUser.name);
    }

    if (data.theme !== undefined) {
      updates.theme = data.theme === 'dark' ? 'dark' : 'light';
    }

    if (data.preferences !== undefined) {
      updates.preferences = typeof data.preferences === 'string'
        ? data.preferences
        : JSON.stringify(data.preferences || {});
    }

    if (!Object.keys(updates).length) {
      return serializeUser(currentUser);
    }

    const updated = await updateOne(
      'users',
      { id: session.user.id },
      updates,
      'id, name, email, avatar_color, theme, preferences, created_at',
    );

    return serializeUser(updated);
  } catch (error) {
    throw new Error(normalizeErrorMessage(error, 'Nao foi possivel atualizar sua conta'));
  }
}

async function register({ name, email, password }) {
  try {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedName = sanitizeName(name, normalizedEmail.split('@')[0] || 'Usuario');
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          name: normalizedName,
        },
      },
    });

    if (error) {
      throw error;
    }

    let session = data.session;
    let authUser = data.user;

    if (!session && normalizedEmail && password) {
      const signInResult = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (!signInResult.error && signInResult.data.session) {
        session = signInResult.data.session;
        authUser = signInResult.data.user;
      }
    }

    if (!session?.user || !authUser) {
      throw new Error('Conta criada, mas a sessao nao foi iniciada. Desative a confirmacao de email no Supabase Auth para manter o fluxo atual.');
    }

    const user = serializeUser(await ensureProfile(authUser, { name: normalizedName, email: normalizedEmail }));

    return {
      token: session.access_token,
      user,
    };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error, 'Nao foi possivel criar sua conta'));
  }
}

async function login({ email, password }) {
  try {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error || !data?.session?.user) {
      throw error || new Error('Email ou senha incorretos');
    }

    const user = serializeUser(await ensureProfile(data.session.user, { email: normalizedEmail }));

    return {
      token: data.session.access_token,
      user,
    };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error, 'Nao foi possivel entrar'));
  }
}

async function logout() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(normalizeErrorMessage(error, 'Nao foi possivel encerrar a sessao'));
  }
}

export {
  ensureProfile,
  getMe,
  login,
  logout,
  register,
  updateMe,
};
