import SubjectIcon, { getSubjectAccent } from './SubjectIcon';
import { useAuth } from '../context/AuthContext';

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-.4-1.1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.8a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.1-.4 1.7 1.7 0 0 0 .6-1A1.7 1.7 0 0 0 4.26 6.3l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2.8a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 .4 1.1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c0 .38.22.74.6 1 .34.24.73.37 1.1.4h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.1.4c-.38.26-.6.62-.6 1Z" />
    </svg>
  );
}

function NotebookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M9 3v18" />
    </svg>
  );
}

function PageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function NavButton({ active = false, icon, label, onClick }) {
  return (
    <button type="button" className={`sidebar-nav-button ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="sidebar-nav-icon">{icon}</span>
      <span className="sidebar-nav-copy">
        <strong>{label}</strong>
      </span>
    </button>
  );
}

export default function Sidebar({
  currentView,
  activeNotebook,
  activeSubject,
  activePage,
  isOpen,
  onToggle,
  onOpenHome,
  onOpenNotebook,
  onOpenSubject,
  onOpenPage,
  onCreateNotebook,
  onCreateSubject,
  onCreatePage,
  onRequestPrompt,
  onOpenSettings,
}) {
  const { user } = useAuth();

  return (
    <aside className={`sidebar ${isOpen ? '' : 'collapsed'}`}>
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">C</div>
          <div>
            <strong>Caderno</strong>
            <span>Estudos organizados</span>
          </div>
        </div>

        <button type="button" className="icon-button" onClick={onToggle} aria-label="Fechar lateral">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      <button
        type="button"
        className="sidebar-create-button"
        onClick={async () => {
          const name = await onRequestPrompt('Nome do novo caderno');
          if (name) {
            onCreateNotebook(name);
          }
        }}
      >
        <PlusIcon />
        Novo caderno
      </button>

      <div className="sidebar-nav">
        <NavButton
          active={currentView === 'home'}
          icon={<HomeIcon />}
          label="Cadernos"
          onClick={onOpenHome}
        />
        <NavButton
          active={currentView === 'settings'}
          icon={<SettingsIcon />}
          label="Configuracoes"
          onClick={onOpenSettings}
        />
      </div>

      {(activeNotebook || activeSubject || activePage) && (
        <section className="sidebar-section sidebar-context">
          <div className="sidebar-section-title">Agora</div>

          {activeNotebook && (
            <button type="button" className="sidebar-context-card" onClick={() => onOpenNotebook(activeNotebook.id)}>
              <span className="sidebar-context-icon"><NotebookIcon /></span>
              <span className="sidebar-context-copy">
                <strong>{activeNotebook.name}</strong>
                <small>Caderno atual</small>
              </span>
            </button>
          )}

          {activeSubject && (
            <button type="button" className="sidebar-context-card" onClick={() => onOpenSubject(activeSubject.id)}>
              <span className="sidebar-context-icon" style={{ color: getSubjectAccent(activeSubject.name) }}>
                <SubjectIcon name={activeSubject.name} />
              </span>
              <span className="sidebar-context-copy">
                <strong>{activeSubject.name}</strong>
                <small>Materia atual</small>
              </span>
            </button>
          )}

          {activePage && (
            <button type="button" className="sidebar-context-card" onClick={() => onOpenPage(activePage.id)}>
              <span className="sidebar-context-icon"><PageIcon /></span>
              <span className="sidebar-context-copy">
                <strong>{activePage.title || 'Sem titulo'}</strong>
                <small>Pagina aberta</small>
              </span>
            </button>
          )}
          <div className="sidebar-context-actions">
            {activeNotebook && (
              <button
                type="button"
                className="sidebar-inline-create"
                onClick={async () => {
                  const name = await onRequestPrompt(`Nova materia em ${activeNotebook.name}`);
                  if (name) {
                    onCreateSubject(activeNotebook.id, name);
                  }
                }}
              >
                <PlusIcon />
                Nova materia
              </button>
            )}

            {activeSubject && (
              <button type="button" className="sidebar-inline-create" onClick={() => onCreatePage(activeSubject.id)}>
                <PlusIcon />
                Nova pagina
              </button>
            )}
          </div>
        </section>
      )}

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar" style={{ background: user?.avatarColor || '#94a3b8' }}>
            {(user?.name?.slice(0, 1) || 'C').toUpperCase()}
          </div>
          <div>
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
