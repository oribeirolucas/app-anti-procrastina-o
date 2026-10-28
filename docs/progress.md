# Progresso

Legenda: ✅ implementado e testado · 🧪 implementado, teste parcial · ⛔ bloqueado (dependência externa) · ⏳ não iniciado

| Item | Situação | Evidência |
|---|---|---|
| Fundação F1–F5 | ✅ | `server/test/fundacao.test.ts`, `/saude` e `x-request-id` verificados via curl |
| CRM C1 | ✅ | `client/e2e/jornada-crm.cjs`: 9 passos no navegador, incluindo recarga e celular |
| CRM C2–C7 | ✅ | `server/test/integridade.test.ts`, `server/test/crm.test.ts` |
| CRM C8 | ✅ | `crm.test.ts` (indicadores), fórmulas em `docs/INDICADORES.md` |
| Contratos K1–K7 | ✅ | `server/test/contratos.test.ts` (6 cenários) e `client/e2e/jornada-contratos.cjs` (7 passos, inclui celular) |
| Financeiro R1–R7 | ✅ | `server/test/financeiro.test.ts` (7 cenários) e `client/e2e/jornada-financeiro.cjs` (6 passos no navegador) |
| Automações A1–A7 | ✅ | `server/test/automacoes.test.ts` (10 cenários) e `client/e2e/jornada-automacoes.cjs` (7 passos) |
| Agente de IA I1–I5 | ⛔ parcial | estrutura pode ser feita. Respostas reais exigem `ANTHROPIC_API_KEY` |
| Instalação por cliente (Docker, HTTPS, backup e restauração) | ✅ | `Dockerfile` e `deploy/`: compose subido e conferido. Backup, teste de restauração e restauração real executados. Ver `docs/INSTALACAO.md` |

## Instalação por cliente (28/10/2026)
- `Dockerfile` (front-end e API numa imagem, ~395 MB) e `deploy/docker-compose.yml`: app, PostgreSQL 16 sem porta exposta, Caddy com HTTPS automático e serviço de backup diário.
- Scripts em `deploy/scripts/`: backup-agora, testar-restauracao, restaurar (com backup de segurança e confirmação) e atualizar (backup, build e checagem de saúde).
- Verificado aqui com Docker, usando HTTPS local:
  - stack saudável e login pela interface;
  - backup gerado e conferido;
  - teste de restauração em banco temporário: 1 empresa no backup e 2 no banco em uso;
  - restauração real voltou a 1 empresa, com login funcionando depois;
  - dados persistem ao recriar contêineres;
  - agenda de backup no fuso do cliente.
- **Não verificado aqui:**
  - certificado real do Let's Encrypt (exige domínio público);
  - cópia externa via rclone (exige bucket);
  - `atualizar.sh` de ponta a ponta (a rede deste ambiente exige proxy no build).

## Franquia de uso (28/10/2026)
- Tabela `consumo_uso` (migração 0008), `lib/consumo.ts` (`registrarConsumo`, `verificarLimite`) e tela Administração → Uso e limites.
- Verificado: `npm test` 47/47 (novo `consumo.test.ts`: idempotência, avisos 80/100% sem duplicar, bloqueio, permissões) e tela conferida no navegador.
- Ainda sem fonte de consumo real: o agente de IA e o WhatsApp vão chamar `verificarLimite` antes e `registrarConsumo` depois de cada ação paga.

## Mudança de rumo (28/10/2026): white-label, modelo A
- Removida a marca Recepção IA e os textos de clínica: nome da empresa vem de Admin → Configurações (`auth.marca`, público).
- Catálogo de planos (`plano`, migração 0007) em Admin → Planos e preços. O contrato preenche mensalidade e setup a partir dele.
- Segmento da empresa virou texto livre. Dados fictícios e categorias padrão agora são neutros.
- Verificado: `npm test` 45/45 (novo `planos.test.ts`), `tsc` ok no server e no client, lint sem erros,
  E2E local crm/financeiro/automacoes/contratos OK e roteiro de navegador nome → plano → contrato preenchido.
- Pendente: limpar os dados fictícios do link de teste (aguarda sua confirmação no Supabase) e aplicar lá a migração 0007.

## Últimas verificações executadas (27/10/2026)
- `server`: `npm test` passou (27 testes: fundação, CRM, integridade e financeiro) e `tsc --noEmit` ok.
- E2E `jornada-financeiro.cjs`: 6/6 (despesa → baixa com diferença → painel → rastreio → geração idempotente → operador bloqueado).
- Navegação da Administração conferida no navegador após correção dos links relativos.
- Migrações 0002 (empresa nome+cidade) e 0003 (financeiro, com 7 restrições CHECK) aplicadas no banco de desenvolvimento.
- `client`: `tsc -b` ok, `vite build` ok, `oxlint` sem erros.
- E2E `jornada-crm.cjs` contra servidor local: 9/9 passos (repetido em 27/10).
- Migração 0001 aplicada no banco de desenvolvimento existente. A verificação prévia detectou um nome
  duplicado real (gerado por teste), que foi renomeado, não apagado.

