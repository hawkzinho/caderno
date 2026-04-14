# Migracao Para Supabase E Deploy No Railway

## 1. O que mudou no projeto

- O backend deixou de depender de `sql.js` em memoria para persistencia principal.
- As rotas existentes foram preservadas: `/api/auth`, `/api/subjects`, `/api/notebooks`, `/api/sections`, `/api/pages`, `/api/attachments`, `/api/stats`.
- O frontend nao teve mudanca visual nem de UX. Ele continua consumindo a mesma API.
- A autenticacao agora usa Supabase Auth por tras, mas o contrato continua igual:
  - `POST /api/auth/register` retorna `token` e `user`
  - `POST /api/auth/login` retorna `token` e `user`
  - `GET /api/auth/me` continua validando sessao pelo `Bearer token`
- O editor continua salvando por autosave, mantendo historico, favoritos, lixeira e estatisticas.
- Uploads deixam de depender do disco local do Railway e passam a usar Supabase Storage.

## 2. Mapeamento do modelo atual

Observacao importante para compatibilidade:

- `public.subjects` no banco representa os "cadernos" exibidos no frontend.
- `public.notebooks` no banco representa as "materias" exibidas no frontend.

Isso foi mantido de proposito para nao quebrar a estrutura atual do app.

## 3. Arquivos principais desta migracao

- SQL completo do Supabase: [server/db/supabase-schema.sql](/Users/athos/OneDrive/Área%20de%20Trabalho/caderno/server/db/supabase-schema.sql)
- Script para migrar o `caderno.db` legado: [server/scripts/migrate-sqljs-to-supabase.js](/Users/athos/OneDrive/Área%20de%20Trabalho/caderno/server/scripts/migrate-sqljs-to-supabase.js)
- Exemplo de ambiente do backend: [server/.env.example](/Users/athos/OneDrive/Área%20de%20Trabalho/caderno/server/.env.example)
- Exemplo de ambiente do frontend: [client/.env.example](/Users/athos/OneDrive/Área%20de%20Trabalho/caderno/client/.env.example)

## 4. Variaveis de ambiente

Backend:

```env
PORT=3001
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_STORAGE_BUCKET=attachments
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,https://your-app.up.railway.app
MAX_FILE_SIZE=10485760
LEGACY_SQLJS_DB_PATH=./caderno.db
LEGACY_UPLOADS_DIR=./uploads
```

Frontend:

```env
VITE_API_BASE=/api
```

O que cada chave faz:

- `SUPABASE_URL`
  - URL base do projeto Supabase.
  - Fica em `Project Settings > API > Project URL`.

- `SUPABASE_ANON_KEY`
  - Chave publica usada para operacoes autenticadas normais do Supabase Auth.
  - Fica em `Project Settings > API > Project API keys`.
  - Pode ser exposta apenas quando o frontend fala direto com o Supabase.
  - Neste projeto atual, o frontend nao precisa dela porque tudo passa pelo backend.

- `SUPABASE_SERVICE_ROLE_KEY`
  - Chave administrativa.
  - Fica em `Project Settings > API > Project API keys`.
  - Usa bypass de RLS.
  - Deve ficar apenas no backend e nunca no frontend.

- `SUPABASE_STORAGE_BUCKET`
  - Nome do bucket privado para anexos.
  - O schema SQL ja cria `attachments` por padrao.

- `CORS_ORIGINS`
  - Lista de origens permitidas, separadas por virgula.
  - Em dev, mantenha localhost.
  - Em producao, inclua a URL publica do Railway.

## 5. Decisao de autenticacao

### Opcao A: manter JWT proprio

Vantagens:

- Menor acoplamento com o provedor.
- Facil reaproveitar exatamente o fluxo atual.
- Migracao mais simples para projetos sem usuarios existentes ou sem necessidade de recursos do Supabase Auth.

Desvantagens:

- Mais codigo de seguranca para manter manualmente.
- Controle de sessao, expiracao e auditoria ficam totalmente por sua conta.
- Nao aproveita a infraestrutura nativa do Supabase Auth.

### Opcao B: usar Supabase Auth

Vantagens:

- Sessao persistente e validacao de token padronizadas.
- Integracao natural com RLS.
- Melhor base para crescer depois com reset de senha, provedores externos e gestao centralizada de usuarios.

Desvantagens:

- Exige adaptar o backend para usar o token do Supabase.
- Migracao de usuarios legados precisa de script.

### Escolha adotada neste projeto

Foi escolhida a Opcao B, Supabase Auth.

Motivo:

- Ela entrega seguranca e escalabilidade melhores sem mudar a UX.
- O frontend continua exatamente com o mesmo fluxo visual.
- O backend preserva o mesmo contrato de API.
- O script legado permite migrar os usuarios existentes para o Auth do Supabase.

