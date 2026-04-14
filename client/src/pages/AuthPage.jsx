import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
    } catch (currentError) {
      setError(currentError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-background-grid" />

      <div className="auth-shell">
        <section className="auth-showcase">
          <div className="auth-showcase-topbar">
            <div className="auth-logo">
              <span className="auth-logo-mark">C</span>
              <div>
                <strong>Caderno</strong>
                <span>Workspace de estudo</span>
              </div>
            </div>
          </div>

          <div className="auth-showcase-body">
            <span className="auth-eyebrow">Fluxo claro de estudo</span>
            <h1>Escreva como em um editor real, sem ruido e sem hierarquia confusa.</h1>
            <p>
              Organize seus cadernos, materias e paginas em uma experiencia limpa, com documento claro,
              comandos rapidos e salvamento continuo.
            </p>

            <div className="auth-preview">
              <div className="auth-preview-toolbar">
                <span>Normal</span>
                <span>Inter</span>
                <span>16</span>
                <span>#111827</span>
              </div>

              <div className="auth-preview-sheet">
                <div className="auth-preview-title">Resumo de biologia</div>
                <div className="auth-preview-line">/ para abrir comandos</div>
                <div className="auth-preview-line">Checklist, codigo, tabela, desenho</div>
                <div className="auth-preview-line">Tudo alinhado como uma folha real</div>
              </div>
            </div>
          </div>
        </section>

        <section className="auth-panel">
          <div className="auth-card">
            <div className="auth-card-header">
              <span className="auth-eyebrow">{mode === 'login' ? 'Entrar' : 'Criar conta'}</span>
              <h2>{mode === 'login' ? 'Acesse seu caderno digital' : 'Monte seu workspace de estudo'}</h2>
              <p>{mode === 'login' ? 'Retome seus documentos e preferencias em segundos.' : 'Comece com um ambiente limpo para escrever e estudar melhor.'}</p>
            </div>

            <div className="auth-switch">
              <button
                type="button"
                className={`auth-switch-button ${mode === 'login' ? 'active' : ''}`}
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
              >
                Entrar
              </button>
              <button
                type="button"
                className={`auth-switch-button ${mode === 'register' ? 'active' : ''}`}
                onClick={() => {
                  setMode('register');
                  setError('');
                }}
              >
                Cadastrar
              </button>
            </div>

            {error && <div className="form-error">{error}</div>}

            <form className="auth-form" onSubmit={handleSubmit}>
              {mode === 'register' && (
                <label className="form-field">
                  <span>Nome</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Como devemos te chamar?"
                    minLength={2}
                    required
                  />
                </label>
              )}

              <label className="form-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="voce@exemplo.com"
                  required
                />
              </label>

              <label className="form-field">
                <span>Senha</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimo de 6 caracteres"
                  minLength={6}
                  required
                />
              </label>

              <button type="submit" className="btn-primary auth-submit" disabled={loading}>
                {loading ? 'Processando...' : mode === 'login' ? 'Entrar no workspace' : 'Criar conta'}
              </button>
            </form>

            <div className="auth-footnote">
              Seus dados, preferencias visuais e estrutura do workspace ficam salvos na sua conta.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