## Limitações conhecidas
- Indicadores do painel não têm link para a lista filtrada de oportunidades (só para o pipeline geral).
- Sem paginação no quadro do pipeline (limite de 500 oportunidades abertas carregadas).
- Backup/restauração ainda não implementados. **Não usar com dados reais antes da etapa 6.**
- Geração de cobranças é manual (botão por mês). Automatizar no dia 1 entra na etapa 4 (automações).
- Painel financeiro não tem gráfico de linha. As barras mês a mês são clicáveis.
- Sem conciliação bancária nem emissão de boleto/NF (fora do escopo atual).

## Próximo passo
Etapa 5, agente de IA (I1–I8). Bloqueio: precisa da `ANTHROPIC_API_KEY` (custo por uso). Sem a chave, é possível construir a base de conhecimento, os casos de transferência, as regras obrigatórias e a aprovação de propostas, deixando a chamada ao modelo para o fim.

## Ambiente de teste publicado (27/10/2026)
- URL: https://plataforma-comercial-demo.vercel.app (Vercel, time `larc21`, projeto `recepcao-ia-teste`), banco Supabase `recepcao-ia-teste` (sa-east-1).
- Migrações 0000–0003 aplicadas via API do Supabase. Schema conferido idêntico ao local (hash de 220 itens).
  **Atenção:** esse banco não tem a tabela de controle do Drizzle. Novas migrações ali devem ser aplicadas uma a uma, da mesma forma.
- A aplicação usa o usuário de banco `app_crm` (só DML). `anon`/`authenticated` sem acesso às tabelas.
- Verificado no link: `/saude` 200, `jornada-crm.cjs` 9/9, `jornada-financeiro.cjs` 6/6, pedido de outra origem 403, sem login 401, cabeçalhos de segurança presentes.
- Limitações: TLS com o banco sem verificação de certificado (`uselibpqcompat` + `sslmode=require`), função em iad1 e banco em sa-east-1 (latência), sem backup. Só dados fictícios.
- Resolvido em 27/10: drizzle-orm 0.45.4, drizzle-kit 0.31.11, zod 4.6.7 (`npm audit --omit=dev`: 0 vulnerabilidades).

## Etapa 4: automações (27/10/2026)
- Verificado: `npm test` 37/37 (inclui 10 de automações). E2E `jornada-automacoes.cjs` 7/7, `jornada-crm.cjs` 9/9 e `jornada-financeiro.cjs` 6/6 no servidor local.
- Cobertos por teste: sem duplicidade (índice único por automação+evento), condições, pausa, follow-up com passos e paradas
  (resposta, descadastro com rechecagem no passo, oportunidade encerrada), 5 tentativas com espera crescente e estado "falhou"
  com reprocessamento manual, vencimento de contrato sem repetir, webhook HMAC (válido, inválido, reenvio, rotação, revogação),
  formulário público (domínio, armadilha anti-robô, duplicado do dia, limite por IP), permissões.
- Bug encontrado no E2E e corrigido: telas não mostravam os efeitos das automações sem recarregar.
- Limitações: ações apenas internas (tarefa, aviso, follow-up), sem envio de WhatsApp ou e-mail. Na Vercel, os passos de follow-up
  vencidos rodam na próxima alteração feita por alguém ou pelo botão "Processar agora" (não há processo contínuo). Na VPS, a cada 30 s.
- Pendente de decisão: indicador/gatilho "bola do nosso lado" e follow-up que muda conforme a resposta (perguntados ao responsável).
- Ambiente de teste (27/10): migração 0004 aplicada no Supabase (schema idêntico, hash de 308 itens), `TRUST_PROXY=1` na Vercel.
  Bug encontrado só na Vercel e corrigido: `/webhooks` e `/tarefas` não eram roteados para a função (respondiam 405).
  No link: `jornada-automacoes.cjs` 7/7, `jornada-financeiro.cjs` OK, `jornada-crm.cjs` OK em 2 de 3 execuções
  (a primeira terminou sem resultado visível; provável lentidão iad1↔sa-east, não reproduzida). Observar.

## Aba Contratos funcional (27/10/2026)
- Antes: lista somente leitura. Agora: criar pela aba e a partir de venda ganha, editar, renovar, suspender/reativar, cancelar com
  motivo (opcional: cancelar cobranças futuras), saúde financeira por contrato, histórico e indicadores no topo.
- Migrações 0005 (versão, motivo, data de cancelamento, observações) e 0006 (CHECK de situação e vigência, com verificação prévia).
- Verificado: `npm test` 43/43. E2E local: contratos 7/7, CRM 9/9, financeiro e automações OK.
- Ambiente de teste: migrações 0005 e 0006 aplicadas, deploy feito. A jornada de contratos falhou no link real no passo
  "cancelar" (passou local): condição de corrida. A ação seguinte saía com a versão antiga antes do recarregamento, em rede lenta.
  Corrigido (o detalhe aplica a versão devolvida na hora e bloqueia ações enquanto recarrega). Mesma correção na tela da oportunidade.
  Depois da correção: contratos 2/2 rodadas no link. CRM, financeiro e automações OK no link.
- Intermitência das jornadas no link investigada até a causa (27/10): não era o sistema. O teste esperava o texto digitado,
  que o Playwright encontrava no próprio campo, e recarregava a página com o envio ainda em andamento. Reproduzido localmente com
  `RETARDO_MS=700` (4/4 falhas) e corrigido nos testes (CRM e automações). Depois: 9/9 com rede lenta simulada e 8/8 no link.
