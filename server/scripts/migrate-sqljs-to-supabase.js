require('dotenv').config();

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { v5: uuidv5 } = require('uuid');
const { getSupabaseAdmin, assertSupabaseConfig } = require('../lib/supabase');

const LEGACY_DB_PATH = process.env.LEGACY_SQLJS_DB_PATH || path.join(__dirname, '..', 'caderno.db');
const LEGACY_UPLOADS_DIR = process.env.LEGACY_UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'attachments';
const MIGRATION_NAMESPACE = '2cb6f97d-7aa3-4d7c-a3f2-7b7f96f3c9d5';

function chunkArray(items, size = 100) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
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

function buildMappedId(entityName, legacyId) {
  return uuidv5(`${entityName}:${legacyId}`, MIGRATION_NAMESPACE);
}

function createStats(label, totalLegacy) {
  return {
    label,
    totalLegacy,
    migrated: 0,
    skipped: 0,
    skippedMissingUser: 0,
    skippedMissingParent: 0,
    skippedMissingFile: 0,
  };
}

function logInfo(message) {
  console.log(message);
}

function logWarn(message) {
  console.warn(message);
}

function logSummary(stats) {
  console.log(
    `[summary] ${stats.label}: total_legado=${stats.totalLegacy} migrados=${stats.migrated} ignorados=${stats.skipped}`,
  );
}

async function upsertBatch(tableName, rows, onConflict = 'id') {
  if (!rows.length) {
    return;
  }

  const admin = getSupabaseAdmin();

  for (const chunk of chunkArray(rows, 100)) {
    const { error } = await admin
      .from(tableName)
      .upsert(chunk, { onConflict });

    if (error) {
      throw error;
    }
  }
}

async function loadAuthUsersByEmail() {
  const admin = getSupabaseAdmin();
  const authUsersByEmail = new Map();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw error;
    }

    const users = data?.users || [];
    users.forEach((user) => {
      const normalizedEmail = normalizeEmail(user.email);
      if (normalizedEmail) {
        authUsersByEmail.set(normalizedEmail, user);
      }
    });

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  return authUsersByEmail;
}

async function migrateUsers(legacyUsers) {
  const admin = getSupabaseAdmin();
  const authUsersByEmail = await loadAuthUsersByEmail();
  const userIdMap = new Map();
  const stats = createStats('users', legacyUsers.length);
  const publicUserRows = [];

  for (const legacyUser of legacyUsers) {
    const email = normalizeEmail(legacyUser.email);

    if (!email) {
      stats.skipped += 1;
      logWarn(`[users] ignorado legacy_id=${legacyUser.id} motivo=email_invalido`);
      continue;
    }

    let authUser = authUsersByEmail.get(email);

    if (!authUser) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password_hash: legacyUser.password_hash,
        email_confirm: true,
        user_metadata: {
          name: legacyUser.name,
        },
      });

      if (error || !data?.user?.id) {
        throw error || new Error(`Nao foi possivel migrar o usuario ${email}`);
      }

      authUser = data.user;
      authUsersByEmail.set(email, authUser);
      logInfo(`[users] criado auth email=${email} supabase_id=${authUser.id}`);
    } else {
      logInfo(`[users] reutilizado auth email=${email} supabase_id=${authUser.id}`);
    }

    userIdMap.set(legacyUser.id, authUser.id);
    publicUserRows.push({
      id: authUser.id,
      name: legacyUser.name,
      email,
      avatar_color: legacyUser.avatar_color || '#6C5CE7',
      theme: legacyUser.theme || 'light',
      preferences: legacyUser.preferences || '{}',
      created_at: toTimestamp(legacyUser.created_at),
      updated_at: toTimestamp(legacyUser.updated_at),
      deleted_at: null,
    });
    stats.migrated += 1;
  }

  await upsertBatch('users', publicUserRows);
  logSummary(stats);

  return { userIdMap, stats };
}

