const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  deleteMany,
  fetchMany,
  fetchOne,
  getMaxOrderIndex,
  insertOne,
  nowIso,
  updateMany,
  updateOne,
} = require('../lib/supabase-db');
const { getSupabaseAdmin } = require('../lib/supabase');
const { authenticate } = require('../middleware/auth');
const { ensureDefaultSection } = require('../utils/workspace');

const router = express.Router();
router.use(authenticate);

function createEmptyDocumentObject() {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeSheetStyle(value) {
  if (value === 'grid' || value === 'squared') {
    return 'grid';
  }

  if (value === 'plain' || value === 'blank') {
    return 'plain';
  }

  return 'lined';
}

function normalizePageSettings(pageTheme, rawSettings) {
  const parsed = parseJson(rawSettings, {});

  return {
    sheetStyle: normalizeSheetStyle(parsed.sheetStyle || pageTheme),
    showMargin: typeof parsed.showMargin === 'boolean' ? parsed.showMargin : true,
  };
}

function mapSheetStyleToTheme(sheetStyle) {
  if (sheetStyle === 'plain') {
    return 'blank';
  }

  if (sheetStyle === 'grid') {
    return 'squared';
  }

  return 'lined';
}

function serializePageSettings(pageTheme, rawSettings) {
  return JSON.stringify(normalizePageSettings(pageTheme, rawSettings));
}

function extractTextFromNode(node) {
  let text = '';

  if (node.text) {
    text += `${node.text} `;
  }

  if (Array.isArray(node.content)) {
    node.content.forEach((child) => {
      text += extractTextFromNode(child);
    });
  }

  return text;
}

function countWords(content) {
  try {
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;
    const text = Array.isArray(parsed?.content)
      ? parsed.content.map((node) => extractTextFromNode(node)).join(' ')
      : '';

    return text.trim().split(/\s+/).filter(Boolean).length;
  } catch {
    return 0;
  }
}

function toDatabaseDate(dateValue) {
  if (!dateValue) {
    return 0;
  }

  const normalized = String(dateValue).includes('T')
    ? String(dateValue)
    : `${String(dateValue).replace(' ', 'T')}Z`;

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildPageResponse(page) {
  return {
    ...page,
    page_settings: normalizePageSettings(page.page_theme, page.page_settings),
  };
}

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

  return {
    section,
    subject,
  };
}

async function upsertDailyStats(userId, date, nextValues, increments = {}) {
  const existing = await fetchOne('daily_stats', { user_id: userId, date });

  if (!existing) {
    await insertOne('daily_stats', {
      id: uuidv4(),
      user_id: userId,
      date,
      pages_created: nextValues.pages_created || 0,
      pages_edited: nextValues.pages_edited || 0,
      words_written: nextValues.words_written || 0,
      study_seconds: nextValues.study_seconds || 0,
    });
    return;
  }

  await updateOne('daily_stats', { id: existing.id }, {
    pages_created: Number(existing.pages_created || 0) + Number(increments.pages_created || 0),
    pages_edited: Number(existing.pages_edited || 0) + Number(increments.pages_edited || 0),
    words_written: Number(existing.words_written || 0) + Number(increments.words_written || 0),
    study_seconds: Number(existing.study_seconds || 0) + Number(increments.study_seconds || 0),
  });
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

router.get('/user/trash', async (req, res) => {
  try {
    const pages = await fetchMany('pages', {
      filters: {
        user_id: req.userId,
        is_deleted: true,
      },
      select: 'id, title, deleted_at, updated_at',
      orderBy: 'deleted_at',
      ascending: false,
    });

    res.json(pages);
  } catch (error) {
    console.error('Get trash error:', error);
    res.status(500).json({ error: 'Erro ao buscar lixeira' });
  }
});

router.get('/user/favorites', async (req, res) => {
  try {
    const pages = await fetchMany('pages', {
      filters: {
        user_id: req.userId,
        is_favorite: true,
        is_deleted: false,
        deleted_at: null,
      },
      select: 'id, section_id, title, is_pinned, tags, updated_at, word_count',
      orderBy: 'updated_at',
      ascending: false,
    });

    const relationMaps = await loadPageRelationMaps(req.userId, pages);

    res.json(pages.map((page) => {
      const context = buildPageContext(page, relationMaps);

      return {
        id: page.id,
        title: page.title,
        is_pinned: page.is_pinned,
        tags: page.tags,
        updated_at: page.updated_at,
        word_count: page.word_count,
        subject_name: context.subject_name,
        notebook_name: context.notebook_name,
      };
    }));
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ error: 'Erro ao buscar favoritos' });
  }
});

