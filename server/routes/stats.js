const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  countRows,
  fetchMany,
  fetchOne,
  insertOne,
  updateOne,
} = require('../lib/supabase-db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

async function upsertStudySeconds(userId, date, studySeconds) {
  const existing = await fetchOne('daily_stats', { user_id: userId, date });

  if (!existing) {
    await insertOne('daily_stats', {
      id: uuidv4(),
      user_id: userId,
      date,
      study_seconds: studySeconds,
    });
    return;
  }

  await updateOne('daily_stats', { id: existing.id }, {
    study_seconds: Number(existing.study_seconds || 0) + Number(studySeconds || 0),
  });
}

router.get('/dashboard', async (req, res) => {
  try {
    const [totalPages, totalSubjects, favoriteCount, pages, stats] = await Promise.all([
      countRows('pages', { user_id: req.userId, is_deleted: false, deleted_at: null }),
      countRows('subjects', { user_id: req.userId, is_archived: false, deleted_at: null }),
      countRows('pages', { user_id: req.userId, is_favorite: true, is_deleted: false, deleted_at: null }),
      fetchMany('pages', {
        filters: {
          user_id: req.userId,
          is_deleted: false,
          deleted_at: null,
        },
        select: 'word_count',
      }),
      fetchMany('daily_stats', {
        filters: { user_id: req.userId },
        select: 'date, pages_created, pages_edited, words_written, study_seconds',
        orderBy: 'date',
        ascending: false,
        limit: 365,
      }),
    ]);

    const totalWords = pages.reduce((sum, page) => sum + Number(page.word_count || 0), 0);

    let streak = 0;
    const dates = stats
      .filter((entry) => Number(entry.pages_created || 0) > 0 || Number(entry.pages_edited || 0) > 0 || Number(entry.study_seconds || 0) > 0)
      .map((entry) => entry.date);
    let checkDate = new Date();

    for (let index = 0; index < 365; index += 1) {
      const dateStr = checkDate.toISOString().split('T')[0];

      if (dates.includes(dateStr)) {
        streak += 1;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (index === 0) {
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekThreshold = weekAgo.toISOString().split('T')[0];
    const lastWeekStats = stats
      .filter((entry) => entry.date >= weekThreshold)
      .sort((left, right) => left.date.localeCompare(right.date));

    const weekly = lastWeekStats.reduce((totals, entry) => ({
      pages_created: totals.pages_created + Number(entry.pages_created || 0),
      pages_edited: totals.pages_edited + Number(entry.pages_edited || 0),
      words_written: totals.words_written + Number(entry.words_written || 0),
      study_seconds: totals.study_seconds + Number(entry.study_seconds || 0),
    }), {
      pages_created: 0,
      pages_edited: 0,
      words_written: 0,
      study_seconds: 0,
    });

    res.json({
      totalPages,
      totalSubjects,
      totalWords,
      totalFavorites: favoriteCount,
      streak,
      weekly,
      dailyBreakdown: lastWeekStats,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Erro ao buscar estatisticas' });
  }
});

router.post('/session/start', async (req, res) => {
  try {
    const { page_id: pageId } = req.body;
    const openSessions = await fetchMany('study_sessions', {
      filters: {
        user_id: req.userId,
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

    const sessionId = uuidv4();
    await insertOne('study_sessions', {
      id: sessionId,
      user_id: req.userId,
      page_id: pageId || null,
    });

    res.status(201).json({ sessionId });
  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({ error: 'Erro ao iniciar sessao' });
  }
});

router.post('/session/end', async (req, res) => {
  try {
    const sessions = await fetchMany('study_sessions', {
      filters: {
        user_id: req.userId,
        ended_at: null,
      },
      orderBy: 'started_at',
      ascending: false,
      limit: 1,
    });

    const session = sessions[0];

    if (!session) {
      return res.json({ success: true, duration: 0 });
    }

    const duration = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000);

    await updateOne('study_sessions', { id: session.id }, {
      ended_at: new Date().toISOString(),
      duration_seconds: duration,
    });

    const today = new Date().toISOString().split('T')[0];
    await upsertStudySeconds(req.userId, today, duration);

    res.json({ success: true, duration });
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ error: 'Erro ao encerrar sessao' });
  }
});

module.exports = router;
