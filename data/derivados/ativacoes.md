# Ativações: quantas vezes por ano cada gatilho acenderia (derivado)

Gerado por `scripts/consolidar_ativacoes.py` (tarefa 6.7) a partir de `frequencia_chuva.json`, `vies_open_meteo.json` e `frequencia_mare.json`. **Nenhum gatilho foi alterado.** Este relatório é a base da escolha de alvos (tarefa 6.3, decisão do autor).

**Fonte das estações:** Dos Santos-Silva, J. C. (2026). Joinville hydrometeorological dataset (SEPROT / Defesa Civil de Joinville). Zenodo, versão data-2026-07-29, DOI 10.5281/zenodo.21682712. CC BY 4.0. Termos da SEPROT ainda sem confirmação formal. Open-Meteo: Historical Forecast API, CC BY 4.0.

**Limites desta etapa:** a tarefa 6.6 (histórico ao vivo) ainda não existe, então só há o histórico das estações e da Open-Meteo, **sem registro ao vivo do app**. A série das estações tem 5 a 12 anos válidos; taxas abaixo de ~1 evento por 10 anos e o nível de 25 anos são extrapolação.

## Resposta curta: com os limiares de hoje, quantas vezes por ano o app ficaria vermelho?

- **Chuva ≥ 30 mm em 24 h:** acenderia **13,0 vezes por ano** com a Open-Meteo (a fonte de produção) e 13,8 a 19,7 vezes por ano segundo os sensores (Iate Clube 15,0; Flotflux 19,7; Águas 13,8). Isso é de 1 a 2 eventos por mês. Um evento de 25 anos deveria acender 0,04 vez por ano: o limiar atual acende **cerca de 300 a 500 vezes mais**. Desde a tarefa 5.7 a chuva **não pinta ruas**: vira aviso geral (âmbar). Antes da 5.7 seria vermelho nessa frequência.
- **Maré ≥ 1.60 m (`mare_1_6`):** na régua do Iate Clube (regime A, 2011–2016, 5,2 anos) a régua passou de 1,60 m em **1,5 episódios por ano**; de 2,53 m, em **0,0 por ano** (nunca na série confiável). **Isto não é a frequência do gatilho de produção:** o gatilho usa a 'maré efetiva' do CIRAM em outro referencial, e a relação entre as duas réguas ainda não foi medida (tarefa 6.5). Veja a seção de maré para a leitura com a hipótese 'nível acima da mediana'.

## Chuva (faixas `pluvial_vn_tr5`, `pluvial_vn_tr10`, `pluvial_vn_tr25` e aviso geral `chuva_forte`)

### Eventos por ano acima de cada limiar de chuva de 24 h

Evento = trecho com a chuva de 24 h acima do limiar, fundidos quando separados por menos de 24 h. Linha **em destaque** = limiar atual.

| Limiar (mm) | Iate Clube | Flotflux | Águas de Joinville | Open-Meteo 2018–2026 (produção) |
|--:|--:|--:|--:|--:|
| 20 | 23.22 | 29.26 | 18.88 | 25.22 |
| **30 (atual)** | 14.96 | 19.72 | 13.78 | 13.01 |
| 40 | 9.41 | 12.82 | 8.12 | 7.37 |
| 50 | 5.65 | 8.79 | 5.10 | 3.57 |
| 60 | 3.77 | 5.83 | 3.02 | 2.07 |
| 80 | 2.20 | 3.12 | 1.32 | 0.69 |
| 100 | 0.84 | 1.73 | 0.57 | 0.12 |

Anos de dados válidos por fonte: Iate Clube: 9.56; Flotflux: 12.17; Águas de Joinville: 5.3; Open-Meteo 2018–2026 (produção): 8.68.

### O que os alvos pedem

Limiar de chuva de 24 h (mm) que produziria a taxa-alvo, **lido da própria curva de cada fonte** (menor limiar inteiro com taxa ≤ alvo). Para a Open-Meteo isso já embute o viés dela; é o número que valeria para o gatilho de produção. Entre parênteses, o nível de retorno por Gumbel (IC 95% por bootstrap), quando a fonte tem anos suficientes. **\*** = alvo mais raro que 1 evento por série inteira, ou limiar acima do maior valor observado: **extrapolação**.

| Alvo (eventos/ano) | Iate Clube | Flotflux | Águas de Joinville | Open-Meteo 2018–2026 (produção) |
|--|--|--|--|--|
| Aviso geral, mais frequente: 10/ano | 38 | 47 | 38 | 34 |
| Aviso geral, menos frequente: 3/ano | 64 | 82 | 62 | 53 |
| Faixa TR 5 (0.2/ano) | 144 (Gumbel 122.9; IC 101.0–137.0) | 152 (Gumbel 146.3; IC 117.6–169.1) | 118 | 99 (Gumbel 97.8; IC 75.8–123.7) |
| Faixa TR 10 (0.1/ano) | 194* (Gumbel 138.7; IC 108.4–155.9) | 156 (Gumbel 166.5; IC 130.9–193.4) | 138* | 143* (Gumbel 110.0; IC 81.2–142.4) |
| Faixa TR 25 (0.04/ano) | 194* (Gumbel 158.6; IC 115.2–181.0) | 172* (Gumbel 191.9; IC 147.1–224.7) | 138* | 143* (Gumbel 125.4; IC 87.5–166.9) |

