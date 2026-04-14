const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  deleteMany,
  fetchMany,
  fetchOne,
  getMaxOrderIndex,
  insertOne,
  updateMany,
  updateOne,
} = require('../lib/supabase-db');
const { authenticate } = require('../middleware/auth');
const { ensureDefaultSection } = require('../utils/workspace');

const router = express.Router();
router.use(authenticate);

router.get('/notebook/:notebookId', async (req, res) => {
  try {
    const notebook = await fetchOne('subjects', {
      id: req.params.notebookId,
      user_id: req.userId,
      deleted_at: null,
    }, 'id');

    if (!notebook) {
      return res.status(404).json({ error: 'Caderno nao encontrado' });
    }

    const subjects = await fetchMany('notebooks', {
      filters: {
        subject_id: req.params.notebookId,
        user_id: req.userId,
        is_archived: false,
        deleted_at: null,
      },
      orderBy: 'order_index',
    });

    res.json(subjects);
  } catch (error) {
    console.error('Get subjects by notebook error:', error);
    res.status(500).json({ error: 'Erro ao buscar materias' });
  }
});

router.post('/', async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const notebookId = req.body.subject_id;
    const color = req.body.color || '#2563eb';
    const pageTheme = req.body.page_theme || 'lined';

    if (!name || !notebookId) {
      return res.status(400).json({ error: 'Nome da materia e caderno sao obrigatorios' });
    }

    const notebook = await fetchOne('subjects', {
      id: notebookId,
      user_id: req.userId,
      deleted_at: null,
    }, 'id');

    if (!notebook) {
      return res.status(404).json({ error: 'Caderno nao encontrado' });
    }

    const orderIndex = await getMaxOrderIndex('notebooks', {
      subject_id: notebookId,
      user_id: req.userId,
    });

    const subject = await insertOne('notebooks', {
      id: uuidv4(),
      subject_id: notebookId,
      user_id: req.userId,
      name,
      color,
      page_theme: pageTheme,
      order_index: orderIndex + 1,
    });

    const defaultSection = await ensureDefaultSection(subject.id, req.userId);

    res.status(201).json({
      ...subject,
      default_section_id: defaultSection.id,
    });
  } catch (error) {
    console.error('Create subject error:', error);
    res.status(500).json({ error: 'Erro ao criar materia' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const subject = await fetchOne('notebooks', {
      id: req.params.id,
      user_id: req.userId,
      deleted_at: null,
    });

    if (!subject) {
      return res.status(404).json({ error: 'Materia nao encontrada' });
    }

    const updated = await updateOne(
      'notebooks',
      { id: req.params.id, user_id: req.userId },
      {
        name: req.body.name?.trim() || subject.name,
        color: req.body.color || subject.color,
        page_theme: req.body.page_theme || subject.page_theme || 'lined',
        order_index: req.body.order_index ?? subject.order_index,
      },
    );

    res.json(updated);
  } catch (error) {
    console.error('Update subject error:', error);
    res.status(500).json({ error: 'Erro ao atualizar materia' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const subject = await fetchOne('notebooks', {
      id: req.params.id,
      user_id: req.userId,
      deleted_at: null,
    });

    if (!subject) {
      return res.status(404).json({ error: 'Materia nao encontrada' });
    }

    await deleteMany('notebooks', { id: req.params.id, user_id: req.userId });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete subject error:', error);
    res.status(500).json({ error: 'Erro ao excluir materia' });
  }
});

router.patch('/:id/pin', async (req, res) => {
  try {
    const subject = await fetchOne('notebooks', {
      id: req.params.id,
      user_id: req.userId,
      deleted_at: null,
    });

    if (!subject) {
      return res.status(404).json({ error: 'Materia nao encontrada' });
    }

    await updateOne('notebooks', { id: req.params.id, user_id: req.userId }, {
      is_pinned: !subject.is_pinned,
    });

    res.json({ is_pinned: !subject.is_pinned });
  } catch (error) {
    console.error('Pin subject error:', error);
    res.status(500).json({ error: 'Erro ao fixar materia' });
  }
});

router.put('/reorder/batch', async (req, res) => {
  try {
    const items = req.body.items;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items deve ser um array' });
    }

    await Promise.all(items.map(({ id, order_index: orderIndex, subject_id: notebookId }) => (
      updateMany(
        'notebooks',
        { id, user_id: req.userId },
        notebookId
          ? { order_index: orderIndex, subject_id: notebookId }
          : { order_index: orderIndex },
      )
    )));

    res.json({ success: true });
  } catch (error) {
    console.error('Reorder subjects error:', error);
    res.status(500).json({ error: 'Erro ao reordenar materias' });
  }
});

module.exports = router;
