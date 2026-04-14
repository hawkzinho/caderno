const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { deleteMany, fetchMany, fetchOne, insertOne } = require('../lib/supabase-db');
const { getSupabaseAdmin } = require('../lib/supabase');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'attachments';
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/zip',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(new Error('Tipo de arquivo nao permitido'), false);
  },
});

function sanitizeFilename(filename) {
  return filename
    .normalize('NFKD')
    .replace(/[^\w.\-() ]+/g, '')
    .replace(/\s+/g, '-')
    .slice(-120) || 'arquivo';
}

async function removeStorageObject(filePath) {
  const { error } = await getSupabaseAdmin()
    .storage
    .from(STORAGE_BUCKET)
    .remove([filePath]);

  if (error) {
    throw error;
  }
}

router.post('/upload/:pageId', upload.single('file'), async (req, res) => {
  let storagePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const page = await fetchOne('pages', {
      id: req.params.pageId,
      user_id: req.userId,
      deleted_at: null,
    }, 'id');

    if (!page) {
      return res.status(404).json({ error: 'Pagina nao encontrada' });
    }

    const extension = path.extname(req.file.originalname || '');
    storagePath = `${req.userId}/${uuidv4()}-${sanitizeFilename(req.file.originalname || `arquivo${extension}`)}`;

    const { error: uploadError } = await getSupabaseAdmin()
      .storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const attachment = await insertOne('attachments', {
      id: uuidv4(),
      page_id: req.params.pageId,
      user_id: req.userId,
      filename: storagePath,
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size: req.file.size,
    });

    res.status(201).json({
      ...attachment,
      url: `/api/attachments/download/${attachment.id}`,
    });
  } catch (error) {
    if (storagePath) {
      try {
        await removeStorageObject(storagePath);
      } catch (cleanupError) {
        console.error('Attachment cleanup error:', cleanupError);
      }
    }

    console.error('Upload attachment error:', error);
    res.status(500).json({ error: 'Erro ao fazer upload' });
  }
});

router.get('/download/:id', async (req, res) => {
  try {
    const attachment = await fetchOne('attachments', {
      id: req.params.id,
      user_id: req.userId,
      deleted_at: null,
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Arquivo nao encontrado' });
    }

    const { data, error } = await getSupabaseAdmin()
      .storage
      .from(STORAGE_BUCKET)
      .download(attachment.filename);

    if (error || !data) {
      return res.status(404).json({ error: 'Arquivo nao encontrado' });
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    res.setHeader('Content-Type', attachment.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${attachment.original_name}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Download attachment error:', error);
    res.status(500).json({ error: 'Erro ao baixar arquivo' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const attachment = await fetchOne('attachments', {
      id: req.params.id,
      user_id: req.userId,
      deleted_at: null,
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Arquivo nao encontrado' });
    }

    await removeStorageObject(attachment.filename);
    await deleteMany('attachments', { id: req.params.id, user_id: req.userId });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete attachment error:', error);
    res.status(500).json({ error: 'Erro ao excluir arquivo' });
  }
});

router.get('/page/:pageId', async (req, res) => {
  try {
    const page = await fetchOne('pages', {
      id: req.params.pageId,
      user_id: req.userId,
      deleted_at: null,
    }, 'id');

    if (!page) {
      return res.status(404).json({ error: 'Pagina nao encontrada' });
    }

    const attachments = await fetchMany('attachments', {
      filters: {
        page_id: req.params.pageId,
        user_id: req.userId,
        deleted_at: null,
      },
      select: 'id, original_name, mime_type, size, created_at',
      orderBy: 'created_at',
      ascending: false,
    });

    res.json(attachments.map((attachment) => ({
      ...attachment,
      url: `/api/attachments/download/${attachment.id}`,
    })));
  } catch (error) {
    console.error('List attachments error:', error);
    res.status(500).json({ error: 'Erro ao buscar arquivos' });
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Arquivo muito grande (max. 10MB)' });
    }

    return res.status(400).json({ error: err.message });
  }

  if (err.message === 'Tipo de arquivo nao permitido') {
    return res.status(415).json({ error: err.message });
  }

  next(err);
});

module.exports = router;