O limiar de hoje é 30 mm e acende 13,0 vezes por ano na Open-Meteo, **acima do teto de 10/ano** do alvo de aviso geral. Pela curva da Open-Meteo, 10/ano corresponde a ~34 mm e 3/ano a ~53 mm.

Leitura do viés (de `vies_open_meteo.md`): nos limiares altos a Open-Meteo **subestima** a estação (p99 da chuva de 24 h entre 0,59 e 0,85 da estação; ela encontra menos da metade dos eventos de 30 mm das estações). Portanto, um limiar que dê a taxa certa **na Open-Meteo** fica abaixo do limiar equivalente na estação. A última coluna da tabela já está em unidades da Open-Meteo, que é o que o gatilho de produção enxerga.

## Maré (faixas `mare_1_6`, `mare_2_5` e aviso geral `mare_alta`; Itaum fica em `mare_2_5`, decisão de 29/10/2026)

> **Tudo em metros na régua do Iate Clube, regime A (2011–2016).** O regime B (2021–abr/2025) tem outro zero e teto de sensor em 2,5 m, e foi deixado de fora das taxas. A régua não é o referencial do PDDU. **Estas taxas não são a frequência dos gatilhos de produção.**

### Episódios por ano acima de cada nível (régua, regime A, 5,2 anos)

| Nível na régua (m) | Episódios/ano | Dias/ano | Horas/ano | Observação |
|--:|--:|--:|--:|--|
| 0.8 | 40.467 | 272.572 | 1117.7 |  |
| 1.0 | 52.029 | 175.796 | 503.1 |  |
| 1.2 | 35.65 | 67.704 | 146.3 |  |
| 1.4 | 12.718 | 17.56 | 28.7 |  |
| 1.6 | 1.542 | 1.951 | 2.9 | valor literal do gatilho `mare_1_6` |
| 1.8 | 0.385 | 0.39 | 0.6 |  |
| 2.0 | 0.0 | 0.0 | 0.0 |  |
| 2.2 | 0.0 | 0.0 | 0.0 |  |
| 2.4 | 0.0 | 0.0 | 0.0 |  |
| 2.53 | 0.0 | 0.0 | 0.0 | valor literal do gatilho `mare_2_5` |

### Hipótese: gatilho = altura acima do nível médio (mediana da régua = 0.157 m)

O CIRAM informa a 'maré efetiva (m acima do NMM)'. **Se** o nível médio do mar for a mediana da régua do Iate Clube (hipótese de `analise_mare_qc.py`, **não confirmada**), os gatilhos equivalem a estes níveis na régua:

| Gatilho | Nível equivalente na régua (m) | Episódios/ano (grade de 0,05 m) |
|--|--:|--:|
| mare_1_6 (1,60 m) | 1.76 | 0.385 |
| mare_2_5 (2,53 m) | 2.69 | 0.0 |

### O que os alvos de maré pedem (régua, regime A)

| Alvo | Eventos/ano | Nível na régua (m), pela curva observada | Gumbel (IC 95%) | Obs. |
|--|--:|--:|--|--|
| `mare_1_6` ~TR 2 (a confirmar) | 0.5 | 1.75 | 1.65 (1.53–1.79) | dentro da série, mas com só 5 máximos |
| `mare_2_5` ~TR 10 (a confirmar) | 0.1 | 2.00 | 1.89 (1.61–2.12) | extrapolação (série de 5,2 anos) |

Ler assim: se a régua do Iate Clube valesse como referencial do PDDU, o alvo de ~2 anos pediria cerca de 1,6 a 1,75 m e o de ~10 anos cerca de 1,9 a 2,0 m (Gumbel e curva observada), ou seja, o 2,53 m atual ficaria **muito acima** do que um evento de 10 anos alcança nessa régua (nunca atingido em 5 anos). Como o zero da régua não é o do PDDU, isso fica **como indício**, a confirmar na tarefa 6.5.

## O que isto não responde

- **Registro ao vivo do app:** não existe (tarefa 6.6). Estes números são retrospectivos.
- **Pluviômetro de referência (6.3):** as séries são os sensores de chuva de três estações hidrometeorológicas, não a rede de pluviômetros; Iate Clube e Águas têm meses de sensor parado removidos (muitos anos sem máximo utilizável); só o Flotflux tem 9 anos de máximo anual.
- **Maré em produção:** a relação entre o CIRAM e o Iate Clube (6.5) e o referencial vertical continuam abertos.
- **Qual alvo vale:** é a decisão da tarefa 6.3 ⚖️, do autor.
