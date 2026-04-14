require('dotenv').config();

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { getSupabaseAdmin, assertSupabaseConfig } = require('../lib/supabase');

const LEGACY_DB_PATH = process.env.LEGACY_SQLJS_DB_PATH || path.join(__dirname, '..', 'caderno.db');
const LEGACY_UPLOADS_DIR = process.env.LEGACY_UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'attachments';

function chunkArray(items, size = 100) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function toBoolean(value) {
  return value === true || value === 1 || value === '1';
}

function toTimestamp(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).includes('T')
    ? String(value)
    : `${String(value).replace(' ', 'T')}Z`;
  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function queryTable(db, tableName) {
  const statement = db.prepare(`SELECT * FROM ${tableName}`);
  const rows = [];

  while (statement.step()) {
    rows.push(statement.getAsObject());
  }

  statement.free();
  return rows;
}

async function upsertBatch(tableName, rows) {
  if (!rows.length) {
    return;
  }

  const admin = getSupabaseAdmin();

  for (const chunk of chunkArray(rows, 100)) {
    const { error } = await admin
      .from(tableName)
      .upsert(chunk, { onConflict: 'id' });

    if (error) {
      throw error;
    }
  }
}

async function migrateUsers(legacyUsers) {
  const admin = getSupabaseAdmin();
  const userIdMap = new Map();

  for (const legacyUser of legacyUsers) {
    const { data: existingProfile, error: profileError } = await admin
      .from('users')
      .select('id, email')
      .eq('email', legacyUser.email)
      .maybeSingle();

    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError;
    }

    let nextUserId = existingProfile?.id || null;

    if (!nextUserId) {
      const { data, error } = await admin.auth.admin.createUser({
        email: legacyUser.email,
        password_hash: legacyUser.password_hash,
        email_confirm: true,
        user_metadata: {
          name: legacyUser.name,
        },
      });

      if (error || !data?.user?.id) {
        throw error || new Error(`Nao foi possivel migrar o usuario ${legacyUser.email}`);
      }

      nextUserId = data.user.id;
    }

    userIdMap.set(legacyUser.id, nextUserId);

    const { error: upsertError } = await admin.from('users').upsert({
      id: nextUserId,
      name: legacyUser.name,
      email: legacyUser.email,
      avatar_color: legacyUser.avatar_color || '#6C5CE7',
      theme: legacyUser.theme || 'light',
      preferences: legacyUser.preferences || '{}',
      created_at: toTimestamp(legacyUser.created_at),
      updated_at: toTimestamp(legacyUser.updated_at),
      deleted_at: null,
    }, {
      onConflict: 'id',
    });

    if (upsertError) {
      throw upsertError;
    }
  }

  return userIdMap;
}

async function migrateAttachments(legacyAttachments, userIdMap) {
  if (!legacyAttachments.length) {
    return [];
  }

  const admin = getSupabaseAdmin();
  const migratedRows = [];

  for (const attachment of legacyAttachments) {
    const mappedUserId = userIdMap.get(attachment.user_id);

    if (!mappedUserId) {
      continue;
    }

    const localFilePath = path.join(LEGACY_UPLOADS_DIR, attachment.filename);

    if (!fs.existsSync(localFilePath)) {
      console.warn(`Arquivo nao encontrado para attachment ${attachment.id}: ${localFilePath}`);
      continue;
    }

    const storagePath = `${mappedUserId}/${attachment.filename}`;
    const fileBuffer = fs.readFileSync(localFilePath);
    const { error: uploadError } = await admin.storage.from(STORAGE_BUCKET).upload(storagePath, fileBuffer, {
      contentType: attachment.mime_type,
      upsert: true,
    });

    if (uploadError) {
      throw uploadError;
    }

    migratedRows.push({
      id: attachment.id,
      page_id: attachment.page_id,
      user_id: mappedUserId,
      filename: storagePath,
      original_name: attachment.original_name,
      mime_type: attachment.mime_type,
      size: Number(attachment.size || 0),
      created_at: toTimestamp(attachment.created_at),
      updated_at: toTimestamp(attachment.created_at),
      deleted_at: null,
    });
  }

  return migratedRows;
}

