# Agente 05: prospecção (semana 1, Grande Florianópolis)

## Montar a lista (50 clínicas)
1. No Google Maps, buscar "clínica de estética" em Florianópolis, São José e Palhoça.
2. Filtro: nota ≥ 4,3, ≥ 50 avaliações, WhatsApp visível, Instagram ativo.
3. Registrar na planilha (colunas abaixo). Tempo estimado: 2h manuais, ou 10 min com scraper (Apify/Bright Data, ~R$20; **precisa de aprovação**).

| Clínica | Bairro | Nota/Avaliações | WhatsApp | Instagram | Decisor | Tempo de resposta (teste) | Score | Etapa |
|---|---|---|---|---|---|---|---|---|

## Teste do cliente oculto (D-1, entre 19h e 22h)
Mensagem para o WhatsApp da clínica:
> Oi! Quanto custa o botox de vocês? Tem horário essa semana?

Anotar o tempo até a primeira resposta. Tempo acima de 30 min = **score +3**.

## Cadência (WhatsApp do fundador, máximo 15 novas/dia)
**D0, abertura:**
> Oi, {{nome}}! Sou o Lucas, aqui de Floripa. Ontem às {{hora}} mandei uma mensagem pra {{clínica}} perguntando preço de botox e a resposta veio {{tempo}} depois. Nesse intervalo, a maioria das pacientes já fechou com outra clínica. Montei uma recepcionista de IA que responde em 10 segundos, 24h, e já deixa a avaliação agendada. Posso te mostrar em 15 min, com as perguntas reais da sua clínica?

**D1, vídeo de 40s:** gravação da IA respondendo "quanto custa o botox de vocês?" com o nome da clínica dela.

**D3, prova:**
> Fiz a conta: se vocês recebem uns 300 contatos por mês e perdem 30% por demora, são ~90 pacientes. Recuperar 3 já paga a ferramenta o ano todo. Bora testar 30 dias com garantia?

**D5, presencial (diferencial local):**
> Tô passando pelo {{bairro}} quinta. Posso dar uma passada de 15 min pra te mostrar ao vivo?

**D7, encerramento:**
> Não vou mais te incomodar 🙂 Se quiser ver funcionando um dia, é só responder "quero".

## Regras
- Respeitar "não tenho interesse" imediatamente.
- Nada de disparo em massa: mensagens personalizadas, máximo 15/dia.
- Demo agendada vai para o 06 com briefing: tempo de resposta medido, procedimentos e preços do Instagram, nº de avaliações.

## Meta da semana 1
50 testes de cliente oculto → 50 abordagens → 8 a 10 demos → 3 a 5 vendas (fechamento de 35 a 50%).

## PRÓXIMAS AÇÕES
- Fundador: montar a lista (2h) ou aprovar o scraper
- Fundador: rodar os testes de cliente oculto nas noites de D-1
- 07: deixar uma demo funcional pronta (bloqueante)

## PRECISA DE APROVAÇÃO
- Usar o WhatsApp pessoal do fundador para a prospecção
- Scraper (~R$20), opcional

## HANDOFF
- 06: roteiro de demo presencial (vem a seguir)
- 07: demo funcional antes de D0
