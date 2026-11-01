// Funções puras do front: faixas e cenários, estado da rua, busca, grupos de homônimos e entorno.
// Sem DOM e sem rede, para rodar no navegador e no Node (teste/ruas.test.js).
// Nenhuma regra de risco aqui: o estado de cada faixa vem do back-end (via idade.js).
(function (raiz) {
  // --- faixas e cenários -----------------------------------------------------------------
  // Ordem = prioridade de exibição entre faixas ativas (pior primeiro). Espelha config.NIVEL_DA_FAIXA no back-end.
  const FAIXAS = [
    { id: 'mare_2_5', rotulo: 'Maré — Calha Baixa do Cachoeira e Estuário (2,5m)', curto: 'Maré de 2,5 m', familia: 'mare', mancha: 'data/geojson/mare_cachoeira_2_5m.geojson' },
    { id: 'mare_1_6', rotulo: 'Maré — Bacia do Cachoeira / Cotas Intermediárias (1,6m)', curto: 'Maré de 1,6 m', familia: 'mare', mancha: 'data/geojson/mare_cachoeira_1_6m.geojson' },
    { id: 'pluvial_vn_tr5', rotulo: 'Chuva — Vila Nova (cenário de 5 anos)', curto: 'Cenário de 5 anos', familia: 'vila_nova', mancha: 'data/geojson/inundacao_vila_nova.geojson', filtro: '5 anos' },
    { id: 'pluvial_vn_tr10', rotulo: 'Chuva — Vila Nova (cenário de 10 anos)', curto: 'Cenário de 10 anos', familia: 'vila_nova', mancha: 'data/geojson/inundacao_vila_nova.geojson', filtro: '10 anos' },
    { id: 'pluvial_vn_tr25', rotulo: 'Chuva — Vila Nova (cenário de 25 anos)', curto: 'Cenário de 25 anos', familia: 'vila_nova', mancha: 'data/geojson/inundacao_vila_nova.geojson', filtro: '25 anos' },
  ];

  // Famílias de cenários, com as faixas do cenário mais frequente para o mais raro.
  // Maré não traz tempo de retorno: o TR das faixas de maré ainda é "a confirmar" (CLAUDE.md).
  const FAMILIAS = [
    { id: 'mare', rotulo: 'Maré — Rio Cachoeira', faixas: ['mare_1_6', 'mare_2_5'], explica: 'Quanto menor o patamar de maré, mais frequente é o cenário.' },
    { id: 'vila_nova', rotulo: 'Chuva — Vila Nova', faixas: ['pluvial_vn_tr5', 'pluvial_vn_tr10', 'pluvial_vn_tr25'], explica: 'O número de anos é o tempo de retorno do cenário oficial: quanto menor, mais frequente.' },
  ];

  const CENARIO = {
    mare_1_6: 'aparece no cenário de maré de 1,6 m, o mais frequente entre os de maré',
    mare_2_5: 'só no cenário de maré de 2,5 m, o mais raro entre os de maré',
    pluvial_vn_tr5: 'aparece no cenário de cheia de 5 anos, o mais frequente',
    pluvial_vn_tr10: 'só a partir do cenário de cheia de 10 anos, de frequência intermediária',
    pluvial_vn_tr25: 'só no cenário de cheia de 25 anos, o mais raro',
  };

  // Filtro das feições de uma mancha para a faixa (Vila Nova: cenário Atual do tempo de retorno da faixa).
  function filtroDe(id) {
    const tr = FAIXAS.find((f) => f.id === id)?.filtro;
    return tr ? (f) => f.properties.status_1 === 'Atual' && f.properties.tempretor === tr : undefined;
  }

  // Menor tempo de retorno (cenário mais frequente) de cada família em que a via aparece.
  // Devolve [{ familia, faixa, texto, explica }]; `faixas` é qualquer iterável de ids.
  function cenariosDaVia(faixas) {
    const tem = new Set(faixas);
    const out = [];
    for (const fam of FAMILIAS) {
      const faixa = fam.faixas.find((id) => tem.has(id));
      if (faixa) out.push({ familia: fam.id, faixa, texto: CENARIO[faixa], explica: fam.explica });
    }
    return out;
  }

  // --- estado (uma só regra para diagnóstico, entorno, lista geral e GPS) ----------------------
  // `estadoDe(id)` é o estado de uma faixa já com teto de idade (idade.js): ativa | inativa | indisponivel.
  // Qualquer faixa ativa = ativa; senão qualquer indisponível = indisponível; senão inativa.
  // Lista vazia (sem faixa conhecida) é indisponível: nunca tranquiliza.
  function estadoDeFaixas(ids, estadoDe) {
    const es = [...ids].map(estadoDe);
    if (es.includes('ativa')) return 'ativa';
    if (!es.length || es.includes('indisponivel')) return 'indisponivel';
    return 'inativa';
  }
  const estadoDaRua = (rua, estadoDe) => estadoDeFaixas(rua.faixas, estadoDe);

  // --- texto e filtros ---------------------------------------------------------------------------
  const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Filtro da lista geral: se a busca casa com o rótulo da faixa, mostra todas as ruas dela.
  function filtrarRuasDaFaixa(ruas, rotulo, q) {
    if (!q || semAcento(rotulo).includes(q)) return ruas;
    return ruas.filter((r) => r.chave.includes(q));
  }

  // --- geometria em metros (projeção equiretangular local) ---------------------------------------
  const LAT0 = -26.3; // centro de Joinville; sobre ~15 km o erro de escala é menor que 0,2%
  const LNG0 = -48.85;
  const M_POR_GRAU_LNG = Math.cos((LAT0 * Math.PI) / 180) * 111320;
  const M_POR_GRAU_LAT = 110540;
  const projetar = (lng, lat) => [(lng - LNG0) * M_POR_GRAU_LNG, (lat - LAT0) * M_POR_GRAU_LAT];

  function distPontoSegmento(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const q = dx * dx + dy * dy;
    const t = q === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / q));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }
  const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  function distSegmentoSegmento(a, b, c, d) {
    // Se os segmentos se cruzam a distância é 0; senão o mínimo está em algum dos quatro pontos extremos.
    if (orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0) return 0;
    return Math.min(distPontoSegmento(a, c, d), distPontoSegmento(b, c, d), distPontoSegmento(c, a, b), distPontoSegmento(d, a, b));
  }

  // Menor distância entre dois conjuntos de linhas ([[x,y],...] em metros). Para quando chega a `parar` ou menos.
  function distLinhas(A, B, parar = 0) {
    let m = Infinity;
    for (const la of A) {
      const na = Math.max(la.length - 1, 1);
      for (const lb of B) {
        const nb = Math.max(lb.length - 1, 1);
        for (let i = 0; i < na; i++) {
          const a = la[i];
          const b = la[Math.min(i + 1, la.length - 1)];
          for (let j = 0; j < nb; j++) {
            const d = distSegmentoSegmento(a, b, lb[j], lb[Math.min(j + 1, lb.length - 1)]);
            if (d < m) {
              m = d;
              if (m <= parar) return m;
            }
          }
        }
      }
    }
    return m;
  }

  function caixaDe(linhas) {
    const c = [Infinity, Infinity, -Infinity, -Infinity];
    for (const l of linhas)
      for (const [x, y] of l) {
        if (x < c[0]) c[0] = x;
        if (y < c[1]) c[1] = y;
        if (x > c[2]) c[2] = x;
        if (y > c[3]) c[3] = y;
      }
    return c;
  }
  const distCaixas = (a, b) => Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));

  // --- índice de ruas e homônimos ------------------------------------------------------------------
  const RAIO_HOMONIMO_M = 500; // trechos do mesmo nome a até 500 m um do outro são a mesma rua

  // Constrói o índice a partir do ruas_risco.geojson. Cada nome vira um ou mais grupos: trechos do mesmo
  // nome ligados por cadeias de até RAIO_HOMONIMO_M. Mais de um grupo = vias distintas com o mesmo nome.
  function construirIndice(colecao) {
    const trechosPorNome = new Map();
    for (const feat of colecao.features) {
      const { nome, faixas, m, cota_minima: cmin, cota_maxima: cmax } = feat.properties;
      if (!nome) continue;
      const g = feat.geometry;
      const linhas = (g.type === 'MultiLineString' ? g.coordinates : [g.coordinates]).map((l) => l.map(([lng, lat]) => projetar(lng, lat)));
      const lista = trechosPorNome.get(nome) ?? [];
      lista.push({ faixas, m, cmin, cmax, linhas, caixa: caixaDe(linhas) });
      trechosPorNome.set(nome, lista);
    }

    const grupos = [];
    const ruas = [];
    for (const [nome, trechos] of trechosPorNome) {
      const pai = trechos.map((_, i) => i);
      const raiz_ = (i) => (pai[i] === i ? i : (pai[i] = raiz_(pai[i])));
      for (let i = 0; i < trechos.length; i++)
        for (let j = i + 1; j < trechos.length; j++) {
          if (raiz_(i) === raiz_(j)) continue;
          if (distCaixas(trechos[i].caixa, trechos[j].caixa) > RAIO_HOMONIMO_M) continue;
          if (distLinhas(trechos[i].linhas, trechos[j].linhas, RAIO_HOMONIMO_M) <= RAIO_HOMONIMO_M) pai[raiz_(j)] = raiz_(i);
        }
      const porRaiz = new Map();
      trechos.forEach((t, i) => porRaiz.set(raiz_(i), [...(porRaiz.get(raiz_(i)) ?? []), t]));
      const gs = [...porRaiz.values()].map((ts) => {
        const linhas = ts.flatMap((t) => t.linhas);
        return {
          nome,
          chave: semAcento(nome),
          faixas: new Set(ts.flatMap((t) => t.faixas)),
          m: ts.reduce((s, t) => s + t.m, 0), // metros de via dentro das áreas mapeadas
          cmin: Math.min(...ts.map((t) => t.cmin ?? Infinity)),
          cmax: Math.max(...ts.map((t) => t.cmax ?? -Infinity)),
          linhas,
          caixa: caixaDe(linhas),
        };
      });
      grupos.push(...gs);
      ruas.push({ nome, chave: semAcento(nome), grupos: gs });
    }
    return { grupos, ruas };
  }

  // Busca por nome (3+ letras, sem acento): nome exato, depois começa com, depois contém.
  function achar(indice, q) {
    const n = semAcento(q.trim());
    if (n.length < 3) return [];
    const pontos = (r) => (r.chave === n ? 0 : r.chave.startsWith(n) ? 1 : 2);
    return indice.ruas
      .filter((r) => r.chave.includes(n))
      .sort((a, b) => pontos(a) - pontos(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  const refDoPonto = (lng, lat) => {
    const p = projetar(lng, lat);
    return { linhas: [[p]], caixa: [p[0], p[1], p[0], p[1]] };
  };

  // Escolhe qual grupo mostrar quando o nome tem mais de um. Com posição: o mais próximo.
  // Sem posição: o de faixa ativa primeiro (nunca esconde uma via em risco), depois o de maior trecho.
  function escolherGrupo(rua, pos, estadoDe) {
    const ordem = { ativa: 0, indisponivel: 1, inativa: 2 };
    const gs = [...rua.grupos];
    if (pos) {
      const ref = refDoPonto(pos[0], pos[1]);
      return gs.map((g) => ({ g, d: distLinhas(ref.linhas, g.linhas) })).sort((a, b) => a.d - b.d)[0].g;
    }
    return gs.sort((a, b) => ordem[estadoDaRua(a, estadoDe)] - ordem[estadoDaRua(b, estadoDe)] || b.m - a.m)[0];
  }

  // Ruas das áreas mapeadas a até `raio` m de `ref` ({linhas, caixa}: um grupo ou refDoPonto).
  // Distância ponto-segmento em metros; uma rua com vários grupos entra uma vez, pelo grupo mais próximo.
  function vizinhas(indice, ref, estadoDe, { excluir = null, raio = 300, max = 4 } = {}) {
    const melhor = new Map();
    for (const g of indice.grupos) {
      if (g.nome === excluir) continue;
      if (distCaixas(ref.caixa, g.caixa) > raio) continue;
      const d = distLinhas(ref.linhas, g.linhas);
      if (d > raio) continue;
      const ant = melhor.get(g.nome);
      if (!ant || d < ant.d) melhor.set(g.nome, { grupo: g, d });
    }
    const out = [...melhor.values()].map((v) => ({ ...v, estado: estadoDaRua(v.grupo, estadoDe) }));
    // Faixa ativa primeiro, depois a mais próxima
    out.sort((a, b) => (b.estado === 'ativa') - (a.estado === 'ativa') || a.d - b.d);
    return out.slice(0, max);
  }

  const api = {
    FAIXAS, FAMILIAS, CENARIO, RAIO_HOMONIMO_M,
    filtroDe, cenariosDaVia, estadoDeFaixas, estadoDaRua, semAcento, filtrarRuasDaFaixa,
    projetar, distPontoSegmento, distSegmentoSegmento, distLinhas,
    construirIndice, achar, refDoPonto, escolherGrupo, vizinhas,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.RUAS = api;
})(typeof window !== 'undefined' ? window : globalThis);
