import { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import Sidebar from '../components/Sidebar';
import PromptModal from '../components/PromptModal';
import SettingsPage from '../components/SettingsPage';
import { ShortcutProvider } from '../context/ShortcutProvider';
import { useAuth } from '../context/AuthContext';
import { buildPageSettingsFromPreferences, normalizePreferences } from '../utils/preferences';
import {
  findNotebookById,
  findNotebookForSubject,
  findPageContext,
  findSubjectById,
} from '../utils/workspace';

const WorkspaceBrowser = lazy(() => import('../components/WorkspaceBrowser'));
const Editor = lazy(() => import('../components/Editor'));

function isNarrowViewport() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(max-width: 960px)').matches;
}

function LoadingState({ title, hint }) {
  return (
    <div className="main-empty">
      <p className="main-empty-title">{title}</p>
      <p className="main-empty-hint">{hint}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState([]);
  const [view, setView] = useState('home');
  const [activeNotebookId, setActiveNotebookId] = useState(null);
  const [activeSubjectId, setActiveSubjectId] = useState(null);
  const [activePageId, setActivePageId] = useState(null);
  const [isNarrow, setIsNarrow] = useState(() => isNarrowViewport());
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => !isNarrowViewport());
  const [notice, setNotice] = useState(null);
  const [promptData, setPromptData] = useState({
    isOpen: false,
    title: '',
    description: '',
    defaultValue: '',
    confirmLabel: 'Confirmar',
    resolve: null,
  });
  const noticeTimeoutRef = useRef(null);

  const preferences = useMemo(() => normalizePreferences(user?.preferences), [user?.preferences]);

  const showNotice = useCallback((message, type = 'info') => {
    if (noticeTimeoutRef.current) {
      clearTimeout(noticeTimeoutRef.current);
    }

    setNotice({ id: Date.now(), message, type });
    noticeTimeoutRef.current = setTimeout(() => {
      setNotice(null);
      noticeTimeoutRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => () => {
    if (noticeTimeoutRef.current) {
      clearTimeout(noticeTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(max-width: 960px)');
    const handleChange = () => {
      const nextIsNarrow = mediaQuery.matches;
      setIsNarrow(nextIsNarrow);

      if (nextIsNarrow) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };

    handleChange();
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  const requestPrompt = useCallback((config) => new Promise((resolve) => {
    if (typeof config === 'string') {
      setPromptData({
        isOpen: true,
        title: config,
        description: 'Use um nome curto e claro para manter sua estrutura facil de navegar.',
        defaultValue: '',
        confirmLabel: 'Confirmar',
        resolve,
      });
      return;
    }

    setPromptData({
      isOpen: true,
      title: config?.title || 'Digite um nome',
      description: config?.description || 'Use um nome curto e claro para manter sua estrutura facil de navegar.',
      defaultValue: config?.defaultValue || '',
      confirmLabel: config?.confirmLabel || 'Confirmar',
      resolve,
    });
  }), []);

  const closePrompt = useCallback((value = null) => {
    if (promptData.resolve) {
      promptData.resolve(value);
    }

    setPromptData({
      isOpen: false,
      title: '',
      description: '',
      defaultValue: '',
      confirmLabel: 'Confirmar',
      resolve: null,
    });
  }, [promptData]);

  const refreshWorkspace = useCallback(async () => {
    const data = await api.getWorkspace();
    setWorkspace(data);
    return data;
  }, []);

  useEffect(() => {
    refreshWorkspace().catch((error) => {
      console.error(error);
      showNotice('Nao foi possivel atualizar o workspace.', 'error');
    });
  }, [refreshWorkspace, showNotice]);

  const activeNotebook = useMemo(
    () => findNotebookById(workspace, activeNotebookId),
    [activeNotebookId, workspace],
  );

  const activeSubject = useMemo(
    () => findSubjectById(workspace, activeSubjectId),
    [activeSubjectId, workspace],
  );

  const activePageContext = useMemo(
    () => findPageContext(workspace, activePageId),
    [activePageId, workspace],
  );

  const currentNotebook = activePageContext.notebook || activeNotebook;
  const currentSubject = activePageContext.subject || activeSubject;
  const currentPage = activePageContext.page || null;

  const openHome = useCallback(() => {
    startTransition(() => {
      setView('home');
      setActiveNotebookId(null);
      setActiveSubjectId(null);
      setActivePageId(null);
    });
  }, []);

  const openNotebook = useCallback((notebookId) => {
    startTransition(() => {
      setView('notebook');
      setActiveNotebookId(notebookId);
      setActiveSubjectId(null);
      setActivePageId(null);
    });

    if (isNarrowViewport()) {
      setIsSidebarOpen(false);
    }
  }, []);

  const openSubject = useCallback((subjectId, workspaceOverride = workspace) => {
    const notebook = findNotebookForSubject(workspaceOverride, subjectId);

    startTransition(() => {
      setView('subject');
      setActiveNotebookId(notebook?.id || null);
      setActiveSubjectId(subjectId);
      setActivePageId(null);
    });

    if (isNarrowViewport()) {
      setIsSidebarOpen(false);
    }
  }, [workspace]);

  const openPage = useCallback((pageId, workspaceOverride = workspace) => {
    const context = findPageContext(workspaceOverride, pageId);

    startTransition(() => {
      setView('page');
      setActiveNotebookId(context.notebook?.id || null);
      setActiveSubjectId(context.subject?.id || null);
      setActivePageId(pageId);
    });

    if (isNarrowViewport()) {
      setIsSidebarOpen(false);
    }
  }, [workspace]);

  const openSettings = useCallback(() => {
    startTransition(() => {
      setView('settings');
      setActivePageId(null);
    });

    if (isNarrowViewport()) {
      setIsSidebarOpen(false);
    }
  }, []);

  const handleCreateNotebook = async (name) => {
    try {
      const notebook = await api.createNotebook({ name });
      const nextWorkspace = await refreshWorkspace();
      openNotebook(notebook.id, nextWorkspace);
      showNotice('Caderno criado com sucesso.', 'success');
    } catch (error) {
      showNotice(error.message, 'error');
    }
  };

  const handleCreateSubject = async (notebookId, name) => {
    try {
      const subject = await api.createSubject({ subject_id: notebookId, name });
      const nextWorkspace = await refreshWorkspace();
      openSubject(subject.id, nextWorkspace);
      showNotice('Materia criada com sucesso.', 'success');
    } catch (error) {
      showNotice(error.message, 'error');
    }
  };

  const handleCreatePage = useCallback(async (subjectId, title = 'Nova pagina') => {
    try {
      const page = await api.createPage({
        subject_id: subjectId,
        title,
        page_settings: buildPageSettingsFromPreferences(preferences),
      });
      const nextWorkspace = await refreshWorkspace();
      openPage(page.id, nextWorkspace);
      showNotice('Pagina criada. O editor ja esta pronto.', 'success');
    } catch (error) {
      showNotice(error.message, 'error');
    }
  }, [openPage, preferences, refreshWorkspace, showNotice]);

  const handleRenameItem = async (type, id, currentName) => {
    const labelByType = {
      notebook: {
        title: 'Renomear caderno',
        description: 'Escolha um nome claro para identificar este caderno na navegacao.',
      },
      subject: {
        title: 'Renomear materia',
        description: 'Use um nome curto para facilitar a leitura dos cards e da barra lateral.',
      },
    };

    const nextName = await requestPrompt({
      title: labelByType[type]?.title || 'Novo nome',
      description: labelByType[type]?.description,
      defaultValue: currentName,
      confirmLabel: 'Salvar nome',
    });

    if (!nextName || nextName.trim() === currentName) {
      return;
    }

    try {
      if (type === 'notebook') {
        await api.updateNotebook(id, { name: nextName.trim() });
      } else if (type === 'subject') {
        await api.updateSubject(id, { name: nextName.trim() });
      }

      await refreshWorkspace();
      showNotice('Nome atualizado com sucesso.', 'success');
    } catch (error) {
      showNotice(error.message, 'error');
    }
  };

  const handleDeleteItem = async (type, id) => {
    const confirmationByType = {
      notebook: 'Excluir este caderno com todas as materias e paginas?',
      subject: 'Excluir esta materia com todas as paginas?',
      page: 'Mover esta pagina para a lixeira?',
    };

    if (!window.confirm(confirmationByType[type] || 'Deseja continuar?')) {
      return;
    }

    try {
      if (type === 'notebook') {
        await api.deleteNotebook(id);
      } else if (type === 'subject') {
        await api.deleteSubject(id);
      } else if (type === 'page') {
        await api.deletePage(id);
      }

      const nextWorkspace = await refreshWorkspace();

      if (type === 'page' && activePageId === id) {
        if (activeSubjectId) {
          openSubject(activeSubjectId, nextWorkspace);
        } else {
          openHome();
        }
      }

      if (type === 'subject' && activeSubjectId === id) {
        if (activeNotebookId) {
          openNotebook(activeNotebookId);
        } else {
          openHome();
        }
      }

      if (type === 'notebook' && activeNotebookId === id) {
        openHome();
      }

      showNotice(type === 'page' ? 'Pagina movida para a lixeira.' : 'Item removido com sucesso.', 'success');
    } catch (error) {
      showNotice(error.message, 'error');
    }
  };

  const handleShortcutAction = useCallback((action) => {
    if (action === 'new_page') {
      if (!currentSubject?.id) {
        showNotice('Abra uma materia para criar uma nova pagina rapidamente.', 'error');
        return;
      }

      handleCreatePage(currentSubject.id, 'Nova pagina');
      return;
    }

    if (view === 'page') {
      window.dispatchEvent(new CustomEvent(`editor:${action}`));
    }
  }, [currentSubject?.id, handleCreatePage, showNotice, view]);

  useEffect(() => {
    if (view === 'page' && activePageId && !currentPage) {
      if (activeSubjectId) {
        setView('subject');
      } else {
        setView('home');
      }
    }

    if (view === 'subject' && activeSubjectId && !currentSubject) {
      if (activeNotebookId) {
        setView('notebook');
      } else {
        setView('home');
      }
    }

    if (view === 'notebook' && activeNotebookId && !currentNotebook) {
      setView('home');
    }
  }, [activeNotebookId, activePageId, activeSubjectId, currentNotebook, currentPage, currentSubject, view]);

  return (
    <ShortcutProvider onAction={handleShortcutAction}>
      <div className="app-shell">
        <button
          type="button"
          className={`sidebar-backdrop ${isSidebarOpen && isNarrow ? 'visible' : ''}`}
          aria-label="Fechar lateral"
          onClick={() => setIsSidebarOpen(false)}
        />

        {!isSidebarOpen && (
          <button
            type="button"
            className="icon-button"
            aria-label="Abrir lateral"
            onClick={() => setIsSidebarOpen(true)}
            style={{
              position: 'fixed',
              top: '20px',
              left: '20px',
              zIndex: 45,
              background: 'rgba(252, 248, 242, 0.96)',
              boxShadow: '0 10px 24px rgba(15, 23, 42, 0.08)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
        )}

        <Sidebar
          workspace={workspace}
          currentView={view}
          activeNotebook={currentNotebook}
          activeSubject={currentSubject}
          activePage={currentPage}
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen((current) => !current)}
          onOpenHome={openHome}
          onOpenNotebook={openNotebook}
          onOpenSubject={openSubject}
          onOpenPage={openPage}
          onCreateNotebook={handleCreateNotebook}
          onCreateSubject={handleCreateSubject}
          onCreatePage={handleCreatePage}
          onRequestPrompt={requestPrompt}
          onOpenSettings={openSettings}
        />

        <main className="workspace-main">
          <Suspense
            fallback={(
              <LoadingState
                title="Preparando seu editor"
                hint="Carregando estrutura, documentos e preferencias."
              />
            )}
          >
            {(view === 'home' || view === 'notebook' || view === 'subject') && (
              <WorkspaceBrowser
                view={view}
                workspace={workspace}
                activeNotebook={currentNotebook}
                activeSubject={currentSubject}
                onToggleSidebar={() => setIsSidebarOpen((current) => !current)}
                onOpenHome={openHome}
                onOpenNotebook={openNotebook}
                onOpenSubject={openSubject}
                onOpenPage={openPage}
                onCreateNotebook={handleCreateNotebook}
                onCreateSubject={handleCreateSubject}
                onCreatePage={handleCreatePage}
                onRenameItem={handleRenameItem}
                onDeleteItem={handleDeleteItem}
                onRequestPrompt={requestPrompt}
              />
            )}

            {view === 'settings' && (
              <SettingsPage
                onToggleSidebar={() => setIsSidebarOpen((current) => !current)}
                onShowNotice={showNotice}
              />
            )}

            {view === 'page' && (
              <Editor
                key={activePageId}
                pageId={activePageId}
                onOpenHome={openHome}
                onOpenNotebook={openNotebook}
                onOpenSubject={openSubject}
                onToggleSidebar={() => setIsSidebarOpen((current) => !current)}
                onWorkspaceRefresh={refreshWorkspace}
                onShowNotice={showNotice}
              />
            )}
          </Suspense>
        </main>

        <PromptModal
          isOpen={promptData.isOpen}
          title={promptData.title}
          description={promptData.description}
          defaultValue={promptData.defaultValue}
          confirmLabel={promptData.confirmLabel}
          onConfirm={closePrompt}
          onCancel={() => closePrompt(null)}
        />

        {notice && (
          <div className="toast-container">
            <div className={`toast ${notice.type}`}>{notice.message}</div>
          </div>
        )}
      </div>
    </ShortcutProvider>
  );
}
