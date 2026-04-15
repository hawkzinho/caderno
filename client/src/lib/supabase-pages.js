import {
  DEFAULT_PAGE_CONTENT,
  DEFAULT_PAGE_SETTINGS,
  MAX_HISTORY_ENTRIES,
  buildPageResponse,
  countWords,
  deleteMany,
  fetchMany,
  fetchOne,
  getMaxOrderIndex,
  insertOne,
  mapSheetStyleToTheme,
  normalizeErrorMessage,
  normalizePageSettings,
  normalizeSheetStyle,
  parseJson,
  requireUserId,
  serializePageSettings,
  toDatabaseDate,
  todayKey,
  updateOne,
} from './supabase-data';
import { ensureDefaultSection } from './supabase-workspace';
import { upsertDailyStats } from './supabase-stats';

async function resolveSectionForPageCreation(subjectId, userId) {
  const subject = await fetchOne('notebooks', {
    id: subjectId,
    user_id: userId,
    deleted_at: null,
  });

  if (!subject) {
    return null;
  }

  const section = await ensureDefaultSection(subject.id, userId);
  return { section, subject };
}

async function loadPageRelationMaps(userId, pages) {
  const sectionIds = [...new Set(pages.map((page) => page.section_id).filter(Boolean))];

  if (!sectionIds.length) {
    return {
      sectionsById: new Map(),
      subjectsById: new Map(),
      notebooksById: new Map(),
    };
  }

  const sections = await fetchMany('sections', {
    filters: {
      id: sectionIds,
      user_id: userId,
      deleted_at: null,
    },
    select: 'id, notebook_id',
  });

  const subjectIds = [...new Set(sections.map((section) => section.notebook_id).filter(Boolean))];
  const subjects = subjectIds.length
    ? await fetchMany('notebooks', {
      filters: {
        id: subjectIds,
        user_id: userId,
        deleted_at: null,
      },
      select: 'id, subject_id, name',
    })
    : [];

  const notebookIds = [...new Set(subjects.map((subject) => subject.subject_id).filter(Boolean))];
  const notebooks = notebookIds.length
    ? await fetchMany('subjects', {
      filters: {
        id: notebookIds,
        user_id: userId,
        deleted_at: null,
      },
      select: 'id, name, color',
    })
    : [];

  return {
    sectionsById: new Map(sections.map((section) => [section.id, section])),
    subjectsById: new Map(subjects.map((subject) => [subject.id, subject])),
    notebooksById: new Map(notebooks.map((notebook) => [notebook.id, notebook])),
  };
}

function buildPageContext(page, relationMaps) {
  const section = relationMaps.sectionsById.get(page.section_id);
  const subject = relationMaps.subjectsById.get(section?.notebook_id);
  const notebook = relationMaps.notebooksById.get(subject?.subject_id);

  return {
    subject_id: subject?.id || null,
    subject_name: subject?.name || null,
    notebook_id: notebook?.id || null,
    notebook_name: notebook?.name || null,
    notebook_color: notebook?.color || null,
  };
}

async function createPage(data) {
  try {
    const userId = await requireUserId();
    const title = String(data?.title || '').trim() || 'Nova pagina';
    const legacySectionId = data?.section_id;
    const subjectId = data?.subject_id;
    let sectionId = legacySectionId;
    let inheritedTheme = data?.page_theme || 'lined';

    if (!sectionId && subjectId) {
      const resolved = await resolveSectionForPageCreation(subjectId, userId);

      if (!resolved) {
        throw new Error('Materia nao encontrada');
      }

      sectionId = resolved.section.id;
      inheritedTheme = data?.page_theme || resolved.subject.page_theme || 'lined';
    }

    if (!sectionId) {
      throw new Error('Materia e obrigatoria para criar a pagina');
    }

    const section = await fetchOne('sections', {
      id: sectionId,
      user_id: userId,
      deleted_at: null,
    }, 'id, notebook_id');

    if (!section) {
      throw new Error('Materia nao encontrada');
    }

    const subject = await fetchOne('notebooks', {
      id: section.notebook_id,
      user_id: userId,
      deleted_at: null,
    }, 'id, page_theme');

    const orderIndex = await getMaxOrderIndex('pages', {
      section_id: sectionId,
      user_id: userId,
    });
    const pageTheme = normalizeSheetStyle(inheritedTheme || subject?.page_theme);
    const storedTheme = mapSheetStyleToTheme(pageTheme);
    const pageSettings = serializePageSettings(storedTheme, data?.page_settings || DEFAULT_PAGE_SETTINGS);
    const content = typeof data?.content === 'string'
      ? data.content
      : JSON.stringify(data?.content || DEFAULT_PAGE_CONTENT);
    const wordCount = countWords(content);
    const page = await insertOne('pages', {
      section_id: sectionId,
      user_id: userId,
      title,
      content,
      page_theme: storedTheme,
      page_settings: pageSettings,
      order_index: orderIndex + 1,
      word_count: wordCount,
    });

    await upsertDailyStats(userId, todayKey(), { pages_created: 1 }, { pages_created: 1 });
    return buildPageResponse(page);
  } catch (error) {
    throw new Error(normalizeErrorMessage(error, 'Erro ao criar pagina'));
  }
}

