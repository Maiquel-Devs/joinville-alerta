# Nota: protótipo × `gerar_trajetos.py` (06/11/2026)

**Pergunta:** o protótipo deu 5,20 km para Centro → Boa Vista; o gerador deu 3,99 km. Por quê?

**Causa:** os pontos de origem e destino eram diferentes. Os 5,20 km vieram dos pontos de exemplo que o protótipo usava antes
(`-26,3040 / -48,8460` → `-26,3020 / -48,8100`), não dos pontos reais (Praça Nereu Ramos → Bairro Boa Vista) que o gerador usa.
Com os mesmos pontos, o mesmo grafo e o mesmo `data/ruas_risco.geojson`, o código do protótipo e o gerador dão o mesmo resultado.

**Conferido** (reexecutando o código do protótipo da branch `prototipo-rota` com os dois conjuntos de pontos):

- Grafo: `cache/grafo.graphml` e `prototipo-rota/cache/grafo.graphml` são o mesmo arquivo (md5 `c5c546ec9b4df91673402d4e0115ab08`).
  `data/ruas_risco.geojson` é idêntico nas duas branches.
- Caminho: mesmos nós de origem e destino, mesmo caminho (56 nós em Centro → Boa Vista, 22 nós em Rodoviária → Mueller), `weight="length"` nos dois.
- Cruzamento: mesma regra (15 m, fatias de 5 m, mesmo `osm`). Nenhum ajuste foi feito para fechar números.

| Trajeto / pontos | Cenário | Total (km) | Faixa ativa | Área sem faixa ativa | Não avaliado |
|---|---|--:|--:|--:|--:|
| Centro → Boa Vista, pontos de exemplo antigos (protótipo) | seco / chuva TR 10 | 5,203 | 0,000 | 3,039 | 2,162 |
| Centro → Boa Vista, pontos de exemplo antigos (protótipo) | maré 1,70 m | 5,203 | 0,979 | 2,060 | 2,162 |
| **Centro → Boa Vista, pontos reais, protótipo** | seco / chuva TR 10 | 3,992 (3,996 pelas arestas) | 0,000 | 1,414 | 2,578 |
| **Centro → Boa Vista, pontos reais, gerador** | seco / chuva TR 10 | 3,992 | 0,000 | 1,414 | 2,578 |
| Centro → Boa Vista, pontos reais, protótipo | maré 1,70 m | 3,992 | 0,093 | 1,321 | 2,578 |
| Centro → Boa Vista, pontos reais, gerador | maré 1,70 m | 3,992 | 0,094 | 1,320 | 2,578 |
| Rodoviária → Mueller, protótipo e gerador | qualquer | 2,752 (2,754 pelas arestas) | 0,000 | 0,000 | 2,752 |

**Diferenças pequenas que sobram (não são erro de cruzamento):**

- Total 3,996 × 3,992 km (0,1%): o total do protótipo vem do atributo `length` das arestas do OSM; as classes (e o gerador) somam as
  cordas das fatias de 5 m, que são um pouco mais curtas que a curva. A soma das classes fecha com a soma das fatias, não com o `length`.
- Corridas de trecho com a mesma classe: mesma sequência de classes nos dois; a maior diferença por corrida é 0,6 m, do arredondamento do `m` (metros inteiros) no gerador.
- Maré 1,70 m: 0,093 × 0,094 km em faixa ativa, mesmo motivo.
