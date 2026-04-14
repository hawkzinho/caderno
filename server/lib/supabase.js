const { createClient } = require('@supabase/supabase-js');

const clientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
};

let adminClient = null;
let authClient = null;

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function assertSupabaseConfig() {
  getRequiredEnv('SUPABASE_URL');
  getRequiredEnv('SUPABASE_ANON_KEY');
  getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
}

function getSupabaseAdmin() {
  if (!adminClient) {
    adminClient = createClient(
      getRequiredEnv('SUPABASE_URL'),
      getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      clientOptions,
    );
  }

  return adminClient;
}

function getSupabaseAuth() {
  if (!authClient) {
    authClient = createClient(
      getRequiredEnv('SUPABASE_URL'),
      getRequiredEnv('SUPABASE_ANON_KEY'),
      clientOptions,
    );
  }

  return authClient;
}

function createUserClient(accessToken) {
  return createClient(
    getRequiredEnv('SUPABASE_URL'),
    getRequiredEnv('SUPABASE_ANON_KEY'),
    {
      ...clientOptions,
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    },
  );
}

module.exports = {
  assertSupabaseConfig,
  getSupabaseAdmin,
  getSupabaseAuth,
  createUserClient,
};