async function getPage(id) {
  try {
    const userId = await requireUserId();
    const page = await fetchOne('pages', {
      id,
      user_id: userId,
      is_deleted: false,
      deleted_at: null,
    });

    if (!page) {
      throw new Error('Pagina nao encontrada');
    }

    const relationMaps = await loadPageRelationMaps(userId, [page]);
    const attachments = await fetchMany('attachments', {
      filters: {
        page_id: page.id,
        user_id: userId,
        deleted_at: null,
      },
      select: 'id, original_name, mime_type, size, created_at',
      orderBy: 'created_at',
      ascending: false,
    });

    return {
      ...buildPageResponse(page),
      ...buildPageContext(page, relationMaps),
      attachments,
    };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error, 'Erro ao buscar pagina'));
  }
}

async function updatePage(id, data) {
  try {
    const userId = await requireUserId();
    const page = await fetchOne('pages', {
      id,
      user_id: userId,
      deleted_at: null,
    });

    if (!page) {
      throw new Error('Pagina nao encontrada');
    }

    const pageSettings = data?.page_settings !== undefined
      ? normalizePageSettings(data?.page_theme || page.page_theme, data.page_settings)
      : normalizePageSettings(page.page_theme, page.page_settings);
    const pageTheme = mapSheetStyleToTheme(pageSettings.sheetStyle);
    const content = data?.content !== undefined
      ? (typeof data.content === 'string' ? data.content : JSON.stringify(data.content))
      : page.content;
    const updated = await updateOne('pages', { id, user_id: userId }, {
      title: String(data?.title || page.title).trim() || page.title,
      content,
      tags: data?.tags ? JSON.stringify(data.tags) : page.tags,
      page_theme: pageTheme,
      page_settings: JSON.stringify(pageSettings),
      order_index: data?.order_index ?? page.order_index,
      word_count: data?.content !== undefined ? countWords(content) : page.word_count,
    });

    return buildPageResponse(updated);
  } catch (error) {
    throw new Error(normalizeErrorMessage(error, 'Erro ao atualizar pagina'));
  }
}

async function autoSavePage(id, data) {
  try {
    const userId = await requireUserId();
    const page = await fetchOne('pages', {
      id,
      user_id: userId,
      is_deleted: false,
      deleted_at: null,
    });

    if (!page) {
      throw new Error('Pagina nao encontrada');
    }

    const nextTitle = String(data?.title || '').trim() || page.title;
    const nextContent = typeof data?.content === 'string'
      ? data.content
      : JSON.stringify(data?.content || parseJson(page.content, DEFAULT_PAGE_CONTENT));
    const nextWordCount = countWords(nextContent);
    const today = todayKey();
    const pageUpdatedToday = String(page.updated_at || '').startsWith(today);
    const wordsDelta = Math.max(nextWordCount - Number(page.word_count || 0), 0);

    await updateOne('pages', { id, user_id: userId }, {
      title: nextTitle,
      content: nextContent,
      word_count: nextWordCount,
    });

    const lastHistoryEntries = await fetchMany('page_history', {
      filters: {
        page_id: id,
        user_id: userId,
      },
      select: 'id, saved_at',
      orderBy: 'saved_at',
      ascending: false,
      limit: MAX_HISTORY_ENTRIES + 1,
    });

    const shouldSaveHistory = !lastHistoryEntries.length
      || (Date.now() - toDatabaseDate(lastHistoryEntries[0].saved_at)) > 5 * 60 * 1000;

    if (shouldSaveHistory) {
      await insertOne('page_history', {
        page_id: id,
        user_id: userId,
        title: nextTitle,
        content: nextContent,
        word_count: nextWordCount,
      });

      const staleEntries = lastHistoryEntries.slice(MAX_HISTORY_ENTRIES - 1);
      await Promise.all(staleEntries.map((entry) => deleteMany('page_history', { id: entry.id, user_id: userId })));
    }

    if (pageUpdatedToday) {
      await upsertDailyStats(userId, today, { words_written: wordsDelta }, { words_written: wordsDelta });
    } else {
      await upsertDailyStats(
        userId,
        today,
        { pages_edited: 1, words_written: wordsDelta },
        { pages_edited: 1, words_written: wordsDelta },
      );
    }

    return {
      success: true,
      wordCount: nextWordCount,
      savedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error, 'Erro ao salvar'));
  }
}

async function deletePage(id) {
  try {
    const userId = await requireUserId();
    const page = await fetchOne('pages', {
      id,
      user_id: userId,
      deleted_at: null,
    }, 'id');

    if (!page) {
      throw new Error('Pagina nao encontrada');
    }

    await updateOne('pages', { id, user_id: userId }, {
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    });

    return { success: true };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error, 'Erro ao excluir pagina'));
  }
}

export {
  buildPageContext,
  createPage,
  deletePage,
  getPage,
  loadPageRelationMaps,
  updatePage,
  autoSavePage,
};
