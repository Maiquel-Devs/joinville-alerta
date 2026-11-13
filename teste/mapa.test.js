const test = require('node:test');
const assert = require('node:assert/strict');
const { estiloDoTrecho, formatarKm, LEAFLET, MAPLIBRE } = require('../mapa.js');

function matiz(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return null; // cinza
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

test('estiloDoTrecho: três classes com as cores de nível e sem verde', () => {
  assert.equal(estiloDoTrecho('faixa_ativa').color, '#ef4444'); // --nivel-alto
  assert.equal(estiloDoTrecho('area_sem_faixa_ativa').color, '#eab308'); // --nivel-atencao
  assert.ok(estiloDoTrecho('nao_avaliado').dashArray, 'não avaliado é tracejado');
  for (const c of ['faixa_ativa', 'area_sem_faixa_ativa', 'nao_avaliado']) {
    const h = matiz(estiloDoTrecho(c).color);
    assert.ok(h === null || h < 75 || h > 165 || false, `${c}: matiz ${h} cai na faixa do verde`);
  }
});

test('estiloDoTrecho: classe desconhecida cai em não avaliado, nunca em "sem problema"', () => {
  assert.deepEqual(estiloDoTrecho('qualquer'), estiloDoTrecho('nao_avaliado'));
});

test('formatarKm: vírgula decimal e unidade', () => {
  assert.equal(formatarKm(3.992), '3,99 km');
  assert.equal(formatarKm(0), '0,00 km');
  assert.equal(formatarKm(0.094), '0,09 km');
});

test('Leaflet: versão fixa 1.9.4 com integridade sha256', () => {
  assert.match(LEAFLET.js.src, /leaflet@1\.9\.4\//);
  assert.match(LEAFLET.css.href, /leaflet@1\.9\.4\//);
  assert.match(LEAFLET.js.integrity, /^sha256-[A-Za-z0-9+/]{43}=$/);
  assert.match(LEAFLET.css.integrity, /^sha256-[A-Za-z0-9+/]{43}=$/);
});

test('Fundo OpenFreeMap: MapLibre 5.24.0 e plugin 0.1.4 fixos, com integridade sha384 e sem chave de API', () => {
  assert.match(MAPLIBRE.js.src, /maplibre-gl@5\.24\.0\//);
  assert.match(MAPLIBRE.css.href, /maplibre-gl@5\.24\.0\//);
  assert.match(MAPLIBRE.plugin.src, /maplibre-gl-leaflet@0\.1\.4\//);
  for (const { integrity } of [MAPLIBRE.js, MAPLIBRE.css, MAPLIBRE.plugin]) assert.match(integrity, /^sha384-[A-Za-z0-9+/]{64}$/);
  const fonte = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'mapa.js'), 'utf8');
  assert.ok(fonte.includes('https://tiles.openfreemap.org/styles/liberty'));
  assert.ok(fonte.includes('OpenFreeMap © OpenMapTiles Data from OpenStreetMap'));
  assert.ok(!/cartocdn/i.test(fonte), 'sem tiles do CARTO');
  assert.ok(!/api[_-]?key|apikey/i.test(fonte), 'sem chave de API');
});

const { ROTULO_CLASSE } = require('../mapa.js');
const fs = require('node:fs');
const path = require('node:path');

test('rótulos das classes são os da legenda do index.html', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const rotulo of Object.values(ROTULO_CLASSE)) assert.ok(html.includes(rotulo), rotulo);
});

// --- caminho livre, textos e altitude (12/11/2026) ---------------------------------------------------
const { marcadoresInicioFim, COR_INICIO, COR_FIM, urlRota, resumoCaminho, rotuloOpcao, interpretarRota, TEXTOS_ROTA } = require('../mapa.js');
const RUAS = require('../ruas.js');
const PROIBIDAS = /segur|mancha|caminho até|\brota\b/i;
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
// Texto visível do index.html: sem comentários, scripts, estilos nem marcação.
const textoVisivel = html
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ');

test('urlRota: codifica as ruas e só envia origem_no / destino_no quando escolhidos', () => {
  assert.equal(urlRota('http://x/api/v1', ' Rua do Príncipe ', 'Horto'), 'http://x/api/v1/rota?origem=Rua+do+Pr%C3%ADncipe&destino=Horto');
  const u = urlRota('http://x/api/v1', 'a b', 'c d', 12, 34);
  assert.ok(u.endsWith('&origem_no=12&destino_no=34'), u);
  assert.ok(!urlRota('http://x', 'abc', 'def', null, 7).includes('origem_no'));
});

test('resumoCaminho: total e as três classes, com vírgula decimal', () => {
  assert.deepEqual(
    resumoCaminho({ km: 3.992, km_por_classe: { faixa_ativa: 0.5, area_sem_faixa_ativa: 1.25, nao_avaliado: 2.242 } }),
    { total: '3,99 km', faixa_ativa: '0,50 km', area_sem_faixa_ativa: '1,25 km', nao_avaliado: '2,24 km' },
  );
});

const caminho = { km: 1, km_por_classe: {}, trechos: { type: 'FeatureCollection', features: [] } };
const lado = (ambiguo, opcoes = []) => ({ ambiguo, total_opcoes: opcoes.length, opcoes });

test('interpretarRota: ok, com e sem teto aplicado', () => {
  const base = { status: 'ok', caminho_curto: caminho, caminho_exposicao: caminho };
  assert.deepEqual(interpretarRota(200, { ...base, teto_aplicado: false }), { tipo: 'ok', teto: false, mensagemTeto: '' });
  const t = interpretarRota(200, { ...base, teto_aplicado: true });
  assert.equal(t.mensagemTeto, 'O caminho de menor exposição ficaria mais de 20% mais longo; exibindo o mais curto.');
  assert.equal(interpretarRota(200, { status: 'ok' }).tipo, 'erro'); // ok sem os dois caminhos nunca é aceito
});

test('interpretarRota: ambíguo lista só os lados ambíguos, com rótulo e nó, sem escolher', () => {
  const r = interpretarRota(200, {
    status: 'ambiguo',
    origem: lado(false, [{ rotulo: null, no: 1 }]),
    destino: lado(true, [{ nome: 'Rua Aubé', trechos: 3, km: 0.94, no: 10 }, { nome: 'Rua Aubé', trechos: 1, km: 0.3, no: 11 }]),
  });
  assert.equal(r.tipo, 'ambiguo');
  assert.equal(r.lados.length, 1);
  assert.equal(r.lados[0].campo, 'destino');
  assert.deepEqual(r.lados[0].opcoes, [{ rotulo: 'Rua Aubé, 3 trechos, 0,9 km\nsem cruzamento nomeado', no: 10 }, { rotulo: 'Rua Aubé, 1 trecho, 0,3 km\nsem cruzamento nomeado', no: 11 }]);
});

test('rotuloOpcao: duas linhas com a rua que cruza, singular e fim de via; sem palavras vetadas', () => {
  const base = { nome: 'Avenida Santos Dumont', trechos: 26, km: 3.6, no: 1 };
  assert.equal(rotuloOpcao(base), 'Avenida Santos Dumont, 26 trechos, 3,6 km\nsem cruzamento nomeado'); // as duas pontas null
  assert.equal(rotuloOpcao({ ...base, cruza_inicio: 'Rua X', cruza_fim: 'Rua Y' }), 'Avenida Santos Dumont, 26 trechos, 3,6 km\nentre Rua X e Rua Y');
  assert.equal(rotuloOpcao({ nome: 'Rua A', trechos: 1, km: 3, no: 1, cruza_inicio: 'Rua X', cruza_fim: null }), 'Rua A, 1 trecho, 3,0 km\nde Rua X até o fim da via');
  assert.equal(rotuloOpcao({ nome: 'Rua A', trechos: 2, km: 3, no: 1, cruza_inicio: null, cruza_fim: 'Rua Y' }), 'Rua A, 2 trechos, 3,0 km\ndo fim da via até Rua Y');
  assert.equal(rotuloOpcao({ nome: 'Rua A', trechos: 2, km: 3, no: 1, cruza_inicio: null, cruza_fim: null }), 'Rua A, 2 trechos, 3,0 km\nsem cruzamento nomeado');
  for (const o of [base, { ...base, cruza_inicio: 'Rua X', cruza_fim: null }]) assert.ok(!PROIBIDAS.test(rotuloOpcao(o)));
});

test('interpretarRota: textos iguais ganham a posição ("1ª opção"); no máximo 5 visíveis', () => {
  const o = (no, extra = {}) => ({ nome: 'Rua B', trechos: 2, km: 0.5, cruza_inicio: 'Rua X', cruza_fim: 'Rua Y', no, ...extra });
  const r = interpretarRota(200, { status: 'ambiguo', origem: lado(true, [o(1), o(2), o(3, { km: 0.9 })]), destino: lado(false) });
  const t = r.lados[0].opcoes.map((x) => x.rotulo);
  assert.ok(t[0].endsWith('\n1ª opção') && t[1].endsWith('\n2ª opção'));
  assert.ok(!t[2].includes('ª opção')); // este é diferente das outras
  assert.equal(new Set(t).size, 3);
  // só o título se repete: uma com cruzamento nomeado e outra sem ganham a posição
  const r3 = interpretarRota(200, { status: 'ambiguo', origem: lado(true, [o(1), o(2, { cruza_inicio: null, cruza_fim: null })]), destino: lado(false) });
  assert.deepEqual(r3.lados[0].opcoes.map((x) => x.rotulo), [
    'Rua B, 2 trechos, 0,5 km\nentre Rua X e Rua Y\n1ª opção',
    'Rua B, 2 trechos, 0,5 km\nsem cruzamento nomeado\n2ª opção',
  ]);
  const sete = Array.from({ length: 7 }, (_, i) => ({ nome: 'Rua C', trechos: 9 - i, km: 1, no: i }));
  const r2 = interpretarRota(200, { status: 'ambiguo', origem: { ambiguo: true, total_opcoes: 7, opcoes: sete }, destino: lado(false) });
  assert.equal(r2.lados[0].opcoes.length, 5);
  assert.equal(r2.lados[0].total, 7);
});

test('interpretarRota: demais status e HTTP 400 têm o texto pedido', () => {
  assert.equal(interpretarRota(200, { status: 'indisponivel' }).mensagem, 'Os dados de maré e chuva estão desatualizados. Tente mais tarde.');
  assert.equal(interpretarRota(200, { status: 'sem_caminho' }).mensagem, 'Não há caminho entre essas ruas dentro da malha mapeada.');
  assert.equal(interpretarRota(400, { detail: {} }).mensagem, 'Digite pelo menos 3 letras em cada rua.');
  assert.equal(interpretarRota(200, { status: 'nao_encontrado' }).tipo, 'nao_encontrado');
  for (const [http, corpo] of [[503, null], [0, null], [200, null], [500, {}], [200, { status: 'x' }]]) {
    assert.equal(interpretarRota(http, corpo).tipo, 'erro', `${http}`);
  }
});

test('textos visíveis (index.html, caminho livre, cenários) não usam as palavras vetadas', () => {
  assert.ok(textoVisivel.includes('Caminho livre'), 'o painel novo está no index.html');
  assert.ok(!PROIBIDAS.test(textoVisivel), `index.html: ${textoVisivel.match(PROIBIDAS)}`);
  for (const [nome, t] of Object.entries(TEXTOS_ROTA)) assert.ok(!PROIBIDAS.test(t), `${nome}: ${t}`);
  for (const [id, t] of Object.entries(RUAS.CENARIO)) assert.ok(!PROIBIDAS.test(t), `${id}: ${t}`);
  for (const c of [{ cmin: 9, cmax: 9 }, { cmin: 8, cmax: 9.5 }]) assert.ok(!PROIBIDAS.test(RUAS.formatarAltitude(c.cmin, c.cmax)));
  for (const r of [interpretarRota(200, { status: 'ambiguo', origem: lado(true), destino: lado(false) }), interpretarRota(0, null)]) {
    assert.ok(!PROIBIDAS.test(r.mensagem ?? ''));
  }
});

test('caminho livre: avisos fixos e atribuição estão no painel', () => {
  for (const frase of [TEXTOS_ROTA.nao_avaliado, TEXTOS_ROTA.metrica, 'Rua de origem', 'Rua de destino', 'Mais curto', 'Menor exposição', 'OpenStreetMap', 'OpenFreeMap']) {
    assert.ok(textoVisivel.includes(frase), frase);
  }
});

test('formatarAltitude: valor único quando mínimo e máximo coincidem', () => {
  assert.equal(RUAS.formatarAltitude(9, 9), 'Altitude aproximada: 9,0 m');
  assert.equal(RUAS.formatarAltitude(9.04, 8.96), 'Altitude aproximada: 9,0 m'); // iguais na casa exibida
  assert.equal(RUAS.formatarAltitude(8.5, 9.5), 'Altitude aproximada: 8,5 a 9,5 m');
});

test('cenários: frases com verbo ("só aparece ...")', () => {
  assert.equal(RUAS.CENARIO.pluvial_vn_tr25, 'só aparece no cenário de cheia de 25 anos, o mais raro');
  for (const t of Object.values(RUAS.CENARIO)) assert.match(t, /aparece/);
});

test('não há mais seletor de trajeto nem bloco de vias por faixa no index.html', () => {
  for (const id of ['mapa-seletor', 'mapa-rua-inicio', 'lista-geral', 'caminho-voltar']) assert.ok(!html.includes(`id="${id}"`), id);
  assert.ok(!html.includes('Ver todas as vias'));
  assert.ok(textoVisivel.includes('Digite duas ruas para ver os caminhos.'));
  assert.ok(html.includes('id="mapa-trajeto"') && !/id="mapa-trajeto"[^>]*hidden/.test(html), 'o mapa fica visível, vazio');
});

test('marcadoresInicioFim: dois pontos com as coordenadas certas, rótulos e cores fora das classes de risco', () => {
  const m = marcadoresInicioFim({ status: 'ok', origem: { lat: -26.3, lon: -48.84, no: 1 }, destino: { lat: -26.31, lon: -48.83, no: 2 } });
  assert.deepEqual(m, [
    { lat: -26.3, lng: -48.84, rotulo: 'Início', cor: '#1d4ed8' },
    { lat: -26.31, lng: -48.83, rotulo: 'Fim', cor: '#7c3aed' },
  ]);
  for (const cor of [COR_INICIO, COR_FIM]) assert.ok(!['#ef4444', '#eab308'].includes(cor));
  assert.ok(html.includes(COR_INICIO) || fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8').includes(COR_INICIO));
});

test('marcadoresInicioFim: sem coordenadas não cria marcador; textos sem palavras vetadas', () => {
  assert.deepEqual(marcadoresInicioFim({ origem: { no: 1 }, destino: { lat: null, lon: null } }), []);
  assert.deepEqual(marcadoresInicioFim(null), []);
  assert.equal(marcadoresInicioFim({ origem: { lat: -26.3, lon: -48.8 } }).length, 1);
  assert.ok(textoVisivel.includes('Início e fim do caminho'));
  assert.ok(!PROIBIDAS.test('Início e fim do caminho'));
});
