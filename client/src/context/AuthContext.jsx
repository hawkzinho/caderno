import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearLegacyToken } from '../api/client';
import { supabase } from '../lib/supabase';
import { normalizePreferences } from '../utils/preferences';

const AuthContext = createContext(null);

function normalizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    ...user,
    theme: 'light',
    preferences: normalizePreferences(user.preferences),
  };
}

function getInitialTheme() {
  return 'light';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(getInitialTheme);

  const applyTheme = useCallback(() => {
    setTheme('light');

    if (typeof window !== 'undefined') {
      document.documentElement.dataset.theme = 'light';
      document.documentElement.style.colorScheme = 'light';
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [applyTheme, theme]);

  useEffect(() => {
    let cancelled = false;
    clearLegacyToken();

    const syncUser = async (session) => {
      if (!session?.user) {
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        const currentUser = await api.getMe();

        if (cancelled) {
          return;
        }

        const normalizedUser = normalizeUser(currentUser);
        setUser(normalizedUser);
        applyTheme(normalizedUser.theme);
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    supabase.auth.getSession()
      .then(({ data }) => syncUser(data.session))
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncUser(session);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [applyTheme]);

  const login = useCallback(async (email, password) => {
    const data = await api.login({ email, password });
    const normalizedUser = normalizeUser(data.user);

    setUser(normalizedUser);
    applyTheme(normalizedUser.theme);

    return normalizedUser;
  }, [applyTheme]);

  const register = useCallback(async (name, email, password) => {
    const data = await api.register({ name, email, password });
    const normalizedUser = normalizeUser(data.user);

    setUser(normalizedUser);
    applyTheme(normalizedUser.theme);

    return normalizedUser;
  }, [applyTheme]);

  const logout = useCallback(async () => {
    await api.endSession().catch(() => {});
    await api.logout().catch(() => {});
    setUser(null);
    applyTheme(getInitialTheme());
  }, [applyTheme]);

  const updateTheme = useCallback(async () => {
    applyTheme('light');
    setUser((currentUser) => (currentUser ? { ...currentUser, theme: 'light' } : currentUser));

    if (!user) {
      return { theme: 'light' };
    }

    const updatedUser = normalizeUser(await api.updateMe({ theme: 'light' }));
    setUser(updatedUser);
    return updatedUser;
  }, [applyTheme, user]);

  const updatePreferences = useCallback(async (preferences) => {
    const normalizedPreferences = normalizePreferences(preferences);
    const previousPreferences = user?.preferences || normalizePreferences();
    setUser((currentUser) => (currentUser ? { ...currentUser, preferences: normalizedPreferences } : currentUser));

    try {
      const updatedUser = normalizeUser(await api.updateMe({ preferences: normalizedPreferences }));
      setUser(updatedUser);
      return updatedUser;
    } catch (error) {
      setUser((currentUser) => (currentUser ? { ...currentUser, preferences: previousPreferences } : currentUser));
      throw error;
    }
  }, [user?.preferences]);

  const value = useMemo(() => ({
    user,
    theme,
    loading,
    login,
    register,
    logout,
    updateTheme,
    updatePreferences,
    isAuthenticated: Boolean(user),
  }), [loading, login, logout, register, theme, updatePreferences, updateTheme, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
