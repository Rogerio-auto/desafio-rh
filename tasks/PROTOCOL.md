# PROTOCOL.md — Regras invioláveis para agentes IA

> Leia este arquivo **antes** de pegar o primeiro slot. Releia se algo parecer ambíguo. **Em qualquer conflito, este protocolo + a documentação do projeto vencem o slot individual.**

## 1. Regras gerais (NUNCA violar)

1. **Não saia do escopo do slot.** Se você precisa tocar em arquivos não listados em `files_allowed`, pare e abra um slot novo (ou um issue). Nunca "aproveite" para refatorar fora do escopo.
2. **Não invente decisões.** Stack, padrões, naming, arquitetura estão na documentação do projeto (`docs/`, `ARCHITECTURE.md`, `CLAUDE.md`). Se a doc é silente, escolha a opção mais simples e registre no PR para revisão humana.
3. **Não introduza dependências sem justificar.** Cada nova entrada em `package.json`, `pyproject.toml`, `Cargo.toml`, etc, precisa de uma frase no PR explicando por que ela é a melhor escolha.
4. **Tipos estritos.** Sem `any`, sem `as unknown as ...` em TS. Sem `# type: ignore` sem comentário justificando em Python. Resolva o tipo de verdade.
5. **Sem código placeholder.** Nada de `// TODO: implementar` em código que entra em `done`. Se algo falta, é fora de escopo do slot — diga isso explicitamente.
6. **Validação nas bordas.** Toda rota HTTP nova valida request e response com schema (Zod/Pydantic/etc). Toda integração externa valida o payload.
7. **Eventos atômicos.** Mutação que emite evento grava em outbox/queue na **mesma transação** da mutação. Não emita eventos fora de transação.
8. **Auditoria** em mutações sensíveis (criar/editar entidade, mudança de estado, alteração de permissão).
9. **Idempotência** em rotas POST que webhooks ou clientes podem repetir.
10. **Logs estruturados** com `request_id` e `correlation_id`. Sem `console.log` / `print` em código de produção (apenas em scripts e mensagens de inicialização).
11. **Segurança** — nunca commite secret, nunca exponha porta desnecessária, sempre valide HMAC em webhooks, sempre rate-limit endpoints públicos.

## 2. Workflow do agente

### 2.0 Pre-flight (OBRIGATÓRIO antes de qualquer ação)

```powershell
git status --short              # working tree deve estar limpo
git rev-parse --abbrev-ref HEAD
```

Se sujo ou em branch que não é o esperado, **aborte e reporte**. Agentes paralelos no mesmo working tree fazem swap de branch e poluem trabalho um do outro.

**Se vai rodar em paralelo com outro agente:** o orquestrador DEVE usar `isolation: "worktree"` no parâmetro do `Agent` tool — sem isso, é proibido.

### 2.1 Antes de começar

1. `python scripts/slot.py status` → resumo de 10 linhas (substitui leitura de STATUS.md).
2. `python scripts/slot.py list-available` → lista slots prontos (filtrados por deps satisfeitos).
3. Ler o frontmatter + corpo do slot escolhido. Ler **apenas** os `source_docs` listados nele.
4. Identificar slot com:
   - `status: available`
   - todas as `depends_on` em `done`
   - você possui contexto/competência para o domínio

### 2.2 Claim atômico

```powershell
python scripts/slot.py claim <SLOT-ID>
```

Esse comando faz, atomicamente:

- `git checkout main && git pull --ff-only` _(apenas no working tree principal)_
- Cria branch `feat/<slot-id-lowercase>`
- Atualiza frontmatter (`status: in-progress`, `agent_id`, `claimed_at`)
- Re-renderiza `tasks/STATUS.md` a partir dos frontmatters
- Commit `chore(tasks): <SLOT-ID> in-progress`

Rejeita se: working tree com arquivos tracked modificados, branch já existe, slot não está available.

**Comportamento em worktrees do Agent tool (`isolation: "worktree"`):**

Quando o script detecta que está sendo executado dentro de um worktree adicional, ele **pula** `git checkout main && git pull --ff-only`. Isso porque o git proíbe ter a mesma branch (`main`) checked out em dois worktrees simultaneamente. O worktree é criado pelo orquestrador com HEAD apontando para `origin/main` — atualizar o main antes do dispatch é responsabilidade do orquestrador.

**NÃO** edite `tasks/STATUS.md` à mão. **NÃO** crie branch manualmente. O script é a única forma.

### 2.3 Durante a execução

