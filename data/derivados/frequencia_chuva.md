# Frequência de chuva — joinville_meteo (derivado)

Gerado por `scripts/frequencia_chuva.py` (tarefa 6.1). **Resultado derivado**; os dados brutos não estão no repositório.

**Fonte:** Dos Santos-Silva, J. C. (2026). Joinville hydrometeorological dataset (SEPROT / Defesa Civil de Joinville). Zenodo, versão data-2026-07-29, DOI 10.5281/zenodo.21682712. Licença CC BY 4.0. Termos da SEPROT ainda sem confirmação formal.

## Método

- **Dado:** chuva horária (`prec`) do sensor de chuva das três estações hidrometeorológicas de `series_horaria/` (Iate Clube, Flotflux, Águas de Joinville). Não é a rede de pluviômetros; ver a ressalva na tarefa 6.3.
- **QC:** inválido vira ausente, nunca zero. Descarta hora fora de [0; 200] mm, despejo de acúmulo (≥ 40 mm na hora logo após lacuna > 2 h) e meses com registro cheio (≥ 500 h) e total ≤ 5 mm (sensor parado: aparecem muitos meses seguidos com 0 mm). O conjunto já traz um filtro anterior.
- **Chuva móvel de 24 h:** soma das 24 h que terminam na hora; só com as 24 horas válidas (mesma janela de `somar_chuva` do back-end).
- **Evento:** trecho em que a chuva de 24 h fica ≥ limiar; trechos separados por menos de 24 h abaixo do limiar contam como um evento. **Dia:** dia civil em que a chuva de 24 h chegou ao limiar em algum momento. Taxas divididas pelos anos de janela válida.
- **Máximo anual:** calendário civil; o ano entra no ajuste se ≥ 75% das janelas forem válidas (ano com lacuna grande subestima o máximo).
- **Níveis de retorno:** Gumbel e GEV (`scipy.stats`, máxima verossimilhança) sobre os máximos anuais; IC 95% por bootstrap (2000 reamostragens).

> **Atenção:** a série tem poucos anos. **O nível de 25 anos é extrapolação** (a série não chega a 25 anos). O de 10 anos também é pouco sustentado. O GEV com tão poucos máximos tem forma instável; os intervalos de confiança são largos de propósito.

## Iate Clube

Período: 2011-02-09 a 2026-09-08; **9.56 anos** com janela de 24 h válida; **7 ano(s)** no ajuste (2012, 2013, 2014, 2015, 2016, 2017, 2019).

QC (horas): horas com chuva bruta = 111939; fora da faixa = 0; despejo apos lacuna = 0; horas em meses parados = 23210; horas com chuva apos qc = 88729.

### Eventos por ano acima de cada limiar (chuva de 24 h)

| Limiar (mm) | Eventos/ano | Dias/ano | Horas/ano | Eventos na série |
|--:|--:|--:|--:|--:|
| 20 | 23.221 | 50.102 | 628.6 | 222 |
| 30 | 14.957 | 29.078 | 338.1 | 143 |
| 40 | 9.414 | 16.526 | 180.1 | 90 |
| 50 | 5.648 | 10.355 | 115.3 | 54 |
| 60 | 3.766 | 6.694 | 71.1 | 36 |
| 80 | 2.197 | 3.661 | 37.6 | 21 |
| 100 | 0.837 | 1.255 | 13.4 | 8 |

### Máximo anual da chuva de 24 h

| Ano | Máx. 24 h (mm) | Janelas válidas | No ajuste |
|--|--:|--:|:-:|
| 2012 | 97.9 | 100% | sim |
| 2013 | 63.8 | 100% | sim |
| 2014 | 118.0 | 100% | sim |
| 2015 | 112.5 | 79% | sim |
| 2016 | 92.6 | 98% | sim |
| 2017 | 133.6 | 76% | sim |
| 2018 | 21.7 | 11% | não |
| 2019 | 95.7 | 82% | sim |
| 2020 | 120.7 | 33% | não |
| 2021 | 110.8 | 32% | não |
| 2022 | 96.8 | 57% | não |
| 2023 | 96.0 | 40% | não |
| 2024 | 193.3 | 46% | não |
| 2025 | 143.5 | 52% | não |
| 2026 | 91.4 | 72% | não |

### Níveis de retorno (chuva de 24 h, mm)

| TR (anos) | Gumbel | IC 95% Gumbel | GEV | IC 95% GEV | Obs. |
|--:|--:|--|--:|--|--|
| 2 | 99.1 | [83.3, 114.8] | 104.5 | [63.8, 127.2] |  |
| 5 | 122.9 | [101.0, 137.0] | 120.6 | [63.8, instável] |  |
| 10 | 138.7 | [108.4, 155.9] | 127.2 | [63.8, instável] | pouco sustentado |
| 25 | 158.6 | [115.2, 181.0] | 132.7 | [63.8, instável] | extrapolação |

