// mapa.js - Caminho livre e mapa. O back-end calcula e classifica os trechos; aqui só se desenha.
// Métrica de exposição às faixas do PDDU: não sugere caminho nem desvio.
// As funções puras rodam no navegador e no Node (teste/mapa.test.js); o resto só no navegador.
(function (raiz) {
  const node = typeof module !== 'undefined' && module.exports;
  const { semAcento } = node ? require('./ruas.js') : raiz.RUAS; // mesma normalização da busca de ruas

  // Leaflet carregado sob demanda (só ao abrir o painel pela primeira vez), versão e hash fixos.
  const LEAFLET = {
    css: {
      href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
      integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
    },
    js: {
      src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
    },
  };
  // Fundo do mapa: OpenFreeMap (gratuito, sem chave) desenhado pelo MapLibre GL através do plugin para Leaflet.
  // Só carregam depois do Leaflet e, se falharem, os trechos aparecem sem fundo (nenhum outro provedor de tiles).
  const MAPLIBRE = {
    css: {
      href: 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css',
      integrity: 'sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK',
    },
    js: {
      src: 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js',
      integrity: 'sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp',
    },
    plugin: {
      src: 'https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js',
      integrity: 'sha384-tXYNKOHx4T02jMP7YYCtBxPIv1B5gaA5mcVPBzqMp6d7VzWzxJgI2aWF/nJLrQdS',
    },
  };
  const ESTILO_FUNDO = 'https://tiles.openfreemap.org/styles/liberty';
  const ATRIBUICAO = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap';

  // Cores espelham --nivel-alto e --nivel-atencao de style.css (atributo SVG não lê var()). Nenhum verde.
  const ESTILOS = {
    faixa_ativa: { color: '#ef4444', weight: 6, opacity: 0.9 },
    area_sem_faixa_ativa: { color: '#eab308', weight: 6, opacity: 0.9 },
    nao_avaliado: { color: '#94a3b8', weight: 4, opacity: 0.85, dashArray: '8 8' },
  };

  // Rótulos das classes: os mesmos textos da legenda em index.html.
  const ROTULO_CLASSE = {
    faixa_ativa: 'Faixa ativa no cenário',
    area_sem_faixa_ativa: 'Área mapeada pelo PDDU, sem faixa ativa',
    nao_avaliado: 'Fora das áreas mapeadas pelo PDDU: não avaliado (não significa ausência de risco)',
  };
  // Denominações que o cidadão costuma omitir ("Aubé" para "Rua Aubé"); só a inicial do texto digitado é removida.
  const DENOMINACOES = new Set(['rua', 'av', 'avenida', 'servidao', 'travessa', 'alameda', 'ponte', 'rodovia', 'praca', 'estrada']);
  const MIN_LETRAS = 3;
  const normalizar = (s) => semAcento(String(s ?? '')).replace(/[^a-z0-9]+/g, ' ').trim();

  // Texto digitado sem acento, caixa nem denominação inicial. Menos de 3 letras sobrando = null ("curto").
  function consulta(texto) {
    const palavras = normalizar(texto).split(' ').filter(Boolean);
    if (palavras.length && DENOMINACOES.has(palavras[0])) palavras.shift();
    const q = palavras.join(' ');
    return q.length < MIN_LETRAS ? null : q;
  }

  function estiloDoTrecho(classe) {
    return { ...(ESTILOS[classe] ?? ESTILOS.nao_avaliado) };
  }

  // Marcadores de início e fim: cores fora das classes de risco (nada de vermelho nem âmbar).
  const COR_INICIO = '#1d4ed8';
  const COR_FIM = '#7c3aed';

  // Dois pontos { lat, lng, rotulo, cor } a partir de origem/destino da resposta ok; ponto sem coordenadas não gera marcador.
  function marcadoresInicioFim(corpo) {
    const ponto = (p, rotulo, cor) => (Number.isFinite(p?.lat) && Number.isFinite(p?.lon) ? [{ lat: p.lat, lng: p.lon, rotulo, cor }] : []);
    return [...ponto(corpo?.origem, 'Início', COR_INICIO), ...ponto(corpo?.destino, 'Fim', COR_FIM)];
  }

  // 3,992 -> "3,99 km"
  function formatarKm(km) {
    return `${Number(km).toFixed(2).replace('.', ',')} km`;
  }

  // --- caminho livre: entre duas ruas, o mais curto e o de menor exposição (GET /rota) -----------------------
  // Métrica de exposição às faixas do PDDU; o back-end calcula os dois caminhos, aqui só se mostra.
  const TEXTOS_ROTA = {
    teto: 'O caminho de menor exposição ficaria mais de 20% mais longo; exibindo o mais curto.',
    indisponivel: 'Os dados de maré e chuva estão desatualizados. Tente mais tarde.',
    sem_caminho: 'Não há caminho entre essas ruas dentro da malha mapeada.',
    curto: 'Digite pelo menos 3 letras em cada rua.',
    nao_encontrado: 'Não encontramos uma dessas ruas na malha mapeada. Isso não significa ausência de risco.',
    erro: 'Caminho livre indisponível agora. Tente mais tarde.',
    sem_conexao: 'Sem conexão com o servidor. Verifique a internet e tente de novo.',
    sem_servico: 'O servidor ainda não tem o caminho livre. Tente mais tarde.',
    iniciando: 'O servidor está iniciando. Tente de novo em instantes.',
    quis_dizer: 'Você quis dizer:',
    escolha: 'Há mais de uma rua com esse nome. Escolha a que você quer; o app não escolhe por você.',
    mais_opcoes: 'Há mais opções do que as listadas. Digite mais letras do nome para refinar.',
    nao_avaliado: 'Não avaliado não significa ausência de risco.',
    metrica: 'Métrica de exposição do PDDU. Não é recomendação de trajeto.',
    atribuicao: 'Mapa: © colaboradores do OpenStreetMap; fundo OpenFreeMap © OpenMapTiles.',
  };
  const CAMINHOS = { curto: 'caminho_curto', exposicao: 'caminho_exposicao' };

  // Query string do pedido; origem_no / destino_no só entram quando o usuário escolheu uma opção.
  function urlRota(base, origem, destino, origemNo, destinoNo) {
    const q = new URLSearchParams({ origem: String(origem).trim(), destino: String(destino).trim() });
    if (origemNo != null) q.set('origem_no', String(origemNo));
    if (destinoNo != null) q.set('destino_no', String(destinoNo));
    return `${base}/rota?${q}`;
  }

  // Rótulo de uma opção de rua homônima, em até duas linhas, sem risco:
  // "Rua X, 26 trechos, 3,6 km" e, se houver, "entre Rua Y e Rua Z" (ponta sem vizinha: "de Rua Y até o fim da via").
  function rotuloOpcao(o) {
    if (o?.trechos == null || o?.km == null) return o?.nome ?? o?.rotulo ?? '';
    const n = o.trechos === 1 ? '1 trecho' : `${o.trechos} trechos`;
    const linhas = [`${o.nome}, ${n}, ${Number(o.km).toFixed(1).replace('.', ',')} km`];
    const ini = o.cruza_inicio ?? null;
    const fim = o.cruza_fim ?? null;
    if (!ini && !fim) linhas.push('sem cruzamento nomeado');
    else if (ini && fim) linhas.push(`entre ${ini} e ${fim}`);
    else if (ini) linhas.push(`de ${ini} até o fim da via`);
    else if (fim) linhas.push(`do fim da via até ${fim}`);
    return linhas.join('\n');
  }

  // Quatro números de um caminho, já formatados: total, faixa ativa, área sem faixa ativa e não avaliado.
  function resumoCaminho(desc) {
    const k = desc?.km_por_classe ?? {};
    return {
      total: formatarKm(desc?.km ?? 0),
      faixa_ativa: formatarKm(k.faixa_ativa ?? 0),
      area_sem_faixa_ativa: formatarKm(k.area_sem_faixa_ativa ?? 0),
      nao_avaliado: formatarKm(k.nao_avaliado ?? 0),
    };
  }

  const MAX_OPCOES_VISIVEIS = 5;

  // Opções com rótulo; se duas tiverem o mesmo título (1ª linha), a posição entre elas entra como última linha.
  function rotularOpcoes(lista) {
    const rotulos = lista.map(rotuloOpcao);
    const titulos = rotulos.map((r) => r.split('\n')[0]);
    const visto = {};
    return lista.map((o, i) => {
      const iguais = titulos.filter((t) => t === titulos[i]).length;
      visto[titulos[i]] = (visto[titulos[i]] ?? 0) + 1;
      return { rotulo: iguais > 1 ? `${rotulos[i]}\n${visto[titulos[i]]}ª opção` : rotulos[i], no: o.no };
    });
  }

  // Texto acima das sugestões: o que foi digitado, entre aspas.
  const textoSugestao = (digitado) => `Não encontramos "${String(digitado).trim()}". ${TEXTOS_ROTA.quis_dizer}`;

  // Ao tocar numa sugestão, o campo daquele lado recebe o nome oficial; o outro fica como está.
  function aplicarSugestao(campos, campo, nome) {
    return { ...campos, [campo]: nome };
  }

  // Traduz a resposta do endpoint (HTTP + corpo JSON) em { tipo, ... } para a tela. Nunca devolve "ok" sem
  // os dois caminhos, nem trata erro como ausência de risco.
  function interpretarRota(http, corpo) {
    if (http === 400) return { tipo: 'curto', mensagem: TEXTOS_ROTA.curto };
    if (http === 0) return { tipo: 'sem_conexao', mensagem: TEXTOS_ROTA.sem_conexao }; // falha de rede
    if (http === 404) return { tipo: 'sem_servico', mensagem: TEXTOS_ROTA.sem_servico };
    if (http === 408 || http === 503 || http === 504) return { tipo: 'iniciando', mensagem: TEXTOS_ROTA.iniciando }; // 408 = tempo esgotado
    if (http !== 200 || !corpo || typeof corpo !== 'object') return { tipo: 'erro', mensagem: TEXTOS_ROTA.erro };
    switch (corpo.status) {
      case 'ok':
        if (!corpo.caminho_curto?.trechos || !corpo.caminho_exposicao?.trechos) return { tipo: 'erro', mensagem: TEXTOS_ROTA.erro };
        return { tipo: 'ok', teto: corpo.teto_aplicado === true, mensagemTeto: corpo.teto_aplicado === true ? TEXTOS_ROTA.teto : '' };
      case 'ambiguo': {
        const lados = ['origem', 'destino']
          .filter((campo) => corpo[campo]?.ambiguo)
          .map((campo) => ({
            campo,
            titulo: campo === 'origem' ? 'Rua de origem' : 'Rua de destino',
            total: corpo[campo].total_opcoes,
            opcoes: rotularOpcoes((corpo[campo].opcoes ?? []).slice(0, MAX_OPCOES_VISIVEIS)),
          }));
        if (!lados.length) return { tipo: 'erro', mensagem: TEXTOS_ROTA.erro };
        return { tipo: 'ambiguo', lados, mensagem: TEXTOS_ROTA.escolha };
      }
      case 'indisponivel': return { tipo: 'indisponivel', mensagem: TEXTOS_ROTA.indisponivel };
      case 'sem_caminho': return { tipo: 'sem_caminho', mensagem: TEXTOS_ROTA.sem_caminho };
      case 'nao_encontrado': {
        const sugestoes = ['origem', 'destino']
          .map((campo) => ({ campo, nomes: (corpo[campo]?.sugestoes ?? []).filter((n) => typeof n === 'string').slice(0, 3) }))
          .filter((l) => l.nomes.length && corpo[l.campo]?.total_opcoes === 0);
        return { tipo: 'nao_encontrado', mensagem: TEXTOS_ROTA.nao_encontrado, sugestoes };
      }
      default: return { tipo: 'erro', mensagem: TEXTOS_ROTA.erro };
    }
  }

  const api = { estiloDoTrecho, formatarKm, marcadoresInicioFim, COR_INICIO, COR_FIM, consulta, urlRota, resumoCaminho, rotuloOpcao, interpretarRota, textoSugestao, aplicarSugestao, TEXTOS_ROTA, CAMINHOS, ROTULO_CLASSE, ESTILOS, LEAFLET, MAPLIBRE };

  // --- só no navegador -------------------------------------------------------------------
  if (typeof document !== 'undefined') {
    let promessaLeaflet = null;
    const carregarCss = ({ href, integrity }) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = href;
      css.integrity = integrity;
      css.crossOrigin = 'anonymous';
      document.head.appendChild(css);
    };
    const carregarJs = ({ src, integrity }) =>
      new Promise((resolve, reject) => {
        const js = document.createElement('script');
        js.src = src;
        js.integrity = integrity;
        js.crossOrigin = 'anonymous';
        js.onload = resolve;
        js.onerror = () => reject(new Error(`não carregou: ${src}`));
        document.head.appendChild(js);
      });
    // Leaflet (obrigatório) e, depois dele, MapLibre + plugin (o fundo). Sem o fundo o mapa continua útil.
    function carregarLeaflet() {
      promessaLeaflet ??= (async () => {
        carregarCss(LEAFLET.css);
        await carregarJs(LEAFLET.js);
        try {
          carregarCss(MAPLIBRE.css);
          await carregarJs(MAPLIBRE.js); // o plugin lê o MapLibre global ao carregar
          await carregarJs(MAPLIBRE.plugin);
        } catch (e) {
          console.warn('[mapa] fundo OpenFreeMap indisponível; mostrando só os trechos:', e);
        }
        return raiz.L;
      })().catch((e) => {
        promessaLeaflet = null; // permite nova tentativa na próxima abertura
        throw e;
      });
      return promessaLeaflet;
    }

    // base: URL da API sem o endpoint (ex.: https://.../api/v1), passada por app.js.
    function init({ base }) {
      const $ = (id) => document.getElementById(id);
      const painel = $('painel-mapa');
      if (!painel) return;
      let mapa = null;

      // Mapa do caminho livre. Vista inicial no centro de Joinville:
      // o plugin do fundo exige centro e zoom antes de entrar no mapa.
      function criarMapa(L) {
        if (mapa) return;
        mapa = L.map('mapa-trajeto', { center: [-26.30, -48.845], zoom: 13 });
        if (L.maplibreGL) {
          try {
            // O fundo entra antes dos trechos e fica no painel dos tiles, abaixo da camada de trechos.
            L.maplibreGL({ style: ESTILO_FUNDO, attribution: ATRIBUICAO }).addTo(mapa);
          } catch (e) {
            console.warn('[mapa] fundo OpenFreeMap indisponível; mostrando só os trechos:', e);
          }
        }
        mapa.createPane('marcadores').style.zIndex = 650; // acima da linha do caminho
      }

      // --- caminho livre ---------------------------------------------------------------------------
      let camadaCaminho = null; // caminho desenhado agora
      let camadaMarcadores = null; // bolinhas de início e fim
      let ultimo = null; // resposta ok em exibição: { corpo, qual }
      let escolhas = { origem: null, destino: null }; // nós escolhidos entre opções ambíguas
      let pedidoCaminho = 0;
      const msgCaminho = (texto) => {
        $('caminho-msg').textContent = texto;
      };
      function limparCaminho() {
        if (camadaCaminho) camadaCaminho.remove();
        camadaCaminho = null;
        if (camadaMarcadores) camadaMarcadores.remove();
        camadaMarcadores = null;
        ultimo = null;
        $('caminho-resultado').hidden = true;
        $('mapa-orienta').hidden = false;
      }
      // Só textContent, nunca HTML vindo da API.
      const el = (tag, texto, classe) => {
        const e = document.createElement(tag);
        if (texto != null) e.textContent = texto;
        if (classe) e.className = classe;
        return e;
      };

      function desenharCaminho(qual) {
        ultimo.qual = qual;
        for (const k of Object.keys(CAMINHOS)) $(`caminho-ver-${k}`).setAttribute('aria-pressed', String(k === qual));
        if (!mapa) return;
        if (camadaCaminho) camadaCaminho.remove();
        camadaCaminho = raiz.L.geoJSON(ultimo.corpo[CAMINHOS[qual]].trechos, { style: (f) => estiloDoTrecho(f.properties.classe) }).addTo(mapa);
        mapa.invalidateSize();
        mapa.fitBounds(camadaCaminho.getBounds(), { padding: [20, 20] });
      }

      function desenharMarcadores(corpo) {
        if (camadaMarcadores) camadaMarcadores.remove();
        camadaMarcadores = null;
        if (!mapa) return;
        camadaMarcadores = raiz.L.layerGroup(
          marcadoresInicioFim(corpo).map((p) =>
            raiz.L.circleMarker([p.lat, p.lng], { pane: 'marcadores', radius: 8, color: '#ffffff', weight: 2, fillColor: p.cor, fillOpacity: 1 })
              .bindTooltip(p.rotulo, { permanent: true, direction: 'top', offset: [0, -6], className: 'marcador-rotulo' })),
        ).addTo(mapa);
      }

      function mostrarComparacao(corpo, interp) {
        ultimo = { corpo, qual: 'curto' };
        const caixa = $('caminho-comparacao');
        caixa.replaceChildren();
        for (const [k, titulo] of [['curto', 'Mais curto'], ['exposicao', 'Menor exposição']]) {
          const r = resumoCaminho(corpo[CAMINHOS[k]]);
          const cartao = el('div', null, 'caminho-cartao');
          cartao.append(el('h4', titulo));
          const dl = el('dl', null, 'mapa-totais');
          for (const [rotulo, valor] of [['Total', r.total], ['Faixa ativa', r.faixa_ativa], ['Área mapeada, sem faixa ativa', r.area_sem_faixa_ativa], ['Não avaliado', r.nao_avaliado]]) {
            const linha = document.createElement('div');
            linha.append(el('dt', rotulo), el('dd', valor));
            dl.append(linha);
          }
          cartao.append(dl);
          caixa.append(cartao);
        }
        $('caminho-teto').textContent = interp.mensagemTeto;
        $('caminho-resultado').hidden = false;
        $('mapa-orienta').hidden = true;
        desenharCaminho('curto');
        desenharMarcadores(corpo);
      }

      function mostrarOpcoes(interp) {
        const caixa = $('caminho-opcoes');
        caixa.replaceChildren();
        for (const lado of interp.lados) {
          const grupo = el('div', null, 'caminho-lado');
          grupo.append(el('p', `${lado.titulo}: escolha uma opção`));
          for (const o of lado.opcoes) {
            const b = el('button', o.rotulo, 'caminho-opcao');
            b.type = 'button';
            b.addEventListener('click', () => {
              escolhas[lado.campo] = o.no;
              enviarCaminho();
            });
            grupo.append(b);
          }
          if (lado.total > lado.opcoes.length) grupo.append(el('small', TEXTOS_ROTA.mais_opcoes));
          caixa.append(grupo);
        }
        caixa.hidden = false;
      }

      // Sugestões para nome digitado com erro: um botão por nome oficial; tocar preenche o campo e envia de novo.
      function mostrarSugestoes(interp) {
        const caixa = $('caminho-opcoes');
        caixa.replaceChildren();
        for (const lado of interp.sugestoes) {
          const grupo = el('div', null, 'caminho-lado');
          grupo.append(el('p', textoSugestao($(`caminho-${lado.campo}`).value)));
          for (const nome of lado.nomes) {
            const b = el('button', nome, 'caminho-opcao');
            b.type = 'button';
            b.addEventListener('click', () => {
              const novo = aplicarSugestao({ origem: $('caminho-origem').value, destino: $('caminho-destino').value }, lado.campo, nome);
              $('caminho-origem').value = novo.origem;
              $('caminho-destino').value = novo.destino;
              escolhas = { origem: null, destino: null };
              enviarCaminho();
            });
            grupo.append(b);
          }
          caixa.append(grupo);
        }
        caixa.hidden = false;
      }

      async function enviarCaminho() {
        const origem = $('caminho-origem').value;
        const destino = $('caminho-destino').value;
        const meu = ++pedidoCaminho;
        limparCaminho();
        $('caminho-opcoes').hidden = true;
        if (consulta(origem) === null || consulta(destino) === null) return msgCaminho(TEXTOS_ROTA.curto); // sem pedido
        msgCaminho('Calculando…');
        let interp;
        let corpo = null;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 45000); // o Render gratuito pode estar acordando
        try {
          const res = await fetch(urlRota(base, origem, destino, escolhas.origem, escolhas.destino), { signal: ctrl.signal });
          corpo = await res.json().catch(() => null);
          interp = interpretarRota(res.status, corpo);
        } catch (e) {
          console.warn('[caminho] indisponível:', e);
          interp = interpretarRota(e?.name === 'AbortError' ? 408 : 0, null); // tempo esgotado x sem conexão
        } finally {
          clearTimeout(t);
        }
        if (meu !== pedidoCaminho) return;
        if (interp.tipo === 'ambiguo') {
          msgCaminho(interp.mensagem);
          return mostrarOpcoes(interp);
        }
        if (interp.tipo === 'nao_encontrado' && interp.sugestoes.length) {
          msgCaminho('');
          return mostrarSugestoes(interp);
        }
        if (interp.tipo !== 'ok') return msgCaminho(interp.mensagem);
        msgCaminho('');
        try {
          const L = await carregarLeaflet();
          if (meu !== pedidoCaminho) return;
          $('mapa-aviso').hidden = true;
          criarMapa(L);
        } catch (e) {
          console.warn('[caminho] mapa indisponível; só os números:', e); // os totais aparecem mesmo sem mapa
        }
        mostrarComparacao(corpo, interp);
      }

      $('caminho-form').addEventListener('submit', (e) => {
        e.preventDefault();
        enviarCaminho();
      });
      for (const id of ['caminho-origem', 'caminho-destino']) {
        $(id).addEventListener('input', () => {
          escolhas = { origem: null, destino: null }; // texto novo invalida a opção escolhida antes
          $('caminho-opcoes').hidden = true;
        });
      }
      for (const k of Object.keys(CAMINHOS)) {
        $(`caminho-ver-${k}`).addEventListener('click', () => ultimo && desenharCaminho(k));
      }
      // O mapa abre vazio, no centro de Joinville; o Leaflet só é carregado na primeira abertura do painel.
      painel.addEventListener('toggle', async () => {
        if (!painel.open) return;
        try {
          criarMapa(await carregarLeaflet());
          $('mapa-aviso').hidden = true;
          mapa.invalidateSize();
        } catch (e) {
          console.warn('[mapa] indisponível:', e);
          $('mapa-aviso').hidden = false;
        }
      });
    }
    api.init = init;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.MAPA = api;
})(typeof window !== 'undefined' ? window : globalThis);
