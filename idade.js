// Teto de idade do dado (decidido 29/10/2026: 120 min). Funções puras: recebem "agora" para serem testáveis.
// Roda no navegador e no Node (teste/idade.test.js).
(function (raiz) {
  const IDADE_MAX_MIN = 120;

  // Idade em minutos de `geradoEm` (ISO) em relação a `agora` (ms); null se a data não existe ou é inválida.
  function idadeMin(geradoEm, agora) {
    const t = Date.parse(geradoEm);
    return Number.isNaN(t) ? null : (agora - t) / 60000;
  }

  // Dado vencido: mais velho que o teto. Sem horário verificável também conta como vencido,
  // para nunca mostrar "Nenhuma faixa ativa agora" com um dado de idade desconhecida.
  function vencido(dados, agora, maxMin = IDADE_MAX_MIN) {
    if (!dados) return true;
    const idade = idadeMin(dados.gerado_em, agora);
    return idade === null || idade > maxMin;
  }

  // Estado de uma faixa para a tela. Ausente, inválido, indisponível ou vencido = 'indisponivel'.
  function estadoFaixa(dados, id, agora, maxMin = IDADE_MAX_MIN) {
    if (!dados || dados.status === 'indisponivel' || vencido(dados, agora, maxMin)) return 'indisponivel';
    const e = dados.faixas?.[id];
    return e === 'ativa' || e === 'inativa' ? e : 'indisponivel';
  }

  const api = { IDADE_MAX_MIN, idadeMin, vencido, estadoFaixa };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.IDADE = api;
})(typeof window !== 'undefined' ? window : globalThis);
