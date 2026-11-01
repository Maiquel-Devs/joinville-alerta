# 📑 Documentação - Fase 4: Deploy, CI e Publicação

## 🎯 Objetivo da Fase
Disponibilizar o 'joinville-alerta' em ambiente de produção com hospedagem do Front-End no GitHub Pages e implantação da API FastAPI em nuvem, garantindo infraestrutura de custo zero e zero exposição de credenciais.

---

## 🏗️ Arquitetura de Produção

| Camada | Tecnologia | Plataforma de Hospedagem | URL / Endpoint |
| :--- | :--- | :--- | :--- |
| **Front-End** | HTML5, CSS3, JS (ES Modules) | GitHub Pages | `https://<usuario>.github.io/joinville-alerta/` |
| **Back-End** | Python 3.12.10 (`.python-version`), FastAPI, Uvicorn, versões exatas em `backend/requirements.txt` | Render / Cloud Server | `https://<sua-api>.onrender.com/api/v1/status-geral` |

---

## ✅ CI

`.github/workflows/ci.yml` roda a cada push e pull request: `pytest` do back-end, `node --test` do front e `scripts/validar_dados.py`. Não faz deploy.

## ⏱️ Render gratuito

O serviço hiberna sem acessos e a primeira resposta é lenta; o front mostra o cache enquanto espera. O ping que o mantém acordado e o pedido de autorização de uso da fonte de maré estão em `docs/operacao.md`.

---

## 🔒 Proteção de Segredos em Produção
- O back-end não usa chaves de API; não há segredo a configurar no Render.
- O repositório no GitHub permanece $100\%$ público e auditável.