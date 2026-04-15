import {
  fetchMany,
  fetchOne,
  getMaxOrderIndex,
  insertOne,
  normalizeErrorMessage,
  requireUserId,
  updateOne,
  deleteMany,
} from './supabase-data';

async function ensureDefaultSection(notebookId, userId) {
  const existingSections = await fetchMany('sections', {
    filters: {
      notebook_id: notebookId,
      user_id: userId,
      is_archived: false,
      deleted_at: null,
    },
    orderBy: 'order_index',
    limit: 1,
  });

  if (existingSections[0]) {
    return existingSections[0];
  }

  const maxOrder = await getMaxOrderIndex('sections', {
    notebook_id: notebookId,
    user_id: userId,
  });

  return insertOne('sections', {
    notebook_id: notebookId,
    user_id: userId,
    name: 'Paginas',
    order_index: maxOrder + 1,
  });
}

async function buildWorkspaceTree(userId) {
  const [notebooks, subjects, sections, pages] = await Promise.all([
    fetchMany('subjects', {
      filters: {
        user_id: userId,
        is_archived: false,
        deleted_at: null,
      },
      orderBy: 'order_index',
    }),
    fetchMany('notebooks', {
      filters: {
        user_id: userId,
        is_archived: false,
        deleted_at: null,
      },
      orderBy: 'order_index',
    }),
    fetchMany('sections', {
      filters: {
        user_id: userId,
        is_archived: false,
        deleted_at: null,
      },
      select: 'id, notebook_id, order_index',
      orderBy: 'order_index',
    }),
    fetchMany('pages', {
      filters: {
        user_id: userId,
        is_deleted: false,
        is_archived: false,
        deleted_at: null,
      },
      select: 'id, section_id, title, is_favorite, is_pinned, tags, word_count, order_index, updated_at',
      orderBy: 'order_index',
    }),
  ]);

  const sectionsByNotebook = sections.reduce((map, section) => {
    const current = map.get(section.notebook_id) || [];
    current.push(section);
    map.set(section.notebook_id, current);
    return map;
  }, new Map());

  const pagesBySection = pages.reduce((map, page) => {
    const current = map.get(page.section_id) || [];
    current.push(page);
    map.set(page.section_id, current);
    return map;
  }, new Map());

  const subjectsByNotebook = subjects.reduce((map, subject) => {
    const current = map.get(subject.subject_id) || [];
    current.push(subject);
    map.set(subject.subject_id, current);
    return map;
  }, new Map());

  return notebooks.map((notebook) => {
    const notebookSubjects = (subjectsByNotebook.get(notebook.id) || []).map((subject) => {
      const subjectSections = sectionsByNotebook.get(subject.id) || [];
      const sectionOrderMap = new Map(subjectSections.map((section) => [section.id, Number(section.order_index || 0)]));
      const subjectPages = subjectSections.flatMap((section) => pagesBySection.get(section.id) || []);

      subjectPages.sort((left, right) => {
        const sectionOrderDiff = (sectionOrderMap.get(left.section_id) || 0)
          - (sectionOrderMap.get(right.section_id) || 0);

        if (sectionOrderDiff !== 0) {
          return sectionOrderDiff;
        }

        return Number(left.order_index || 0) - Number(right.order_index || 0);
      });

      return {
        id: subject.id,
        name: subject.name,
        color: subject.color,
        page_theme: subject.page_theme || 'lined',
        pageCount: subjectPages.length,
        pages: subjectPages,
      };
    });

    return {
      id: notebook.id,
      name: notebook.name,
      color: notebook.color,
      icon: notebook.icon,
      pageCount: notebookSubjects.reduce((sum, subject) => sum + subject.pageCount, 0),
      subjects: notebookSubjects,
    };
  });
}

async function getWorkspace() {
  try {
    const userId = await requireUserId();
    return await buildWorkspaceTree(userId);
  } catch (error) {
    throw new Error(normalizeErrorMessage(error, 'Erro ao carregar o workspace'));
  }
}

