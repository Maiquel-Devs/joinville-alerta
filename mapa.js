// mapa.js - Mapa de trajetos fixos (Etapa 10). O back-end classifica cada trecho; aqui só se desenha.
// Métrica de exposição às faixas do PDDU: não sugere caminho nem desvio.
// As funções puras rodam no navegador e no Node (teste/mapa.test.js); o resto só no navegador.
(function (raiz) {
  const IDADE = typeof module !== 'undefined' && module.exports ? require('./idade.js') : raiz.IDADE;

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

  const api = { decidirMapa, estiloDoTrecho, formatarKm, ESTILOS, LEAFLET };

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

      const mostrarIndisponivel = () => {
        if (camada) camada.remove();
        camada = null;
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
