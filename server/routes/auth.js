const express = require('express');
const { authenticate } = require('../middleware/auth');
const { fetchOne, insertOne, updateOne } = require('../lib/supabase-db');
const { getSupabaseAdmin, getSupabaseAuth } = require('../lib/supabase');

const router = express.Router();
const DEFAULT_THEME = 'light';

function parsePreferences(preferences) {
  if (!preferences) {
    return {};
  }

  if (typeof preferences === 'object') {
    return preferences;
  }

  try {
    return JSON.parse(preferences);
  } catch {
    return {};
  }
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

async function getUserProfile(userId) {
  return fetchOne(
    'users',
    {
      id: userId,
      deleted_at: null,
    },
    'id, name, email, avatar_color, theme, preferences, created_at',
  );
}

router.post('/register', async (req, res) => {
  let createdAuthUserId = null;

  try {
    const trimmedName = req.body.name?.trim();
    const normalizedEmail = req.body.email?.toLowerCase().trim();
    const password = req.body.password;

    if (!trimmedName || !normalizedEmail || !password) {
      return res.status(400).json({ error: 'Nome, email e senha sao obrigatorios' });
    }

    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Email invalido' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no minimo 6 caracteres' });
    }

    const existing = await fetchOne('users', { email: normalizedEmail, deleted_at: null }, 'id');
    if (existing) {
      return res.status(409).json({ error: 'Este email ja esta cadastrado' });
    }

    const avatarPalette = ['#4f46e5', '#2563eb', '#0f766e', '#b45309', '#be185d', '#7c3aed'];
    const avatarColor = avatarPalette[Math.floor(Math.random() * avatarPalette.length)];
    const admin = getSupabaseAdmin();
    const auth = getSupabaseAuth();

    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        name: trimmedName,
      },
    });

    if (createUserError || !createdUser?.user) {
      if (createUserError?.status === 422 || /already/i.test(createUserError?.message || '')) {
        return res.status(409).json({ error: 'Este email ja esta cadastrado' });
      }

      throw createUserError || new Error('Nao foi possivel criar o usuario no Supabase Auth');
    }

    createdAuthUserId = createdUser.user.id;

    const existingProfile = await fetchOne('users', { id: createdAuthUserId }, 'id');

    if (existingProfile) {
      await updateOne('users', { id: createdAuthUserId }, {
        name: trimmedName,
        email: normalizedEmail,
        avatar_color: avatarColor,
        theme: DEFAULT_THEME,
        preferences: '{}',
      });
    } else {
      await insertOne('users', {
        id: createdAuthUserId,
        name: trimmedName,
        email: normalizedEmail,
        avatar_color: avatarColor,
        theme: DEFAULT_THEME,
        preferences: '{}',
      });
    }

    const { data: sessionData, error: signInError } = await auth.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInError || !sessionData?.session) {
      throw signInError || new Error('Nao foi possivel iniciar a sessao');
    }

    const user = await getUserProfile(createdAuthUserId);

    res.status(201).json({
      token: sessionData.session.access_token,
      user: serializeUser(user),
    });
  } catch (error) {
    if (createdAuthUserId) {
      try {
        await getSupabaseAdmin().auth.admin.deleteUser(createdAuthUserId);
      } catch (cleanupError) {
        console.error('Auth cleanup error:', cleanupError);
      }
    }

    console.error('Register error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const normalizedEmail = req.body.email?.toLowerCase().trim();
    const password = req.body.password;

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'Email e senha sao obrigatorios' });
    }

    const { data, error } = await getSupabaseAuth().auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error || !data?.user || !data?.session) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const user = await getUserProfile(data.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Usuario nao encontrado' });
    }

    res.json({
      token: data.session.access_token,
      user: serializeUser(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await getUserProfile(req.userId);

    if (!user) {
      return res.status(404).json({ error: 'Usuario nao encontrado' });
    }

    res.json(serializeUser(user));
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.patch('/me', authenticate, async (req, res) => {
  try {
    const currentUser = await getUserProfile(req.userId);

    if (!currentUser) {
      return res.status(404).json({ error: 'Usuario nao encontrado' });
    }

    const updates = {};

    if (req.body.name !== undefined) {
      const trimmedName = req.body.name.trim();

      if (trimmedName.length < 2 || trimmedName.length > 100) {
        return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres' });
      }

      updates.name = trimmedName;
    }

    if (req.body.theme !== undefined) {
      if (!['light', 'dark'].includes(req.body.theme)) {
        return res.status(400).json({ error: 'Tema deve ser "light" ou "dark"' });
      }

      updates.theme = req.body.theme;
    }

    if (req.body.preferences !== undefined) {
      updates.preferences = typeof req.body.preferences === 'string'
        ? req.body.preferences
        : JSON.stringify(req.body.preferences);
    }

    const updated = Object.keys(updates).length
      ? await updateOne('users', { id: req.userId }, updates, 'id, name, email, avatar_color, theme, preferences, created_at')
      : currentUser;

    res.json(serializeUser(updated));
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