router.get('/user/recent', async (req, res) => {
  try {
    const pages = await fetchMany('pages', {
      filters: {
        user_id: req.userId,
        is_deleted: false,
        deleted_at: null,
      },
      select: 'id, section_id, title, is_favorite, is_pinned, tags, updated_at, word_count',
      orderBy: 'updated_at',
      ascending: false,
      limit: 20,
    });

    const relationMaps = await loadPageRelationMaps(req.userId, pages);

    res.json(pages.map((page) => ({
      id: page.id,
      title: page.title,
      is_favorite: page.is_favorite,
      is_pinned: page.is_pinned,
      tags: page.tags,
      updated_at: page.updated_at,
      word_count: page.word_count,
      ...buildPageContext(page, relationMaps),
    })));
  } catch (error) {
    console.error('Get recent pages error:', error);
    res.status(500).json({ error: 'Erro ao buscar paginas recentes' });
  }
});

router.get('/user/search', async (req, res) => {
  try {
    const query = req.query.q?.trim();

    if (!query) {
      return res.json([]);
    }

    const escapedQuery = query.replace(/,/g, '\\,');
    const admin = getSupabaseAdmin();
    let queryBuilder = admin
      .from('pages')
      .select('id, section_id, title, is_favorite, is_pinned, tags, updated_at, content')
      .eq('user_id', req.userId)
      .eq('is_deleted', false)
      .is('deleted_at', null)
      .or(`title.ilike.%${escapedQuery}%,content.ilike.%${escapedQuery}%`)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (req.query.favorite === '1') {
      queryBuilder = queryBuilder.eq('is_favorite', true);
    }

    if (req.query.tag) {
      queryBuilder = queryBuilder.ilike('tags', `%\"${req.query.tag}\"%`);
    }

    const pages = await (async () => {
      const { data, error } = await queryBuilder;

      if (error) {
        throw error;
      }

      return data || [];
    })();

    const relationMaps = await loadPageRelationMaps(req.userId, pages);
    const filteredPages = pages.filter((page) => {
      const context = buildPageContext(page, relationMaps);

      if (req.query.notebook_id && context.notebook_id !== req.query.notebook_id) {
        return false;
      }

      return true;
    });

    res.json(filteredPages.map((page) => {
      const parsed = parseJson(page.content, null);
      const fullText = Array.isArray(parsed?.content)
        ? parsed.content.map((node) => extractTextFromNode(node)).join(' ')
        : '';
      const hitIndex = fullText.toLowerCase().indexOf(query.toLowerCase());

      let snippet = '';
      if (hitIndex >= 0) {
        const start = Math.max(0, hitIndex - 40);
        const end = Math.min(fullText.length, hitIndex + query.length + 40);
        snippet = `${start > 0 ? '...' : ''}${fullText.slice(start, end)}${end < fullText.length ? '...' : ''}`;
      } else {
        snippet = `${fullText.slice(0, 100)}${fullText.length > 100 ? '...' : ''}`;
      }

      return {
        id: page.id,
        title: page.title,
        is_favorite: page.is_favorite,
        is_pinned: page.is_pinned,
        tags: page.tags,
        updated_at: page.updated_at,
        content: page.content,
        snippet,
        ...buildPageContext(page, relationMaps),
      };
    }));
  } catch (error) {
    console.error('Search pages error:', error);
    res.status(500).json({ error: 'Erro na busca' });
  }
});

router.get('/section/:sectionId', async (req, res) => {
  try {
    const section = await fetchOne('sections', {
      id: req.params.sectionId,
      user_id: req.userId,
      deleted_at: null,
    }, 'id');

    if (!section) {
      return res.status(404).json({ error: 'Secao nao encontrada' });
    }

    const pages = await fetchMany('pages', {
      filters: {
        section_id: req.params.sectionId,
        user_id: req.userId,
        is_deleted: false,
        is_archived: false,
        deleted_at: null,
      },
      select: 'id, title, is_favorite, is_pinned, tags, order_index, word_count, updated_at',
      orderBy: 'order_index',
    });

    res.json(pages);
  } catch (error) {
    console.error('Get pages by section error:', error);
    res.status(500).json({ error: 'Erro ao buscar paginas' });
  }
});

