# Operação: ações manuais

Tarefas 9.3 e 9.6. Nada aqui roda sozinho nem foi feito pelo repositório: são dois passos que dependem de você. Marque quando fizer.

- [ ] Criar o ping gratuito que mantém o Render acordado (seção 1)
- [ ] Enviar o e-mail ao CIRAM/Epagri e registrar a resposta (seção 2)

## 1. Manter o Render acordado (9.3)

**Por quê.** O plano gratuito do Render hiberna o serviço depois de um tempo sem acessos, e a primeira resposta depois disso demora (da ordem de dezenas de segundos). Decidido em 29/10/2026: manter acordado com um ping gratuito a cada ~10 minutos.

**URL do ping:** `https://joinville-alerta-v2.onrender.com/api/v1/status-geral` (a mesma de `app.js`). Ela não tem rota de saúde separada; essa já responde com o cache.

### Opção A: cron-job.org

1. Crie uma conta gratuita em cron-job.org.
2. Em "Create cronjob", coloque a URL acima.
3. Agendamento: a cada 10 minutos.
4. Método: GET (o padrão).
5. Salve e use "Test run" para ver a resposta HTTP 200.

### Opção B: UptimeRobot

1. Crie uma conta gratuita em uptimerobot.com.
2. "Add New Monitor", tipo **HTTP(s)**, a URL acima, intervalo de 10 minutos ou o menor que o plano gratuito oferecer.
3. A rota só aceita GET. Se o monitor usar HEAD e o painel mostrar erro 405, mude o método do monitor para GET (se o plano não permitir, use a opção A).

Os planos e as telas mudam; confira os limites vigentes ao criar.

### Conferir

Abra o painel do Render, aba de logs: devem aparecer requisições a `/api/v1/status-geral` a cada ~10 minutos, e o serviço não deve mais mostrar partida a frio.

### Limites

- O plano gratuito tem um limite de horas por mês. Um serviço sempre acordado consome todas as horas de uma instância; confirme no painel do Render que o seu plano cobre o mês inteiro. Se não cobrir, o ping pode esgotar as horas e o serviço ficar fora do ar no fim do mês.
- O ping mantém o processo vivo, mas o cache é em RAM: um novo deploy ou reinício do Render zera o cache e a API responde `indisponivel` até a primeira coleta terminar.

### Sem o ping

O serviço hiberna. A primeira abertura do app depois de um período parado espera a API acordar; nesse tempo o front mostra o último estado salvo com o horário dele. Se esse estado passar de 120 minutos, todas as faixas aparecem como indisponíveis, nunca como "nenhuma faixa ativa agora".

## 2. Autorização de uso do endpoint de maré (9.6)

**Situação.** A maré medida vem de `https://ciram.epagri.sc.gov.br/graficos/getDataMare11_2913.php`, um endpoint que alimenta os gráficos do site do CIRAM/Epagri. Não há autorização formal registrada para uso em produção nem fonte reserva. Esta é a mesma pendência da tarefa 6.5 (relação entre o marégrafo "Joinville" do CIRAM e o Iate Clube, e o zero de cada régua); as perguntas abaixo aproveitam para perguntar isso.

**Antes de enviar:** descubra o contato correto (o CIRAM tem canal de atendimento no site) e revise o texto. Nada foi enviado.

### Texto do e-mail

**Assunto:** Pedido de autorização de uso de dados de maré em projeto acadêmico gratuito (Univille)

> Prezados,
>
> Somos estudantes de Engenharia de Software da Univille e desenvolvemos o *Joinville Alerta*, um aplicativo gratuito e de código aberto que mostra aos moradores de Joinville/SC o risco de alagar por rua, a partir da maré, da chuva e das áreas mapeadas pelo PDDU. O código está em https://github.com/Maiquel-Devs/joinville-alerta. O projeto não tem fins comerciais, não tem custo para quem usa e informa em todas as telas que não substitui a Defesa Civil.
>
> Hoje o servidor do aplicativo consulta, a cada 15 minutos, o endereço
> https://ciram.epagri.sc.gov.br/graficos/getDataMare11_2913.php
> para obter o nível de maré medido em Joinville. Identificamos a origem dos dados como CIRAM/Epagri no aplicativo e na documentação, e o servidor se identifica com um User-Agent próprio.
>
> Gostaríamos de pedir:
>
> 1. A autorização para continuar usando esse endereço em produção, com essa frequência (uma consulta a cada 15 minutos), e a forma de atribuição que vocês preferem.
> 2. Se existe uma API ou endereço oficial, ou outra forma recomendada de acesso, e se há limites de uso ou aviso prévio em caso de mudança.
> 3. Qual é o sensor da série "Joinville" desse endereço: ele é o mesmo marégrafo do Iate Clube? Qual é o referencial vertical (zero da régua) e a relação dele com o nível do PDDU?
> 4. Se o dado é bruto ou já passou por controle de qualidade, e como identificar leituras inválidas ou travadas.
>
> Podemos enviar mais detalhes sobre o uso. Agradecemos a atenção.
>
> Atenciosamente,
> [nome], [curso e instituição], [contato]

### Depois de enviar

1. Anote aqui a data de envio e o canal usado.
2. Guarde a resposta (ou a falta dela) em `docs/` e resuma em "Decisões tomadas" do `CLAUDE.md`.
3. Sem resposta ou com negativa: definir uma fonte reserva de maré (tarefa 9.6) e, enquanto isso, manter o rótulo de que a maré vem de um endpoint sem autorização formal.
4. A resposta à pergunta 3 fecha também as tarefas 0.8 e 6.5.

| Data de envio | Canal | Resposta |
|---|---|---|
| _não enviado_ | | |
