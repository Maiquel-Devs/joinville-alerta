# Frequência de maré — Iate Clube (derivado)

Gerado por `scripts/frequencia_mare.py` (tarefa 6.4). **Resultado derivado**; os dados brutos não estão no repositório.

**Fonte:** Dos Santos-Silva, J. C. (2026). Joinville hydrometeorological dataset (SEPROT / Defesa Civil de Joinville). Zenodo, versão data-2026-07-29, DOI 10.5281/zenodo.21682712. Licença CC BY 4.0. Termos da SEPROT ainda sem confirmação formal.

> **Todos os níveis abaixo estão na régua da estação do Iate Clube, não no referencial do PDDU.** O zero dessa régua não é documentado e, como mostram os regimes abaixo, **mudou ao longo da série**. Estes números dizem *com que frequência a régua passa de cada nível*; eles **não** dizem com que frequência o nível 1,60 m ou 2,53 m do PDDU é atingido, e não servem como gatilho direto. Falta ainda relacionar o marégrafo do CIRAM com esta estação (tarefa 6.5).

## Método

- **Série:** nível horário do Iate Clube depois do QC de `analise_mare_qc.py` (fora de [−3; 4] m, travado ≥ 6 h seguidas — inclui os ~13,8 mil h presas em 2,5 m —, zero isolado e picos saem; inválido = ausente, nunca zero).
- **Episódio:** trecho com nível ≥ X; trechos separados por menos de 24 h abaixo de X contam como um episódio (a maré passa de X duas vezes por dia). **Dia:** dia civil com algum nível ≥ X. Episódios e horas por ano são divididos pelos anos de horas com nível válido; dias por ano, pelos dias com ≥ 20 h válidas. Em níveis baixos os episódios se fundem (a maré fica o tempo todo acima), então a coluna de episódios cai antes da de horas.
- **Máximo anual:** calendário civil, só anos com ≥ 75% das 8.760 horas válidas, dentro de um único regime. Ajuste Gumbel e GEV (`scipy.stats`) com IC 95% por bootstrap (2000).

## Regimes da régua (por que não dá para juntar a série toda)

| Ano | Horas após QC | p1 (m) | Mediana (m) | p99 (m) | Máximo (m) |
|--|--:|--:|--:|--:|--:|
| 2011 | 2998 | -1.13 | 0.04 | 1.16 | 1.43 |
| 2012 | 8775 | -1.1 | 0.13 | 1.2 | 1.49 |
| 2013 | 8758 | -0.94 | 0.18 | 1.3 | 1.67 |
| 2014 | 8759 | -1.04 | 0.13 | 1.21 | 1.53 |
| 2015 | 7448 | -0.97 | 0.2 | 1.28 | 1.74 |
| 2016 | 8752 | -1.02 | 0.2 | 1.35 | 1.95 |
| 2017 | 8290 | -2.73 | -0.26 | 1.15 | 1.56 |
| 2018 | 2318 | -2.61 | 0.32 | 3.76 | 3.99 |
| 2019 | 445 | -1.82 | -0.11 | 2.53 | 3.62 |
| 2020 | 7 | -2.15 | -0.19 | 3.36 | 3.36 |
| 2021 | 5336 | -0.0 | 1.04 | 2.08 | 2.15 |
| 2022 | 1811 | 0.1 | 1.11 | 2.07 | 2.15 |
| 2023 | 2100 | -0.0 | 1.07 | 2.05 | 2.5 |
| 2024 | 3918 | -0.03 | 1.08 | 2.05 | 2.5 |
| 2025 | 1568 | -0.02 | 1.11 | 2.5 | 2.5 |
| 2026 | 0 | — | — | — | — |

Leitura: 2011–2016 têm mediana ~0,15 m e p99 ~1,25 m todo ano (regime **A**). 2017 deriva (mediana −0,26 m, p1 −2,7 m). 2018–2020 têm picos de até 3,99 m e 2020 tem 7 horas: dado não confiável. Desde 2021 a mediana é ~1,05 m e o mínimo ~0 m (regime **B**), como se a régua tivesse sido reposicionada ou o sensor cortasse embaixo. Os períodos 2017–2020 ficam **fora**. Os regimes A e B **não são comparáveis entre si**.

