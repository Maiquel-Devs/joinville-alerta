# CLAUDE.md — Joinville Alerta v2

Projeto acadêmico e comunitário (Univille). **Revisado em 29/10/2026 (v3):** ativação das faixas calibrada por tempo de retorno, texto fixo no lugar do Mistral, e nenhuma faixa de chuva pinta ruas até ser calibrada. Este arquivo resume o que vale para todo o trabalho; o passo a passo está em `task.md`.

> Em 29/10/2026 o autor aceitou todas as recomendações desta revisão. Itens marcados **(decidido 29/10/2026)** estão fechados. Os valores numéricos de gatilho e de frequência continuam sujeitos aos números da Etapa 6.

## O que o projeto é

App gratuito, que funciona offline, que mostra o **risco de alagar por rua** em Joinville/SC. O sistema não observa nada na rua: ele **infere** risco a partir de maré e chuva e das manchas oficiais do PDDU.

- **Dentro do escopo:** diagnóstico por endereço ou GPS; risco por trecho de rua, derivado das manchas do PDDU; aviso geral de chuva/maré; texto de alerta fixo e revisável; custo de infraestrutura R$ 0,00.
- **Fora do escopo (futuro):** alagamento *confirmado* (relato do cidadão, pluviômetros), notificações push, rota "mais segura".

## Por que o app ficava quase todo vermelho (medido em 29/10/2026)

Medição de 29/10/2026 sobre `data/ruas_risco.geojson`, anterior à v3 (953 trechos, 107,4 km, 426 ruas nomeadas). Hoje o arquivo tem 1.094 trechos, 107,8 km, 432 nomes de rua. O arquivo só contém ruas **dentro de manchas**, então qualquer faixa ativa pinta uma parte enorme dele:

| Se acender... | Trechos pintados | Km |
|---|--:|--:|
| chuva ≥ 30 mm/24 h (Vila Nova + Itaum) | 627 (66%) | 68,9 |
| maré ≥ 2,53 m (faixas 1,6 + 2,5) | 740 (78%) | 84,9 |
| só maré ≥ 1,60 m | 134 (14%) | 8,2 |
| só Itaum | 414 (43%) | 46,4 |

Causas, em ordem de peso:

1. **Gatilho de evento frequente sobre mancha de evento raro.** A mancha de Vila Nova em uso é a de **tempo de retorno de 25 anos**, mas o gatilho é 30 mm em 24 h, valor que o próprio histórico mostra bem abaixo do p99 diário dos pluviômetros (47 a 68 mm/dia). A faixa acende muito mais vezes do que um evento de 25 anos.
2. **Itaum provavelmente é maré, não chuva.** A mancha está 100% dentro da de maré de 2,5 m, e a cota mediana dos trechos é igual à da zona de maré (2,0 m). Vila Nova, ao contrário, fica alta (mediana 8 m). Tratar Itaum como chuva a deixa vermelha em qualquer chuva de 30 mm.
3. **Os dados de PDDU já trazem graus que o app joga fora.** Vila Nova tem cenários de 5, 10, 25 e 50 anos; só o de 25 é usado. Dos 213 trechos de Vila Nova, 97 estão no cenário de 5 anos, 131 no de 10 e 213 no de 25.
4. **A cota não ajuda a graduar.** As ruas da zona de 1,6 m e da de 2,5 m têm cota mediana igual (2,0 m), com margem de ~1 m e referencial vertical não confirmado. Não usar cota para decidir quem alaga primeiro.

**Princípio que resolve (decidido 29/10/2026):** cada faixa deve acender com a frequência do cenário que ela representa. Uma faixa ligada a uma mancha de tempo de retorno **TR** deve acender, em média, ~1 vez a cada TR anos. Gatilho que acende o tempo todo é ruído, e ruído faz o cidadão parar de olhar.

## Regra de linguagem (interface, README e textos)

