import { useDeferredValue, useMemo, useState } from 'react';
import SubjectIcon, { getSubjectAccent } from './SubjectIcon';
import { countPagesInNotebook } from '../utils/workspace';

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function NotebookCardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M9 3v18" />
    </svg>
  );
}

function PageCardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  );
}

function ActionIcon({ type }) {
  if (type === 'rename') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 20h9" />
        <path d="m16.5 3.5 4 4L7 21l-4 1 1-4Z" />
      </svg>
    );
  }

  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}

function CardAction({ title, tone = 'default', onClick, type }) {
  return (
    <button
      type="button"
      className={`collection-card-action ${tone === 'danger' ? 'danger' : ''}`}
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <ActionIcon type={type} />
    </button>
  );
}

function ClickableCard({ className = '', onClick, children }) {
  return (
    <article
      role="button"
      tabIndex={0}
      className={className}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
    >
      {children}
    </article>
  );
}

function CreateCard({ title, subtitle, onClick }) {
  return (
    <button type="button" className="collection-card collection-card-create" onClick={onClick}>
      <span className="collection-card-create-mark">+</span>
      <strong>{title}</strong>
      <span>{subtitle}</span>
    </button>
  );
}

function formatRelativeUpdate(value) {
  if (!value) {
    return 'Sem atividade ainda';
  }

  const parsed = new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) {
    return 'Atualizada recentemente';
  }

  const diff = Date.now() - parsed.getTime();
  const minutes = Math.round(diff / 60000);

  if (minutes < 1) return 'Agora mesmo';
  if (minutes < 60) return `${minutes} min atras`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h atras`;
  const days = Math.round(hours / 24);
  return `${days} d atras`;
}

export default function WorkspaceBrowser({
  view,
  workspace,
  activeNotebook,
  activeSubject,
  onToggleSidebar,
  onOpenHome,
  onOpenNotebook,
  onOpenSubject,
  onOpenPage,
  onCreateNotebook,
  onCreateSubject,
  onCreatePage,
  onRenameItem,
  onDeleteItem,
  onRequestPrompt,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const meta = useMemo(() => {
    if (view === 'notebook' && activeNotebook) {
      return {
        overline: 'Caderno',
        title: activeNotebook.name,
        placeholder: 'Buscar materias',
        countLabel: `${activeNotebook.subjects?.length || 0} materias`,
      };
    }

    if (view === 'subject' && activeSubject) {
      return {
        overline: 'Materia',
        title: activeSubject.name,
        placeholder: 'Buscar paginas',
        countLabel: `${activeSubject.pages?.length || 0} paginas`,
      };
    }

    return {
      overline: 'Cadernos',
      title: 'Seus cadernos',
      placeholder: 'Buscar cadernos',
      countLabel: `${workspace.length || 0} cadernos`,
    };
  }, [activeNotebook, activeSubject, view, workspace.length]);

  const filteredNotebooks = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    if (!query) {
      return workspace;
    }

    return workspace.filter((notebook) => notebook.name?.toLowerCase().includes(query));
  }, [deferredSearchQuery, workspace]);

  const filteredSubjects = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    const subjectList = activeNotebook?.subjects || [];

    if (!query) {
      return subjectList;
    }

    return subjectList.filter((subject) => subject.name?.toLowerCase().includes(query));
  }, [activeNotebook, deferredSearchQuery]);

  const filteredPages = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    const pageList = activeSubject?.pages || [];

    if (!query) {
      return pageList;
    }

    return pageList.filter((page) => page.title?.toLowerCase().includes(query));
  }, [activeSubject, deferredSearchQuery]);

  const hasSearchQuery = Boolean(deferredSearchQuery.trim());

  return (
    <div className="dashboard-view">
      <div className="workspace-topbar">
        <div className="workspace-topbar-title">
          <button type="button" className="icon-button mobile-only" onClick={onToggleSidebar}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <div>
            <span className="workspace-overline">{meta.overline}</span>
            <h1>{meta.title}</h1>
          </div>
        </div>

        <div className="workspace-topbar-actions">
          <div className="workspace-search">
            <SearchIcon />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={meta.placeholder}
            />
          </div>

          {view === 'home' && (
            <button type="button" className="btn-primary" onClick={async () => {
              const name = await onRequestPrompt('Nome do novo caderno');
              if (name) {
                onCreateNotebook(name);
              }
            }}>
              Novo caderno
            </button>
          )}

          {view === 'notebook' && activeNotebook && (
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                const name = await onRequestPrompt(`Nova materia em ${activeNotebook.name}`);
                if (name) {
                  onCreateSubject(activeNotebook.id, name);
                }
              }}
            >
              Nova materia
            </button>
          )}

          {view === 'subject' && activeSubject && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => onCreatePage(activeSubject.id)}
            >
              Nova pagina
            </button>
          )}
        </div>
      </div>

      <div className="dashboard-shell">
        <section className="surface-block browser-toolbar">
          <div className="browser-context">
            {view !== 'home' && (
              <>
                <button type="button" className="browser-context-pill interactive" onClick={onOpenHome}>
                  Cadernos
                </button>

                {activeNotebook && (
                  <button
                    type="button"
                    className={`browser-context-pill interactive ${view === 'notebook' ? 'active' : ''}`}
                    onClick={() => onOpenNotebook(activeNotebook.id)}
                  >
                    {activeNotebook.name}
                  </button>
                )}

                {activeSubject && (
                  <button
                    type="button"
                    className={`browser-context-pill interactive ${view === 'subject' ? 'active' : ''}`}
                    onClick={() => onOpenSubject(activeSubject.id)}
                  >
                    {activeSubject.name}
                  </button>
                )}
              </>
            )}

            <span className="browser-context-pill">{meta.countLabel}</span>
          </div>
        </section>

        {view === 'home' && (
          <section className="collection-grid notebook-grid">
            {filteredNotebooks.map((notebook) => (
              <ClickableCard
                key={notebook.id}
                className="collection-card"
                onClick={() => onOpenNotebook(notebook.id)}
              >
                <div className="collection-card-toolbar">
                  <span className="collection-card-icon notebook"><NotebookCardIcon /></span>
                  <div className="collection-card-actions">
                    <CardAction title="Renomear caderno" type="rename" onClick={() => onRenameItem('notebook', notebook.id, notebook.name)} />
                    <CardAction title="Excluir caderno" type="delete" tone="danger" onClick={() => onDeleteItem('notebook', notebook.id)} />
                  </div>
                </div>
                <div className="collection-card-copy">
                  <strong>{notebook.name}</strong>
                  <span>{notebook.subjects?.length || 0} materias</span>
                </div>
                <div className="collection-card-meta">
                  <small>{countPagesInNotebook(notebook)} paginas</small>
                </div>
              </ClickableCard>
            ))}

            <CreateCard
              title="Novo caderno"
              subtitle="Adicionar um novo caderno."
              onClick={async () => {
                const name = await onRequestPrompt('Nome do novo caderno');
                if (name) {
                  onCreateNotebook(name);
                }
              }}
            />
          </section>
        )}

        {view === 'notebook' && activeNotebook && (
          <section className="collection-grid subject-grid">
            {filteredSubjects.map((subject) => (
              <ClickableCard
                key={subject.id}
                className="collection-card subject-card"
                onClick={() => onOpenSubject(subject.id)}
              >
                <div className="collection-card-toolbar">
                  <span className="collection-card-icon subject" style={{ color: getSubjectAccent(subject.name) }}>
                    <SubjectIcon name={subject.name} />
                  </span>
                  <div className="collection-card-actions">
                    <CardAction title="Renomear materia" type="rename" onClick={() => onRenameItem('subject', subject.id, subject.name)} />
                    <CardAction title="Excluir materia" type="delete" tone="danger" onClick={() => onDeleteItem('subject', subject.id)} />
                  </div>
                </div>
                <div className="collection-card-copy">
                  <strong>{subject.name}</strong>
                  <span>{subject.pageCount || subject.pages?.length || 0} paginas</span>
                </div>
              </ClickableCard>
            ))}

            <CreateCard
              title="Nova materia"
              subtitle={`Adicionar materia em ${activeNotebook.name}.`}
              onClick={async () => {
                const name = await onRequestPrompt(`Nova materia em ${activeNotebook.name}`);
                if (name) {
                  onCreateSubject(activeNotebook.id, name);
                }
              }}
            />
          </section>
        )}

        {view === 'subject' && activeSubject && (
          <section className="collection-grid page-grid">
            {filteredPages.map((page) => (
              <ClickableCard
                key={page.id}
                className="collection-card page-card"
                onClick={() => onOpenPage(page.id)}
              >
                <div className="collection-card-toolbar">
                  <span className="collection-card-icon page"><PageCardIcon /></span>
                  <div className="collection-card-actions">
                    <CardAction title="Excluir pagina" type="delete" tone="danger" onClick={() => onDeleteItem('page', page.id)} />
                  </div>
                </div>
                <div className="collection-card-copy">
                  <strong>{page.title || 'Sem titulo'}</strong>
                  <span>{page.word_count || 0} palavras</span>
                </div>
                <div className="collection-card-meta">
                  <small>{formatRelativeUpdate(page.updated_at)}</small>
                </div>
              </ClickableCard>
            ))}

            <CreateCard
              title="Nova pagina"
              subtitle={`Adicionar pagina em ${activeSubject.name}.`}
              onClick={() => onCreatePage(activeSubject.id)}
            />
          </section>
        )}

        {hasSearchQuery && ((view === 'home' && !filteredNotebooks.length) || (view === 'notebook' && !filteredSubjects.length) || (view === 'subject' && !filteredPages.length)) && (
          <div className="overview-empty">
            <p>Nenhum item encontrado para essa busca.</p>
          </div>
        )}
      </div>
    </div>
  );
}
