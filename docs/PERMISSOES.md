# Perfis e permissões

Fonte única: `server/src/auth/permissoes.ts`. A tela Administração → Usuários mostra a matriz ao vivo.

| Permissão | admin | gestor | operador | O que libera |
|---|:-:|:-:|:-:|---|
| usuarios:gerir | ✓ | | | criar/desativar usuários, mudar perfil, redefinir senha |
| config:gerir | ✓ | | | fuso horário e configurações gerais |
| auditoria:ver | ✓ | ✓ | | log de ações e menu Administração |
| crm:ler / crm:escrever | ✓ | ✓ | ✓ | empresas, contatos, oportunidades, tarefas, interações |
| crm:excluir | ✓ | ✓ | | excluir empresa/contato/oportunidade |
| crm:pipeline | ✓ | ✓ | | criar/editar/desativar etapas |
| crm:importar / crm:exportar | ✓ | ✓ | | CSV |
| contratos:escrever | ✓ | ✓ | | registrar e alterar contratos |
| financeiro:ler / financeiro:escrever | ✓ | ✓ | | módulo financeiro (etapa 3) |
| automacoes:ler / automacoes:gerir | ✓ | ✓ | | automações (etapa 4) |
| agente:gerir | ✓ | ✓ | | base de conhecimento e regras do agente (etapa 5) |
| agente:atender | ✓ | ✓ | ✓ | assumir conversas transferidas pelo agente |

Regra extra: o sistema impede remover ou desativar o último administrador ativo.