- Dizer **"risco de alagar"**. Nunca "rua alagada" / "alagado".
- Nunca "sem risco", "cidade segura", "zona segura". Fora da mancha **não** significa seguro.
- Dado indisponível **nunca** aparece como "normal".
- **Nunca rotular a ausência de faixa ativa como "NÍVEL NORMAL"** nem usar verde para ela. Usar "Nenhuma faixa ativa agora", em cor neutra.
- Não usar o termo "mancha" na interface; usar "áreas mapeadas pelo PDDU".

## Regra de UX (inviolável)

O uso principal é o **diagnóstico por endereço**: o cidadão informa a rua (ou usa o GPS) e recebe, em menos de 2 s, a situação dela, as ruas mapeadas ao redor (~300 m) e orientação preventiva. O mapa fica restrito a trajetos fixos pré-definidos, num painel recolhido (ver "Mapa de trajetos fixos no app (06/11/2026)" em "Decisões tomadas").

Ordem da tela: cabeçalho e avisos → cartão do nível do município e indicadores de chuva e maré → **aviso de atenção geral, se houver** → consulta individual (botão GPS, campo `#busca`, cartão `#resultado`) → lista geral recolhida → rodapé.

O cartão `#resultado` traz: situação da via (🔴 faixa ativa com o cenário, ⚪ nenhuma faixa ativa, ⚪ indisponível), orientação preventiva geral, até 4 ruas mapeadas num raio de ~300 m e rodapé de emergência (Defesa Civil 199, Bombeiros 193, "fora das áreas mapeadas também pode alagar", "este app não substitui a Defesa Civil"). Rua não encontrada: dizer que isso **não** significa ausência de risco.

**Novas regras da v3:**
- **Rua só fica vermelha por faixa de rua calibrada.** Chuva ou maré "forte" sem faixa de rua ativa aparece como **atenção geral** (faixa âmbar no topo), sem pintar nenhuma rua.
- **Dado antigo tem teto.** Passada a idade máxima (decidido: 120 min), todas as faixas viram `indisponivel` na tela, com o horário do último dado. "Nenhuma faixa ativa agora" nunca é mostrado com dado vencido.
- **Gradação só por cenário oficial.** A via mostra o **menor tempo de retorno** do cenário em que está (ex.: "aparece no cenário de cheia de 5 anos, o mais frequente"). Isso vem do PDDU, não é invenção.

**Integridade dos dados (o que o app não pode fazer):**
- Nunca simular severidade por proximidade, por cota estimada ou por palpite. Sem 🟡/🟢 por proximidade.
- Nunca sugerir rota ou direção "mais segura".
- O entorno só lista ruas das áreas mapeadas, e o cartão diz isso.
- A transparência sobre o que é mapeado pelo PDDU e o que está fora é obrigatória.

## Princípios (empate → vence a opção que apaga mais código)

1. **Custo zero.** GitHub Pages, Render gratuito. Nada pago.
2. **Uma fonte de verdade.** O back-end é o único lugar que decide o risco. O front só desenha.
3. **Offline-first.** Tudo no front falha com graça: mostra o último estado e o horário dele, respeitando o teto de idade.
4. **Apagar antes de adicionar.**
5. **Sem precisão inventada.** Estimativa não aparece como medida.
6. **Ativação calibrada por frequência (v3).** Todo gatilho de rua tem uma tabela de frequência histórica (quantos eventos por ano teria acendido) e um tempo de retorno de referência. Sem a tabela, o gatilho é provisório e não pinta ruas.
7. **Sem IA generativa no caminho do alerta (v3).** O texto do alerta é fixo, revisável e testado.

## O que NÃO fazer

- Nada pago (infra, APIs, tiles, serviços).
- Nenhuma regra de risco no front.
- Nenhum "normal" quando não há dado válido.
- Nenhuma chave de API no navegador.
- **Não chamar LLM em tempo de execução** (Mistral removido; ver decisão de 29/10/2026).
- **Não usar cota para graduar ruas** enquanto o referencial vertical não estiver confirmado e a margem for ~1 m.
- **Não ativar faixa de rua sem tabela de frequência histórica** (princípio 6).
- Não tratar maré estimada como medida; não rodar o pipeline de ruas em produção.
- Não colocar no caminho servido ao app os arquivos brutos do PDDU nem GeoJSON com mais de 5 casas decimais ou atributos sem uso.
- Não importar biblioteca geoespacial no front só para ponto-em-polígono.
- Não copiar código do repositório joinville_meteo (sem licença); reimplementar. Dados brutos dele não entram no repo.