1. Implementar **somente** dentro de `files_allowed`. Tocar `files_forbidden` é bloqueio.
2. Não rodar `--no-verify` em nenhum commit.
3. Validar continuamente:
   ```powershell
   python scripts/slot.py validate <SLOT-ID>     # parseia "## Validação" do slot e roda
   ```
4. Cobrir testes obrigatórios listados em `dod`.

### 2.4 Ao terminar

```powershell
git add <arquivos de implementação do slot>
git commit -m "feat(<modulo>): <descrição> (<SLOT-ID>)"   # ⚠️ commit do SEU código
python scripts/slot.py finish <SLOT-ID>
git push origin feat/<slot-id-lowercase>
git log --stat origin/feat/<slot-id-lowercase>            # verificação obrigatória
```

**⚠️ `slot.py finish` NÃO commita seu código.** Ele só atualiza o frontmatter para `review`, regenera STATUS.md e commita `chore(tasks): <SLOT-ID> review`. O código de implementação é responsabilidade sua: rode `git add` + `git commit` **antes** do `finish`. Depois do push, confirme com `git log --stat origin/feat/<slot-id>` que os arquivos de implementação aparecem no histórico — se só houver commits `chore(tasks)`, o código **não subiu** e será perdido na próxima limpeza de worktree (ver §7.6).

**NÃO** abre PR. O orquestrador (ou humano) abre o PR via `gh pr create` ou `slot.py pr open`. Você apenas pusha a branch.

### 2.5 Pós-merge

Após merge do PR em `main`:

```powershell
python scripts/slot.py reconcile-merged --write
```

Detecta automaticamente slots cujo trabalho foi mergeado e marca como `done` + atualiza STATUS.md. Idempotente.

**Fonte de verdade (Layer 0):** `gh pr list --state merged`, indexado pelo `headRefName` do PR. Regex tolerante extrai o slot_id: `feat/(f\d+-s\d+)(?:-.*)?` → `F2-S01`, `F0-S10`, etc. Não depende de branches ainda presentes, título do PR, nem histórico rebased.

### 2.6 Se travar

- Faltou contexto na doc? Abra issue rotulado `docs-gap` linkando o slot. Mantenha slot em `blocked` com motivo.
- Slot mal-dimensionado (escopo muito grande)? Quebre em sub-slots: `<SLOT-ID>a`, `<SLOT-ID>b`. O slot original vira `cancelled` com link para os filhos.
- Dependência apareceu durante a execução? Abra slot novo e marque o atual como `blocked`.

## 3. Padrões de código (resumo executivo)

Esta seção é um **stub** — preencha conforme a stack do seu projeto. Veja `CLAUDE.md` ou `docs/` do projeto para padrões específicos. O sistema de slots não impõe linguagem; impõe:

- Tipos estritos quando a linguagem suporta.
- Validação de schema nas bordas.
- Logs estruturados.
- Sem secrets em código.
- Sem dependências sem justificativa.

## 4. Verificações automáticas

Antes de marcar um slot como `review`:

```powershell
python scripts/slot.py validate <SLOT-ID>
```

O script parseia o bloco `## Validação` do slot e executa os comandos listados. Tudo verde, ou o slot não está pronto.

## 5. Limites do agente

- **Não execute migrations destrutivas** em ambientes compartilhados.
- **Não adicione dependência sem registrar no PR.**
- **Não toque em `.env` reais.** Apenas em `.env.example`.
- **Não merge no `main` sem revisão humana** salvo orientação explícita.
- **Não desligue verificações** (`--no-verify`, `eslint-disable`, `# type: ignore`) sem justificativa documentada no PR.

## 6. Comunicação

Tudo o que o agente decide ou questiona vai no PR (ou issue). Não há "memória externa". O próximo agente que pegar um slot relacionado precisa conseguir entender o contexto pela leitura do repositório.

## 7. Lições aprendidas (anti-bugs invariantes)

Bugs que aparecem em qualquer setup com múltiplos agentes paralelos. Mantenha estes invariantes.

### 7.1 Um working tree = um agente

**Sintoma:** disparar N especialistas em paralelo no mesmo working tree → cada um faz `git checkout` → swap de branch entre agentes → commits em branch errado + claim duplicado + arquivos órfãos.

**Causa:** git só tem 1 working tree por repo. Agentes paralelos sem isolamento pisam um no outro.

**Mitigação (já no protocolo, §2.0):**

