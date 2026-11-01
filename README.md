# Joinville Alerta

Lista de **risco de alagar por rua** em Joinville/SC, gratuita e que funciona offline. Mostra ao cidadão em quais ruas a água pode subir com a maré e a chuva de agora, ordenadas do pior para o melhor.

Projeto acadêmico e comunitário do curso de Engenharia de Software da UNIVILLE. Custo de infraestrutura: R$ 0,00.

> **O que este app não é.** Ele **infere** risco a partir de maré e chuva; não observa nada na rua e não confirma alagamento. **Fora das áreas mapeadas pelo PDDU também pode alagar.** Em emergência, ligue **199 (Defesa Civil)**. Este app não substitui a Defesa Civil.

## Como funciona

```
Open-Meteo (chuva) ─┐
CIRAM/Epagri (maré) ┴─► Back-end (FastAPI, Render) ──► /api/v1/status-geral ──┐
                         decide o estado de cada faixa                          ▼
PDDU × OpenStreetMap ──► pipeline offline ──► data/*.geojson ──► Front (PWA, GitHub Pages)
                         (computador do autor)                    lista viva "pior primeiro"
```

- **Back-end (`backend/`):** a cada 15 minutos coleta a chuva acumulada em 24 h e a maré, e avalia cinco **faixas de rua**: `mare_1_6`, `mare_2_5` (Itaum fica aqui, tratado como maré), `pluvial_vn_tr5`, `pluvial_vn_tr10` e `pluvial_vn_tr25` (chuva de 24 h ≥ 98, 110 e 125 mm). Cada faixa fica `ativa`, `inativa` ou `indisponivel`. Além delas, `atencao_geral.chuva` liga com 53 mm e **não pinta ruas** (`atencao_geral.mare` é `null`, sem gatilho ainda). O nível global é a pior faixa ativa; sem faixa ativa, `atencao_geral` se houver aviso; senão `nenhum`. O resultado fica em cache na memória, com o horário (`gerado_em`). **É o único lugar que decide o risco.**
- **Texto de alerta:** vem de uma tabela fixa (`backend/textos.py`), escolhida pelo nível e pelas faixas ativas já calculados. É revisável e testado; não há IA nem chave de API no caminho do alerta.
- **Pipeline offline (`scripts/process_geojson.py`):** cruza as manchas do PDDU (SIRGAS 2000 / UTM 22S, convertidas para WGS84) com as ruas do OpenStreetMap e grava `data/ruas_risco.geojson`, em que cada trecho carrega as faixas em que está. Roda no computador do autor, nunca em produção.
- **Front (`index.html`, `app.js`, `style.css`, `sw.js`):** PWA estático. Monta a lista com o estado das faixas vindo da API e com o GeoJSON de ruas. Só ordena e desenha; não calcula risco. A tela principal é o diagnóstico por endereço ou GPS: situação da rua, o menor tempo de retorno do cenário do PDDU em que ela está, e as ruas mapeadas num raio de ~300 m. Com chuva ou maré fortes mas sem faixa de rua ativa, aparece só um aviso geral (faixa âmbar), sem pintar ruas. O botão de localização testa o ponto do GPS contra as áreas mapeadas (`pip.js`, sem biblioteca geoespacial). Não há mapa na interface.
- **Offline:** o Service Worker responde do cache e atualiza em segundo plano. Sem rede, o app mostra o último estado salvo com o horário dele e avisa quando o dado passou da validade (30 min). **Teto de idade:** passadas 2 h (`IDADE_MAX_MIN = 120` em `idade.js`), todas as faixas viram `indisponivel` na tela, com o horário do último dado. "Nenhuma faixa ativa agora" nunca aparece com dado vencido.

## Faixas por tempo de retorno (modelo v3)

Cada faixa de rua é um cenário oficial do PDDU mais um gatilho calibrado pela frequência com que ele acenderia no histórico (`data/derivados/ativacoes.md`). A faixa de chuva deve acender, em média, uma vez a cada TR anos. Cada trecho de rua carrega a faixa de **menor TR** que o contém.

| Faixa | Cenário PDDU | Gatilho | Situação |
|---|---|---|---|
| `mare_1_6` | maré 1,6 m | maré ≥ 1,60 m | provisório |
| `mare_2_5` | maré 2,5 m (inclui Itaum) | maré ≥ 2,53 m | provisório |
| `pluvial_vn_tr5` | Vila Nova, Atual, 5 anos | chuva 24 h ≥ 98 mm | calibrado |
| `pluvial_vn_tr10` | Vila Nova, Atual, 10 anos | chuva 24 h ≥ 110 mm | calibrado; extrapolação (série de 8,7 anos) |
| `pluvial_vn_tr25` | Vila Nova, Atual, 25 anos | chuva 24 h ≥ 125 mm | calibrado; extrapolação (série de 8,7 anos) |

O aviso geral de chuva (`atencao_geral.chuva`, ≥ 53 mm em 24 h) não pinta ruas. Não usamos cota para graduar ruas.

## Estados e linguagem

Cada faixa aparece como **ativa** (risco de alagar agora), **inativa** ("Nenhuma faixa ativa agora"), **indisponível** (sem dado válido) ou com **dado antigo**. Dado ausente nunca vira "nenhum", e "nenhuma faixa ativa" não significa "sem risco".

## Fontes de dados e licenças

