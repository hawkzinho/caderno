import { useDeferredValue, useMemo, useState } from 'react';

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

export default function Dashboard({
  workspace,
  recentPages,
  onOpenPage,
  onCreateNotebook,
  onCreateSubject,
  onCreatePage,
  onRequestPrompt,
  onToggleSidebar,
  pageCount = 0,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const notebookCount = workspace.length;
  const subjectCount = useMemo(
    () => workspace.reduce((total, notebook) => total + (notebook.subjects?.length || 0), 0),
    [workspace],
  );

  const firstNotebook = workspace[0] || null;
  const firstSubject = useMemo(() => {
    for (const notebook of workspace) {
      if (notebook.subjects?.[0]) {
        return notebook.subjects[0];
      }
    }

    return null;
  }, [workspace]);

  const filteredRecent = useMemo(() => {
    if (!deferredSearchQuery.trim()) {
      return recentPages;
    }

    const normalizedQuery = deferredSearchQuery.toLowerCase();
    return recentPages.filter((page) => (
      page.title?.toLowerCase().includes(normalizedQuery)
      || page.subject_name?.toLowerCase().includes(normalizedQuery)
      || page.notebook_name?.toLowerCase().includes(normalizedQuery)
    ));
  }, [deferredSearchQuery, recentPages]);

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
            <span className="workspace-overline">Workspace</span>
            <h1>Seu caderno digital</h1>
          </div>
        </div>

        <div className="workspace-search">
          <SearchIcon />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar paginas recentes"
          />
        </div>
      </div>

      <div className="dashboard-shell">
        <section className="surface-block dashboard-intro">
          <div className="dashboard-intro-copy">
            <span className="workspace-overline">Fluxo principal</span>
            <h2>Caderno, materia e pagina em uma estrutura direta.</h2>
            <p>
              A experiencia foi organizada para ficar obvia desde o primeiro clique: voce cria um
              caderno, adiciona materias nele e abre paginas para escrever sem camadas extras.
            </p>
          </div>

          <div className="dashboard-intro-actions">
            <button type="button" className="btn-primary" onClick={async () => {
              const name = await onRequestPrompt('Nome do novo caderno');
              if (name) {
                onCreateNotebook(name);
              }
            }}>
              Novo caderno
            </button>

            <button type="button" className="btn-secondary" onClick={onToggleSidebar}>
              Abrir estrutura
            </button>
          </div>
        </section>

        <div className="dashboard-grid">
          <div className="dashboard-column">
            <section className="surface-block">
              <div className="surface-block-header">
                <div>
                  <span className="workspace-overline">Comece por aqui</span>
                  <h3>O fluxo do produto ficou claro na tela inicial.</h3>
                </div>
              </div>

              <div className="flow-list">
                <article className="flow-step">
                  <span className="flow-step-index">1</span>
                  <div className="flow-step-body">
                    <strong>Crie um caderno</strong>
                    <p>Use um caderno por projeto, disciplina ou periodo de estudo.</p>
                  </div>
                  <button type="button" className="btn-secondary flow-step-action" onClick={async () => {
                    const name = await onRequestPrompt('Nome do novo caderno');
                    if (name) {
                      onCreateNotebook(name);
                    }
                  }}>
                    Novo caderno
                  </button>
                </article>

                <article className="flow-step">
                  <span className="flow-step-index">2</span>
                  <div className="flow-step-body">
                    <strong>Adicione uma materia</strong>
                    <p>Dentro do caderno, separe seus assuntos principais sem poluir a navegacao.</p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary flow-step-action"
                    disabled={!firstNotebook}
                    onClick={async () => {
                      if (!firstNotebook) {
                        return;
                      }

                      const name = await onRequestPrompt(`Nova materia em ${firstNotebook.name}`);
                      if (name) {
                        onCreateSubject(firstNotebook.id, name);
                      }
                    }}
                  >
                    Nova materia
                  </button>
                </article>

                <article className="flow-step">
                  <span className="flow-step-index">3</span>
                  <div className="flow-step-body">
                    <strong>Abra uma pagina para escrever</strong>
                    <p>Comece a digitar com slash command, desenho e salvamento automatico.</p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary flow-step-action"
                    disabled={!firstSubject}
                    onClick={() => {
                      if (firstSubject) {
                        onCreatePage(firstSubject.id);
                      }
                    }}
                  >
                    Nova pagina
                  </button>
                </article>
              </div>
            </section>

            <section className="surface-block">
              <div className="surface-block-header">
                <div>
                  <span className="workspace-overline">Cadernos</span>
                  <h3>Estrutura atual do workspace</h3>
                </div>
              </div>

              <div className="notebook-summary-list">
                {workspace.map((notebook) => (
                  <article key={notebook.id} className="notebook-summary-row">
                    <div className="notebook-summary-copy">
                      <div>
                        <strong>{notebook.name}</strong>
                        <span>{notebook.subjects?.length || 0} materias</span>
                      </div>

                      {!!notebook.subjects?.length && (
                        <div className="notebook-summary-tags">
                          {notebook.subjects.map((subject) => (
                            <button
                              key={subject.id}
                              type="button"
                              className="notebook-summary-tag"
                              onClick={() => {
                                if (subject.pages?.[0]) {
                                  onOpenPage(subject.pages[0].id);
                                  return;
                                }

                                onCreatePage(subject.id);
                              }}
                            >
                              <span>{subject.name}</span>
                              <small>{subject.pageCount || 0} paginas</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="overview-inline-button"
                      onClick={async () => {
                        const name = await onRequestPrompt(`Nova materia em ${notebook.name}`);
                        if (name) {
                          onCreateSubject(notebook.id, name);
                        }
                      }}
                    >
                      Nova materia
                    </button>
                  </article>
                ))}

                {!workspace.length && (
                  <div className="overview-empty">
                    <p>Nenhum caderno criado ainda.</p>
                    <button type="button" onClick={async () => {
                      const name = await onRequestPrompt('Nome do novo caderno');
                      if (name) {
                        onCreateNotebook(name);
                      }
                    }}>
                      Criar primeiro caderno
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="dashboard-column dashboard-column-narrow">
            <section className="surface-block">
              <div className="surface-block-header">
                <div>
                  <span className="workspace-overline">Resumo</span>
                  <h3>Visao rapida da sua estrutura</h3>
                </div>
              </div>

              <div className="stats-grid">
                <article className="stat-tile">
                  <span>Cadernos</span>
                  <strong>{notebookCount}</strong>
                </article>
                <article className="stat-tile">
                  <span>Materias</span>
                  <strong>{subjectCount}</strong>
                </article>
                <article className="stat-tile">
                  <span>Paginas</span>
                  <strong>{pageCount}</strong>
                </article>
              </div>
            </section>

            <section className="surface-block">
              <div className="surface-block-header">
                <div>
                  <span className="workspace-overline">Recentes</span>
                  <h3>Continue de onde parou</h3>
                </div>
                <span className="overview-counter">{filteredRecent.length}</span>
              </div>

              <div className="recent-page-list">
                {filteredRecent.map((page) => (
                  <button key={page.id} type="button" className="recent-page-row" onClick={() => onOpenPage(page.id)}>
                    <div>
                      <strong>{page.title || 'Sem titulo'}</strong>
                      <span>{page.notebook_name} - {page.subject_name}</span>
                    </div>
                    <small>{page.word_count || 0} palavras</small>
                  </button>
                ))}

                {!filteredRecent.length && (
                  <div className="overview-empty">
                    <p>Nenhuma pagina encontrada para essa busca.</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