async function migrateSubjects(legacySubjects, userIdMap) {
  const subjectIdMap = new Map();
  const rows = [];
  const stats = createStats('subjects', legacySubjects.length);

  for (const legacySubject of legacySubjects) {
    const mappedUserId = userIdMap.get(legacySubject.user_id);

    if (!mappedUserId) {
      stats.skipped += 1;
      stats.skippedMissingUser += 1;
      logWarn(
        `[subjects] ignorado legacy_id=${legacySubject.id} motivo=user_ausente legacy_user_id=${legacySubject.user_id}`,
      );
      continue;
    }

    const supabaseSubjectId = buildMappedId('subjects', legacySubject.id);
    subjectIdMap.set(legacySubject.id, supabaseSubjectId);
    rows.push({
      id: supabaseSubjectId,
      user_id: mappedUserId,
      name: legacySubject.name,
      color: legacySubject.color || '#6C5CE7',
      icon: legacySubject.icon || 'C',
      order_index: Number(legacySubject.order_index || 0),
      is_archived: toBoolean(legacySubject.is_archived),
      created_at: toTimestamp(legacySubject.created_at),
      updated_at: toTimestamp(legacySubject.updated_at),
      deleted_at: null,
    });
    stats.migrated += 1;
    logInfo(
      `[subjects] sincronizado legacy_id=${legacySubject.id} supabase_id=${supabaseSubjectId} nome="${legacySubject.name}"`,
    );
  }

  await upsertBatch('subjects', rows);
  logSummary(stats);

  return { subjectIdMap, stats };
}

function detectOrphanNotebooks(legacyNotebooks, legacySubjectIds) {
  return legacyNotebooks.filter((legacyNotebook) => !legacySubjectIds.has(legacyNotebook.subject_id));
}

async function migrateNotebooks(legacyNotebooks, userIdMap, subjectIdMap) {
  const notebookIdMap = new Map();
  const rows = [];
  const stats = createStats('notebooks', legacyNotebooks.length);

  for (const legacyNotebook of legacyNotebooks) {
    const mappedUserId = userIdMap.get(legacyNotebook.user_id);

    if (!mappedUserId) {
      stats.skipped += 1;
      stats.skippedMissingUser += 1;
      logWarn(
        `[notebooks] ignorado legacy_id=${legacyNotebook.id} motivo=user_ausente legacy_user_id=${legacyNotebook.user_id}`,
      );
      continue;
    }

    const mappedSubjectId = subjectIdMap.get(legacyNotebook.subject_id);

    if (!mappedSubjectId) {
      stats.skipped += 1;
      stats.skippedMissingParent += 1;
      logWarn(
        `[notebooks] ignorado legacy_id=${legacyNotebook.id} motivo=subject_orfao legacy_subject_id=${legacyNotebook.subject_id} nome="${legacyNotebook.name}"`,
      );
      continue;
    }

    const supabaseNotebookId = buildMappedId('notebooks', legacyNotebook.id);
    notebookIdMap.set(legacyNotebook.id, supabaseNotebookId);
    rows.push({
      id: supabaseNotebookId,
      subject_id: mappedSubjectId,
      user_id: mappedUserId,
      name: legacyNotebook.name,
      color: legacyNotebook.color || '#00B894',
      order_index: Number(legacyNotebook.order_index || 0),
      is_archived: toBoolean(legacyNotebook.is_archived),
      page_theme: legacyNotebook.page_theme || 'blank',
      is_pinned: toBoolean(legacyNotebook.is_pinned),
      created_at: toTimestamp(legacyNotebook.created_at),
      updated_at: toTimestamp(legacyNotebook.updated_at),
      deleted_at: null,
    });
    stats.migrated += 1;
  }

  await upsertBatch('notebooks', rows);
  logSummary(stats);

  return { notebookIdMap, stats };
}

async function migrateSections(legacySections, userIdMap, notebookIdMap) {
  const sectionIdMap = new Map();
  const rows = [];
  const stats = createStats('sections', legacySections.length);

  for (const legacySection of legacySections) {
    const mappedUserId = userIdMap.get(legacySection.user_id);
    const mappedNotebookId = notebookIdMap.get(legacySection.notebook_id);

    if (!mappedUserId) {
      stats.skipped += 1;
      stats.skippedMissingUser += 1;
      logWarn(
        `[sections] ignorado legacy_id=${legacySection.id} motivo=user_ausente legacy_user_id=${legacySection.user_id}`,
      );
      continue;
    }

    if (!mappedNotebookId) {
      stats.skipped += 1;
      stats.skippedMissingParent += 1;
      logWarn(
        `[sections] ignorado legacy_id=${legacySection.id} motivo=notebook_orfao legacy_notebook_id=${legacySection.notebook_id} nome="${legacySection.name}"`,
      );
      continue;
    }

    const supabaseSectionId = buildMappedId('sections', legacySection.id);
    sectionIdMap.set(legacySection.id, supabaseSectionId);
    rows.push({
      id: supabaseSectionId,
      notebook_id: mappedNotebookId,
      user_id: mappedUserId,
      name: legacySection.name,
      order_index: Number(legacySection.order_index || 0),
      is_archived: toBoolean(legacySection.is_archived),
      created_at: toTimestamp(legacySection.created_at),
      updated_at: toTimestamp(legacySection.updated_at),
      deleted_at: null,
    });
    stats.migrated += 1;
  }

  await upsertBatch('sections', rows);
  logSummary(stats);

  return { sectionIdMap, stats };
}