router.post('/', async (req, res) => {
  try {
    const legacySectionId = req.body.section_id;
    const subjectId = req.body.subject_id;
    const title = req.body.title?.trim() || 'Nova pagina';

    let sectionId = legacySectionId;
    let inheritedTheme = req.body.page_theme || 'lined';

    if (!sectionId && subjectId) {
      const resolved = await resolveSectionForPageCreation(subjectId, req.userId);

      if (!resolved) {
        return res.status(404).json({ error: 'Materia nao encontrada' });
      }

      sectionId = resolved.section.id;
      inheritedTheme = req.body.page_theme || resolved.subject.page_theme || 'lined';
    }

    if (!sectionId) {
      return res.status(400).json({ error: 'Materia e obrigatoria para criar a pagina' });
    }

    const section = await fetchOne('sections', {
      id: sectionId,
      user_id: req.userId,
      deleted_at: null,
    }, 'id, notebook_id');

    if (!section) {
      return res.status(404).json({ error: 'Materia nao encontrada' });
    }

    const subject = await fetchOne('notebooks', {
      id: section.notebook_id,
      user_id: req.userId,
      deleted_at: null,
    }, 'id, page_theme');

    const orderIndex = await getMaxOrderIndex('pages', {
      section_id: sectionId,
      user_id: req.userId,
    });

    const pageTheme = normalizeSheetStyle(inheritedTheme || subject?.page_theme);
    const storedTheme = mapSheetStyleToTheme(pageTheme);
    const pageSettings = serializePageSettings(storedTheme, req.body.page_settings);
    const page = await insertOne('pages', {
      id: uuidv4(),
      section_id: sectionId,
      user_id: req.userId,
      title,
      content: typeof req.body.content === 'string'
        ? req.body.content
        : JSON.stringify(req.body.content || createEmptyDocumentObject()),
      page_theme: storedTheme,
      page_settings: pageSettings,
      order_index: orderIndex + 1,
    });

    const today = new Date().toISOString().split('T')[0];
    await upsertDailyStats(req.userId, today, { pages_created: 1 }, { pages_created: 1 });

    res.status(201).json(buildPageResponse(page));
  } catch (error) {
    console.error('Create page error:', error);
    res.status(500).json({ error: 'Erro ao criar pagina' });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const page = await fetchOne('pages', {
      id: req.params.id,
      user_id: req.userId,
    }, 'id');

    if (!page) {
      return res.status(404).json({ error: 'Pagina nao encontrada' });
    }

    const history = await fetchMany('page_history', {
      filters: {
        page_id: req.params.id,
        user_id: req.userId,
      },
      select: 'id, title, word_count, saved_at',
      orderBy: 'saved_at',
      ascending: false,
      limit: 50,
    });

    res.json(history);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Erro ao buscar historico' });
  }
});

router.get('/:id/history/:historyId', async (req, res) => {
  try {
    const entry = await fetchOne('page_history', {
      id: req.params.historyId,
      page_id: req.params.id,
      user_id: req.userId,
    });

    if (!entry) {
      return res.status(404).json({ error: 'Versao nao encontrada' });
    }

    res.json(entry);
  } catch (error) {
    console.error('Get history entry error:', error);
    res.status(500).json({ error: 'Erro ao buscar versao' });
  }
});

