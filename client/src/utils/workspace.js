export function findNotebookById(workspace, notebookId) {
  return workspace.find((notebook) => notebook.id === notebookId) || null;
}

export function findSubjectById(workspace, subjectId) {
  for (const notebook of workspace) {
    const subject = notebook.subjects?.find((currentSubject) => currentSubject.id === subjectId);
    if (subject) {
      return subject;
    }
  }

  return null;
}

export function findNotebookForSubject(workspace, subjectId) {
  for (const notebook of workspace) {
    if (notebook.subjects?.some((subject) => subject.id === subjectId)) {
      return notebook;
    }
  }

  return null;
}

export function findPageContext(workspace, pageId) {
  for (const notebook of workspace) {
    for (const subject of notebook.subjects || []) {
      const page = subject.pages?.find((currentPage) => currentPage.id === pageId);

      if (page) {
        return { notebook, subject, page };
      }
    }
  }

  return { notebook: null, subject: null, page: null };
}

export function countPagesInNotebook(notebook) {
  return (notebook.subjects || []).reduce((total, subject) => total + (subject.pages?.length || 0), 0);
}