| Dado | Fonte | Observação |
|---|---|---|
| Áreas mapeadas pelo PDDU | PDDU de Joinville (cartilha de 2011) | Só cenários modelados; não reflete obras recentes |
| Ruas | © colaboradores do [OpenStreetMap](https://www.openstreetmap.org/copyright), licença ODbL | Via Overpass |
| Chuva | [Open-Meteo](https://open-meteo.com) | Uso não comercial; o limite diário de requisições já foi atingido no Render |
| Maré | Marégrafo CIRAM/Epagri (medida) e previsão MohidSC (estimativa) | O rótulo do front diz se é medida ou estimativa. Uso em produção ainda depende de autorização |

## Limites conhecidos

- **Modelo oficial × estimativa:** as áreas mapeadas são o modelo oficial do PDDU. A maré e a chuva usadas para ativar cada faixa são medições ou estimativas externas, e os gatilhos precisam ser revisados com eventos reais (plano em `docs/eventos.md`). Os de chuva foram calibrados com 8,7 anos de dados, e os de TR 10 e TR 25 são extrapolação. Os de maré (1,60 m e 2,53 m) ainda são provisórios.
- **Referencial vertical:** o zero da régua do marégrafo pode diferir do referencial do PDDU. Isso ainda precisa ser confirmado.
- **Itaum:** tratada como maré, porque a área mapeada está 100% dentro da de maré de 2,5 m. Falta conferir na cartilha do PDDU.
- **Fora das áreas mapeadas pelo PDDU:** falhas de drenagem e chuva local continuam possíveis em qualquer rua.
- **Cota por rua:** não há. A granularidade é o trecho dentro de uma área mapeada.
- **Render gratuito:** hiberna, e a primeira resposta pode demorar. O app mostra o cache enquanto espera. Para evitar a partida a frio, há um passo a passo de ping gratuito em `docs/operacao.md`; sem ele, o comportamento é o descrito acima.

## Como rodar

**Back-end**

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
pip install -r requirements-dev.txt && python -m pytest tests   # tabela de testes do motor
```

Python **3.12.10** (arquivo `.python-version`). A variável opcional `ALLOWED_ORIGIN` define a origem do front liberada no CORS.

**Front:** sirva a pasta raiz por HTTP (por exemplo, `python -m http.server`) e abra `index.html`. O Service Worker exige HTTPS ou localhost. A URL da API fica no topo do `app.js`.

**Testes do front** (Node 22 ou mais novo, sem dependências): `node --test "teste/*.test.js"`.

**Validar os dados servidos ao app** (só biblioteca padrão): `python scripts/validar_dados.py` confere que todo GeoJSON/JSON é válido, tem no máximo 5 casas decimais e que os arquivos do Service Worker existem.

**Testes com a série histórica local** (só no computador do autor, precisam de `data/raw/open_meteo`): `python -m pytest -m dados tests`.

### CI

`.github/workflows/ci.yml` roda a cada push e pull request: `pytest` do back-end (sem o marcador `dados`), `node --test` do front e `validar_dados.py`. O CI não faz deploy; o front sai pelo GitHub Pages e o back-end pelo Render.

### Dependências

`backend/requirements.txt` e `backend/requirements-dev.txt` têm **versões exatas**, incluindo as indiretas, e o Python é fixado em `.python-version`. Para atualizar:

1. Em um ambiente virtual novo, instale só as dependências diretas (`fastapi`, `uvicorn`, `httpx`, `apscheduler`, e `pytest` no de desenvolvimento) nas versões desejadas.
2. Rode `pip freeze` e copie as versões para os dois arquivos (as indiretas ficam sob "Dependências indiretas").
3. Rode `python -m pytest tests` em `backend/` e confira que o CI passa antes de publicar.
4. Para mudar o Python, edite `.python-version` e, se o Render usar a variável `PYTHON_VERSION`, o mesmo valor lá.

### Operação (ações manuais)

O ping que mantém o Render acordado e o pedido de autorização ao CIRAM/Epagri não rodam sozinhos: o passo a passo e o texto do e-mail estão em `docs/operacao.md`.

**Regerar `data/ruas_risco.geojson`** (computador do autor; precisa de `scripts/requirements.txt`, dos shapefiles do PDDU em `data/raw/pddu/` e de internet para o Overpass):

```bash
pip install -r scripts/requirements.txt
python scripts/process_geojson.py inspecionar   # campos e CRS dos shapefiles
python scripts/process_geojson.py baixar        # ruas do OpenStreetMap
python scripts/process_geojson.py cruzar        # faixas e filtros por cenário ficam no topo do script
python scripts/cotas_ruas.py                    # acrescenta a altitude, só como informação
```

Os arquivos de `data/geojson/` (as quatro manchas já simplificadas, WGS84, 5 casas decimais) foram gerados por um script de uso único que ainda não está versionado. Os arquivos brutos do PDDU não vão para o repositório nem para a pasta servida.

## Estrutura

```
backend/   API, motor de risco, textos fixos, coleta, cache e testes
data/      áreas mapeadas e ruas por faixa (servidos ao app); data/derivados/ tem as tabelas de frequência
scripts/   pipeline offline, medições de frequência e validação dos dados
docs/      notas das fases, operação (ping do Render, e-mail ao CIRAM) e registro de eventos
teste/     testes do front (node --test)
.github/   CI
```

Planejamento e decisões: `CLAUDE.md` e `task.md`.

## Créditos

Equipe do Projeto de Vivências, Engenharia de Software, UNIVILLE.
