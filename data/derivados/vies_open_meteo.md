# Open-Meteo × estações de chuva — viés (derivado)

Gerado por `scripts/vies_open_meteo.py` (tarefa 6.2). **Resultado derivado**; os dados brutos (estações e JSON da Open-Meteo) não estão no repositório.

**Fonte das estações:** Dos Santos-Silva, J. C. (2026). Joinville hydrometeorological dataset (SEPROT / Defesa Civil de Joinville). Zenodo, versão data-2026-07-29, DOI 10.5281/zenodo.21682712. CC BY 4.0. **Open-Meteo:** dados de previsão histórica, CC BY 4.0 (open-meteo.com).

## Método

- **Ponto:** `LATITUDE`/`LONGITUDE` de `backend/config.py` (-26.3045; -48.8456). A Open-Meteo encaixa no ponto de grade (-26.3269; -48.8571), elevação 9.0 m.
- **API usada:** *Historical Forecast API* (`historical-forecast-api.open-meteo.com`), variável `precipitation` horária, fuso fixo UTC-3 (igual ao das estações). Motivo: é o que o endpoint `forecast` usado pelo back-end teria devolvido. A *Archive API* (reanálise ERA5) é outro produto e foi **descartada**. Limite: a Historical Forecast só tem chuva a partir de 2018 (2016 volta nulo); período baixado: 2018-01-01 a 2026-09-08.
- **Comparação:** mesma chuva móvel de 24 h do `frequencia_chuva.py`, só nas horas em que **ambas** têm janela válida. QC das estações como no relatório de frequência.
- **Estações:** sensores de chuva de Iate Clube, Flotflux e Águas de Joinville. Os três ficam a 2 a 7 km do ponto; a diferença espacial entra no 'viés' e não dá para separá-la do erro do modelo.
- **Correção:** apenas proposta, **não aplicada** em nenhum lugar do código.

## Iate Clube

Período em comum: 2018-02-01 a 2026-09-08; **4.03 anos** de janela de 24 h válida nos dois.

- **Total de chuva (horas em comum):** estação 7912 mm; Open-Meteo 8217 mm; razão **1.039**.
- **Janela de 24 h:** viés médio 0.2 mm (Open-Meteo − estação); RMSE 10.06 mm; correlação de Pearson 0.612, de Spearman 0.704.
- **Alinhamento horário** (correlação da chuva de 1 h com a Open-Meteo deslocada de k h): k=-2: 0.202; k=-1: 0.212; k=0: 0.233; k=1: 0.219; k=2: 0.203.

### Quantis da chuva de 24 h (mm)

| Quantil | Estação | Open-Meteo | Razão OM/estação |
|--|--:|--:|--:|
| p50 | 0.0 | 1.1 | — |
| p90 | 14.5 | 15.4 | 1.06 |
| p95 | 26.7 | 23.2 | 0.87 |
| p99 | 64.1 | 43.6 | 0.68 |
| p99.9 | 120.7 | 73.2 | 0.61 |

### Eventos por ano (horas em comum)

| Limiar (mm) | Estação | Open-Meteo |
|--:|--:|--:|
| 20 | 20.1 | 23.82 |
| 30 | 14.64 | 12.9 |
| 40 | 9.93 | 7.94 |
| 50 | 5.71 | 3.23 |
| 60 | 5.21 | 2.48 |
| 80 | 3.23 | 0.5 |
| 100 | 1.24 | 0.0 |

### Máximo anual da chuva de 24 h (anos com ≥ 50% de janelas em comum)

| Ano | Estação | Open-Meteo | Cobertura |
|--|--:|--:|--:|
| 2019 | 95.7 | 68.4 | 82% |
| 2022 | 96.8 | 94.0 | 57% |
| 2025 | 143.5 | 45.3 | 52% |
| 2026 | 91.4 | 64.0 | 72% |

### A Open-Meteo vê os eventos da estação? (par dentro de ±24 h)

| Limiar (mm) | Eventos na estação | Detectados | Eventos na OM | OM sem par na estação |
|--:|--:|--:|--:|--:|
| 30 | 59 | 28 | 52 | 24 |
| 50 | 23 | 6 | 13 | 7 |
| 80 | 13 | 1 | 2 | 1 |

### Proposta de correção (não aplicada)