async function migratePages(legacyPages, userIdMap, sectionIdMap) {
  const pageIdMap = new Map();
  const rows = [];
  const stats = createStats('pages', legacyPages.length);

  for (const legacyPage of legacyPages) {
    const mappedUserId = userIdMap.get(legacyPage.user_id);
    const mappedSectionId = sectionIdMap.get(legacyPage.section_id);

    if (!mappedUserId) {
      stats.skipped += 1;
      stats.skippedMissingUser += 1;
      logWarn(
        `[pages] ignorado legacy_id=${legacyPage.id} motivo=user_ausente legacy_user_id=${legacyPage.user_id}`,
      );
      continue;
    }

    if (!mappedSectionId) {
      stats.skipped += 1;
      stats.skippedMissingParent += 1;
      logWarn(
        `[pages] ignorado legacy_id=${legacyPage.id} motivo=section_orfao legacy_section_id=${legacyPage.section_id} titulo="${legacyPage.title}"`,
      );
      continue;
    }

    const supabasePageId = buildMappedId('pages', legacyPage.id);
    pageIdMap.set(legacyPage.id, supabasePageId);
    rows.push({
      id: supabasePageId,
      section_id: mappedSectionId,
      user_id: mappedUserId,
      title: legacyPage.title || 'Sem titulo',
      content: legacyPage.content || '{"type":"doc","content":[{"type":"paragraph"}]}',
      page_theme: legacyPage.page_theme || 'blank',
      page_settings: legacyPage.page_settings || '{}',
      is_favorite: toBoolean(legacyPage.is_favorite),
      is_pinned: toBoolean(legacyPage.is_pinned),
      is_archived: toBoolean(legacyPage.is_archived),
      is_deleted: toBoolean(legacyPage.is_deleted),
      tags: legacyPage.tags || '[]',
      order_index: Number(legacyPage.order_index || 0),
      word_count: Number(legacyPage.word_count || 0),
      created_at: toTimestamp(legacyPage.created_at),
      updated_at: toTimestamp(legacyPage.updated_at),
      deleted_at: toTimestamp(legacyPage.deleted_at),
    });
    stats.migrated += 1;
  }

  await upsertBatch('pages', rows);
  logSummary(stats);

  return { pageIdMap, stats };
}

async function migratePageHistory(legacyPageHistory, userIdMap, pageIdMap) {
  const rows = [];
  const stats = createStats('page_history', legacyPageHistory.length);

  for (const legacyEntry of legacyPageHistory) {
    const mappedUserId = userIdMap.get(legacyEntry.user_id);
    const mappedPageId = pageIdMap.get(legacyEntry.page_id);

    if (!mappedUserId) {
      stats.skipped += 1;
      stats.skippedMissingUser += 1;
      logWarn(
        `[page_history] ignorado legacy_id=${legacyEntry.id} motivo=user_ausente legacy_user_id=${legacyEntry.user_id}`,
      );
      continue;
    }

    if (!mappedPageId) {
      stats.skipped += 1;
      stats.skippedMissingParent += 1;
      logWarn(
        `[page_history] ignorado legacy_id=${legacyEntry.id} motivo=page_orfao legacy_page_id=${legacyEntry.page_id}`,
      );
      continue;
    }

    rows.push({
      id: buildMappedId('page_history', legacyEntry.id),
      page_id: mappedPageId,
      user_id: mappedUserId,
      title: legacyEntry.title,
      content: legacyEntry.content,
      word_count: Number(legacyEntry.word_count || 0),
      saved_at: toTimestamp(legacyEntry.saved_at),
      created_at: toTimestamp(legacyEntry.saved_at),
      updated_at: toTimestamp(legacyEntry.saved_at),
      deleted_at: null,
    });
    stats.migrated += 1;
  }

  await upsertBatch('page_history', rows);
  logSummary(stats);

  return { stats };
}

