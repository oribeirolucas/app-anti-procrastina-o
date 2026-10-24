# Requisitos, premissas e critérios de aceite

## Contexto e premissas (decididas com o responsável em 24/10/2026)
- Uso **interno** da Recepção IA, uma empresa só (sem multiempresa). Se virar produto para clínicas, isolamento por empresa é requisito novo.
- Hospedagem alvo: VPS + Docker, infraestrutura ≤ R$ 100/mês.
- Autenticação própria (sem provedor externo).
- Dados iniciais: fictícios, marcados `[FICTÍCIO]`/`[E2E]`. Importação de dados reais só com autorização.
- **Premissas de regra de negócio (confirmar):**
  - P1. Reabrir oportunidade ganha/perdida: só gestor/admin, com auditoria.
  - P2. Nome de empresa é único (sem diferenciar maiúsculas). CNPJ é único quando informado. E-mail de contato é único quando informado.
  - P3. Exclusão = arquivamento. Anonimização (LGPD) é irreversível e só para admin.
  - P4. Retenção: registros arquivados ficam guardados indefinidamente até haver uma política definida pelo negócio.

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

### Financeiro (etapa 3)
- R1. Lançamentos de receita e despesa com categoria, competência, vencimento e pagamento/recebimento.
- R2. Contas a receber geradas a partir de contratos ativos, sem duplicar a mesma competência.
- R3. Fluxo de caixa realizado (por data de pagamento) × previsto (por vencimento), por período.
- R4. Cada número do dashboard leva aos lançamentos que o compõem.
- R5. Diferença explícita entre vendido (contrato), faturado (conta a receber) e recebido.

### Automações (etapa 4)
- A1. Gatilho → condição → ação. Gatilhos: cadastro, mudança de etapa e vencimento.
- A2. Ações: criar tarefa, notificação interna, agendar follow-up.
- A3. Follow-up para ao haver resposta do contato, opt-out ou encerramento da oportunidade.
- A4. Sem processamento duplicado (idempotência). Tentativas limitadas, com histórico de execução e erro.
- A5. Webhook autenticado (HMAC), repetido sem efeito duplicado.
- A6. Pausar e retomar automação.

### Agente de IA (etapa 5)
- I1. Responde só com base no conteúdo cadastrado. Sem informação, reconhece a limitação e transfere.
- I2. Não inventa preço, política, disponibilidade ou agendamento.
- I3. Conteúdo do usuário e dos documentos é tratado como dado. Tentativa de manipular instruções não altera permissões.
- I4. Limite de consumo configurável e registro de tokens/custo e de falhas.
- I5. Conversa e dados autorizados registrados no CRM. Transferência para humano.