- Pre-flight `git status --short` + `git rev-parse --abbrev-ref HEAD` no início de TODO agente.
- Sujo ou branch inesperado = abortar imediatamente.
- Paralelismo só com `isolation: "worktree"` no `Agent` tool — sem exceções.

### 7.2 Token waste em leituras redundantes

**Sintoma:** cada agente lê STATUS.md inteiro (200+ linhas), PROTOCOL.md (200+ linhas), e docs grandes inteiros.

**Mitigação:**

- `python scripts/slot.py status` produz resumo de 10 linhas.
- `python scripts/slot.py list-available` filtra slots prontos.
- `python scripts/slot.py brief <ID> --json` retorna frontmatter + deps + files_allowed + sections em 1 call.
- **Para docs grandes:** use `Grep` na seção específica. **NÃO** leia docs grandes inteiros.

### 7.3 STATUS.md como view derivada

**Sintoma:** cada agente edita STATUS.md à mão → divergência entre branches paralelos → após merge, STATUS.md fica inconsistente.

**Mitigação:**

- Slot frontmatters são a **fonte única da verdade**.
- `tasks/STATUS.md` é **view derivada** — regenerada por `python scripts/slot.py sync`.
- **Proibido editar STATUS.md à mão.** Mude o frontmatter do slot e rode sync.
- Pós-merge: `python scripts/slot.py reconcile-merged --write` detecta automaticamente quais branches caíram em `origin/main` e marca slots como `done`.

### 7.4 Hooks/lint quebrados não bloqueados

**Sintoma:** slot mergeia um `lint-staged` que chama ESLint sem config na raiz → todos os commits subsequentes falham.

**Mitigação:**

- Depois de slot que mexe em hooks/tooling, rodar smoke test (`git commit --allow-empty`) antes de pushar.
- CI deve rodar exatamente o mesmo conjunto de hooks/lints localmente.

### 7.5 Worktree staleness — commit local sem push antes do dispatch

**Sintoma:** agente reporta que o arquivo do slot não existia no worktree.

**Causa:** o harness Claude Code cria o worktree a partir de `origin/main` (estado remoto), não do `HEAD` do `main` local. Commits feitos em `main` local mas não pushados para `origin` são **invisíveis** ao worktree.

**Mitigação (regra obrigatória):**

```powershell
# Antes de disparar Agent(isolation="worktree"), sempre:
git push origin main   # sincroniza estado local → origin antes do dispatch
```

### 7.6 Código não-commitado perdido em worktree-clean

**Sintoma:** agente roda `slot.py finish` + `git push` e reporta sucesso, mas a branch no `origin` contém apenas os 2 commits `chore(tasks)` — o código de implementação nunca foi commitado. `worktree-clean` remove os diretórios dos worktrees junto com o código não-commitado.

**Causa raiz:** `slot.py finish` commita apenas STATUS.md + frontmatter. Agentes assumem que `finish` commita o código — não commita.

**Mitigação:**

- §2.4 deixa explícito: `git add` + `git commit` do código é passo obrigatório, **antes** do `finish`, com verificação `git log --stat origin/feat/<slot>` após o push.
- `worktree-clean` é ferramenta **pós-merge**. Nunca rodar com worktrees não-mergeados ativos sem antes confirmar que todo o trabalho está commitado **e** pushado.

### 7.7 Custos cognitivos a evitar

| Anti-padrão                                                              | Custo               | Substituto                                          |
| ------------------------------------------------------------------------ | ------------------- | --------------------------------------------------- |
| Ler `STATUS.md` inteiro                                                  | 200+ linhas         | `slot.py status` (~10 linhas)                       |
| Ler PROTOCOL.md em toda invocação                                        | 200+ linhas         | Confiar no contexto; releitura só sob dúvida        |
| Ler `docs/<X>.md` inteiro                                                | 500+ linhas         | `Grep` na seção específica                          |
| `git checkout main && pull && checkout -b ...` + edit frontmatter + edit STATUS.md + commit | 5-7 comandos | `slot.py claim <id>` (1 comando)                    |
| Rodar lint/typecheck/test à mão                                          | N comandos          | `slot.py validate <id>` (1 comando, parseia do slot) |
| Editar STATUS.md à mão                                                   | propenso a drift    | `slot.py sync` (re-renderiza)                       |
| Marcar slot done à mão pós-merge                                         | propenso a esquecer | `slot.py reconcile-merged --write`                  |
| Gerar body de PR à mão                                                   | 30+ linhas          | `slot.py pr open <id>` (extrai do slot)             |
