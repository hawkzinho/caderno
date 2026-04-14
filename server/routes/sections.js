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

const router = express.Router();
router.use(authenticate);

router.get('/notebook/:notebookId', async (req, res) => {
  try {
    const notebook = await fetchOne('notebooks', {
      id: req.params.notebookId,
      user_id: req.userId,
      deleted_at: null,
    }, 'id');

    if (!notebook) {
      return res.status(404).json({ error: 'Caderno nao encontrado' });
    }

    const sections = await fetchMany('sections', {
      filters: {
        notebook_id: req.params.notebookId,
        user_id: req.userId,
        is_archived: false,
        deleted_at: null,
      },
      orderBy: 'order_index',
    });

    res.json(sections);
  } catch (error) {
    console.error('Get sections error:', error);
    res.status(500).json({ error: 'Erro ao buscar secoes' });
  }
});

router.post('/', async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const notebookId = req.body.notebook_id;

    if (!name || !notebookId) {
      return res.status(400).json({ error: 'Nome e caderno sao obrigatorios' });
    }

    const notebook = await fetchOne('notebooks', {
      id: notebookId,
      user_id: req.userId,
      deleted_at: null,
    }, 'id');

    if (!notebook) {
      return res.status(404).json({ error: 'Caderno nao encontrado' });
    }

    const orderIndex = await getMaxOrderIndex('sections', {
      notebook_id: notebookId,
      user_id: req.userId,
    });

    const section = await insertOne('sections', {
      id: uuidv4(),
      notebook_id: notebookId,
      user_id: req.userId,
      name,
      order_index: orderIndex + 1,
    });

    res.status(201).json(section);
  } catch (error) {
    console.error('Create section error:', error);
    res.status(500).json({ error: 'Erro ao criar secao' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const section = await fetchOne('sections', {
      id: req.params.id,
      user_id: req.userId,
      deleted_at: null,
    });

    if (!section) {
      return res.status(404).json({ error: 'Secao nao encontrada' });
    }

    const updated = await updateOne(
      'sections',
      { id: req.params.id, user_id: req.userId },
      {
        name: req.body.name?.trim() || section.name,
        order_index: req.body.order_index ?? section.order_index,
      },
    );

    res.json(updated);
  } catch (error) {
    console.error('Update section error:', error);
    res.status(500).json({ error: 'Erro ao atualizar secao' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const section = await fetchOne('sections', {
      id: req.params.id,
      user_id: req.userId,
      deleted_at: null,
    });

    if (!section) {
      return res.status(404).json({ error: 'Secao nao encontrada' });
    }

    await deleteMany('sections', { id: req.params.id, user_id: req.userId });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete section error:', error);
    res.status(500).json({ error: 'Erro ao excluir secao' });
  }
});

router.put('/reorder/batch', async (req, res) => {
  try {
    const items = req.body.items;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items deve ser um array' });
    }

    await Promise.all(items.map(({ id, order_index: orderIndex, notebook_id: notebookId }) => (
      updateMany(
        'sections',
        { id, user_id: req.userId },
        notebookId
          ? { order_index: orderIndex, notebook_id: notebookId }
          : { order_index: orderIndex },
      )
    )));

    res.json({ success: true });
  } catch (error) {
    console.error('Reorder sections error:', error);
    res.status(500).json({ error: 'Erro ao reordenar' });
  }
});

module.exports = router;
