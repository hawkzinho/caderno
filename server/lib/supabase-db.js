const { getSupabaseAdmin } = require('./supabase');

function nowIso() {
  return new Date().toISOString();
}

function isNotFoundError(error) {
  return error?.code === 'PGRST116';
}

function applyFilters(query, filters = {}) {
  let currentQuery = query;

  Object.entries(filters).forEach(([column, value]) => {
    if (value === undefined) {
      return;
    }

    if (value === null) {
      currentQuery = currentQuery.is(column, null);
      return;
    }

    if (Array.isArray(value)) {
      currentQuery = currentQuery.in(column, value);
      return;
    }

    currentQuery = currentQuery.eq(column, value);
  });

  return currentQuery;
}

async function fetchSingle(query) {
  const { data, error } = await query.maybeSingle();

  if (error && !isNotFoundError(error)) {
    throw error;
  }

  return data || null;
}

async function fetchList(query) {
  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

async function fetchOne(table, filters = {}, select = '*') {
  const admin = getSupabaseAdmin();
  const query = applyFilters(admin.from(table).select(select), filters);
  return fetchSingle(query);
}

async function fetchMany(table, options = {}) {
  const {
    filters = {},
    select = '*',
    orderBy,
    ascending = true,
    limit,
  } = options;

  const admin = getSupabaseAdmin();
  let query = applyFilters(admin.from(table).select(select), filters);

  if (orderBy) {
    query = query.order(orderBy, { ascending });
  }

  if (limit) {
    query = query.limit(limit);
  }

  return fetchList(query);
}

async function insertOne(table, values, select = '*') {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from(table)
    .insert(values)
    .select(select)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function updateOne(table, filters, values, select = '*') {
  const admin = getSupabaseAdmin();
  const query = applyFilters(
    admin.from(table).update({ ...values, updated_at: nowIso() }).select(select),
    filters,
  );

  return fetchSingle(query);
}

async function updateMany(table, filters, values) {
  const admin = getSupabaseAdmin();
  const { error } = await applyFilters(
    admin.from(table).update({ ...values, updated_at: nowIso() }),
    filters,
  );

  if (error) {
    throw error;
  }
}

async function deleteMany(table, filters) {
  const admin = getSupabaseAdmin();
  const { error } = await applyFilters(admin.from(table).delete(), filters);

  if (error) {
    throw error;
  }
}

async function getMaxOrderIndex(table, filters = {}) {
  const rows = await fetchMany(table, {
    filters,
    select: 'order_index',
    orderBy: 'order_index',
    ascending: false,
    limit: 1,
  });

  return Number(rows[0]?.order_index || 0);
}

async function countRows(table, filters = {}) {
  const admin = getSupabaseAdmin();
  const { count, error } = await applyFilters(
    admin.from(table).select('*', { count: 'exact', head: true }),
    filters,
  );

  if (error) {
    throw error;
  }

  return count || 0;
}

module.exports = {
  applyFilters,
  countRows,
  deleteMany,
  fetchList,
  fetchMany,
  fetchOne,
  fetchSingle,
  getMaxOrderIndex,
  insertOne,
  nowIso,
  updateMany,
  updateOne,
};