- **Fator simples:** multiplicar a Open-Meteo por 1/1.039 = 0.96 (só corrige o total, não a cauda).
- **Casamento por frequência:** limiar da Open-Meteo que produz a mesma taxa de eventos da estação no mesmo período: estação 20 mm ↔ Open-Meteo 22 mm; estação 30 mm ↔ Open-Meteo 28 mm; estação 40 mm ↔ Open-Meteo 36 mm; estação 50 mm ↔ Open-Meteo 44 mm; estação 60 mm ↔ Open-Meteo 45 mm; estação 80 mm ↔ Open-Meteo 50 mm; estação 100 mm ↔ Open-Meteo 69 mm.
- **Mapeamento por quantis** (valor da Open-Meteo → valor equivalente da estação): 15.4 → 14.5; 23.2 → 26.7; 43.6 → 64.1; 73.2 → 120.7.

## Flotflux (Cachoeira Central)

Período em comum: 2018-01-01 a 2026-09-08; **6.55 anos** de janela de 24 h válida nos dois.

- **Total de chuva (horas em comum):** estação 16196 mm; Open-Meteo 13051 mm; razão **0.806**.
- **Janela de 24 h:** viés médio -1.26 mm (Open-Meteo − estação); RMSE 10.48 mm; correlação de Pearson 0.715, de Spearman 0.776.
- **Alinhamento horário** (correlação da chuva de 1 h com a Open-Meteo deslocada de k h): k=-2: 0.234; k=-1: 0.252; k=0: 0.261; k=1: 0.28; k=2: 0.238.

### Quantis da chuva de 24 h (mm)

| Quantil | Estação | Open-Meteo | Razão OM/estação |
|--|--:|--:|--:|
| p50 | 0.0 | 1.2 | — |
| p90 | 20.3 | 15.8 | 0.78 |
| p95 | 34.6 | 23.2 | 0.67 |
| p99 | 75.2 | 44.2 | 0.59 |
| p99.9 | 123.1 | 76.7 | 0.62 |

### Eventos por ano (horas em comum)

| Limiar (mm) | Estação | Open-Meteo |
|--:|--:|--:|
| 20 | 30.07 | 24.88 |
| 30 | 19.99 | 12.51 |
| 40 | 14.04 | 7.48 |
| 50 | 10.99 | 3.51 |
| 60 | 7.63 | 2.14 |
| 80 | 4.58 | 0.61 |
| 100 | 2.29 | 0.0 |

### Máximo anual da chuva de 24 h (anos com ≥ 50% de janelas em comum)

| Ano | Estação | Open-Meteo | Cobertura |
|--|--:|--:|--:|
| 2018 | 116.1 | 86.8 | 67% |
| 2019 | 137.2 | 68.4 | 89% |
| 2020 | 114.5 | 66.1 | 84% |
| 2021 | 144.8 | 48.1 | 65% |
| 2022 | 172.0 | 94.0 | 100% |
| 2023 | 102.9 | 77.4 | 100% |
| 2025 | 82.8 | 45.3 | 54% |
| 2026 | 107.4 | 64.0 | 70% |

### A Open-Meteo vê os eventos da estação? (par dentro de ±24 h)

| Limiar (mm) | Eventos na estação | Detectados | Eventos na OM | OM sem par na estação |
|--:|--:|--:|--:|--:|
| 30 | 131 | 49 | 82 | 33 |
| 50 | 72 | 13 | 23 | 10 |
| 80 | 30 | 4 | 4 | 0 |

### Proposta de correção (não aplicada)

- **Fator simples:** multiplicar a Open-Meteo por 1/0.806 = 1.24 (só corrige o total, não a cauda).
- **Casamento por frequência:** limiar da Open-Meteo que produz a mesma taxa de eventos da estação no mesmo período: estação 20 mm ↔ Open-Meteo 16 mm; estação 30 mm ↔ Open-Meteo 24 mm; estação 40 mm ↔ Open-Meteo 28 mm; estação 50 mm ↔ Open-Meteo 33 mm; estação 60 mm ↔ Open-Meteo 39 mm; estação 80 mm ↔ Open-Meteo 47 mm; estação 100 mm ↔ Open-Meteo 57 mm.
- **Mapeamento por quantis** (valor da Open-Meteo → valor equivalente da estação): 15.8 → 20.3; 23.2 → 34.6; 44.2 → 75.2; 76.7 → 123.1.

## Águas de Joinville (Bucarein)

