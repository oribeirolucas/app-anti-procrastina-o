# Perfis e permissões

Fonte única: `server/src/auth/permissoes.ts`. A tela Administração → Usuários mostra a matriz ao vivo.

| Permissão | admin | gestor | operador | O que libera |
|---|:-:|:-:|:-:|---|
| usuarios:gerir | ✓ | | | criar/desativar usuários, mudar perfil, redefinir senha |
| config:gerir | ✓ | | | fuso horário, nome da empresa, catálogo de planos e preços, franquia de uso |
| auditoria:ver | ✓ | ✓ | | log de ações e menu Administração e uso do mês (IA/WhatsApp) |
| crm:ler / crm:escrever | ✓ | ✓ | ✓ | empresas, contatos, oportunidades, tarefas, interações |
| crm:arquivar | ✓ | ✓ | | arquivar/reativar empresa, contato, oportunidade (não há exclusão física) |
| crm:reabrir | ✓ | ✓ | | reabrir ou mudar o resultado de oportunidade ganha/perdida |
| dados:anonimizar | ✓ | | | anonimizar contato (LGPD, irreversível) |
| crm:pipeline | ✓ | ✓ | | criar/editar/desativar etapas |
| crm:importar / crm:exportar | ✓ | ✓ | | CSV |
| contratos:escrever | ✓ | ✓ | | registrar e alterar contratos |
| financeiro:ler / financeiro:escrever | ✓ | ✓ | | módulo financeiro (etapa 3) |
| automacoes:ler / automacoes:gerir | ✓ | ✓ | | automações (etapa 4) |
| agente:gerir | ✓ | ✓ | | Agentes IA: system prompt, LLM e modelo (alterações auditadas com antes/depois) e logs de execução |
| agente:atender | ✓ | ✓ | ✓ | Inbox WhatsApp (auditoria das conversas) e assumir conversas transferidas |
| aprovacoes:ver | ✓ | ✓ | | fila de Aprovações (governança) |
| aprovacoes:decidir | ✓ | | | dar Go/No-Go nas solicitações dos agentes (recusa exige motivo) |
| marketing:ver | ✓ | ✓ | | painel de Marketing (CPL, CAC, orçamento diário). Definir o orçamento exige config:gerir |

Regra extra: o sistema impede remover ou desativar o último administrador ativo.
