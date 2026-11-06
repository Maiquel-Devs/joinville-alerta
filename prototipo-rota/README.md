# Protótipo: mapa de trajeto antes da viagem

## O que é

Protótipo acadêmico que desenha, num mapa, um trajeto entre dois pontos de Joinville e mostra quanto dele passa pelas áreas mapeadas pelo PDDU, usando os dados já existentes do projeto (`data/ruas_risco.geojson`). **Não faz parte do app publicado** e não altera nada fora desta pasta.

## O que a métrica mede

**Exposição**: quantos km do trajeto ficam em cada uma destas três classes, em cada cenário (seco, maré 1,70 m, chuva TR 10 com 115 mm):

| Classe | Cor no mapa |
|---|---|
| Faixa ativa no cenário | vermelho |
| Área mapeada pelo PDDU, sem faixa ativa | amarelo |
| Fora das áreas mapeadas: não avaliado | cinza tracejado |

Não é uma medida de proteção nem uma recomendação. O caminho é sempre o **mais curto por distância** (`networkx.shortest_path`, `weight="length"`). Nenhum critério de risco entra na escolha. As faixas só são cruzadas com o caminho depois que ele já foi escolhido.

## Limitações

- Fora das áreas mapeadas, o trecho é "não avaliado" e **não conta como zero**.
- Os gatilhos de maré (1,60 m e 2,53 m) e os limiares de chuva são provisórios.
- Os cenários de chuva de 10 e 25 anos são extrapolação de uma série de 8,7 anos.
- O mapeamento vem do PDDU, cuja cartilha é de 2011 e não reflete obras posteriores.
- 19 trechos (0,8 km) não encontraram way correspondente no grafo dirigível. Alguns pedaços do trajeto que passam a até 15 m de trechos de outras ruas (em geral, nos cruzamentos) não foram contados como mapeados.
- Altitude e maré não são comparáveis entre si, porque o referencial vertical não está confirmado.

## Como reproduzir

Na raiz do repositório (Windows):

```
python -m venv prototipo-rota/.venv
prototipo-rota/.venv/Scripts/python -m pip install -r prototipo-rota/requirements.txt
prototipo-rota/.venv/Scripts/python prototipo-rota/gerar_grafo.py
prototipo-rota/.venv/Scripts/python prototipo-rota/mapa.py
```

`gerar_grafo.py` baixa a rede do OpenStreetMap uma vez, para `cache/grafo.graphml` (fora do git). `mapa.py` gera `saida/mapa_<viagem>_<cenario>.html` e confere que a soma dos três km bate com o total (tolerância de 1%). As viagens ficam em `viagens.json`.

## Aviso

Protótipo acadêmico. **Não substitui a Defesa Civil (199).** Não faz parte do app publicado.