## Arquitetura-alvo (v3)

```
Open-Meteo (chuva 24 h) ─┐
CIRAM/Epagri (maré)     ─┴─► Back-end (FastAPI, Render) ─► /api/v1/status-geral ─┐
                              motor v3 + textos fixos                            ▼
PDDU × OpenStreetMap ─► pipeline offline ─► data/*.geojson ─► Front (PWA, GitHub Pages)
```

- **Back-end:** a cada 15 min coleta chuva e maré, avalia as faixas de rua e os avisos gerais, e monta o `texto` por tabela fixa (`textos.py`). Cache em RAM com `gerado_em`. A coleta inicial roda **em segundo plano**; com cache vazio o endpoint responde `indisponivel`.
- **Faixas de rua (v3).** Cada faixa = um cenário oficial do PDDU + um gatilho calibrado:

| Faixa | Cenário PDDU | TR de referência | Gatilho | Situação |
|---|---|---|---|---|
| `mare_1_6` | mancha de maré 1,6 m | ~2 anos (a confirmar) | maré efetiva ≥ valor calibrado | provisório: 1,60 m |
| `mare_2_5` | mancha de maré 2,5 m (sem a de 1,6) | ~10 anos (a confirmar) | idem | provisório: 2,53 m |
| `pluvial_vn_tr5` | Vila Nova, Atual, 5 anos | 5 anos | chuva 24 h ≥ 98 mm (Open-Meteo, Gumbel) | calibrado 01/11/2026 |
| `pluvial_vn_tr10` | Vila Nova, Atual, 10 anos | 10 anos | chuva 24 h ≥ 110 mm | calibrado; **extrapolação** (série de 8,7 anos) |
| `pluvial_vn_tr25` | Vila Nova, Atual, 25 anos | 25 anos | chuva 24 h ≥ 125 mm | calibrado; **extrapolação** (série de 8,7 anos) |
| _Itaum_ | mancha de Itaum | — | — | **tratada como maré** (7.2, 01/11/2026): os trechos ficam em `mare_1_6`/`mare_2_5`; não há faixa `pluvial_itaum` |

  Faixas aninhadas: cada trecho carrega a faixa de **menor TR** que o contém. Os cenários de Vila Nova não são perfeitamente aninhados (14% da área de 5 anos fica fora da de 10), então o pipeline atribui por "menor TR que contém o trecho", não por diferença de áreas.
- **Avisos gerais (sem pintar ruas):** `atencao_geral.chuva` liga com chuva de 24 h ≥ 53 mm (≈ 3 eventos por ano na Open-Meteo); `atencao_geral.mare` é `null` até a tarefa 6.5 (sem gatilho). Aninhamento: TR 25 ativa implica TR 10 e TR 5, porque os limiares são crescentes (98 < 110 < 125); o motor não tem regra à parte.
- **Nível global** = pior entre faixas de rua ativas; sem faixa de rua ativa, `atencao_geral` se houver aviso geral; senão `nenhum`; `indisponivel` só se nada tem dado.
- **Pipeline offline:** shapefiles do PDDU (SIRGAS 2000 UTM 22S) × ruas do OSM → `data/ruas_risco.geojson` com a faixa de menor TR por trecho; `cotas_ruas.py` acrescenta altitude só como informação.
- **Front (PWA no GitHub Pages):** diagnóstico por endereço, aviso geral, lista geral recolhida. Service Worker cache-first. GPS testado contra as manchas (`pip.js`).

### Contrato da API — `/api/v1/status-geral` (v3, decidido; nomes dos níveis provisórios)