Período em comum: 2018-01-01 a 2024-06-06; **1.95 anos** de janela de 24 h válida nos dois.

- **Total de chuva (horas em comum):** estação 2832 mm; Open-Meteo 3273 mm; razão **1.156**.
- **Janela de 24 h:** viés médio 0.57 mm (Open-Meteo − estação); RMSE 7.61 mm; correlação de Pearson 0.596, de Spearman 0.631.
- **Alinhamento horário** (correlação da chuva de 1 h com a Open-Meteo deslocada de k h): k=-2: 0.221; k=-1: 0.232; k=0: 0.259; k=1: 0.253; k=2: 0.232.

### Quantis da chuva de 24 h (mm)

| Quantil | Estação | Open-Meteo | Razão OM/estação |
|--|--:|--:|--:|
| p50 | 0.0 | 0.6 | — |
| p90 | 8.9 | 11.5 | 1.29 |
| p95 | 20.4 | 19.3 | 0.95 |
| p99 | 42.7 | 36.4 | 0.85 |
| p99.9 | 80.9 | 75.4 | 0.93 |

### Eventos por ano (horas em comum)

| Limiar (mm) | Estação | Open-Meteo |
|--:|--:|--:|
| 20 | 15.35 | 17.9 |
| 30 | 9.21 | 8.7 |
| 40 | 5.12 | 4.6 |
| 50 | 3.07 | 1.53 |
| 60 | 3.07 | 1.02 |
| 80 | 1.02 | 0.51 |
| 100 | 0.0 | 0.0 |

### Máximo anual da chuva de 24 h (anos com ≥ 50% de janelas em comum)

| Ano | Estação | Open-Meteo | Cobertura |
|--|--:|--:|--:|
| 2021 | 80.3 | 48.1 | 52% |

### A Open-Meteo vê os eventos da estação? (par dentro de ±24 h)

| Limiar (mm) | Eventos na estação | Detectados | Eventos na OM | OM sem par na estação |
|--:|--:|--:|--:|--:|
| 30 | 18 | 5 | 17 | 12 |
| 50 | 6 | 0 | 3 | 3 |
| 80 | 2 | 0 | 1 | 1 |

### Proposta de correção (não aplicada)

- **Fator simples:** multiplicar a Open-Meteo por 1/1.156 = 0.87 (só corrige o total, não a cauda).
- **Casamento por frequência:** limiar da Open-Meteo que produz a mesma taxa de eventos da estação no mesmo período: estação 20 mm ↔ Open-Meteo 21 mm; estação 30 mm ↔ Open-Meteo 28 mm; estação 40 mm ↔ Open-Meteo 37 mm; estação 50 mm ↔ Open-Meteo 43 mm; estação 60 mm ↔ Open-Meteo 43 mm; estação 80 mm ↔ Open-Meteo 53 mm.
- **Mapeamento por quantis** (valor da Open-Meteo → valor equivalente da estação): 11.5 → 8.9; 19.3 → 20.4; 36.4 → 42.7; 75.4 → 80.9.

## A própria Open-Meteo, série completa (o que o app veria em produção)

Período: 2018-01-01 a 2026-09-08; **8.68 anos** de janela de 24 h válida (sem lacunas). Sem a restrição de comparar com a estação, esta é a série que o motor de produção enxerga.

| Limiar (mm) | Eventos/ano | Dias/ano | Horas/ano |
|--:|--:|--:|--:|
| 20 | 25.217 | 51.586 | 622.8 |
| 30 | 13.012 | 23.605 | 256.2 |
| 40 | 7.369 | 12.321 | 125.9 |
| 50 | 3.57 | 6.103 | 58.5 |
| 60 | 2.073 | 3.685 | 33.5 |
| 80 | 0.691 | 0.921 | 10.7 |
| 100 | 0.115 | 0.23 | 2.2 |

Máximo anual (anos com ≥ 75% de janelas): 2018: 86.8, 2019: 68.4, 2020: 66.1, 2021: 58.7, 2022: 94.0, 2023: 77.4, 2024: 142.3, 2025: 98.0, 2026: 64.0.

Níveis de retorno da Open-Meteo (Gumbel, 9 anos; **25 anos é extrapolação**): TR 2: 79.5 mm [67.7, 95.3]; TR 5: 97.8 mm [75.8, 123.7]; TR 10: 110.0 mm [81.2, 142.4]; TR 25: 125.4 mm [87.5, 166.9].
