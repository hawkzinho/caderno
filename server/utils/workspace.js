const { v4: uuidv4 } = require('uuid');
const {
  fetchMany,
  fetchOne,
  getMaxOrderIndex,
  insertOne,
} = require('../lib/supabase-db');

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
  let section = existingSections[0] || null;

  if (section) {
    return section;
  }

  const maxOrder = await getMaxOrderIndex('sections', {
    notebook_id: notebookId,
    user_id: userId,
  });

  section = await insertOne('sections', {
    id: uuidv4(),
    notebook_id: notebookId,
    user_id: userId,
    name: 'Paginas',
    order_index: maxOrder + 1,
  });

  return section;
}

async function getSubjectPages(subjectId, userId) {
  const sections = await fetchMany('sections', {
    filters: {
      notebook_id: subjectId,
      user_id: userId,
      deleted_at: null,
    },
    select: 'id, notebook_id, order_index',
  });

  if (!sections.length) {
    return [];
  }

  const sectionIds = sections.map((section) => section.id);
  const sectionOrderMap = new Map(sections.map((section) => [section.id, Number(section.order_index || 0)]));

  const pages = await fetchMany('pages', {
    filters: {
      section_id: sectionIds,
      user_id: userId,
      is_deleted: false,
      is_archived: false,
      deleted_at: null,
    },
    select: 'id, section_id, title, is_favorite, is_pinned, tags, word_count, order_index, updated_at',
  });

  return pages.sort((left, right) => {
    const sectionOrderDiff = (sectionOrderMap.get(left.section_id) || 0) - (sectionOrderMap.get(right.section_id) || 0);
    if (sectionOrderDiff !== 0) {
      return sectionOrderDiff;
    }

    const pageOrderDiff = Number(left.order_index || 0) - Number(right.order_index || 0);
    if (pageOrderDiff !== 0) {
      return pageOrderDiff;
    }

    return new Date(right.updated_at || 0).getTime() - new Date(left.updated_at || 0).getTime();
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

module.exports = {
  buildWorkspaceTree,
  ensureDefaultSection,
  getSubjectPages,
};
