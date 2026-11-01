# 📑 Documentação - Fase 3: Back-End Python & In-Memory Cache

## 🎯 Objetivo da Fase
Construir uma API autônoma em FastAPI com agendamento automático (*cron* de 15 minutos) e armazenamento em memória RAM (*In-Memory Cache*), suportando picos massivos de acessos sem custos.

---

## 🛠️ Componentes do Back-End (`/backend`)

| Arquivo | Função |
| :--- | :--- |
| `cache_store.py` | Estrutura na memória RAM para entrega instantânea (< 5ms). |
| `textos.py` | Texto do alerta por tabela fixa. |
| `scheduler.py` | Agendador autônomo (APScheduler) que atualiza a telemetria a cada 15 minutos. |
| `main.py` | Servidor FastAPI expondo a rota `/api/v1/status-geral`. CORS restrito à origem do front (`ALLOWED_ORIGIN`). A primeira coleta roda em segundo plano; com o cache vazio a rota responde `indisponivel`. |

---

## 📡 Contrato resumido

`/api/v1/status-geral` devolve `status`, `gerado_em`, `validade_min` (30), `mare_efetiva_m`, `mare_origem`, `chuva_24h_mm`, `faixas` (`mare_1_6`, `mare_2_5`, `pluvial_vn_tr5`, `pluvial_vn_tr10`, `pluvial_vn_tr25`), `atencao_geral` (`chuva`, `mare`), `nivel` (`nenhum`, `atencao_geral`, `atencao`, `alto`, `indisponivel`) e `texto`. Detalhes em `CLAUDE.md`. O teto de idade de 120 min é aplicado pelo front (`idade.js`); a API ainda não devolve `idade_max_min`.

## 🔒 Segurança
- O back-end não usa chaves de API nem variáveis de ambiente secretas.