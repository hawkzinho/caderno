const { createUserClient, getSupabaseAuth } = require('../lib/supabase');

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticacao nao fornecido' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data, error } = await getSupabaseAuth().auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: 'Token invalido ou expirado' });
    }

    req.userId = data.user.id;
    req.authToken = token;
    req.authUser = data.user;
    req.supabase = createUserClient(token);

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalido ou expirado' });
  }
}

module.exports = { authenticate };