| Campo | Conteúdo |
|---|---|
| `status` | `ok` ou `indisponivel` |
| `gerado_em`, `validade_min` | horário do cálculo e validade (30 min) |
| `idade_max_min` | **planejado, ainda não devolvido pela API**: o front usa a constante `IDADE_MAX_MIN = 120` |
| `mare_efetiva_m`, `mare_origem` | maré usada e se é `medida` ou `estimativa` |
| `chuva_24h_mm` | chuva acumulada (Open-Meteo) |
| `faixas` | estado de cada faixa de rua (`mare_1_6`, `mare_2_5`, `pluvial_vn_tr5`, `pluvial_vn_tr10`, `pluvial_vn_tr25`): `ativa`, `inativa`, `indisponivel`; cache vazio devolve `{}` |
| `atencao_geral` | `{ chuva: bool\|null, mare: bool\|null }`; não pinta ruas |
| `nivel` | `nenhum`, `atencao_geral`, `atencao`, `alto`, `indisponivel` (nomes provisórios) |
| `texto` | `{ titulo, mensagem }` por tabela fixa |

## Situação por etapa

| Etapa | Situação |
|---|---|
| 0 — Validar as fontes | Concluída em 08/10/2026, **mas as decisões não foram registradas** (0.7, 0.8 abertas). |
| 1 — Motor único no back-end | Concluída. |
| 2 — Pipeline ruas × manchas | Concluída, exceto 2.1b (script que gera `data/geojson/` dos brutos). |
| 3 — Front | Concluída para a entrega v2; desempenho em celular real sem números (3.6). |
| 4 — Limpeza e README | Concluída em 23/10/2026. |
| **5 — App usável já** | A fazer: remover Mistral, startup não bloqueante, selo neutro, teto de idade, tirar o mock, ícones, chuva como aviso geral. |
| **6 — Medir antes de calibrar** | A fazer: tabelas de frequência de chuva e maré, viés Open-Meteo × pluviômetros, histórico ao vivo. |
| **7 — Modelo v3 (faixas por TR)** | Bloqueada por 6. |
| **8 — Front v3** | 8.1 a 8.6 concluídas em 01/11/2026; falta 8.7 (tempos no celular do autor). |
| **9 — Operação e qualidade** | CI, dependências fixas, testes do front, ciclo de revisão com eventos reais. |

## Dados geográficos (`data/geojson/`)

O app só carrega arquivos **já simplificados** (WGS84, `FeatureCollection` de `MultiPolygon`, no máximo 5 casas decimais, só os atributos usados, geometrias válidas). Os brutos do PDDU ficam fora da pasta servida. Orçamento: manchas + ruas ≈ 375 KB comprimidos.

| Arquivo | Conteúdo | Atributos |
|---|---|---|
| `mare_cachoeira_1_6m.geojson` | mancha da maré de 1,6 m | `id` |
| `mare_cachoeira_2_5m.geojson` | mancha da maré de 2,5 m | `id` |
| `inundacao_vila_nova.geojson` | 8 polígonos: tempo de retorno (5, 10, 25, 50) × `Atual`/`Futuro` | `tempretor`, `status_1` |
| `inundacao_itaum.geojson` | mancha de Itaum | `id` |

Estes arquivos vieram de um script de uso único **ainda não versionado** (tarefa 2.1b); a v3 exige versioná-lo, pois os cenários de 5 e 10 anos passam a ser usados.

## Decisões em aberto

| Decisão | Recomendação | Etapa |
|---|---|---|
| Fonte e referencial da maré (0.8, D2) | Registrar papel de CIRAM, MohidSC e Iate Clube; confirmar se CIRAM "Joinville" e Iate Clube são o mesmo sensor | 6 |
| Pluviômetro de referência | Escolher na Etapa 6 com a tabela em mãos (os alvos de frequência já estão decididos, ver abaixo) | 6 |
| Itaum: maré ou chuva? | Padrão decidido: maré. Falta só conferir na cartilha | 7 |
| Nomes dos níveis | Provisórios: `nenhum`, `atencao_geral`, `atencao`, `alto` | 7 |
| Camada de alagamento confirmado / push | Fora desta entrega | Futuro |

## Decisões tomadas