async function createNotebook(data) {
  try {
    const userId = await requireUserId();
    const name = String(data?.name || '').trim();

    if (!name) {
      throw new Error('Nome do caderno e obrigatorio');
    }

    const orderIndex = await getMaxOrderIndex('subjects', { user_id: userId });
    return await insertOne('subjects', {
      user_id: userId,
      name,
      color: data?.color || '#4f46e5',
      icon: data?.icon || 'C',
      order_index: orderIndex + 1,
    });
  } catch (error) {
    throw new Error(normalizeErrorMessage(error, 'Erro ao criar caderno'));
  }
}

async function updateNotebook(id, data) {
  try {
    const userId = await requireUserId();
    const notebook = await fetchOne('subjects', {
      id,
      user_id: userId,
      deleted_at: null,
    });

    if (!notebook) {
      throw new Error('Caderno nao encontrado');
    }

    return await updateOne('subjects', { id, user_id: userId }, {
      name: String(data?.name || notebook.name).trim() || notebook.name,
      color: data?.color || notebook.color,
      icon: data?.icon || notebook.icon,
      order_index: data?.order_index ?? notebook.order_index,
    });
  } catch (error) {
    throw new Error(normalizeErrorMessage(error, 'Erro ao atualizar caderno'));
  }
}

async function deleteNotebook(id) {
  try {
    const userId = await requireUserId();
    const notebook = await fetchOne('subjects', {
      id,
      user_id: userId,
      deleted_at: null,
    }, 'id');

    if (!notebook) {
      throw new Error('Caderno nao encontrado');
    }

    await deleteMany('subjects', { id, user_id: userId });
    return { success: true };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error, 'Erro ao excluir caderno'));
  }
}

async function createSubject(data) {
  try {
    const userId = await requireUserId();
    const name = String(data?.name || '').trim();
    const notebookId = data?.subject_id;

    if (!name || !notebookId) {
      throw new Error('Nome da materia e caderno sao obrigatorios');
    }

    const notebook = await fetchOne('subjects', {
      id: notebookId,
      user_id: userId,
      deleted_at: null,
    }, 'id');

    if (!notebook) {
      throw new Error('Caderno nao encontrado');
    }

    const orderIndex = await getMaxOrderIndex('notebooks', {
      subject_id: notebookId,
      user_id: userId,
    });

    const subject = await insertOne('notebooks', {
      subject_id: notebookId,
      user_id: userId,
      name,
      color: data?.color || '#2563eb',
      page_theme: data?.page_theme || 'lined',
      order_index: orderIndex + 1,
    });
    const defaultSection = await ensureDefaultSection(subject.id, userId);

    return {
      ...subject,
      default_section_id: defaultSection.id,
    };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error, 'Erro ao criar materia'));
  }
}

async function updateSubject(id, data) {
  try {
    const userId = await requireUserId();
    const subject = await fetchOne('notebooks', {
      id,
      user_id: userId,
      deleted_at: null,
    });

    if (!subject) {
      throw new Error('Materia nao encontrada');
    }

    return await updateOne('notebooks', { id, user_id: userId }, {
      name: String(data?.name || subject.name).trim() || subject.name,
      color: data?.color || subject.color,
      page_theme: data?.page_theme || subject.page_theme || 'lined',
      order_index: data?.order_index ?? subject.order_index,
    });
  } catch (error) {
    throw new Error(normalizeErrorMessage(error, 'Erro ao atualizar materia'));
  }
}

async function deleteSubject(id) {
  try {
    const userId = await requireUserId();
    const subject = await fetchOne('notebooks', {
      id,
      user_id: userId,
      deleted_at: null,
    }, 'id');

    if (!subject) {
      throw new Error('Materia nao encontrada');
    }

    await deleteMany('notebooks', { id, user_id: userId });
    return { success: true };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error, 'Erro ao excluir materia'));
  }
}

export {
  buildWorkspaceTree,
  createNotebook,
  createSubject,
  deleteNotebook,
  deleteSubject,
  ensureDefaultSection,
  getWorkspace,
  updateNotebook,
  updateSubject,
};
