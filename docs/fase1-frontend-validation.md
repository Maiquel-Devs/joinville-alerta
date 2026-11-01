# Fase 1: Front-end e validação de UX

## Objetivo
Interface *mobile-first*, lida em menos de 2 s sob emergência, sem login e sem instalar nada.

## Regras da v3 no front
- A tela principal é o **diagnóstico por endereço ou GPS**, com o cenário do PDDU em que a rua está (menor tempo de retorno).
- Rua só fica vermelha por faixa de rua ativa. Chuva ou maré fortes sem faixa ativa aparecem como **atenção geral** (faixa âmbar), sem pintar ruas.
- Sem faixa ativa, o selo diz "Nenhuma faixa ativa agora", em cor neutra. Nunca "normal", nunca verde.
- Dado com mais de 120 min vira `indisponivel` em todas as telas (cartão, entorno, lista, GPS), com o horário do último dado.

## Decisões
- JavaScript puro, sem framework; `style.css` próprio.
- **12/10/2026:** a primeira versão (mapa em tela cheia) foi substituída por uma **lista viva "pior primeiro" + busca + GPS**. O mapa foi removido da interface e do cache inicial; o Leaflet ficou só em `teste/camadas.html`, para auditoria.
- O front só ordena e desenha. O risco é decidido pelo back-end (ver `fase3-backend-cache.md`).

## Arquivos

| Arquivo | Função |
| :--- | :--- |
| `index.html` | Estrutura da tela: cartão de nível, indicadores, aviso geral, consulta por endereço/GPS, lista geral recolhida e rodapé com avisos. |
| `style.css` | Estilos e cores dos estados (ativa, inativa, indisponível, dado antigo, atenção geral). |
| `app.js` | Busca o estado na API, monta o diagnóstico, a lista por família de faixas e o botão de GPS. |
| `ruas.js` | Funções puras testadas com `node --test`: estado da rua, cenário (menor TR), ruas vizinhas a ~300 m (distância ponto-segmento), homônimos. |
| `idade.js` | Teto de idade do dado (`IDADE_MAX_MIN = 120`): passado o teto, toda faixa vira `indisponivel`. |
| `pip.js` | Ponto-em-polígono para o GPS, sem biblioteca geoespacial; testado contra o shapely. |
| `sw.js` | Service Worker: cache primeiro e atualização em segundo plano. |

O antigo `mock-data.json` e a regra de risco por bairro foram removidos na Etapa 4.

## Validação
- Estado ativo simulado em 16/10/2026: o cartão de nível e a ordem "pior primeiro" funcionaram.
- Estado indisponível exibido com estilo tracejado, sem virar "normal".
- Medição de desempenho no celular real (tarefas 3.6 e 8.7): os tempos ainda não foram registrados.