| Decisão | Valor | Data |
|---|---|---|
| Cenário de Vila Nova (v2) | `Atual`, 25 anos. "Futuro" não é "com obras" (mancha maior). **v3 passa a usar 5, 10 e 25 anos (Atual)**; 50 anos fica fora por ser quase igual ao de 25 (212 de 213 trechos). | 08/10/2026; v3: decidido 29/10/2026 |
| Cenário de Itaum | Mantido como `pluvial_itaum` na v2; **v3: tratado como maré (7.2)** (100% dentro da mancha de 2,5 m; cota mediana igual à da maré). | 08/10/2026 |
| Uso do conjunto joinville_meteo | CC BY 4.0 com atribuição, segundo o autor; termos da SEPROT a confirmar por e-mail | 23/10/2026 |
| Trecho em mais de uma faixa | v2: pior faixa ativa. **v3: faixa de menor TR que contém o trecho** | 12/10/2026; v3: decidido 29/10/2026 |
| Agrupamento da lista | Por faixa/área, sem bairro | 12/10/2026 |
| Mapa Leaflet | Fora da interface e do cache; a página de auditoria `teste/camadas.html` existiu no repositório antigo e não foi migrada | 12/10/2026 |
| Interface principal | Diagnóstico por endereço + entorno ~300 m; lista geral recolhida | 23/10/2026 |
| Rótulos das faixas de maré | "Maré — Bacia do Cachoeira / Cotas Intermediárias (1,6m)" e "Maré — Calha Baixa do Cachoeira e Estuário (2,5m)" (termos a conferir na cartilha) | 16/10/2026 |
| Só a faixa ativa marca a rua; sem verde nem amarelo por proximidade | Mantido | 16/10/2026 |
| **Remover o Mistral** | Texto por tabela fixa em `textos.py`. Motivo: o conjunto de textos é finito (nível × faixas ativas), a IA só reescreve esse texto, adiciona dependência, latência na coleta e um risco de texto não revisado num aviso público. Não é questão de dinheiro (o plano é gratuito), é complexidade e risco. | decidido 29/10/2026 |
| **Teto de idade do dado** | 120 min; passado isso, tudo vira `indisponivel` na tela | 29/10/2026 |
| **Chuva interina** | _Encerrada em 01/11/2026 (7.3)_: as faixas de chuva de Vila Nova voltam a pintar ruas, agora com limiares calibrados (abaixo). O interino era 30 mm como aviso geral | 29/10/2026 |
| **Limiares de chuva (7.3)** | Referência: Open-Meteo (fonte de produção; o viés já está embutido). Aviso geral `atencao_geral.chuva` = **53 mm/24 h** (≈ 3 por ano). Faixas de rua por Gumbel: **TR 5 = 98 mm, TR 10 = 110 mm, TR 25 = 125 mm**; TR 10 e TR 25 são extrapolação (IC 95%: 81–142 e 88–167 mm). Maré: `atencao_geral.mare` = `null` até a 6.5; gatilhos `mare_1_6` = 1,60 m e `mare_2_5` = 2,53 m seguem provisórios. Fonte: `data/derivados/ativacoes.md`. Teste de frequência: `pytest -m dados` | 01/11/2026 |
| **TR 25 validada por plausibilidade** | TR 25 (125 mm) validado apenas por plausibilidade de Poisson, porque a série tem 8,7 anos e não tem eventos suficientes para ±50%. Reavaliar com mais anos de dado. | 01/11/2026 |
| **Alvos de frequência** | Faixa de rua ≈ 1/TR eventos por ano (TR 5 → 0,2; TR 10 → 0,1; TR 25 → 0,04); aviso geral entre 3 e 10 vezes por ano. Ajustáveis depois de ver a tabela da Etapa 6 | 29/10/2026 |
| **Itaum** | Tratar como maré (padrão); conferir na cartilha. **Aplicado em 01/11/2026 (7.2):** `pluvial_itaum` saiu do pipeline; os trechos ficam em `mare_1_6`/`mare_2_5`. Evidência medida: 100,0% da área de Itaum (3,97 km²) está dentro das manchas de maré; cota mediana dos trechos 2,0 m, igual à da maré (Vila Nova: 8 m). Cartilha **não conferida** (sem acesso a ela nesta sessão); reverter só se disser que é chuva | 29/10/2026; aplicado 01/11/2026 |
| **Render acordado** | Usar ping gratuito a cada ~10 min (tarefa 9.3) e documentar o comportamento sem ele | 29/10/2026 |
| **Mapa de trajetos fixos no app** | Mapa de trajetos fixos no app (06/11/2026): substitui 'sem mapa na interface' (12/10/2026). Trajetos pré-definidos, sem destino livre; back-end classifica os trechos; front só desenha; métrica de exposição, não de segurança. | 06/11/2026 |
| Fonte da maré, referencial vertical, significado de 1,6 m, limiar pluvial | _a preencher (0.7); a Etapa 6 fornece os números_ | |

