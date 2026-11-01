# Fase 2: Motor de risco e textos fixos

> O nome do arquivo (`motor-e-ia`) é histórico: a IA generativa foi removida em 29/10/2026 e o texto do alerta é fixo.

> A versão inicial desta fase ficava no navegador (`/src/services`, maré sintética). Foi **removida** na Etapa 4. O motor hoje é único e fica no back-end.

## Motor (`backend/`)

| Arquivo | Função |
| :--- | :--- |
| `sources.py` | Chuva de 24 h e 48 h (Open-Meteo, com retentativa) e maré (marégrafo CIRAM/Epagri; previsão MohidSC como estimativa). Sem dado válido devolve `None`. |
| `risk_engine.py` | Avalia as faixas `mare_1_6`, `mare_2_5`, `pluvial_vn_tr5`, `pluvial_vn_tr10` e `pluvial_vn_tr25` como `ativa`, `inativa` ou `indisponivel`; calcula `atencao_geral` (`chuva` ≥ 53 mm; `mare` sempre `null` até a 6.5) e o nível global: `nenhum`, `atencao_geral`, `atencao`, `alto` ou `indisponivel`. O aninhamento de TR sai dos limiares crescentes (98 < 110 < 125 mm). |
| `config.py` | Gatilhos e constantes. Os de chuva são calibrados (`data/derivados/ativacoes.md`: 53, 98, 110 e 125 mm); os de maré (1,60 e 2,53 m) são provisórios. |
| `textos.py` | Texto do alerta por tabela fixa, a partir do nível e das faixas ativas já calculados. |
| `tests/test_frequencia_dados.py` | Marcado `dados` (`pytest -m dados`, fora do CI): simula o motor na série local da Open-Meteo e confere as faixas de chuva contra os alvos de frequência. |
| `tests/test_motor.py` | Tabela de testes do motor, incluindo os limites exatos de cada gatilho e "sem dado nunca é nenhum". |

## Regras
- O texto vem de tabela fixa e revisável; não há IA no caminho do alerta.
- Dado ausente vira `indisponivel`, nunca "nenhum".
- A maré é rotulada como medida ou estimativa (`mare_origem`).
