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
  const TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  const ATRIBUICAO = '© OpenStreetMap contributors © CARTO';

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
  const MSG_DENTRO = 'A rua digitada faz parte deste trajeto.';
  const MSG_FORA = 'Esta rua não faz parte dos trajetos fixos deste mapa. Isso não significa que não haja risco de alagar.';

  // Denominações que o cidadão costuma omitir ("Aubé" para "Rua Aubé").
  const DENOMINACOES = new Set(['rua', 'avenida', 'servidao', 'travessa', 'alameda', 'ponte', 'rodovia', 'praca', 'estrada']);
  function semDenominacao(nome) {
    const [primeira, ...resto] = nome.split(' ');
    return resto.length && DENOMINACOES.has(primeira) ? resto.join(' ') : nome;
  }

  // Índices dos trechos cujo nome (lista `nomes`) é igual a `texto` ou começa com ele, sem acento nem caixa;
  // também vale o nome sem a denominação. Menos de 3 letras: nada. Trecho sem nome nunca casa.
  function trechosDaRua(features, texto) {
    const q = semAcento(String(texto ?? '').trim()).replace(/\s+/g, ' ');
    if (q.length < 3) return [];
    const casa = (nome) => {
      const n = semAcento(nome).replace(/\s+/g, ' ').trim();
      return n === q || n.startsWith(q) || semDenominacao(n) === q || semDenominacao(n).startsWith(q);
    };
    const achados = [];
    (features ?? []).forEach((f, i) => {
      if ((f.properties?.nomes ?? []).some((nome) => typeof nome === 'string' && casa(nome))) achados.push(i);
    });
    return achados;
  }

  // Mensagem do destaque: '' (texto curto), dentro do trajeto (com as classes dos trechos) ou fora.
  function mensagemDaRua(features, texto) {
    if (semAcento(String(texto ?? '').trim()).length < 3) return '';
    const idx = trechosDaRua(features, texto);
    if (!idx.length) return MSG_FORA;
    const classes = [...new Set(idx.map((i) => features[i].properties.classe))]
      .sort((a, b) => Object.keys(ROTULO_CLASSE).indexOf(a) - Object.keys(ROTULO_CLASSE).indexOf(b));
    return `${MSG_DENTRO} Trecho: ${classes.map((c) => ROTULO_CLASSE[c] ?? c).join('; ')}.`;
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

  // 3,992 -> "3,99 km"
  function formatarKm(km) {
    return `${Number(km).toFixed(2).replace('.', ',')} km`;
  }

  const api = { decidirMapa, estiloDoTrecho, formatarKm, trechosDaRua, mensagemDaRua, ROTULO_CLASSE, ESTILOS, LEAFLET };

  // --- só no navegador -------------------------------------------------------------------
  if (typeof document !== 'undefined') {
    let promessaLeaflet = null;
    function carregarLeaflet() {
      promessaLeaflet ??= new Promise((resolve, reject) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = LEAFLET.css.href;
        css.integrity = LEAFLET.css.integrity;
        css.crossOrigin = 'anonymous';
        document.head.appendChild(css);
        const js = document.createElement('script');
        js.src = LEAFLET.js.src;
        js.integrity = LEAFLET.js.integrity;
        js.crossOrigin = 'anonymous';
        js.onload = () => resolve(raiz.L);
        js.onerror = () => reject(new Error('Leaflet não carregou'));
        document.head.appendChild(js);
      }).catch((e) => {
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
      ctx = { aberto: false };

      // Destaque da rua digitada: só entre as ruas do trajeto desenhado; sem texto válido, estilo padrão.
      function destacar(texto) {
        const msg = $('mapa-rua-msg');
        if (!camada || !trechos) {
          msg.textContent = '';
          return;
        }
        const idx = new Set(trechosDaRua(trechos, texto));
        camada.eachLayer((layer) => {
          const base = estiloDoTrecho(layer.feature.properties.classe);
          if (!idx.size) return layer.setStyle(base);
          layer.setStyle(
            idx.has(trechos.indexOf(layer.feature))
              ? { ...base, weight: base.weight + 4, opacity: 1 }
              : { ...base, opacity: 0.25 },
          );
        });
        msg.textContent = mensagemDaRua(trechos, texto);
        if (idx.size) {
          const grupo = raiz.L.featureGroup(camada.getLayers().filter((l) => idx.has(trechos.indexOf(l.feature))));
          mapa.fitBounds(grupo.getBounds(), { padding: [30, 30] });
        }
      }
      ctx.destacar = destacar;

      const mostrarIndisponivel = () => {
        if (camada) camada.remove();
        camada = null;
        trechos = null;
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
            mapa = L.map('mapa-trajeto');
            L.tileLayer(TILES, { attribution: ATRIBUICAO, subdomains: 'abcd', maxZoom: 19 }).addTo(mapa);
          }
          if (camada) camada.remove();
          camada = L.geoJSON(resposta.trechos, { style: (f) => estiloDoTrecho(f.properties.classe) }).addTo(mapa);
          trechos = resposta.trechos.features;
          $('mapa-rua-msg').textContent = ''; // trocar de trajeto limpa o destaque
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
        ctx.aberto = true;
        mostrar($('mapa-seletor').value);
      });
      $('mapa-seletor').addEventListener('change', (e) => mostrar(e.target.value));
    }
    // Estado do painel (preenchido por init): app.js só chama o destaque depois que o mapa foi aberto.
    let ctx = null;
    api.init = init;
    api.foiAberto = () => Boolean(ctx?.aberto);
    api.destacarRua = (texto) => ctx?.destacar?.(texto);
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.MAPA = api;
})(typeof window !== 'undefined' ? window : globalThis);
