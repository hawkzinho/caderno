import { clearLegacyToken } from '../lib/supabase-data';
import { getMe, login, logout, register, updateMe } from '../lib/supabase-auth';
import {
  createNotebook,
  createSubject,
  deleteNotebook,
  deleteSubject,
  getWorkspace,
  updateNotebook,
  updateSubject,
} from '../lib/supabase-workspace';
import {
  autoSavePage,
  createPage,
  deletePage,
  getPage,
  updatePage,
} from '../lib/supabase-pages';
import { endSession, startSession } from '../lib/supabase-stats';

export const api = {
  register,
  login,
  logout,
  getMe,
  updateMe,
  getWorkspace,
  createNotebook,
  updateNotebook,
  deleteNotebook,
  createSubject,
  updateSubject,
  deleteSubject,
  getPage,
  createPage,
  updatePage,
  autoSavePage,
  deletePage,
  startSession,
  endSession,
};

export { clearLegacyToken };
