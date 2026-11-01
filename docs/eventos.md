# Registro de eventos reais e revisão dos gatilhos

Tarefa 9.4. Os gatilhos de `backend/config.py` foram calibrados com séries históricas, não com eventos que o app viu ao vivo. Este arquivo é onde os eventos reais entram para corrigir isso.

## Quando registrar

Registre um evento sempre que houver **alagamento relatado** (Defesa Civil, imprensa, moradores) **ou** uma faixa de rua ficar `ativa` no app. O segundo caso vale mesmo que nada tenha sido relatado: ele conta como ativação sem ocorrência confirmada.

## Regra de revisão dos gatilhos

Revisar os gatilhos **a cada 6 meses ou após 3 eventos registrados, o que vier primeiro**. Na revisão:

1. Conferir, para cada faixa, quantas vezes acendeu e quantas vezes houve ocorrência. Comparar com a frequência-alvo do CLAUDE.md (faixa de rua ≈ 1/TR por ano; aviso geral entre 3 e 10 vezes por ano).
2. Usar também `data/historico/leituras.csv` (tarefa 6.6), quando existir.
3. Se mudar um gatilho: atualizar a tabela de frequência em `data/derivados/`, citá-la em `config.py`, acrescentar caso na tabela de testes do motor e registrar a decisão em "Decisões tomadas" do `CLAUDE.md`.

Uma ocorrência em rua fora das áreas mapeadas não prova que o gatilho está errado: o app só cobre as áreas mapeadas pelo PDDU.

## Modelo de registro

Copie o bloco abaixo para o fim da seção "Eventos", um por evento. Preencha só com o que foi observado ou citado em fonte; campo desconhecido fica como "não sabido", nunca estimado.

```
### AAAA-MM-DD — título curto

- **Data e hora (início e fim):**
- **Chuva observada:** acumulado de 24 h e fonte (pluviômetro, Open-Meteo, Defesa Civil)
- **Maré observada:** nível máximo, origem (medida ou estimativa) e fonte
- **O que o app mostrou:** nível global, faixas ativas, aviso geral, horário do dado (`gerado_em`). Anexar captura de tela se houver
- **O que de fato ocorreu:** ruas ou bairros com alagamento relatado
- **Fonte da ocorrência:** link ou nome do boletim, reportagem ou contato
- **Avaliação:** o app avisou a tempo? Avisou sem ocorrência? Não avisou apesar da ocorrência (a rua estava dentro de área mapeada)?
- **Gatilho a revisar:** faixa e motivo, ou "nenhum"
```

## Eventos

_Nenhum evento registrado ainda._

## Revisões feitas

_Nenhuma revisão feita ainda._ Registrar aqui data, eventos considerados e o que mudou.