async function main() {
  assertSupabaseConfig();

  if (!fs.existsSync(LEGACY_DB_PATH)) {
    throw new Error(`Banco legado nao encontrado em ${LEGACY_DB_PATH}`);
  }

  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(LEGACY_DB_PATH));

  const legacyUsers = queryTable(db, 'users');
  const legacySubjects = queryTable(db, 'subjects');
  const legacyNotebooks = queryTable(db, 'notebooks');
  const legacySections = queryTable(db, 'sections');
  const legacyPages = queryTable(db, 'pages');
  const legacyPageHistory = queryTable(db, 'page_history');
  const legacyAttachments = queryTable(db, 'attachments');
  const legacyStudySessions = queryTable(db, 'study_sessions');
  const legacyDailyStats = queryTable(db, 'daily_stats');

  console.log(`Usuarios legados encontrados: ${legacyUsers.length}`);
  const userIdMap = await migrateUsers(legacyUsers);
  console.log(`Usuarios migrados para auth + public.users: ${userIdMap.size}`);

  await upsertBatch('subjects', legacySubjects.map((row) => ({
    id: row.id,
    user_id: userIdMap.get(row.user_id),
    name: row.name,
    color: row.color || '#6C5CE7',
    icon: row.icon || '📚',
    order_index: Number(row.order_index || 0),
    is_archived: toBoolean(row.is_archived),
    created_at: toTimestamp(row.created_at),
    updated_at: toTimestamp(row.updated_at),
    deleted_at: null,
  })).filter((row) => row.user_id));
  console.log(`Cadernos migrados: ${legacySubjects.length}`);

  await upsertBatch('notebooks', legacyNotebooks.map((row) => ({
    id: row.id,
    subject_id: row.subject_id,
    user_id: userIdMap.get(row.user_id),
    name: row.name,
    color: row.color || '#00B894',
    order_index: Number(row.order_index || 0),
    is_archived: toBoolean(row.is_archived),
    page_theme: row.page_theme || 'blank',
    is_pinned: toBoolean(row.is_pinned),
    created_at: toTimestamp(row.created_at),
    updated_at: toTimestamp(row.updated_at),
    deleted_at: null,
  })).filter((row) => row.user_id));
  console.log(`Materias migradas: ${legacyNotebooks.length}`);

  await upsertBatch('sections', legacySections.map((row) => ({
    id: row.id,
    notebook_id: row.notebook_id,
    user_id: userIdMap.get(row.user_id),
    name: row.name,
    order_index: Number(row.order_index || 0),
    is_archived: toBoolean(row.is_archived),
    created_at: toTimestamp(row.created_at),
    updated_at: toTimestamp(row.updated_at),
    deleted_at: null,
  })).filter((row) => row.user_id));
  console.log(`Secoes migradas: ${legacySections.length}`);

  await upsertBatch('pages', legacyPages.map((row) => ({
    id: row.id,
    section_id: row.section_id,
    user_id: userIdMap.get(row.user_id),
    title: row.title || 'Sem titulo',
    content: row.content || '{"type":"doc","content":[{"type":"paragraph"}]}',
    page_theme: row.page_theme || 'blank',
    page_settings: row.page_settings || '{}',
    is_favorite: toBoolean(row.is_favorite),
    is_pinned: toBoolean(row.is_pinned),
    is_archived: toBoolean(row.is_archived),
    is_deleted: toBoolean(row.is_deleted),
    tags: row.tags || '[]',
    order_index: Number(row.order_index || 0),
    word_count: Number(row.word_count || 0),
    created_at: toTimestamp(row.created_at),
    updated_at: toTimestamp(row.updated_at),
    deleted_at: toTimestamp(row.deleted_at),
  })).filter((row) => row.user_id));
  console.log(`Paginas migradas: ${legacyPages.length}`);

  await upsertBatch('page_history', legacyPageHistory.map((row) => ({
    id: row.id,
    page_id: row.page_id,
    user_id: userIdMap.get(row.user_id),
    title: row.title,
    content: row.content,
    word_count: Number(row.word_count || 0),
    saved_at: toTimestamp(row.saved_at),
    created_at: toTimestamp(row.saved_at),
    updated_at: toTimestamp(row.saved_at),
    deleted_at: null,
  })).filter((row) => row.user_id));
  console.log(`Historico migrado: ${legacyPageHistory.length}`);

  const migratedAttachments = await migrateAttachments(legacyAttachments, userIdMap);
  await upsertBatch('attachments', migratedAttachments);
  console.log(`Anexos migrados: ${migratedAttachments.length}`);

  await upsertBatch('study_sessions', legacyStudySessions.map((row) => ({
    id: row.id,
    user_id: userIdMap.get(row.user_id),
    page_id: row.page_id || null,
    started_at: toTimestamp(row.started_at),
    ended_at: toTimestamp(row.ended_at),
    duration_seconds: Number(row.duration_seconds || 0),
    created_at: toTimestamp(row.started_at),
    updated_at: toTimestamp(row.ended_at || row.started_at),
    deleted_at: null,
  })).filter((row) => row.user_id));
  console.log(`Sessoes de estudo migradas: ${legacyStudySessions.length}`);

  await upsertBatch('daily_stats', legacyDailyStats.map((row) => ({
    id: row.id,
    user_id: userIdMap.get(row.user_id),
    date: row.date,
    pages_created: Number(row.pages_created || 0),
    pages_edited: Number(row.pages_edited || 0),
    words_written: Number(row.words_written || 0),
    study_seconds: Number(row.study_seconds || 0),
    created_at: toTimestamp(row.date),
    updated_at: toTimestamp(row.date),
    deleted_at: null,
  })).filter((row) => row.user_id));
  console.log(`Estatisticas diarias migradas: ${legacyDailyStats.length}`);

  console.log('Migracao concluida com sucesso.');
}

main().catch((error) => {
  console.error('Falha na migracao:', error);
  process.exit(1);
});