## 6. Passo a passo: criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com/) e crie a conta.
2. Clique em `New project`.
3. Escolha a organizacao, nome do projeto e senha do banco.
4. Aguarde o provisionamento terminar.
5. Abra `SQL Editor`.
6. Abra o arquivo [server/db/supabase-schema.sql](/Users/athos/OneDrive/Área%20de%20Trabalho/caderno/server/db/supabase-schema.sql).
7. Copie todo o SQL e execute no editor do Supabase.
8. Acesse `Project Settings > API`.
9. Copie:
   - `Project URL`
   - `anon public key`
   - `service_role secret`
10. Acesse `Authentication > Users` apenas para conferir depois da migracao.
11. Acesse `Storage` e confirme que o bucket `attachments` foi criado.

## 7. Passo a passo: configurar o projeto local

1. Na raiz do projeto, rode:

```bash
npm install
```

2. Crie o arquivo `server/.env` usando [server/.env.example](/Users/athos/OneDrive/Área%20de%20Trabalho/caderno/server/.env.example).
3. Crie o arquivo `client/.env` usando [client/.env.example](/Users/athos/OneDrive/Área%20de%20Trabalho/caderno/client/.env.example).
4. Preencha o backend com `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`.
5. Em desenvolvimento, mantenha:

```env
VITE_API_BASE=http://localhost:3001/api
```

6. Em producao, pode voltar para:

```env
VITE_API_BASE=/api
```

## 8. Passo a passo: migrar os dados do banco legado

Se voce quiser levar os dados atuais do `server/caderno.db` para o Supabase:

1. Garanta que o SQL do Supabase ja foi executado.
2. Garanta que `server/.env` esta preenchido.
3. Rode:

```bash
npm run migrate:legacy
```

O script faz:

- leitura do `server/caderno.db`
- criacao de usuarios no Supabase Auth
- copia da tabela `users` para `public.users`
- migracao de `subjects`, `notebooks`, `sections`, `pages`, `page_history`, `study_sessions`, `daily_stats`
- envio dos anexos locais para o bucket `attachments`

## 9. Passo a passo: rodar localmente

1. Suba o backend:

```bash
npm run dev:server
```

2. Em outro terminal, suba o frontend:

```bash
npm run dev:client
```

3. Abra `http://localhost:5173`.
4. Crie uma conta nova ou use um usuario migrado.
5. Valide:
   - login
   - criacao de caderno
   - criacao de materia
   - criacao de pagina
   - autosave
   - reabertura da pagina com conteudo persistido

## 10. Passo a passo: preparar para deploy

O projeto foi preparado para deploy unico, com backend servindo o build do frontend.

Scripts de root:

```bash
npm run build
npm start
```

O que isso faz:

- `npm run build`
  - executa o build do Vite no `client`
- `npm start`
  - sobe o `server`
  - o `server` serve `client/dist`

`PORT`:

- O backend ja usa `process.env.PORT`.
- Isso e obrigatorio para Railway.

## 11. Passo a passo: GitHub

1. Crie um repositorio novo no GitHub.
2. Na raiz do projeto:

```bash
git init
git add .
git commit -m "feat: migrate app to supabase and railway-ready deploy"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
git push -u origin main
```

3. Confirme que:
   - `server/.env` nao foi enviado
   - `client/.env` nao foi enviado
   - `node_modules` nao foi enviado

## 12. Passo a passo: Railway

1. Acesse [railway.app](https://railway.app/).
2. Clique em `New Project`.
3. Escolha `Deploy from GitHub repo`.
4. Selecione este repositorio.
5. Aguarde o Railway detectar o projeto Node.
6. Em `Variables`, adicione:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_STORAGE_BUCKET=attachments`
   - `CORS_ORIGINS=https://SUA-URL-DO-RAILWAY`
7. Em `Settings`, confirme:
   - Build Command: `npm run build`
   - Start Command: `npm start`
8. Faça o primeiro deploy.
9. Depois do deploy, abra a URL publica e teste o app.

## 13. Checklist de validacao

- O schema do Supabase foi executado sem erro.
- O bucket `attachments` existe.
- As policies de RLS ficaram ativas.
- `server/.env` esta preenchido.
- `client/.env` esta preenchido.
- `npm run build` gera `client/dist`.
- `npm start` sobe o backend.
- `GET /api/health` responde com `provider: supabase`.
- Login funciona.
- Cadastro funciona.
- Sessao persiste ao recarregar a pagina.
- O usuario so ve os dados do proprio workspace.
- O autosave continua funcionando.
- O editor recarrega o conteudo salvo.
- Cadernos, materias e paginas continuam sendo criados e listados.

## 14. Pontos de atencao

- `SUPABASE_SERVICE_ROLE_KEY` nunca deve ir para o frontend.
- Mesmo com RLS ativa, este backend usa `service_role` no servidor. Por isso o filtro por `req.userId` foi mantido em todas as rotas.
- Se voce for acessar o Supabase direto do browser no futuro, use apenas `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
- O projeto preserva a nomenclatura atual para compatibilidade:
  - tabela `subjects` = cadernos
  - tabela `notebooks` = materias
- Os anexos agora dependem do bucket `attachments`. Se o bucket nao existir, upload falha.
- Se quiser separar frontend e backend em dominios diferentes, atualize `CORS_ORIGINS`.
