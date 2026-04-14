import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  DEFAULT_EDITOR_DEFAULTS,
  DEFAULT_EDITOR_LAYOUT,
  DEFAULT_SHORTCUTS,
  EDITOR_FONT_OPTIONS,
  normalizePreferences,
} from '../utils/preferences';

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

const PAGE_WIDTH_OPTIONS = [
  { value: 'narrow', label: 'Focada', hint: 'Folha menor para leitura concentrada.' },
  { value: 'standard', label: 'Padrao', hint: 'Equilibrio entre foco e espaco.' },
  { value: 'wide', label: 'Ampla', hint: 'Mais area horizontal para conteudo extenso.' },
];

const WRITING_WIDTH_OPTIONS = [
  { value: 'focused', label: 'Mais estreita', hint: 'Linhas menores e leitura mais densa.' },
  { value: 'comfortable', label: 'Confortavel', hint: 'Padrao recomendado para estudar.' },
  { value: 'airy', label: 'Mais aberta', hint: 'Mais area livre ao redor do texto.' },
];

const SHEET_STYLE_OPTIONS = [
  { value: 'lined', label: 'Pautado' },
  { value: 'grid', label: 'Quadriculado' },
  { value: 'plain', label: 'Liso' },
];

function ToggleField({ label, hint, checked, onChange }) {
  return (
    <button type="button" className={`settings-toggle ${checked ? 'active' : ''}`} onClick={() => onChange(!checked)}>
      <div className="settings-toggle-copy">
        <strong>{label}</strong>
        <span>{hint}</span>
      </div>
      <span className="settings-toggle-track">
        <span className="settings-toggle-thumb" />
      </span>
    </button>
  );
}

export default function SettingsPage({ onToggleSidebar, onShowNotice }) {
  const { user, updatePreferences, logout } = useAuth();
  const [preferences, setPreferences] = useState(() => normalizePreferences(user?.preferences));
  const [recordingAction, setRecordingAction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPreferences(normalizePreferences(user?.preferences));
    setError(null);
  }, [user]);

  useEffect(() => {
    if (!recordingAction) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      event.preventDefault();

      const keys = [];
      if (event.ctrlKey || event.metaKey) keys.push('ctrl');
      if (event.altKey) keys.push('alt');
      if (event.shiftKey) keys.push('shift');

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
        return;
      }

      keys.push(event.key.toLowerCase());
      const newShortcut = keys.join('+');
      const currentShortcuts = preferences.shortcuts || DEFAULT_SHORTCUTS;

      const conflictAction = Object.keys(currentShortcuts).find(
        (action) => action !== recordingAction && currentShortcuts[action] === newShortcut,
      );

      if (conflictAction) {
        setError(`Conflito: a combinacao "${newShortcut}" ja esta em uso por "${ACTION_LABELS[conflictAction].title}".`);
        setRecordingAction(null);
        return;
      }

      setPreferences((current) => ({
        ...current,
        shortcuts: {
          ...current.shortcuts,
          [recordingAction]: newShortcut,
        },
      }));
      setRecordingAction(null);
      setError(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [preferences.shortcuts, recordingAction]);

  const updateEditorDefaults = (field, value) => {
    setPreferences((current) => ({
      ...current,
      editorDefaults: {
        ...current.editorDefaults,
        [field]: value,
      },
    }));
  };

  const updateEditorLayout = (field, value) => {
    setPreferences((current) => ({
      ...current,
      editorLayout: {
        ...current.editorLayout,
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    setLoading(true);

    try {
      await updatePreferences(normalizePreferences(preferences));
      setError(null);
      onShowNotice?.('Preferencias salvas com sucesso.', 'success');
    } catch (currentError) {
      console.error(currentError);
      setError('Falha ao salvar as preferencias no servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = () => {
    setPreferences(normalizePreferences({
      shortcuts: DEFAULT_SHORTCUTS,
      editorDefaults: DEFAULT_EDITOR_DEFAULTS,
      editorLayout: DEFAULT_EDITOR_LAYOUT,
    }));
    setError(null);
  };

  return (
    <div className="settings-view">
      <div className="workspace-topbar">
        <div className="workspace-topbar-title">
          <button type="button" className="icon-button mobile-only" onClick={onToggleSidebar}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <div>
            <span className="workspace-overline">Configuracoes</span>
            <h1>Preferencias do editor</h1>
          </div>
        </div>

        <div className="settings-actions">
          <button type="button" className="btn-secondary" onClick={handleRestore}>Restaurar padroes</button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar alteracoes'}
          </button>
        </div>
      </div>

      <div className="settings-shell">
        {error && <div className="inline-notice error">{error}</div>}

        <section className="surface-block settings-section">
          <div className="surface-block-header">
            <div>
              <span className="workspace-overline">Folha e escrita</span>
              <h3>Defina como novas paginas devem abrir por padrao</h3>
            </div>
          </div>

          <div className="settings-grid">
            <label className="settings-field">
              <span>Estilo da folha</span>
              <select
                value={preferences.editorDefaults.sheetStyle}
                onChange={(event) => updateEditorDefaults('sheetStyle', event.target.value)}
              >
                {SHEET_STYLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              <span>Fonte padrao</span>
              <select
                value={preferences.editorDefaults.fontFamily}
                onChange={(event) => updateEditorDefaults('fontFamily', event.target.value)}
              >
                {EDITOR_FONT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <small>Define a tipografia base da folha quando nenhum trecho tem fonte local aplicada.</small>
            </label>

            <label className="settings-field">
              <span>Largura da folha</span>
              <select
                value={preferences.editorLayout.pageWidth}
                onChange={(event) => updateEditorLayout('pageWidth', event.target.value)}
              >
                {PAGE_WIDTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <small>{PAGE_WIDTH_OPTIONS.find((option) => option.value === preferences.editorLayout.pageWidth)?.hint}</small>
            </label>

            <label className="settings-field">
              <span>Area de escrita</span>
              <select
                value={preferences.editorLayout.writingWidth}
                onChange={(event) => updateEditorLayout('writingWidth', event.target.value)}
              >
                {WRITING_WIDTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <small>{WRITING_WIDTH_OPTIONS.find((option) => option.value === preferences.editorLayout.writingWidth)?.hint}</small>
            </label>
          </div>

          <div className="settings-toggle-list">
            <ToggleField
              label="Mostrar margem vermelha"
              hint="Aplica a margem lateral automaticamente em novas paginas."
              checked={preferences.editorDefaults.showMargin}
              onChange={(value) => updateEditorDefaults('showMargin', value)}
            />
            <ToggleField
              label="Exibir botao lateral de insercao"
              hint="Mantem o botao flutuante de insercao visivel na folha."
              checked={preferences.editorLayout.showFloatingInsert}
              onChange={(value) => updateEditorLayout('showFloatingInsert', value)}
            />
          </div>
        </section>

        <section className="surface-block settings-section">
          <div className="surface-block-header">
            <div>
              <span className="workspace-overline">Atalhos</span>
              <h3>Comandos mais usados</h3>
            </div>
          </div>

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
                >
                  {recordingAction === action ? 'Aguardando tecla...' : (preferences.shortcuts[action] || 'Nenhum')}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-block settings-section">
          <div className="surface-block-header">
            <div>
              <span className="workspace-overline">Conta</span>
              <h3>Gerencie sua sessao</h3>
            </div>
          </div>

          <div>
            <button
              type="button"
              className="btn-secondary"
              onClick={logout}
              style={{ color: 'var(--danger)', borderColor: 'rgba(194,65,53,.18)', background: 'var(--bg-danger-soft)' }}
            >
              Sair da conta
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