router.post('/:id/history/:historyId/restore', async (req, res) => {
  try {
    const entry = await fetchOne('page_history', {
      id: req.params.historyId,
      page_id: req.params.id,
      user_id: req.userId,
    });

    if (!entry) {
      return res.status(404).json({ error: 'Versao nao encontrada' });
    }

    const currentPage = await fetchOne('pages', {
      id: req.params.id,
      user_id: req.userId,
    });

    await insertOne('page_history', {
      id: uuidv4(),
      page_id: req.params.id,
      user_id: req.userId,
      title: currentPage.title,
      content: currentPage.content,
      word_count: currentPage.word_count,
    });

    const updated = await updateOne(
      'pages',
      { id: req.params.id, user_id: req.userId },
      {
        title: entry.title,
        content: entry.content,
        word_count: entry.word_count,
      },
    );

    res.json(buildPageResponse(updated));
  } catch (error) {
    console.error('Restore history error:', error);
    res.status(500).json({ error: 'Erro ao restaurar versao' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const page = await fetchOne('pages', {
      id: req.params.id,
      user_id: req.userId,
      is_deleted: false,
      deleted_at: null,
    });

    if (!page) {
      return res.status(404).json({ error: 'Pagina nao encontrada' });
    }

    const relationMaps = await loadPageRelationMaps(req.userId, [page]);
    const attachments = await fetchMany('attachments', {
      filters: {
        page_id: page.id,
        user_id: req.userId,
        deleted_at: null,
      },
      select: 'id, original_name, mime_type, size, created_at',
      orderBy: 'created_at',
      ascending: false,
    });

    res.json({
      ...buildPageResponse(page),
      ...buildPageContext(page, relationMaps),
      attachments,
    });
  } catch (error) {
    console.error('Get page error:', error);
    res.status(500).json({ error: 'Erro ao buscar pagina' });
  }
});

router.patch('/:id/autosave', async (req, res) => {
  try {
    const page = await fetchOne('pages', {
      id: req.params.id,
      user_id: req.userId,
      is_deleted: false,
      deleted_at: null,
    });

    if (!page) {
      return res.status(404).json({ error: 'Pagina nao encontrada' });
    }

    const nextTitle = req.body.title?.trim() || page.title;
    const nextContent = typeof req.body.content === 'string'
      ? req.body.content
      : JSON.stringify(req.body.content || parseJson(page.content, createEmptyDocumentObject()));
    const nextWordCount = countWords(nextContent);
    const today = new Date().toISOString().split('T')[0];
    const pageUpdatedToday = String(page.updated_at || '').startsWith(today);
    const wordsDelta = Math.max(nextWordCount - Number(page.word_count || 0), 0);

    await updateOne(
      'pages',
      { id: req.params.id, user_id: req.userId },
      {
        title: nextTitle,
        content: nextContent,
        word_count: nextWordCount,
      },
    );

    const lastHistoryEntries = await fetchMany('page_history', {
      filters: {
        page_id: req.params.id,
        user_id: req.userId,
      },
      select: 'id, saved_at',
      orderBy: 'saved_at',
      ascending: false,
      limit: 51,
    });

    const shouldSaveHistory = !lastHistoryEntries.length
      || (Date.now() - toDatabaseDate(lastHistoryEntries[0].saved_at)) > 5 * 60 * 1000;

    if (shouldSaveHistory) {
      await insertOne('page_history', {
        id: uuidv4(),
        page_id: req.params.id,
        user_id: req.userId,
        title: nextTitle,
        content: nextContent,
        word_count: nextWordCount,
      });

      const staleEntries = lastHistoryEntries.slice(49);
      await Promise.all(staleEntries.map((entry) => deleteMany('page_history', { id: entry.id })));
    }

    if (pageUpdatedToday) {
      await upsertDailyStats(req.userId, today, { words_written: wordsDelta }, { words_written: wordsDelta });
    } else {
      await upsertDailyStats(
        req.userId,
        today,
        { pages_edited: 1, words_written: wordsDelta },
        { pages_edited: 1, words_written: wordsDelta },
      );
    }

    res.json({
      success: true,
      wordCount: nextWordCount,
      savedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Autosave error:', error);
    res.status(500).json({ error: 'Erro ao salvar' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const page = await fetchOne('pages', {
      id: req.params.id,
      user_id: req.userId,
      deleted_at: null,
    });

    if (!page) {
      return res.status(404).json({ error: 'Pagina nao encontrada' });
    }

    const pageSettings = req.body.page_settings !== undefined
      ? normalizePageSettings(req.body.page_theme || page.page_theme, req.body.page_settings)
      : normalizePageSettings(page.page_theme, page.page_settings);
    const pageTheme = mapSheetStyleToTheme(pageSettings.sheetStyle);
    const content = req.body.content !== undefined
      ? (typeof req.body.content === 'string' ? req.body.content : JSON.stringify(req.body.content))
      : page.content;

    const updated = await updateOne(
      'pages',
      { id: req.params.id, user_id: req.userId },
      {
        title: req.body.title?.trim() || page.title,
        content,
        tags: req.body.tags ? JSON.stringify(req.body.tags) : page.tags,
        page_theme: pageTheme,
        page_settings: JSON.stringify(pageSettings),
        order_index: req.body.order_index ?? page.order_index,
      },
    );

    res.json(buildPageResponse(updated));
  } catch (error) {
    console.error('Update page error:', error);
    res.status(500).json({ error: 'Erro ao atualizar pagina' });
  }
});

router.patch('/:id/favorite', async (req, res) => {
  try {
    const page = await fetchOne('pages', {
      id: req.params.id,
      user_id: req.userId,
      deleted_at: null,
    });

    if (!page) {
      return res.status(404).json({ error: 'Pagina nao encontrada' });
    }

    await updateOne('pages', { id: req.params.id, user_id: req.userId }, {
      is_favorite: !page.is_favorite,
    });

    res.json({ is_favorite: !page.is_favorite });
  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({ error: 'Erro ao favoritar' });
  }
});

router.patch('/:id/pin', async (req, res) => {
  try {
    const page = await fetchOne('pages', {
      id: req.params.id,
      user_id: req.userId,
      deleted_at: null,
    });

    if (!page) {
      return res.status(404).json({ error: 'Pagina nao encontrada' });
    }

    await updateOne('pages', { id: req.params.id, user_id: req.userId }, {
      is_pinned: !page.is_pinned,
    });

    res.json({ is_pinned: !page.is_pinned });
  } catch (error) {
    console.error('Toggle pin error:', error);
    res.status(500).json({ error: 'Erro ao fixar' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const page = await fetchOne('pages', {
      id: req.params.id,
      user_id: req.userId,
      deleted_at: null,
    });

    if (!page) {
      return res.status(404).json({ error: 'Pagina nao encontrada' });
    }

    await updateOne('pages', { id: req.params.id, user_id: req.userId }, {
      is_deleted: true,
      deleted_at: nowIso(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Soft delete page error:', error);
    res.status(500).json({ error: 'Erro ao excluir pagina' });
  }
});

router.patch('/:id/restore', async (req, res) => {
  try {
    const page = await fetchOne('pages', {
      id: req.params.id,
      user_id: req.userId,
      is_deleted: true,
    });

    if (!page) {
      return res.status(404).json({ error: 'Pagina nao encontrada na lixeira' });
    }

    await updateOne('pages', { id: req.params.id, user_id: req.userId }, {
      is_deleted: false,
      deleted_at: null,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Restore page error:', error);
    res.status(500).json({ error: 'Erro ao restaurar pagina' });
  }
});

router.delete('/:id/permanent', async (req, res) => {
  try {
    const page = await fetchOne('pages', {
      id: req.params.id,
      user_id: req.userId,
    }, 'id');

    if (!page) {
      return res.status(404).json({ error: 'Pagina nao encontrada' });
    }

    await deleteMany('pages', { id: req.params.id, user_id: req.userId });
    res.json({ success: true });
  } catch (error) {
    console.error('Permanent delete page error:', error);
    res.status(500).json({ error: 'Erro ao excluir pagina permanentemente' });
  }
});

router.post('/:id/duplicate', async (req, res) => {
  try {
    const page = await fetchOne('pages', {
      id: req.params.id,
      user_id: req.userId,
      is_deleted: false,
      deleted_at: null,
    });

    if (!page) {
      return res.status(404).json({ error: 'Pagina nao encontrada' });
    }

    const duplicated = await insertOne('pages', {
      id: uuidv4(),
      section_id: page.section_id,
      user_id: req.userId,
      title: `${page.title} (copia)`,
      content: page.content,
      page_theme: page.page_theme || 'lined',
      page_settings: page.page_settings || '{}',
      tags: page.tags || '[]',
      order_index: Number(page.order_index || 0) + 1,
      word_count: page.word_count || 0,
    });

    res.status(201).json(buildPageResponse(duplicated));
  } catch (error) {
    console.error('Duplicate page error:', error);
    res.status(500).json({ error: 'Erro ao duplicar pagina' });
  }
});

router.put('/reorder/batch', async (req, res) => {
  try {
    const items = req.body.items;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items deve ser um array' });
    }

    await Promise.all(items.map(({ id, order_index: orderIndex, section_id: sectionId }) => (
      updateMany(
        'pages',
        { id, user_id: req.userId },
        sectionId
          ? { order_index: orderIndex, section_id: sectionId }
          : { order_index: orderIndex },
      )
    )));

    res.json({ success: true });
  } catch (error) {
    console.error('Reorder pages error:', error);
    res.status(500).json({ error: 'Erro ao reordenar paginas' });
  }
});

module.exports = router;
