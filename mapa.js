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

  const api = { decidirMapa, estiloDoTrecho, estiloDestacado, estiloEsmaecido, formatarKm, casarNome, resolverIntervalo, ROTULO_CLASSE, ESTILOS, LEAFLET, MAPLIBRE };

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

      const mostrarIndisponivel = () => {
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
          if (!mapa) {
            // Vista inicial no centro de Joinville: o plugin do fundo exige centro e zoom antes de entrar no mapa.
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