## Regime A: 2011-08-29 a 2016-12-31

régua estável (2011–2016); único trecho com ano completo. **5.19 anos** de horas com nível; mediana 0.157 m.

### Frequência de excedência por nível (na régua)

| Nível (m) | Episódios/ano | Dias/ano | Horas/ano | Episódios na série |
|--:|--:|--:|--:|--:|
| 0.8 | 40.467 | 272.572 | 1117.7 | 210 |
| 1.0 | 52.029 | 175.796 | 503.1 | 270 |
| 1.2 | 35.65 | 67.704 | 146.3 | 185 |
| 1.4 | 12.718 | 17.56 | 28.7 | 66 |
| 1.6 | 1.542 | 1.951 | 2.9 | 8 |
| 1.8 | 0.385 | 0.39 | 0.6 | 2 |
| 2.0 | 0.0 | 0.0 | 0.0 | 0 |
| 2.2 | 0.0 | 0.0 | 0.0 | 0 |
| 2.4 | 0.0 | 0.0 | 0.0 | 0 |
| 2.53 | 0.0 | 0.0 | 0.0 | 0 |

### Máximo anual do nível horário

| Ano | Máximo (m) | Horas válidas / 8.760 | No ajuste |
|--|--:|--:|:-:|
| 2011 | 1.43 | 34% | não |
| 2012 | 1.49 | 100% | sim |
| 2013 | 1.67 | 100% | sim |
| 2014 | 1.53 | 100% | sim |
| 2015 | 1.74 | 85% | sim |
| 2016 | 1.95 | 100% | sim |

### Níveis de retorno (régua, m) — 5 máximos anuais

| TR (anos) | Gumbel | IC 95% Gumbel | GEV | IC 95% GEV | Obs. |
|--:|--:|--|--:|--|--|
| 2 | 1.65 | [1.53, 1.79] | 1.62 | [1.49, 1.91] |  |
| 10 | 1.89 | [1.61, 2.12] | 1.93 | [1.49, 'instável'] | extrapolação (TR > série) |

Valores em **metros**, na régua. Com 5 máximos o ajuste é frágil; o GEV principalmente (forma ξ = 0.296). O nível de 10 anos é extrapolação além da série. Prefira a tabela de excedência acima.

## Regime B: 2021-01-01 a 2025-04-30

régua com outro nível médio (2021–abr/2025); cobertura parcial e trechos travados em 2,5 m. **1.68 anos** de horas com nível; mediana 1.07 m. **Atenção:** o sensor tem teto em 2,5 m; a partir de 2,2 m os episódios são em boa parte o platô de 2,5 m, então a frequência acima de 2,2 m é um piso incerto, não uma medida.

### Frequência de excedência por nível (na régua)

| Nível (m) | Episódios/ano | Dias/ano | Horas/ano | Episódios na série |
|--:|--:|--:|--:|--:|
| 0.8 | 5.95 | 365.25 | 6130.8 | 10 |
| 1.0 | 5.95 | 365.25 | 4837.9 | 10 |
| 1.2 | 7.14 | 364.644 | 3572.9 | 12 |
| 1.4 | 13.685 | 358.587 | 2421.6 | 23 |
| 1.6 | 35.699 | 301.044 | 1407.7 | 60 |
| 1.8 | 58.309 | 201.1 | 670.0 | 98 |
| 2.0 | 46.409 | 87.224 | 235.0 | 78 |
| 2.2 | 9.52 | 9.692 | 70.8 | 16 |
| 2.4 | 9.52 | 9.692 | 70.8 | 16 |
| 2.53 | 0.0 | 0.0 | 0.0 | 0 |

### Máximo anual do nível horário

| Ano | Máximo (m) | Horas válidas / 8.760 | No ajuste |
|--|--:|--:|:-:|
| 2021 | 2.15 | 61% | não |
| 2022 | 2.15 | 21% | não |
| 2023 | 2.5 | 24% | não |
| 2024 | 2.5 | 45% | não |
| 2025 | 2.5 | 18% | não |

Anos completos insuficientes neste regime (0) para ajustar Gumbel/GEV; **só a tabela de excedência** é informativa.