function sanitizeFilename(filename) {
  return String(filename || 'arquivo')
    .normalize('NFKD')
    .replace(/[^\w.\-() ]+/g, '')
    .replace(/\s+/g, '-')
    .slice(-120) || 'arquivo';
}

async function migrateAttachments(legacyAttachments, userIdMap, pageIdMap) {
  const admin = getSupabaseAdmin();
  const rows = [];
  const stats = createStats('attachments', legacyAttachments.length);

  for (const legacyAttachment of legacyAttachments) {
    const mappedUserId = userIdMap.get(legacyAttachment.user_id);
    const mappedPageId = pageIdMap.get(legacyAttachment.page_id);

    if (!mappedUserId) {
      stats.skipped += 1;
      stats.skippedMissingUser += 1;
      logWarn(
        `[attachments] ignorado legacy_id=${legacyAttachment.id} motivo=user_ausente legacy_user_id=${legacyAttachment.user_id}`,
      );
      continue;
    }

    if (!mappedPageId) {
      stats.skipped += 1;
      stats.skippedMissingParent += 1;
      logWarn(
        `[attachments] ignorado legacy_id=${legacyAttachment.id} motivo=page_orfao legacy_page_id=${legacyAttachment.page_id}`,
      );
      continue;
    }

    const localFilePath = path.join(LEGACY_UPLOADS_DIR, legacyAttachment.filename);

    if (!fs.existsSync(localFilePath)) {
      stats.skipped += 1;
      stats.skippedMissingFile += 1;
      logWarn(
        `[attachments] ignorado legacy_id=${legacyAttachment.id} motivo=arquivo_ausente caminho="${localFilePath}"`,
      );
      continue;
    }

    const attachmentId = buildMappedId('attachments', legacyAttachment.id);
    const extension = path.extname(legacyAttachment.original_name || legacyAttachment.filename || '');
    const storagePath = `${mappedUserId}/${attachmentId}-${sanitizeFilename(
      legacyAttachment.original_name || legacyAttachment.filename || `arquivo${extension}`,
    )}`;
    const fileBuffer = fs.readFileSync(localFilePath);
    const { error: uploadError } = await admin.storage.from(STORAGE_BUCKET).upload(storagePath, fileBuffer, {
      contentType: legacyAttachment.mime_type,
      upsert: true,
    });

    if (uploadError) {
      throw uploadError;
    }

    rows.push({
      id: attachmentId,
      page_id: mappedPageId,
      user_id: mappedUserId,
      filename: storagePath,
      original_name: legacyAttachment.original_name,
      mime_type: legacyAttachment.mime_type,
      size: Number(legacyAttachment.size || 0),
      created_at: toTimestamp(legacyAttachment.created_at),
      updated_at: toTimestamp(legacyAttachment.created_at),
      deleted_at: null,
    });
    stats.migrated += 1;
  }

  await upsertBatch('attachments', rows);
  logSummary(stats);

  return { stats };
}

async function migrateStudySessions(legacyStudySessions, userIdMap, pageIdMap) {
  const rows = [];
  const stats = createStats('study_sessions', legacyStudySessions.length);

  for (const legacySession of legacyStudySessions) {
    const mappedUserId = userIdMap.get(legacySession.user_id);

    if (!mappedUserId) {
      stats.skipped += 1;
      stats.skippedMissingUser += 1;
      logWarn(
        `[study_sessions] ignorado legacy_id=${legacySession.id} motivo=user_ausente legacy_user_id=${legacySession.user_id}`,
      );
      continue;
    }

    const mappedPageId = legacySession.page_id ? pageIdMap.get(legacySession.page_id) : null;

    if (legacySession.page_id && !mappedPageId) {
      logWarn(
        `[study_sessions] legacy_id=${legacySession.id} com page_id orfao legacy_page_id=${legacySession.page_id}; page_id sera gravado como null`,
      );
    }

    rows.push({
      id: buildMappedId('study_sessions', legacySession.id),
      user_id: mappedUserId,
      page_id: mappedPageId || null,
      started_at: toTimestamp(legacySession.started_at),
      ended_at: toTimestamp(legacySession.ended_at),
      duration_seconds: Number(legacySession.duration_seconds || 0),
      created_at: toTimestamp(legacySession.started_at),
      updated_at: toTimestamp(legacySession.ended_at || legacySession.started_at),
      deleted_at: null,
    });
    stats.migrated += 1;
  }

  await upsertBatch('study_sessions', rows);
  logSummary(stats);

  return { stats };
}