## Dados de terceiros (joinville_meteo)

- **Conjunto:** "Joinville hydrometeorological dataset: station master series SEPROT / Defesa Civil de Joinville", J. C. Dos Santos-Silva (UDESC). DOI `10.5281/zenodo.21682712`, versão `data-2026-07-29`, 169,5 MB (md5 `b918fc969e6ddc61b0549bd2ef56dba8`). Licença CC BY 4.0, uso permitido com atribuição segundo o autor; termos da SEPROT ainda a confirmar.
- **Citação:** DOI do Zenodo e SEPROT / Defesa Civil de Joinville. Não usamos o WRF do INPE.
- **Código dela:** sem licença; reimplementar. **Dados brutos ficam fora do git**; só constantes, relatórios de método e a citação.
- **Achados de qualidade (23/10/2026):** Iate Clube fica travado em 2,5 m por ~13,8 mil horas (2022, 2023, 2025); último nível válido: Iate Clube 30/04/2025, Flotflux 02/06/2024, Bucarein 23/10/2021; há valores absurdos que exigem controle de qualidade. Chuva diária p99: 55 mm (Iate Clube), 68 mm (Flotflux), 47 mm (Bucarein); máximos de 120 a 142 mm/dia.
- **Aviso:** o zero da régua de cada estação é diferente do referencial do PDDU.

## Riscos conhecidos

- Manchas cobrem só cenários modelados; a cartilha é de 2011 e não reflete obras.
- **Gatilhos de maré ainda provisórios** e referencial vertical não confirmado; a calibração por frequência (Etapa 6) contorna parte do problema, mas não substitui a confirmação.
- Open-Meteo estima chuva em grade, não mede no pluviômetro; pode haver viés (tarefa 6.2). Já estourou o limite diário no Render.
- A maré vem de um endpoint do CIRAM sem autorização formal de uso em produção, sem fonte reserva.
- Render gratuito hiberna; a primeira resposta é lenta e o front mostra o cache enquanto espera.
- Ruas sem nome no OSM (94 trechos, 4,4 km) não aparecem em buscas; 9 nomes de rua têm trechos separados por mais de 500 m e são tratados como uma rua só.
- O entorno mede vértice a vértice e perde ~1,7% dos pares realmente a ≤ 300 m (inclusive ruas que se cruzam).

## Documentos relacionados

- Doc 1 — Arquitetura e Planejamento (base original).
- Doc 2 — Dados do joinville_meteo e maré do Iate Clube (alimenta a Etapa 6).
- `data/derivados/mare_qc_relatorio.md` — QC das séries.

## Como trabalhar neste repo

- Seguir `task.md` na ordem; uma tarefa por critério de "pronto".
- Antes de adicionar algo, perguntar se o requisito existe e se dá para apagar.
- Mudança de comportamento do risco exige caso novo na tabela de testes do motor.
- Mudança de gatilho exige atualizar a tabela de frequência em `data/derivados/` e citá-la em `config.py`.
- Atualizar "Decisões tomadas" a cada decisão fechada. Tarefas marcadas ⚖️ pedem confirmação do autor antes de implementar.
