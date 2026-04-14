const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  deleteMany,
  fetchMany,
  fetchOne,
  getMaxOrderIndex,
  insertOne,
  updateOne,
  updateMany,
} = require('../lib/supabase-db');
const { authenticate } = require('../middleware/auth');
const { buildWorkspaceTree } = require('../utils/workspace');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const notebooks = await fetchMany('subjects', {
      filters: {
        user_id: req.userId,
        is_archived: false,
        deleted_at: null,
      },
      orderBy: 'order_index',
    });

    res.json(notebooks);
  } catch (error) {
    console.error('Get notebooks error:', error);
    res.status(500).json({ error: 'Erro ao buscar cadernos' });
  }
});

router.get('/tree', async (req, res) => {
  try {
    res.json(await buildWorkspaceTree(req.userId));
  } catch (error) {
    console.error('Get workspace tree error:', error);
    res.status(500).json({ error: 'Erro ao carregar o workspace' });
  }
});

router.post('/', async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const color = req.body.color || '#4f46e5';
    const icon = req.body.icon || 'C';

    if (!name) {
      return res.status(400).json({ error: 'Nome do caderno e obrigatorio' });
    }

    const orderIndex = await getMaxOrderIndex('subjects', { user_id: req.userId });
    const notebook = await insertOne('subjects', {
      id: uuidv4(),
      user_id: req.userId,
      name,
      color,
      icon,
      order_index: orderIndex + 1,
    });

    res.status(201).json(notebook);
  } catch (error) {
    console.error('Create notebook error:', error);
    res.status(500).json({ error: 'Erro ao criar caderno' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const notebook = await fetchOne('subjects', {
      id: req.params.id,
      user_id: req.userId,
      deleted_at: null,
    });

    if (!notebook) {
      return res.status(404).json({ error: 'Caderno nao encontrado' });
    }

    const updated = await updateOne(
      'subjects',
      { id: req.params.id, user_id: req.userId },
      {
        name: req.body.name?.trim() || notebook.name,
        color: req.body.color || notebook.color,
        icon: req.body.icon || notebook.icon,
        order_index: req.body.order_index ?? notebook.order_index,
      },
    );

    res.json(updated);
  } catch (error) {
    console.error('Update notebook error:', error);
    res.status(500).json({ error: 'Erro ao atualizar caderno' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const notebook = await fetchOne('subjects', {
      id: req.params.id,
      user_id: req.userId,
      deleted_at: null,
    });

    if (!notebook) {
      return res.status(404).json({ error: 'Caderno nao encontrado' });
    }

    await deleteMany('subjects', { id: req.params.id, user_id: req.userId });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete notebook error:', error);
    res.status(500).json({ error: 'Erro ao excluir caderno' });
  }
});

router.put('/reorder/batch', async (req, res) => {
  try {
    const items = req.body.items;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items deve ser um array' });
    }

    await Promise.all(items.map(({ id, order_index: orderIndex }) => (
      updateMany('subjects', { id, user_id: req.userId }, { order_index: orderIndex })
    )));

    res.json({ success: true });
  } catch (error) {
    console.error('Reorder notebooks error:', error);
    res.status(500).json({ error: 'Erro ao reordenar cadernos' });
  }
});

router.post('/:id/duplicate', async (req, res) => {
  try {
    const notebook = await fetchOne('subjects', {
      id: req.params.id,
      user_id: req.userId,
      deleted_at: null,
    });

    if (!notebook) {
      return res.status(404).json({ error: 'Caderno nao encontrado' });
    }

    const duplicateId = uuidv4();
    const duplicatedNotebook = await insertOne('subjects', {
      id: duplicateId,
      user_id: req.userId,
      name: `${notebook.name} (copia)`,
      color: notebook.color,
      icon: notebook.icon,
      order_index: Number(notebook.order_index || 0) + 1,
    });

    const subjects = await fetchMany('notebooks', {
      filters: {
        subject_id: notebook.id,
        user_id: req.userId,
        deleted_at: null,
      },
      orderBy: 'order_index',
    });

    for (const subject of subjects) {
      const newSubjectId = uuidv4();

      await insertOne('notebooks', {
        id: newSubjectId,
        subject_id: duplicateId,
        user_id: req.userId,
        name: subject.name,
        color: subject.color,
        page_theme: subject.page_theme || 'lined',
        order_index: subject.order_index,
        is_pinned: false,
      });

      const sections = await fetchMany('sections', {
        filters: {
          notebook_id: subject.id,
          user_id: req.userId,
          deleted_at: null,
        },
        orderBy: 'order_index',
      });

      for (const section of sections) {
        const newSectionId = uuidv4();

        await insertOne('sections', {
          id: newSectionId,
          notebook_id: newSubjectId,
          user_id: req.userId,
          name: section.name,
          order_index: section.order_index,
        });

        const pages = await fetchMany('pages', {
          filters: {
            section_id: section.id,
            user_id: req.userId,
            is_deleted: false,
            deleted_at: null,
          },
          orderBy: 'order_index',
        });

        for (const page of pages) {
          await insertOne('pages', {
            id: uuidv4(),
            section_id: newSectionId,
            user_id: req.userId,
            title: page.title,
            content: page.content,
            page_theme: page.page_theme || 'lined',
            page_settings: page.page_settings || '{}',
            tags: page.tags || '[]',
            order_index: page.order_index,
            word_count: page.word_count || 0,
            is_favorite: false,
            is_pinned: false,
          });
        }
      }
    }

    res.status(201).json(duplicatedNotebook);
  } catch (error) {
    console.error('Duplicate notebook error:', error);
    res.status(500).json({ error: 'Erro ao duplicar caderno' });
  }
});

module.exports = router;
