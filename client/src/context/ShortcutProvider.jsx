import { useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { DEFAULT_SHORTCUTS, normalizePreferences } from '../utils/preferences';

export function ShortcutProvider({ children, onAction }) {
  const { user } = useAuth();
  
  const handleKeyDown = useCallback((e) => {
    // Para edição (bold, underline, highlight) queremos interceptar ATÉ se em ContentEditable
    // Porém, para nova_página, queremos qualquer lugar
    const shortcuts = normalizePreferences(user?.preferences).shortcuts || DEFAULT_SHORTCUTS;
    
    const matchKey = (shortcut) => {
      if (!shortcut) return false;
      const parts = shortcut.split('+');
      const hasAlt = parts.includes('alt');
      const hasCtrl = parts.includes('ctrl');
      const hasShift = parts.includes('shift');
      const key = parts[parts.length - 1]; 

      return (
        e.altKey === hasAlt &&
        (e.ctrlKey || e.metaKey) === hasCtrl &&
        e.shiftKey === hasShift &&
        e.key.toLowerCase() === key
      );
    };

    if (matchKey(shortcuts.new_page)) {
      e.preventDefault();
      onAction('new_page');
    } else if (matchKey(shortcuts.bold)) {
      e.preventDefault();
      onAction('bold');
    } else if (matchKey(shortcuts.underline)) {
      e.preventDefault();
      onAction('underline');
    } else if (matchKey(shortcuts.highlight)) {
      e.preventDefault();
      onAction('highlight');
    }
  }, [user, onAction]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return <>{children}</>;
}
