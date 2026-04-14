# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: artifacts\tmp\block-flow.spec.js >> inserted blocks stay anchored in document flow
- Location: artifacts\tmp\block-flow.spec.js:40:1

# Error details

```
Test timeout of 240000ms exceeded.
```

```
Error: locator.click: Test timeout of 240000ms exceeded.
Call log:
  - waiting for locator('.collection-card').filter({ hasText: 'Pagina desenho' }).first()

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - button "Fechar lateral"
  - complementary [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]: C
        - generic [ref=e8]:
          - strong [ref=e9]: Caderno
          - text: Estudos organizados
      - button "Fechar lateral" [ref=e10] [cursor=pointer]:
        - img [ref=e11]
    - button "Novo caderno" [ref=e13] [cursor=pointer]:
      - img [ref=e14]
      - text: Novo caderno
    - generic [ref=e16]:
      - button "Cadernos" [ref=e17] [cursor=pointer]:
        - img [ref=e19]
        - strong [ref=e23]: Cadernos
      - button "Configuracoes" [ref=e24] [cursor=pointer]:
        - img [ref=e26]
        - strong [ref=e30]: Configuracoes
    - generic [ref=e31]:
      - generic [ref=e32]: Agora
      - button "Notebook Fluxo Caderno atual" [ref=e33] [cursor=pointer]:
        - img [ref=e35]
        - generic [ref=e37]:
          - strong [ref=e38]: Notebook Fluxo
          - generic [ref=e39]: Caderno atual
      - button "Materia Fluxo Materia atual" [ref=e40] [cursor=pointer]:
        - img [ref=e42]
        - generic [ref=e44]:
          - strong [ref=e45]: Materia Fluxo
          - generic [ref=e46]: Materia atual
      - generic [ref=e47]:
        - button "Nova materia" [ref=e48] [cursor=pointer]:
          - img [ref=e49]
          - text: Nova materia
        - button "Nova pagina" [ref=e51] [cursor=pointer]:
          - img [ref=e52]
          - text: Nova pagina
    - button "Q QA Flow qa-1775855313101@example.com" [ref=e55] [cursor=pointer]:
      - generic [ref=e56]: Q
      - generic [ref=e57]:
        - strong [ref=e58]: QA Flow
        - generic [ref=e59]: qa-1775855313101@example.com
  - main [ref=e60]:
    - generic [ref=e61]:
      - generic [ref=e62]:
        - generic [ref=e64]:
          - generic [ref=e65]: Materia
          - heading "Materia Fluxo" [level=1] [ref=e66]
        - generic [ref=e67]:
          - generic [ref=e68]:
            - img [ref=e69]
            - textbox "Buscar paginas" [ref=e72]
          - button "Nova pagina" [ref=e73] [cursor=pointer]
      - generic [ref=e74]:
        - generic [ref=e76]:
          - button "Cadernos" [ref=e77] [cursor=pointer]
          - button "Notebook Fluxo" [ref=e78] [cursor=pointer]
          - button "Materia Fluxo" [ref=e79] [cursor=pointer]
          - generic [ref=e80]: 4 paginas
        - generic [ref=e81]:
          - button "Nova pagina 0 palavras Agora mesmo" [ref=e82] [cursor=pointer]:
            - generic [ref=e83]:
              - img [ref=e85]
              - button "Excluir pagina" [ref=e90]:
                - img [ref=e91]
            - generic [ref=e93]:
              - strong [ref=e94]: Nova pagina
              - generic [ref=e95]: 0 palavras
            - generic [ref=e96]: Agora mesmo
          - button "Nova pagina 0 palavras Agora mesmo" [ref=e97] [cursor=pointer]:
            - generic [ref=e98]:
              - img [ref=e100]
              - button "Excluir pagina" [ref=e105]:
                - img [ref=e106]
            - generic [ref=e108]:
              - strong [ref=e109]: Nova pagina
              - generic [ref=e110]: 0 palavras
            - generic [ref=e111]: Agora mesmo
          - button "Nova pagina 0 palavras Agora mesmo" [ref=e112] [cursor=pointer]:
            - generic [ref=e113]:
              - img [ref=e115]
              - button "Excluir pagina" [ref=e120]:
                - img [ref=e121]
            - generic [ref=e123]:
              - strong [ref=e124]: Nova pagina
              - generic [ref=e125]: 0 palavras
            - generic [ref=e126]: Agora mesmo
          - button "Nova pagina 0 palavras Agora mesmo" [ref=e127] [cursor=pointer]:
            - generic [ref=e128]:
              - img [ref=e130]
              - button "Excluir pagina" [ref=e135]:
                - img [ref=e136]
            - generic [ref=e138]:
              - strong [ref=e139]: Nova pagina
              - generic [ref=e140]: 0 palavras
            - generic [ref=e141]: Agora mesmo
          - button "+ Nova pagina Adicionar pagina em Materia Fluxo." [ref=e142] [cursor=pointer]:
            - generic [ref=e143]: +
            - strong [ref=e144]: Nova pagina
            - generic [ref=e145]: Adicionar pagina em Materia Fluxo.
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const baseUrl = 'http://localhost:3001';
  4   | const uploadImage = 'artifacts/tmp/upload-image.png';
  5   | 
  6   | test.setTimeout(240000);
  7   | 
  8   | async function fillPrompt(page, value) {
  9   |   await expect(page.locator('.dialog')).toBeVisible();
  10  |   await page.locator('.dialog input').fill(value);
  11  |   await page.locator('.dialog .btn-primary').click();
  12  | }
  13  | 
  14  | async function openInsertAction(page, label) {
  15  |   await page.getByRole('button', { name: /^Inserir$/ }).click();
  16  |   await expect(page.locator('.insert-menu')).toBeVisible();
  17  |   await page.locator('.insert-menu-item').filter({ hasText: label }).first().click();
  18  | }
  19  | 
  20  | async function createPageFromSubject(page, title) {
  21  |   const createButton = page.locator('.workspace-main .btn-primary').filter({ hasText: 'Nova pagina' });
  22  |   await expect(createButton).toBeVisible();
  23  |   await createButton.click();
  24  |   await expect(page.locator('.editor-view')).toBeVisible();
  25  |   await page.locator('.document-title').fill(title);
  26  | }
  27  | 
  28  | async function openNotebook(page, notebookName) {
  29  |   await page.locator('.collection-card').filter({ hasText: notebookName }).first().click();
  30  | }
  31  | 
  32  | async function openSubject(page, subjectName) {
  33  |   await page.locator('.collection-card').filter({ hasText: subjectName }).first().click();
  34  | }
  35  | 
  36  | async function openPageCard(page, pageTitle) {
> 37  |   await page.locator('.collection-card').filter({ hasText: pageTitle }).first().click();
      |                                                                                 ^ Error: locator.click: Test timeout of 240000ms exceeded.
  38  | }
  39  | 
  40  | test('inserted blocks stay anchored in document flow', async ({ page }) => {
  41  |   const email = `qa-${Date.now()}@example.com`;
  42  |   const notebookName = 'Notebook Fluxo';
  43  |   const subjectName = 'Materia Fluxo';
  44  | 
  45  |   await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  46  |   await page.getByRole('button', { name: 'Cadastrar' }).click();
  47  |   await page.getByLabel('Nome').fill('QA Flow');
  48  |   await page.getByLabel('Email').fill(email);
  49  |   await page.getByLabel('Senha').fill('123456');
  50  |   await page.getByRole('button', { name: 'Criar conta' }).click();
  51  | 
  52  |   await page.locator('.workspace-main .btn-primary').filter({ hasText: 'Novo caderno' }).click();
  53  |   await fillPrompt(page, notebookName);
  54  |   await page.locator('.workspace-main .btn-primary').filter({ hasText: 'Nova materia' }).click();
  55  |   await fillPrompt(page, subjectName);
  56  | 
  57  |   await createPageFromSubject(page, 'Pagina desenho');
  58  |   await openInsertAction(page, 'Desenho');
  59  |   const sheet = page.locator('.document-sheet');
  60  |   const sheetBox = await sheet.boundingBox();
  61  |   if (!sheetBox) throw new Error('Folha sem bounding box');
  62  |   await page.mouse.move(sheetBox.x + 180, sheetBox.y + 280);
  63  |   await page.mouse.down();
  64  |   await page.mouse.move(sheetBox.x + 400, sheetBox.y + 400, { steps: 15 });
  65  |   await page.mouse.up();
  66  |   await expect(page.locator('.drawing-node')).toHaveCount(1);
  67  |   await page.keyboard.type('texto depois do desenho');
  68  |   await expect(page.getByText('texto depois do desenho')).toBeVisible();
  69  |   await expect(page.locator('.drawing-node')).toHaveCount(1);
  70  |   await page.locator('.workspace-topbar-title').getByRole('button', { name: subjectName }).click();
  71  | 
  72  |   await createPageFromSubject(page, 'Pagina imagem');
  73  |   await openInsertAction(page, 'Imagem');
  74  |   await page.locator('input[type="file"]').setInputFiles(uploadImage);
  75  |   await expect(page.locator('.image-node')).toHaveCount(1);
  76  |   await page.keyboard.type('texto depois da imagem');
  77  |   await expect(page.getByText('texto depois da imagem')).toBeVisible();
  78  |   await expect(page.locator('.image-node')).toHaveCount(1);
  79  |   await page.locator('.workspace-topbar-title').getByRole('button', { name: subjectName }).click();
  80  | 
  81  |   await createPageFromSubject(page, 'Pagina tabela');
  82  |   await openInsertAction(page, 'Tabela');
  83  |   await expect(page.locator('table')).toHaveCount(1);
  84  |   await page.keyboard.type('texto depois da tabela');
  85  |   await expect(page.getByText('texto depois da tabela')).toBeVisible();
  86  |   await expect(page.locator('table')).toHaveCount(1);
  87  |   await page.locator('.workspace-topbar-title').getByRole('button', { name: subjectName }).click();
  88  | 
  89  |   await createPageFromSubject(page, 'Pagina blocos');
  90  |   await openInsertAction(page, 'Divisor');
  91  |   await expect(page.locator('hr')).toHaveCount(1);
  92  |   await page.keyboard.type('texto depois do divisor');
  93  |   await expect(page.getByText('texto depois do divisor')).toBeVisible();
  94  |   await expect(page.locator('hr')).toHaveCount(1);
  95  | 
  96  |   await openInsertAction(page, 'Codigo');
  97  |   await expect(page.locator('pre')).toHaveCount(1);
  98  |   await page.keyboard.type('texto depois do codigo');
  99  |   await expect(page.getByText('texto depois do codigo')).toBeVisible();
  100 |   await expect(page.locator('pre')).toHaveCount(1);
  101 | 
  102 |   await openInsertAction(page, 'Checklist');
  103 |   await expect(page.locator("ul[data-type='taskList']")).toHaveCount(1);
  104 |   await page.keyboard.type('texto depois do checklist');
  105 |   await expect(page.getByText('texto depois do checklist')).toBeVisible();
  106 |   await expect(page.locator("ul[data-type='taskList']")).toHaveCount(1);
  107 | 
  108 |   await page.reload({ waitUntil: 'networkidle' });
  109 |   await openNotebook(page, notebookName);
  110 |   await openSubject(page, subjectName);
  111 |   await openPageCard(page, 'Pagina desenho');
  112 |   await expect(page.locator('.drawing-node')).toHaveCount(1);
  113 |   await expect(page.getByText('texto depois do desenho')).toBeVisible();
  114 | 
  115 |   await page.locator('.workspace-topbar-title').getByRole('button', { name: subjectName }).click();
  116 |   await openPageCard(page, 'Pagina imagem');
  117 |   await expect(page.locator('.image-node')).toHaveCount(1);
  118 |   await expect(page.getByText('texto depois da imagem')).toBeVisible();
  119 | 
  120 |   await page.locator('.workspace-topbar-title').getByRole('button', { name: subjectName }).click();
  121 |   await openPageCard(page, 'Pagina tabela');
  122 |   await expect(page.locator('table')).toHaveCount(1);
  123 |   await expect(page.getByText('texto depois da tabela')).toBeVisible();
  124 | 
  125 |   await page.locator('.workspace-topbar-title').getByRole('button', { name: subjectName }).click();
  126 |   await openPageCard(page, 'Pagina blocos');
  127 |   await expect(page.locator('hr')).toHaveCount(1);
  128 |   await expect(page.locator('pre')).toHaveCount(1);
  129 |   await expect(page.locator("ul[data-type='taskList']")).toHaveCount(1);
  130 |   await expect(page.getByText('texto depois do divisor')).toBeVisible();
  131 |   await expect(page.getByText('texto depois do codigo')).toBeVisible();
  132 |   await expect(page.getByText('texto depois do checklist')).toBeVisible();
  133 | });
  134 | 
```