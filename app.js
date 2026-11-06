// app.js - Lista viva "pior primeiro". Só ordena e mostra o que o back-end decidiu:
// o estado de cada faixa e o nível vêm de /api/v1/status-geral. Nenhuma regra de risco aqui.
(() => {
  const API = 'http://127.0.0.1:8000/api/v1/status-geral';
  const CHAVE_SALVO = 'ja2_ultimo_estado';
  const TIMEOUT_API_MS = 45000; // por tentativa; o Render gratuito hiberna e a primeira resposta é lenta
  const TENTATIVAS_API = 2; // a 2ª pega o servidor já acordado
  const LIMITE_RUAS = 10; // ruas desenhadas por cartão antes de "mostrar todas"

  // Faixas, cenários, estado da rua, busca e entorno ficam em ruas.js (funções puras, testadas).
  const { FAIXAS, FAMILIAS, filtroDe, semAcento } = RUAS;
  const RUAS_ARQ = 'data/ruas_risco.geojson';

  // Rótulo curto do estado da faixa em cada rua (o front só repete o que o back-end decidiu).
  const TAG_RUA_ATIVA = '🔴 Faixa ativa';
  const ROTULO_NIVEL = { atencao: 'atenção', indisponivel: 'indisponível' }; // provisório (CLAUDE.md: nomes dos níveis em aberto)
  const TEXTO_ESTADO = {
    ativa: 'Faixa ativa agora: risco de alagar',
    inativa: 'Nenhuma faixa ativa agora',
    indisponivel: 'Sem dado válido: estado indisponível',
  };
  const ORDEM_ESTADO = { ativa: 0, indisponivel: 1, inativa: 2 };

  const $ = (id) => document.getElementById(id);

  // --- estado vindo da API -------------------------------------------------------
  let estado = { dados: null, origem: 'nenhum' }; // origem: rede | salvo | nenhum

  function lerSalvo() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_SALVO));
    } catch {
      return null;
    }
  }
  function salvar(dados) {
    try {
      localStorage.setItem(CHAVE_SALVO, JSON.stringify(dados));
    } catch {
      /* sem armazenamento: só não guarda */
    }
  }

  // Uma tentativa na API; lança erro se falhar, estourar o tempo ou vier sem objeto.
  async function pedirApi(n) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_API_MS);
    try {
      const res = await fetch(API, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const dados = json?.data ?? json;
      if (dados == null || typeof dados !== 'object') throw new Error('Resposta sem dados');
      return dados;
    } finally {
      clearTimeout(t);
    }
  }

  async function buscarEstado() {
    for (let n = 1; n <= TENTATIVAS_API; n++) {
      try {
        const dados = await pedirApi(n);
        salvar(dados);
        return { dados, origem: 'rede' };
      } catch (e) {
        console.error(`[API] tentativa ${n}/${TENTATIVAS_API} falhou:`, e);
        if (n < TENTATIVAS_API) await new Promise((r) => setTimeout(r, 3000));
      }
    }
    console.error('[API] todas as tentativas falharam; usando último estado salvo, se houver.');
    const salvo = lerSalvo();
    return salvo ? { dados: salvo, origem: 'salvo' } : { dados: null, origem: 'nenhum' };
  }

  // Dado ausente ou vencido (idade.js, teto de 120 min) nunca vira "nenhuma faixa ativa": vira indisponível.
  const estadoFaixa = (id) => IDADE.estadoFaixa(estado.dados, id, Date.now());
  const estadoDeFaixas = (ids) => RUAS.estadoDeFaixas(ids, estadoFaixa); // única regra de estado, para todas as telas
  const dadoVencido = () => IDADE.vencido(estado.dados, Date.now());
  const idadeMin = () => IDADE.idadeMin(estado.dados?.gerado_em, Date.now());
  function dadoAntigo() {
    const idade = idadeMin();
    const validade = Number(estado.dados?.validade_min);
    return idade != null && validade > 0 && idade > validade;
  }
  const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  // --- painel do nível ------------------------------------------------------------
  function renderPainel() {
    const d = estado.dados;
    const ok = d && d.status !== 'indisponivel' && !dadoVencido();
    const nivel = ok ? semAcento(d.nivel || 'indisponivel') : 'indisponivel';

    const badge = $('ai-risk-badge');
    const semFaixa = nivel === 'nenhum' || nivel === 'atencao_geral'; // atenção geral não pinta ruas
    badge.textContent =
      nivel === 'indisponivel' ? 'DADOS INDISPONÍVEIS' : semFaixa ? 'NENHUMA FAIXA ATIVA' : `NÍVEL ${(ROTULO_NIVEL[nivel] || nivel).toUpperCase()}`;
    const classe = semFaixa ? 'normal' : nivel;
    badge.className = `badge-risk nivel-${classe}`;
    $('ai-card').className = `ai-card nivel-${classe}`;

    // Aviso geral (âmbar): só com dado válido e dentro do teto de idade; não altera nenhuma rua.
    const ag = ok ? d.atencao_geral : null;
    const partes = [];
    if (ag?.chuva === true) partes.push('Chuva forte acumulada nas últimas 24 h: atenção a pontos baixos.');
    if (ag?.mare === true) partes.push('Maré forte na região: atenção a pontos baixos.');
    $('aviso-geral').textContent = partes.length ? `${partes.join(' ')} Fora das áreas mapeadas pelo PDDU também pode alagar. Em emergência, ligue 199.` : '';
    $('aviso-geral').hidden = partes.length === 0;

    const texto = d?.texto;
    if (nivel === 'indisponivel') {
      $('ai-title').textContent = 'Dados indisponíveis';
      $('ai-message').textContent = 'Não foi possível obter o estado atual. Isso não significa que não há risco de alagar.';
    } else {
      $('ai-title').textContent = texto?.titulo ?? 'Veja a lista abaixo';
      $('ai-message').textContent = texto?.mensagem ?? 'Áreas fora das regiões mapeadas também podem alagar.';
    }

    const chuva = Number(d?.chuva_24h_mm);
    const mare = Number(d?.mare_efetiva_m);
    $('m-rain').textContent = ok && d.chuva_24h_mm != null && !Number.isNaN(chuva) ? `${chuva.toFixed(1)} mm` : '—';
    $('m-tide').textContent = ok && d.mare_efetiva_m != null && !Number.isNaN(mare) ? `${mare.toFixed(2)} m` : '—';
    $('m-tide-label').textContent = d?.mare_origem === 'medida' ? 'Maré (medida)' : 'Maré (estimativa)';

    // Horário sempre visível
    $('last-update').textContent = d?.gerado_em
      ? `Joinville - SC • calculado em ${quando(d.gerado_em)}${estado.origem === 'salvo' ? ' (último estado salvo)' : ''}`
      : 'Joinville - SC • sem dados do servidor';

    const avisos = [];
    if (!d) avisos.push('Sem dados atuais: não foi possível falar com o servidor e não há estado salvo.');
    else if (d.status === 'indisponivel') avisos.push('O servidor não tem dado válido agora. As faixas aparecem como indisponíveis.');
    if (d && estado.origem === 'salvo') avisos.push('Sem conexão com o servidor: mostrando o último estado salvo.');
    if (d && d.status !== 'indisponivel' && dadoVencido()) {
      avisos.push(
        `Dado vencido: o último dado é de ${d.gerado_em ? quando(d.gerado_em) : 'horário desconhecido'}, com mais de ${IDADE.IDADE_MAX_MIN / 60} h. Todas as faixas aparecem como indisponíveis. Isso não significa que não haja risco de alagar.`
      );
    } else if (d && dadoAntigo()) {
      avisos.push(`Dado antigo: calculado há ${Math.round(idadeMin())} min (validade ${d.validade_min} min). O risco pode ter mudado.`);
    }
    const aviso = $('aviso-estado');
    aviso.hidden = avisos.length === 0;
    aviso.textContent = avisos.join(' ');
  }

  // --- lista viva ----------------------------------------------------------------------
  const ruasPorFaixa = {}; // id -> [{nome, chave, m}] em ordem alfabética
  let indice = null; // ruas.js: grupos de ruas (homônimos separados por distância)
  let ruasCarregadas = false;
  let ruasFalhou = false;
  let busca = '';
  const aberto = new Map(); // id -> escolha do usuário (aberto/fechado)
  const expandidas = new Set(); // ids de faixa em que o usuário pediu a lista completa

  function indexarRuas(colecao) {
    const mapa = Object.fromEntries(FAIXAS.map((f) => [f.id, new Map()]));
    for (const feat of colecao.features) {
      const { nome, faixas, m } = feat.properties;
      if (!nome) continue;
      for (const id of faixas) mapa[id]?.set(nome, (mapa[id].get(nome) || 0) + m);
    }
    for (const f of FAIXAS) {
      ruasPorFaixa[f.id] = [...mapa[f.id]]
        .map(([nome, m]) => ({ nome, chave: semAcento(nome), m }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }
    indice = RUAS.construirIndice(colecao);
    ruasCarregadas = true;
  }

  function criarCartao(f, ruas, total) {
    const e = estadoDeFaixas([f.id]);
    const li = document.createElement('li');
    li.className = `cartao ${e}${e === 'ativa' && dadoAntigo() ? ' antigo' : ''}`;

    const h = document.createElement('h4');
    h.textContent = f.curto;
    const est = document.createElement('p');
    est.className = 'estado';
    est.textContent = TEXTO_ESTADO[e];
    li.append(h, est);

    if (!ruasCarregadas) {
      const p = document.createElement('p');
      p.className = 'resumo';
      p.textContent = ruasFalhou ? 'Lista de ruas indisponível agora. O estado desta faixa continua valendo.' : 'Carregando ruas...';
      li.append(p);
      return li;
    }

    const det = document.createElement('details');
    det.open = busca ? true : aberto.get(f.id) ?? e === 'ativa'; // só a faixa ativa abre sozinha
    const sum = document.createElement('summary');
    const parcial = !busca && !expandidas.has(f.id) && ruas.length > LIMITE_RUAS;
    const afetadas = e === 'ativa' ? 'ruas com risco de alagar agora' : 'ruas mapeadas';
    sum.textContent = busca
      ? `${ruas.length} de ${total} ruas`
      : parcial
        ? `${total} ${afetadas}: mostrando as ${LIMITE_RUAS} de maior trecho`
        : `${total} ${afetadas}, das de maior trecho para as de menor`;
    const ul = document.createElement('ul');
    ul.className = 'ruas';
    det.append(sum, ul);
    det.addEventListener('toggle', () => {
      if (!busca) aberto.set(f.id, det.open);
    });

    // Com busca ativa o resultado já é curto e filtrado: mostra tudo.
    const ate = busca || expandidas.has(f.id) ? ruas.length : LIMITE_RUAS;
    // Sem busca: ordena pelo comprimento do trecho dentro da área mapeada (único dado por rua; não é severidade).
    const ordenadas = busca ? ruas : [...ruas].sort((a, b) => b.m - a.m);
    for (const r of ordenadas.slice(0, ate)) {
      const item = document.createElement('li');
      const nome = document.createElement('span');
      nome.className = 'nome-rua';
      nome.textContent = r.nome;
      item.append(nome);
      if (e === 'ativa') {
        // Só a faixa ativa marca a rua; o estado das demais já está no cabeçalho do cartão.
        const tag = document.createElement('span');
        tag.className = 'tag ativa';
        tag.textContent = TAG_RUA_ATIVA;
        item.append(tag);
      }
      ul.append(item);
    }
    if (ruas.length > ate) {
      const mais = document.createElement('button');
      mais.type = 'button';
      mais.className = 'mais';
      mais.textContent = `Mostrar todas as ${ruas.length} ruas desta área`;
      mais.addEventListener('click', () => {
        expandidas.add(f.id);
        renderLista();
      });
      det.append(mais);
    }
    if (!ruas.length) {
      const vazio = document.createElement('p');
      vazio.className = 'resumo';
      vazio.textContent = 'Nenhuma rua encontrada nesta área.';
      det.append(vazio);
    }
    li.append(det);
    return li;
  }

  function renderLista() {
    const q = semAcento(busca.trim());
    // Famílias com faixa ativa primeiro, depois indisponível, depois o resto; dentro da família, do cenário mais frequente ao mais raro.
    const pior = (fam) => Math.min(...fam.faixas.map((id) => ORDEM_ESTADO[estadoDeFaixas([id])]));
    const familias = FAMILIAS.map((fam, i) => ({ fam, i, p: pior(fam) })).sort((a, b) => a.p - b.p || a.i - b.i);

    const grupos = [];
    for (const { fam } of familias) {
      const cartoes = [];
      for (const id of fam.faixas) {
        const f = FAIXAS.find((x) => x.id === id);
        const todas = ruasPorFaixa[id] || [];
        const ruas = RUAS.filtrarRuasDaFaixa(todas, f.rotulo, q);
        if (q && !ruas.length) continue;
        cartoes.push(criarCartao(f, ruas, todas.length));
      }
      if (!cartoes.length) continue;
      const li = document.createElement('li');
      li.className = 'familia';
      const h = document.createElement('h3');
      h.textContent = fam.rotulo;
      const ex = document.createElement('p');
      ex.className = 'resumo';
      ex.textContent = fam.explica;
      const ul = document.createElement('ul');
      ul.className = 'cartoes';
      ul.append(...cartoes);
      li.append(h, ex, ul);
      grupos.push(li);
    }
    $('lista').replaceChildren(...grupos);
    $('sem-resultado').hidden = grupos.length > 0;
  }

  // --- localização (ponto-em-polígono sobre as manchas) -------------------------------
  const manchas = {}; // id -> FeatureCollection
  let promessaManchas = null;
  const carregarJson = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  };
  function carregarManchas() {
    promessaManchas ??= Promise.all(FAIXAS.map((f) => carregarJson(f.mancha))).then((r) => {
      FAIXAS.forEach((f, i) => (manchas[f.id] = r[i]));
    });
    return promessaManchas;
  }

  // --- diagnóstico por endereço + entorno (~300 m) ---------------------------------------
  // Só usa o que o projeto sabe: ruas dentro das áreas mapeadas e o estado das faixas vindo do
  // back-end. Não há cota nem severidade por rua, então não existe "segura", "atenção" nem rota.
  const RAIO_ENTORNO_M = 300;
  const MAX_ENTORNO = 4;
  const ICONE_RUA = { ativa: '🔴', inativa: '⚪', indisponivel: '⚪' };
  const TEXTO_RUA = { ativa: 'parte da via em faixa ativa agora', inativa: 'nenhuma faixa ativa agora', indisponivel: 'estado indisponível' };
  let ultimaPosicao = null; // [lng, lat] do último GPS: desempata ruas homônimas

  function blocoEntorno(ref, excluir) {
    const viz = RUAS.vizinhas(indice, ref, estadoFaixa, { excluir, raio: RAIO_ENTORNO_M, max: MAX_ENTORNO });
    const sec = document.createElement('div');
    sec.className = 'entorno';
    const h = document.createElement('h4');
    h.textContent = `🧭 Ruas mapeadas ao redor (até ~${RAIO_ENTORNO_M} m)`;
    sec.append(h);
    if (!viz.length) {
      const p = document.createElement('p');
      p.className = 'resumo';
      p.textContent = 'Nenhuma outra rua das áreas mapeadas neste raio. Isso não significa que não haja risco de alagar.';
      sec.append(p);
      return sec;
    }
    const ul = document.createElement('ul');
    for (const { grupo, d, estado: e } of viz) {
      const li = document.createElement('li');
      li.textContent = `${ICONE_RUA[e]} ${grupo.nome} (a ~${Math.max(10, Math.round(d / 10) * 10)} m): ${TEXTO_RUA[e]}`;
      ul.append(li);
    }
    const nota = document.createElement('small');
    nota.textContent = 'Só aparecem ruas dentro das áreas mapeadas pelo PDDU. As demais não foram avaliadas.';
    sec.append(ul, nota);
    return sec;
  }

  function rodapeEmergencia() {
    const p = document.createElement('p');
    p.className = 'emergencia';
    p.innerHTML = '📞 <strong>Defesa Civil 199</strong> | <strong>Bombeiros 193</strong>. Fora das áreas mapeadas também pode alagar. Este app não substitui a Defesa Civil.';
    return p;
  }

  // Cenário (menor tempo de retorno) em que a via aparece, uma linha por família. Vermelho só se a faixa está ativa;
  // senão é só informação, em cor neutra.
  function blocoCenario(grupo) {
    const sec = document.createElement('div');
    sec.className = 'cenario';
    for (const c of RUAS.cenariosDaVia(grupo.faixas)) {
      const e = estadoDeFaixas([c.faixa]);
      const p = document.createElement('p');
      p.className = e === 'ativa' ? 'cenario-ativo' : '';
      p.textContent = `${ICONE_RUA[e]} Esta via ${c.texto}.`;
      sec.append(p);
    }
    const nota = document.createElement('small');
    nota.textContent = 'Os cenários vêm do PDDU. Quanto mais frequente o cenário, mais cedo a via entra em risco de alagar.';
    sec.append(nota);
    return sec;
  }

  function mostrarDiagnostico(texto) {
    const caixa = $('resultado');
    const ativa = texto.trim().length >= 3;
    // Com busca ativa o foco é só o diagnóstico: lista geral oculta. Ao limpar a busca, volta fechada.
    $('lista-geral').hidden = ativa;
    $('lista-geral').open = false;
    if (!ativa) {
      caixa.hidden = true;
      return;
    }
    const achadas = ruasCarregadas ? RUAS.achar(indice, texto) : [];
    const card = document.createElement('div');
    card.className = 'diagnostico';
    if (!ruasCarregadas) {
      card.textContent = ruasFalhou ? 'Lista de ruas indisponível agora.' : 'Carregando ruas...';
    } else if (!achadas.length) {
      const p = document.createElement('p');
      const h = document.createElement('h3');
      h.textContent = '⚪ Rua fora das áreas mapeadas';
      p.textContent = 'Não encontrei essa rua nas áreas mapeadas pelo PDDU. Isso não é garantia de segurança: o PDDU cobre só alguns cenários, e falhas de drenagem e chuva local podem alagar qualquer rua. Confira o nome (sem número nem bairro) e, se estiver preocupado, ligue para a Defesa Civil (199).';
      card.append(h, p, rodapeEmergencia());
    } else {
      const rua = achadas[0];
      const r = RUAS.escolherGrupo(rua, ultimaPosicao, estadoFaixa);
      const e = RUAS.estadoDaRua(r, estadoFaixa);
      const h = document.createElement('h3');
      h.textContent = `🏠 Diagnóstico para: ${r.nome}`;
      const sit = document.createElement('p');
      sit.className = `situacao ${e}`;
      card.classList.add(`via-${e}`);
      const ativas = FAIXAS.filter((f) => r.faixas.has(f.id) && estadoFaixa(f.id) === 'ativa');
      sit.textContent =
        e === 'ativa'
          ? `🔴 Situação: RISCO DE ALAGAR EM TRECHOS DA VIA (${ativas.map((f) => f.rotulo).join('; ')})`
          : e === 'indisponivel'
            ? '⚪ Situação: estado indisponível. Isso não significa que não haja risco de alagar.'
            : '⚪ Situação: nenhuma faixa ativa agora para esta via (a via tem trechos em área mapeada)';
      const sig = document.createElement('p');
      sig.textContent =
        e === 'ativa'
          ? `Cerca de ${Math.round(r.m)} m desta via estão dentro da área mapeada, com faixa ativa agora. O risco de alagar pode se concentrar em partes da rua e não necessariamente em toda a extensão. Se você mora em andar térreo, tem comércio ao nível da rua ou garagem em subsolo, previna-se e acompanhe a Defesa Civil (199).`
          : e === 'indisponivel'
            ? 'Esta via tem trechos dentro de área mapeada pelo PDDU, mas não há dado válido para dizer se alguma faixa está ativa. Trate como possível risco de alagar e acompanhe a Defesa Civil (199).'
            : 'Esta via tem trechos dentro de área mapeada pelo PDDU, mas nenhuma faixa dela está ativa agora. Isso não quer dizer que o terreno seja alto nem que não haja risco de alagar: o risco muda com a maré e a chuva, e outras faixas podem ativar.';
      card.append(h, sit, sig);
      if (rua.grupos.length > 1) {
        const hom = document.createElement('p');
        hom.className = 'homonimo';
        hom.textContent = `Atenção: há mais de uma rua com este nome nas áreas mapeadas. ${
          ultimaPosicao ? 'Mostrando a mais próxima da sua localização.' : 'Mostrando a que tem faixa ativa ou o maior trecho mapeado; use o GPS para escolher a sua.'
        }`;
        card.append(hom);
      }
      card.append(blocoCenario(r));
      if (Number.isFinite(r.cmin)) {
        // Informativo. Não há comparação com a maré: o referencial vertical das curvas não está confirmado
        // e a precisão é de ~1 m, maior que a diferença entre os gatilhos.
        const alt = document.createElement('small');
        alt.textContent = `Altitude aproximada da via: ${r.cmin.toFixed(1)} a ${r.cmax.toFixed(1)} m (curvas de nível da Prefeitura, margem de cerca de 1 m). Não compare com a altura da maré: o referencial vertical não está confirmado.`;
        card.append(alt);
      }
      card.append(blocoEntorno(r, r.nome));
      if (achadas.length > 1) {
        const outras = document.createElement('small');
        outras.textContent = `Outras ruas com esse nome: ${achadas.slice(1, 6).map((x) => x.nome).join('; ')}${achadas.length > 6 ? '…' : ''}`;
        card.append(outras);
      }
      card.append(rodapeEmergencia());
    }
    caixa.replaceChildren(card);
    caixa.hidden = false;
  }

  function mostrarResultado(dentro, precisao, pos) {
    const caixa = $('resultado');
    const p = document.createElement('p');
    const lista = document.createElement('ul');
    if (dentro.length) {
      // Mesma regra de estado das outras telas (ativa > indisponível > inativa, com teto de idade).
      const e = estadoDeFaixas(dentro.map((f) => f.id));
      p.textContent =
        e === 'ativa'
          ? 'Você está numa área mapeada com faixa ativa agora: há risco de alagar aqui.'
          : e === 'indisponivel'
            ? 'Você está dentro de uma área mapeada pelo PDDU, mas não há dado válido para dizer se alguma faixa está ativa. Trate como possível risco de alagar.'
            : 'Você está dentro de uma área mapeada pelo PDDU, mas nenhuma faixa dela está ativa agora. O risco de alagar muda com maré e chuva.';
      for (const f of dentro) {
        const li = document.createElement('li');
        li.textContent = `${f.rotulo}: ${TEXTO_ESTADO[estadoDeFaixas([f.id])]}`;
        lista.append(li);
      }
    } else {
      p.textContent = 'Você está fora das áreas mapeadas. Isso não significa que não haja risco de alagar.';
    }
    const nota = document.createElement('small');
    nota.textContent = `Precisão do GPS: ±${Math.round(precisao)} m. Perto da borda de uma área mapeada o resultado é incerto. Este app não substitui a Defesa Civil (199).`;
    const entorno = pos && ruasCarregadas ? [blocoEntorno(RUAS.refDoPonto(pos[0], pos[1]), null)] : [];
    caixa.replaceChildren(p, lista, ...entorno, nota, rodapeEmergencia());
    caixa.hidden = false;
  }

  function usarGps() {
    const btn = $('btn-location');
    const caixa = $('resultado');
    const aviso = (txt) => {
      caixa.replaceChildren(txt);
      caixa.hidden = false;
    };
    if (!navigator.geolocation) return aviso('Este navegador não oferece geolocalização.');
    btn.disabled = true;
    btn.textContent = '⌛ Obtendo localização...';
    const volta = () => {
      btn.disabled = false;
      btn.textContent = '📍 Usar minha localização';
    };
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await carregarManchas();
          const { latitude: lat, longitude: lng, accuracy } = pos.coords;
          const dentro = FAIXAS.filter((f) => PIP.pontoNaColecao(manchas[f.id], lng, lat, filtroDe(f.id)));
          ultimaPosicao = [lng, lat];
          $('lista-geral').open = false;
          mostrarResultado(dentro, accuracy, [lng, lat]);
        } catch (e) {
          console.warn('Falha ao carregar as manchas:', e);
          aviso('Não foi possível carregar as áreas mapeadas para conferir sua posição. Tente de novo com conexão.');
        } finally {
          volta();
        }
      },
      () => {
        volta();
        aviso('Não foi possível obter sua localização. Verifique a permissão de GPS no navegador.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // --- início --------------------------------------------------------------------------
  function renderTudo() {
    renderPainel();
    renderLista();
  }

  $('btn-location').addEventListener('click', usarGps);
  $('busca').addEventListener('input', (e) => {
    busca = e.target.value;
    renderLista();
    mostrarDiagnostico(busca);
  });

  (async () => {
    // Cache primeiro: mostra já o último estado salvo, depois atualiza pela rede.
    $('lista-geral').open = false; // tela inicial limpa: a lista geral sempre começa recolhida
    const salvo = lerSalvo();
    if (salvo) estado = { dados: salvo, origem: 'salvo' };
    renderTudo();

    // Ruas: até 3 tentativas (cache do Service Worker primeiro); só avisa se todas falharem.
    const carregarRuas = async () => {
      for (let i = 0; i < 3 && !ruasCarregadas; i++) {
        try {
          indexarRuas(await carregarJson(RUAS_ARQ));
          ruasFalhou = false;
          $('aviso-ruas').hidden = true;
        } catch (e) {
          console.warn(`Falha ao carregar as ruas (tentativa ${i + 1}/3):`, e);
          if (i < 2) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        }
      }
      if (!ruasCarregadas) {
        ruasFalhou = true;
        $('aviso-ruas').hidden = false;
      }
      renderLista();
    };
    const ruasP = carregarRuas();
    window.addEventListener('online', () => {
      if (!ruasCarregadas) carregarRuas();
    });

    estado = await buscarEstado();
    renderTudo();
    await ruasP;
    if (busca) mostrarDiagnostico(busca);
    carregarManchas().catch(() => {}); // aquece o cache para o GPS responder rápido

    setInterval(async () => {
      estado = await buscarEstado();
      renderTudo();
    }, 5 * 60 * 1000);

    // Reavalia a idade a cada minuto: com a página aberta e a API fora do ar, o dado pode vencer sem nova resposta.
    setInterval(() => {
      renderTudo();
      if (busca) mostrarDiagnostico(busca);
    }, 60 * 1000);
  })();
})();
