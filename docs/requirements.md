# Requisitos, premissas e critérios de aceite

## Contexto e premissas (decididas com o responsável em 24/10/2026)
- Uso **interno** da Recepção IA, uma empresa só (sem multiempresa). Se virar produto para clínicas, isolamento por empresa é requisito novo.
- Hospedagem alvo: VPS + Docker, infraestrutura ≤ R$ 100/mês.
- Autenticação própria (sem provedor externo).
- Dados iniciais: fictícios, marcados `[FICTÍCIO]`/`[E2E]`. Importação de dados reais só com autorização.
- **Regras de negócio confirmadas pelo responsável em 27/10/2026:**
  - P1. Reabrir oportunidade ganha/perdida: só gestor/admin, com auditoria.
  - P2. Empresa é única por **nome + cidade** (sem diferenciar maiúsculas). CNPJ é único quando informado. E-mail de contato é único quando informado.
  - P3. Exclusão = arquivamento. Anonimização (LGPD) é irreversível e só para admin.
  - P4. Registros arquivados são guardados **indefinidamente**, até o responsável definir um prazo de retenção.

## Definição de "concluído" (vale para toda funcionalidade)
Fluxo executável pela interface · regra aplicada no backend · persistência verificada · permissão testada ·
erros e estados vazios tratados · testes pertinentes passando · nada simulado apresentado como real.

## Critérios de aceite por módulo

### Fundação
- F1. Login com senha (argon2), sessão em cookie httpOnly. Bloqueio após 5 falhas por e-mail ou 20 por IP em 15 min.
- F2. Perfis admin/gestor/operador. Toda permissão é verificada no servidor.
- F3. Desativar usuário ou mudar perfil encerra as sessões dele. Sempre existe ao menos um admin ativo.
- F4. Ações administrativas ficam em `auditoria`.
- F5. `/saude` retorna 200 com o banco ok e 503 sem ele. Toda resposta tem `x-request-id`.

### CRM
- C1. Jornada: criar contato → abrir oportunidade → alterar etapa → registrar tarefa → concluir tarefa → consultar histórico.
- C2. Duplicidades (P2) recusadas com mensagem clara, inclusive na importação.
- C3. Oportunidade nova começa em etapa aberta. Perda exige motivo. Reabertura segue P1.
- C4. Edição concorrente com versão antiga é recusada (sem sobrescrita silenciosa).
- C5. Arquivar remove das listas e dos indicadores, mantém histórico e é reversível. Empresa com contrato ativo não pode ser arquivada.
- C6. Importação CSV com prévia (nada gravado), erros por linha e duplicados apontados, nunca descartados em silêncio.
- C7. Opt-out bloqueia follow-ups (consumido pelas automações) e é idempotente.
- C8. Indicadores conforme `docs/INDICADORES.md`. Oportunidade nunca conta como receita.

### Contratos (aba Contratos)
- K1. Criar contrato pela própria aba (empresa obrigatória) ou com um clique a partir de venda ganha sem contrato (dados preenchidos).
- K2. Editar plano, valores, datas e dia de cobrança, com concorrência otimista. Contrato cancelado não é editável.
- K3. Renovar por N meses a partir do fim atual (ou de hoje, se vencido), com reajuste opcional da mensalidade. Sem fim, não renova.
- K4. Suspender (motivo obrigatório, para de gerar cobranças) ↔ reativar. Cancelar é definitivo, com motivo, e opcionalmente cancela as
  cobranças futuras pendentes. As cobranças já vencidas continuam em aberto.
- K5. Cada contrato mostra faturado, recebido, em atraso e próxima cobrança, e lista suas cobranças e o histórico de alterações.
- K6. Indicadores: receita mensal ativa, vencendo em 30 dias (e vencidos), inadimplência, cancelados no mês (e receita perdida),
  vendas ganhas sem contrato.
- K7. Filtros por empresa, situação e vencimento (30/60/90 dias, vencidos, sem fim).

### Financeiro (etapa 3)
- R1. Lançamento de receita ou despesa com descrição, categoria, valor, competência (mês), vencimento e,
  ao baixar, data e valor efetivamente pagos/recebidos. Não há exclusão: cancelamento exige motivo e sai de todos os totais.
- R2. "Gerar cobranças do mês" cria uma mensalidade por contrato ativo naquele mês (vencimento no dia de cobrança)
  e a taxa de setup no mês de início. Rodar de novo não duplica (garantido por índice único).
- R3. Fluxo de caixa: **realizado** = baixas por data de pagamento. **Previsto** = lançamentos não cancelados por
  vencimento. Exibido mês a mês no período, com saldo e diferença previsto × realizado.
- R4. Todo número do painel financeiro abre a lista de lançamentos que o compõe (mesmos filtros).
- R5. O painel mostra lado a lado: vendido (MRR de contratos ativos), faturado (receitas por competência),
  recebido (receitas baixadas) e em atraso (pendentes vencidos).
- R6. Contas a receber/pagar: listas de pendentes com atraso destacado. Baixa com valor diferente do previsto
  (juros/desconto) é permitida e a diferença fica visível.
- R7. Operador não vê nem altera o financeiro (backend e menu). Categorias com uso não podem ser removidas, só desativadas.

### Automações (etapa 4)
- A1. Gatilho → condição → ação. Gatilhos: cadastro, mudança de etapa e vencimento.
- A2. Ações: criar tarefa, notificação interna, agendar follow-up.
- A3. Follow-up para ao haver resposta do contato, opt-out ou encerramento da oportunidade.
- A4. Sem processamento duplicado (idempotência). Tentativas limitadas, com histórico de execução e erro.
- A5. Webhook autenticado (HMAC), repetido sem efeito duplicado.
- A7. **Origens de captação** (landing page, formulário): cada origem tem chave própria, define o funil e a etapa de entrada,
  e o sistema mostra o snippet/URL para colar no site. A chave pode ser revogada. O mesmo lead reenviado não duplica o contato.
- A6. Pausar e retomar automação.

### Agente de IA (etapa 5)
- I1. Responde só com base no conteúdo cadastrado. Sem informação, reconhece a limitação e transfere.
- I2. Não inventa preço, política, disponibilidade ou agendamento.
- I3. Conteúdo do usuário e dos documentos é tratado como dado. Tentativa de manipular instruções não altera permissões.
- I4. Limite de consumo configurável e registro de tokens/custo e de falhas.
- I5. Conversa e dados autorizados registrados no CRM. Transferência para humano.
- I6. **Caso de transferência**: ao não poder resolver, o agente abre um caso com motivo e resumo da conversa,
  com situação (aberto → em andamento → resolvido), responsável e prazo. O humano pode instruir o agente dentro do caso,
  e o agente responde ao cliente com base na instrução (registrado na linha do tempo). Casos abertos e vencidos aparecem no painel.
- I7. **Regras obrigatórias**: lista de regras (ex.: "nunca pedir CPF sem autorização humana") aplicada a todos os agentes,
  editável só com `agente:gerir` e versionada (quem mudou e quando). Precedência sobre a base de conhecimento.
- I8. **Aprovação humana de propostas**: o agente só *sugere* proposta comercial, mudança de etapa ou agendamento.
  A sugestão aparece na oportunidade/kanban para aprovar ou recusar. Nada é confirmado ao cliente antes da aprovação.