Forma do GEV (ξ, positivo = cauda pesada): -0.504. Com 7 máximos anuais o GEV é instável (valores acima de 400 mm aparecem como "instável"); **use o Gumbel e a curva de eventos por ano como referência**, e o GEV só como checagem.

## Flotflux (Cachoeira Central)

Período: 2011-01-18 a 2026-09-08; **12.17 anos** com janela de 24 h válida; **9 ano(s)** no ajuste (2012, 2013, 2014, 2016, 2017, 2019, 2020, 2022, 2023).

QC (horas): horas com chuva bruta = 110921; fora da faixa = 0; despejo apos lacuna = 0; horas em meses parados = 715; horas com chuva apos qc = 110206.

### Eventos por ano acima de cada limiar (chuva de 24 h)

| Limiar (mm) | Eventos/ano | Dias/ano | Horas/ano | Eventos na série |
|--:|--:|--:|--:|--:|
| 20 | 29.256 | 64.264 | 825.8 | 356 |
| 30 | 19.723 | 39.939 | 486.5 | 240 |
| 40 | 12.82 | 25.64 | 288.6 | 156 |
| 50 | 8.793 | 15.861 | 173.8 | 107 |
| 60 | 5.835 | 11.094 | 119.7 | 71 |
| 80 | 3.123 | 5.506 | 52.8 | 38 |
| 100 | 1.726 | 2.63 | 23.5 | 21 |

### Máximo anual da chuva de 24 h

| Ano | Máx. 24 h (mm) | Janelas válidas | No ajuste |
|--|--:|--:|:-:|
| 2012 | 128.2 | 99% | sim |
| 2013 | 79.2 | 100% | sim |
| 2014 | 151.5 | 100% | sim |
| 2015 | 52.9 | 65% | não |
| 2016 | 77.8 | 98% | sim |
| 2017 | 123.7 | 98% | sim |
| 2018 | 116.1 | 68% | não |
| 2019 | 137.2 | 89% | sim |
| 2020 | 114.5 | 84% | sim |
| 2021 | 144.8 | 65% | não |
| 2022 | 172.0 | 100% | sim |
| 2023 | 102.9 | 100% | sim |
| 2024 | 156.0 | 47% | não |
| 2025 | 82.8 | 54% | não |
| 2026 | 107.4 | 70% | não |

### Níveis de retorno (chuva de 24 h, mm)

| TR (anos) | Gumbel | IC 95% Gumbel | GEV | IC 95% GEV | Obs. |
|--:|--:|--|--:|--|--|
| 2 | 115.9 | [96.2, 135.7] | 82.9 | [77.9, 156.9] |  |
| 5 | 146.3 | [117.6, 169.1] | instável | [101.5, instável] |  |
| 10 | 166.5 | [130.9, 193.4] | instável | [102.9, instável] | pouco sustentado |
| 25 | 191.9 | [147.1, 224.7] | instável | [102.9, instável] | extrapolação |

Forma do GEV (ξ, positivo = cauda pesada): 8.279. Com 9 máximos anuais o GEV é instável (valores acima de 400 mm aparecem como "instável"); **use o Gumbel e a curva de eventos por ano como referência**, e o GEV só como checagem.

## Águas de Joinville (Bucarein)

Período: 2011-01-23 a 2024-06-06; **5.3 anos** com janela de 24 h válida; **1 ano(s)** no ajuste (2013).

QC (horas): horas com chuva bruta = 66071; fora da faixa = 0; despejo apos lacuna = 0; horas em meses parados = 16745; horas com chuva apos qc = 49326.

### Eventos por ano acima de cada limiar (chuva de 24 h)

| Limiar (mm) | Eventos/ano | Dias/ano | Horas/ano | Eventos na série |
|--:|--:|--:|--:|--:|
| 20 | 18.878 | 41.909 | 556.9 | 100 |
| 30 | 13.781 | 27.184 | 312.8 | 73 |
| 40 | 8.118 | 15.291 | 163.1 | 43 |
| 50 | 5.097 | 8.118 | 81.9 | 27 |
| 60 | 3.02 | 4.72 | 52.7 | 16 |
| 80 | 1.321 | 2.265 | 22.5 | 7 |
| 100 | 0.566 | 0.944 | 8.5 | 3 |

### Máximo anual da chuva de 24 h

| Ano | Máx. 24 h (mm) | Janelas válidas | No ajuste |
|--|--:|--:|:-:|
| 2012 | 107.0 | 70% | não |
| 2013 | 65.5 | 99% | sim |
| 2014 | 17.5 | 16% | não |
| 2015 | 50.2 | 30% | não |
| 2016 | 64.7 | 57% | não |
| 2017 | 137.6 | 60% | não |
| 2018 | 14.4 | 21% | não |
| 2019 | 70.6 | 34% | não |
| 2020 | 93.3 | 49% | não |
| 2021 | 80.3 | 52% | não |
| 2022 | 61.2 | 38% | não |
| 2023 | 0.0 | 0% | não |
| 2024 | 0.0 | 3% | não |

Anos de máximo insuficientes (< 6) para o ajuste.