async function migrateDailyStats(legacyDailyStats, userIdMap) {
  const rows = [];
  const stats = createStats('daily_stats', legacyDailyStats.length);

  for (const legacyStat of legacyDailyStats) {
    const mappedUserId = userIdMap.get(legacyStat.user_id);

    if (!mappedUserId) {
      stats.skipped += 1;
      stats.skippedMissingUser += 1;
      logWarn(
        `[daily_stats] ignorado legacy_id=${legacyStat.id} motivo=user_ausente legacy_user_id=${legacyStat.user_id}`,
      );
      continue;
    }

    rows.push({
      id: buildMappedId('daily_stats', legacyStat.id || `${legacyStat.user_id}:${legacyStat.date}`),
      user_id: mappedUserId,
      date: legacyStat.date,
      pages_created: Number(legacyStat.pages_created || 0),
      pages_edited: Number(legacyStat.pages_edited || 0),
      words_written: Number(legacyStat.words_written || 0),
      study_seconds: Number(legacyStat.study_seconds || 0),
      created_at: toTimestamp(legacyStat.date),
      updated_at: toTimestamp(legacyStat.date),
      deleted_at: null,
    });
    stats.migrated += 1;
  }

  await upsertBatch('daily_stats', rows, 'user_id,date');
  logSummary(stats);

  return { stats };
}

function logOrphanNotebookReport(orphanNotebooks) {
  if (!orphanNotebooks.length) {
    logInfo('[analysis] Nenhum notebook orfao encontrado no banco legado.');
    return;
  }

  logWarn(`[analysis] Notebooks orfaos detectados: ${orphanNotebooks.length}`);

  const missingSubjectIds = [...new Set(orphanNotebooks.map((notebook) => notebook.subject_id))];
  missingSubjectIds.forEach((subjectId) => {
    logWarn(`[analysis] subject faltante no legado: legacy_subject_id=${subjectId}`);
  });

  orphanNotebooks.forEach((notebook) => {
    logWarn(
      `[analysis] notebook orfao legacy_notebook_id=${notebook.id} legacy_subject_id=${notebook.subject_id} nome="${notebook.name}"`,
    );
  });
}

function logFinalSummary(summaries) {
  console.log('\nResumo final da migracao:');
  summaries.forEach((stats) => {
    console.log(
      `- ${stats.label}: migrados=${stats.migrated} ignorados=${stats.skipped} total_legado=${stats.totalLegacy}`,
    );
  });
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

  const legacySubjectIds = new Set(legacySubjects.map((row) => row.id));
  const orphanNotebooks = detectOrphanNotebooks(legacyNotebooks, legacySubjectIds);

  console.log(`Usuarios legados encontrados: ${legacyUsers.length}`);
  console.log(`Subjects legados encontrados: ${legacySubjects.length}`);
  console.log(`Notebooks legados encontrados: ${legacyNotebooks.length}`);
  logOrphanNotebookReport(orphanNotebooks);

  const { userIdMap, stats: userStats } = await migrateUsers(legacyUsers);
  const { subjectIdMap, stats: subjectStats } = await migrateSubjects(legacySubjects, userIdMap);
  const { notebookIdMap, stats: notebookStats } = await migrateNotebooks(legacyNotebooks, userIdMap, subjectIdMap);
  const { sectionIdMap, stats: sectionStats } = await migrateSections(legacySections, userIdMap, notebookIdMap);
  const { pageIdMap, stats: pageStats } = await migratePages(legacyPages, userIdMap, sectionIdMap);
  const { stats: pageHistoryStats } = await migratePageHistory(legacyPageHistory, userIdMap, pageIdMap);
  const { stats: attachmentStats } = await migrateAttachments(legacyAttachments, userIdMap, pageIdMap);
  const { stats: studySessionStats } = await migrateStudySessions(legacyStudySessions, userIdMap, pageIdMap);
  const { stats: dailyStats } = await migrateDailyStats(legacyDailyStats, userIdMap);

  logFinalSummary([
    userStats,
    subjectStats,
    notebookStats,
    sectionStats,
    pageStats,
    pageHistoryStats,
    attachmentStats,
    studySessionStats,
    dailyStats,
  ]);

  console.log('\nMigracao concluida com sucesso.');
}

main().catch((error) => {
  console.error('\nFalha na migracao:', error);
  process.exit(1);
});
