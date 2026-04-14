import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const DEFAULT_SHORTCUTS = {
  bold: 'ctrl+b',
  underline: 'ctrl+u',
  highlight: 'ctrl+shift+h',
  new_page: 'ctrl+alt+n',
};

const ACTION_LABELS = {
  bold: {
    title: 'Negrito',
    description: 'Aplica destaque rapido no texto selecionado.',
  },
  underline: {
    title: 'Sublinhado',
    description: 'Marca trechos importantes com um atalho direto.',
  },
  highlight: {
    title: 'Destacar',
    description: 'Liga o realce do texto sem interromper o fluxo.',
  },
  new_page: {
    title: 'Nova pagina rapida',
    description: 'Cria uma nova pagina na materia atual ou na primeira materia disponivel.',
  },
};

export default function SettingsModal({ isOpen, onClose }) {
  const { user, updatePreferences } = useAuth();
  const [shortcuts, setShortcuts] = useState({});
  const [recordingAction, setRecordingAction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setShortcuts(user?.preferences?.shortcuts || DEFAULT_SHORTCUTS);
      setError(null);
    }
  }, [isOpen, user]);

  useEffect(() => {
    if (!recordingAction) return undefined;

    const handleKeyDown = (event) => {
      event.preventDefault();

      const keys = [];
      if (event.ctrlKey || event.metaKey) keys.push('ctrl');
      if (event.altKey) keys.push('alt');
      if (event.shiftKey) keys.push('shift');

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;

      keys.push(event.key.toLowerCase());
      const newShortcut = keys.join('+');

      const conflictAction = Object.keys(shortcuts).find(
        (action) => action !== recordingAction && shortcuts[action] === newShortcut,
      );

      if (conflictAction) {
        setError(`Conflito: a combinacao "${newShortcut}" ja esta em uso por "${ACTION_LABELS[conflictAction].title}".`);
        setRecordingAction(null);
        return;
      }

      setShortcuts((previousShortcuts) => ({ ...previousShortcuts, [recordingAction]: newShortcut }));
      setRecordingAction(null);
      setError(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [recordingAction, shortcuts]);

  const handleSave = async () => {
    setLoading(true);

    try {
      await updatePreferences({ ...user?.preferences, shortcuts });
      onClose();
    } catch (err) {
      console.error(err);
      setError('Falha ao salvar as preferencias no servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = () => {
    setShortcuts(DEFAULT_SHORTCUTS);
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <h2>Configuracao de atalhos</h2>
            <p>Personalize as combinacoes mais usadas sem poluir a interface principal.</p>
          </div>

          <button type="button" onClick={onClose} className="btn-ghost modal-close" title="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && <div className="inline-notice error">{error}</div>}

        <div className="shortcut-list">
          {Object.entries(ACTION_LABELS).map(([action, config]) => (
            <div key={action} className="shortcut-row">
              <div className="shortcut-label">
                <strong>{config.title}</strong>
                <span>{config.description}</span>
              </div>

              <button
                type="button"
                className={`shortcut-key ${recordingAction === action ? 'recording' : ''}`}
                onClick={() => setRecordingAction(action)}
                title="Clique e pressione a nova combinacao"
              >
                {recordingAction === action ? 'Aguardando tecla...' : (shortcuts[action] || 'Nenhum')}
              </button>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={handleRestore}>Restaurar padroes</button>

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar alteracoes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
