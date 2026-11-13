// mapa.js - Mapa de trajetos fixos (Etapa 10). O back-end classifica cada trecho; aqui só se desenha.
// Métrica de exposição às faixas do PDDU: não sugere caminho nem desvio.
// As funções puras rodam no navegador e no Node (teste/mapa.test.js); o resto só no navegador.
(function (raiz) {
  const node = typeof module !== 'undefined' && module.exports;
  const IDADE = node ? require('./idade.js') : raiz.IDADE;
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
  const CAMPO = { inicio: 'Rua de início', destino: 'Rua de destino' };
  const MSG_FORA = 'Esta rua não faz parte deste trajeto fixo. Isso não significa que não haja risco de alagar.';
  const MSG_UMA_RUA = 'A rua digitada faz parte deste trajeto.';
  const MSG_MESMA_RUA = 'Início e destino na mesma rua: mostrando a rua inteira neste trajeto.';
  const MSG_INVERTIDA = 'A rua de destino vem antes da rua de início neste trajeto.';

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

  // Casa a consulta com os nomes OSM de UM trecho (`nomes` é a lista do trecho). Casa quando o nome começa
  // com o texto ou quando o texto começa alguma palavra do nome, em sequência ("principe" em "do principe").
  // Devolve { casa, oficial, motivo }: oficial = primeiro nome da lista que casou; motivo = 'curto' se não houve busca.
  function casarNome(nomes, texto) {
    const q = consulta(texto);
    if (q === null) return { casa: false, oficial: null, motivo: 'curto' };
    for (const nome of nomes ?? []) {
      if (typeof nome !== 'string') continue;
      const palavras = normalizar(nome).split(' ');
      if (palavras.some((_, k) => palavras.slice(k).join(' ').startsWith(q))) return { casa: true, oficial: nome, motivo: null };
    }
    return { casa: false, oficial: null, motivo: null };
  }

  const rotulos = (features, indices) =>
    Object.keys(ROTULO_CLASSE)
      .filter((c) => indices.some((i) => features[i].properties.classe === c))
      .map((c) => ROTULO_CLASSE[c]);

  // Blocos contíguos de índices: [22, 23, 25] tem 2 blocos (a rua aparece "mais de uma vez" no percurso).
  const blocos = (indices) => indices.reduce((n, i, k) => n + (k === 0 || i !== indices[k - 1] + 1 ? 1 : 0), 0);

  // Uma consulta contra todos os trechos: índices que casam e o nome oficial de cada ponta.
  function acharRua(features, texto) {
    if (consulta(texto) === null) return null; // campo vazio ou curto: sem busca
    const indices = [];
    (features ?? []).forEach((f, i) => {
      if (casarNome(f.properties?.nomes, texto).casa) indices.push(i);
    });
    const oficialEm = (i) => casarNome(features[i].properties.nomes, texto).oficial;
    return {
      indices,
      primeiro: indices[0],
      ultimo: indices[indices.length - 1],
      oficialInicio: indices.length ? oficialEm(indices[0]) : null,
      oficialFim: indices.length ? oficialEm(indices[indices.length - 1]) : null,
      repetida: blocos(indices) > 1,
    };
  }

  // Destaque entre a rua de início e a de destino, na ordem em que o trajeto fixo passa por elas.
  // Não calcula caminho: só escolhe quais trechos já existentes do trajeto destacar.
  // Devolve { indices, mensagem }; indices vazio = nada destacado.
  function resolverIntervalo(features, textoInicio, textoDestino) {
    const ini = acharRua(features, textoInicio);
    const dst = acharRua(features, textoDestino);
    if (!ini && !dst) return { indices: [], mensagem: '' };

    const falhas = [];
    if (ini && !ini.indices.length) falhas.push(`${CAMPO.inicio}: ${MSG_FORA}`);
    if (dst && !dst.indices.length) falhas.push(`${CAMPO.destino}: ${MSG_FORA}`);
    if (falhas.length) return { indices: [], mensagem: falhas.join(' ') };

    if (!ini || !dst) {
      // só um campo: todos os trechos dessa rua
      const r = ini ?? dst;
      return { indices: r.indices, mensagem: `${MSG_UMA_RUA} Trecho: ${rotulos(features, r.indices).join('; ')}.` };
    }
    if (ini.oficialInicio === dst.oficialFim) return { indices: ini.indices, mensagem: MSG_MESMA_RUA };
    // Ordem invertida: a rua de destino começa antes da rua de início (compara as primeiras ocorrências,
    // para que ruas que dividem um mesmo trecho, como Aubé e Albano Schmidt, não passem como válidas ao contrário).
    if (dst.primeiro < ini.primeiro) return { indices: [], mensagem: MSG_INVERTIDA };

    const indices = Array.from({ length: dst.ultimo - ini.primeiro + 1 }, (_, k) => ini.primeiro + k); // inclui trechos sem nome
    let mensagem = `Trecho entre ${ini.oficialInicio} e ${dst.oficialFim} neste trajeto: ${rotulos(features, indices).join('; ')}.`;
    const repetidas = new Set([ini.repetida && ini.oficialInicio, dst.repetida && dst.oficialFim].filter(Boolean));
    for (const rua of repetidas) {
      mensagem += ` ${rua} aparece mais de uma vez neste trajeto; usei a primeira ocorrência para o início e a última para o destino.`;
    }
    return { indices, mensagem };
  }

  // "ok" só com status ok, dado dentro do teto de idade (idade.js) e trajeto/trechos presentes.
  function decidirMapa(resposta, agora) {
    if (!resposta || typeof resposta !== 'object') return 'indisponivel';
    if (resposta.status !== 'ok') return 'indisponivel';
    if (IDADE.vencido(resposta, agora)) return 'indisponivel';
    if (!resposta.trajeto || !resposta.trechos?.features) return 'indisponivel';
    return 'ok';
  }

  function estiloDoTrecho(classe) {
    return { ...(ESTILOS[classe] ?? ESTILOS.nao_avaliado) };
  }

  // Trecho dentro do intervalo escolhido. Faixa ativa e área mapeada mantêm a cor, mais grossas (base + 4).
  // Não avaliado perde o tracejado e escurece (#334155, sem verde), para o destaque aparecer sobre o fundo claro.
  function estiloDestacado(classe) {
    const base = estiloDoTrecho(classe);
    if (classe === 'faixa_ativa' || classe === 'area_sem_faixa_ativa') return { ...base, weight: base.weight + 4, opacity: 1 };
    return { color: '#334155', weight: 8, opacity: 1, dashArray: null };
  }

  // Trecho fora do intervalo: mesma cor e espessura, só mais apagado.
  function estiloEsmaecido(classe) {
    return { ...estiloDoTrecho(classe), opacity: 0.25 };
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

  // Rótulo de uma opção de rua homônima: só extensão e número de trechos (sem risco), ex.: "Rua X — 26 trechos, 3,1 km".
  function rotuloOpcao(o) {
    if (o?.trechos == null || o?.km == null) return o?.nome ?? o?.rotulo ?? '';
    const n = o.trechos === 1 ? '1 trecho' : `${o.trechos} trechos`;
    return `${o.nome} — ${n}, ${Number(o.km).toFixed(1).replace('.', ',')} km`;
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

  // Opções com rótulo; se duas ficarem com o mesmo texto (mesmo nome, trechos e km), mostra só o nome.
  function rotularOpcoes(lista) {
    const rotulos = lista.map(rotuloOpcao);
    return lista.map((o, i) => ({
      rotulo: rotulos.filter((r) => r === rotulos[i]).length > 1 ? (o.nome ?? rotulos[i]) : rotulos[i],
      no: o.no,
    }));
  }

  // Traduz a resposta do endpoint (HTTP + corpo JSON) em { tipo, ... } para a tela. Nunca devolve "ok" sem
  // os dois caminhos, nem trata erro como ausência de risco.
  function interpretarRota(http, corpo) {
    if (http === 400) return { tipo: 'curto', mensagem: TEXTOS_ROTA.curto };
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
      case 'nao_encontrado': return { tipo: 'nao_encontrado', mensagem: TEXTOS_ROTA.nao_encontrado };
      default: return { tipo: 'erro', mensagem: TEXTOS_ROTA.erro };
    }
  }

  const api = { decidirMapa, estiloDoTrecho, estiloDestacado, estiloEsmaecido, formatarKm, casarNome, resolverIntervalo, consulta, urlRota, resumoCaminho, rotuloOpcao, interpretarRota, TEXTOS_ROTA, CAMINHOS, ROTULO_CLASSE, ESTILOS, LEAFLET, MAPLIBRE };

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
      let camada = null;
      let pedido = 0; // descarta respostas antigas se o usuário trocar de trajeto
      let trechos = null; // features do trajeto desenhado

      // Destaque do trecho entre as duas ruas digitadas: só sobre o trajeto já desenhado.
      const campos = () => [$('mapa-rua-inicio').value, $('mapa-rua-destino').value];
      function destacar() {
        const msg = $('mapa-rua-msg');
        if (!camada || !trechos) {
          msg.textContent = '';
          return;
        }
        const { indices, mensagem } = resolverIntervalo(trechos, ...campos());
        const sel = new Set(indices);
        camada.eachLayer((layer) => {
          const classe = layer.feature.properties.classe;
          if (!sel.size) return layer.setStyle(estiloDoTrecho(classe));
          layer.setStyle(sel.has(trechos.indexOf(layer.feature)) ? estiloDestacado(classe) : estiloEsmaecido(classe));
        });
        msg.textContent = mensagem;
        if (sel.size) {
          const grupo = raiz.L.featureGroup(camada.getLayers().filter((l) => sel.has(trechos.indexOf(l.feature))));
          mapa.fitBounds(grupo.getBounds(), { padding: [30, 30] });
        }
      }
      const limparCampos = () => {
        $('mapa-rua-inicio').value = '';
        $('mapa-rua-destino').value = '';
      };
      $('mapa-rua-inicio').addEventListener('input', destacar);
      $('mapa-rua-destino').addEventListener('input', destacar);

      // Mapa único, usado pelos trajetos fixos e pelo caminho livre. Vista inicial no centro de Joinville:
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
      }

      const mostrarIndisponivel = () => {
        limparCaminho();
        if (camada) camada.remove();
        camada = null;
        trechos = null;
        limparCampos();
        $('mapa-rua-msg').textContent = '';
        $('mapa-aviso').hidden = false;
        $('mapa-trajeto').hidden = true;
        $('mapa-totais').hidden = true;
      };

      async function mostrar(id) {
        const meu = ++pedido;
        try {
          const [L, resposta] = await Promise.all([
            carregarLeaflet(),
            fetch(`${base}/trajetos/${encodeURIComponent(id)}`).then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return r.json();
            }),
          ]);
          if (meu !== pedido) return;
          if (decidirMapa(resposta, Date.now()) !== 'ok') return mostrarIndisponivel();

          $('mapa-aviso').hidden = true;
          $('mapa-trajeto').hidden = false;
          $('mapa-totais').hidden = false;
          criarMapa(L);
          limparCaminho();
          if (camada) camada.remove();
          camada = L.geoJSON(resposta.trechos, { style: (f) => estiloDoTrecho(f.properties.classe) }).addTo(mapa);
          trechos = resposta.trechos.features;
          limparCampos(); // trocar de trajeto (ou reabrir o painel) limpa campos, destaque e mensagem
          $('mapa-rua-msg').textContent = '';
          mapa.invalidateSize();
          mapa.fitBounds(camada.getBounds(), { padding: [20, 20] });

          const t = resposta.totais_km;
          $('mapa-km-ativa').textContent = formatarKm(t.faixa_ativa);
          $('mapa-km-area').textContent = formatarKm(t.area_sem_faixa_ativa);
          $('mapa-km-nao').textContent = formatarKm(t.nao_avaliado);
          $('mapa-km-total').textContent = formatarKm(resposta.total_km);
        } catch (e) {
          if (meu !== pedido) return;
          console.warn('[mapa] indisponível:', e);
          mostrarIndisponivel();
        }
      }

      // --- caminho livre ---------------------------------------------------------------------------
      let camadaCaminho = null; // caminho desenhado agora
      let ultimo = null; // resposta ok em exibição: { corpo, qual }
      let escolhas = { origem: null, destino: null }; // nós escolhidos entre opções ambíguas
      let pedidoCaminho = 0;
      const msgCaminho = (texto) => {
        $('caminho-msg').textContent = texto;
      };
      function limparCaminho() {
        if (camadaCaminho) camadaCaminho.remove();
        camadaCaminho = null;
        ultimo = null;
        $('caminho-resultado').hidden = true;
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
        desenharCaminho('curto');
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
          interp = interpretarRota(0, null);
        } finally {
          clearTimeout(t);
        }
        if (meu !== pedidoCaminho) return;
        if (interp.tipo === 'ambiguo') {
          msgCaminho(interp.mensagem);
          return mostrarOpcoes(interp);
        }
        if (interp.tipo !== 'ok') return msgCaminho(interp.mensagem);
        msgCaminho('');
        try {
          const L = await carregarLeaflet();
          if (meu !== pedidoCaminho) return;
          // O caminho livre usa o mesmo mapa; o trajeto fixo sai de cena até o usuário escolher um de novo.
          $('mapa-aviso').hidden = true;
          $('mapa-trajeto').hidden = false;
          criarMapa(L);
          if (camada) camada.remove();
          camada = null;
          trechos = null;
          $('mapa-totais').hidden = true;
          $('mapa-rua-msg').textContent = '';
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
      $('caminho-voltar').addEventListener('click', () => mostrar($('mapa-seletor').value));

      painel.addEventListener('toggle', () => {
        if (!painel.open) return;
        mostrar($('mapa-seletor').value);
      });
      $('mapa-seletor').addEventListener('change', (e) => mostrar(e.target.value));
    }
    api.init = init;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.MAPA = api;
})(typeof window !== 'undefined' ? window : globalThis);
