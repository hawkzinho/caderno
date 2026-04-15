import {
  fetchMany,
  fetchOne,
  insertOne,
  normalizeErrorMessage,
  requireUserId,
  todayKey,
  updateOne,
} from './supabase-data';

async function upsertDailyStats(userId, date, nextValues, increments = {}) {
  const existing = await fetchOne('daily_stats', { user_id: userId, date });

  if (!existing) {
    await insertOne('daily_stats', {
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

async function startSession(pageId) {
  try {
    const userId = await requireUserId();
    const openSessions = await fetchMany('study_sessions', {
      filters: {
        user_id: userId,
        ended_at: null,
      },
      select: 'id, started_at',
    });

    await Promise.all(openSessions.map((session) => {
      const duration = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000);
      return updateOne('study_sessions', { id: session.id }, {
        ended_at: new Date().toISOString(),
        duration_seconds: duration,
      });
    }));

    const session = await insertOne('study_sessions', {
      user_id: userId,
      page_id: pageId || null,
    });

    return { sessionId: session.id };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error, 'Erro ao iniciar sessao'));
  }
}

async function endSession() {
  try {
    const userId = await requireUserId();
    const sessions = await fetchMany('study_sessions', {
      filters: {
        user_id: userId,
        ended_at: null,
      },
      orderBy: 'started_at',
      ascending: false,
      limit: 1,
    });
    const session = sessions[0];

    if (!session) {
      return { success: true, duration: 0 };
    }

    const duration = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000);

    await updateOne('study_sessions', { id: session.id }, {
      ended_at: new Date().toISOString(),
      duration_seconds: duration,
    });
    await upsertDailyStats(userId, todayKey(), { study_seconds: duration }, { study_seconds: duration });

    return { success: true, duration };
  } catch (error) {
    throw new Error(normalizeErrorMessage(error, 'Erro ao encerrar sessao'));
  }
}

export {
  endSession,
  startSession,
  upsertDailyStats,
};
