const test = require('node:test');
const assert = require('node:assert/strict');
const { decidirMapa, estiloDoTrecho, estiloDestacado, estiloEsmaecido, formatarKm, LEAFLET, MAPLIBRE } = require('../mapa.js');

const AGORA = Date.parse('2026-11-07T12:00:00Z');
const minutosAtras = (m) => new Date(AGORA - m * 60000).toISOString();
const ok = (extra = {}) => ({
  status: 'ok',
  gerado_em: minutosAtras(10),
  trajeto: { id: 'centro_boa_vista' },
  trechos: { type: 'FeatureCollection', features: [] },
  ...extra,
});

test('decidirMapa: resposta válida e recente é ok', () => {
  assert.equal(decidirMapa(ok(), AGORA), 'ok');
});

test('decidirMapa: status indisponivel', () => {
  assert.equal(decidirMapa(ok({ status: 'indisponivel', trajeto: {}, trechos: null }), AGORA), 'indisponivel');
});

test('decidirMapa: dado vencido (mais de 120 min) ou sem horário', () => {
  assert.equal(decidirMapa(ok({ gerado_em: minutosAtras(121) }), AGORA), 'indisponivel');
  assert.equal(decidirMapa(ok({ gerado_em: minutosAtras(120) }), AGORA), 'ok');
  assert.equal(decidirMapa(ok({ gerado_em: null }), AGORA), 'indisponivel');
});

test('decidirMapa: trajeto ou trechos nulos', () => {
  assert.equal(decidirMapa(ok({ trechos: null }), AGORA), 'indisponivel');
  assert.equal(decidirMapa(ok({ trajeto: null }), AGORA), 'indisponivel');
});

test('decidirMapa: fetch falho (sem resposta) é indisponivel', () => {
  assert.equal(decidirMapa(null, AGORA), 'indisponivel');
  assert.equal(decidirMapa(undefined, AGORA), 'indisponivel');
  assert.equal(decidirMapa('erro', AGORA), 'indisponivel');
});

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

test('estiloDestacado: não avaliado fica escuro, sólido e grosso; as outras classes mantêm a cor e engrossam', () => {
  assert.deepEqual(estiloDestacado('nao_avaliado'), { color: '#334155', weight: 8, opacity: 1, dashArray: null });
  assert.deepEqual(estiloDestacado('qualquer'), estiloDestacado('nao_avaliado'));
  for (const c of ['faixa_ativa', 'area_sem_faixa_ativa']) {
    const base = estiloDoTrecho(c);
    assert.deepEqual(estiloDestacado(c), { ...base, weight: base.weight + 4, opacity: 1 });
    assert.equal(estiloDestacado(c).weight, 10);
  }
});

test('estiloDestacado: nenhuma cor do destaque cai na faixa do verde', () => {
  for (const c of ['faixa_ativa', 'area_sem_faixa_ativa', 'nao_avaliado']) {
    const h = matiz(estiloDestacado(c).color);
    assert.ok(h === null || h < 75 || h > 165, `${c}: matiz ${h} cai na faixa do verde`);
  }
});

test('estiloEsmaecido: só a opacidade muda (0,25), sem mudar cor nem espessura', () => {
  for (const c of ['faixa_ativa', 'area_sem_faixa_ativa', 'nao_avaliado']) {
    assert.deepEqual(estiloEsmaecido(c), { ...estiloDoTrecho(c), opacity: 0.25 });
  }
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

// --- trecho entre duas ruas -------------------------------------------------------------
const { casarNome, resolverIntervalo, ROTULO_CLASSE } = require('../mapa.js');
const fs = require('node:fs');
const path = require('node:path');

// Trajeto real (data/trajetos), com a classe que o back-end daria sem nenhuma faixa ativa.
function trajeto(id) {
  const col = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'trajetos', `${id}.geojson`), 'utf8'));
  return col.features.map((f) => ({
    properties: { ...f.properties, classe: f.properties.faixas.length ? 'area_sem_faixa_ativa' : 'nao_avaliado' },
  }));
}
const CENTRO = trajeto('centro_boa_vista');
const RODOV = trajeto('rodoviaria_padre_antonio_vieira');
const faixa = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
const L_AREA = ROTULO_CLASSE.area_sem_faixa_ativa;
const L_NAO = ROTULO_CLASSE.nao_avaliado;
const FORA = 'Esta rua não faz parte deste trajeto fixo. Isso não significa que não haja risco de alagar.';

test('casarNome: "Rua" sozinha (ou só a denominação) não casa nada', () => {
  for (const q of ['Rua', 'rua ', 'RUA', 'avenida', 'Av', 'ponte', 'ru', '', '  ', null]) {
    assert.deepEqual(casarNome(['Rua do Príncipe'], q), { casa: false, oficial: null, motivo: 'curto' }, String(q));
  }
});

test('casarNome: sem denominação, por palavra e sem acento nem caixa', () => {
  assert.equal(casarNome(['Rua do Príncipe'], 'principe').casa, true);
  assert.equal(casarNome(['Rua Doutor João Colin'], 'joao colin').casa, true);
  assert.equal(casarNome(['Rua Doutor João Colin'], 'RUA DOUTOR JOÃO COL').casa, true);
  assert.equal(casarNome(['Rua Aubé'], 'Aube').oficial, 'Rua Aubé');
  assert.equal(casarNome(['Avenida Juscelino Kubitschek'], 'av kubitschek').casa, true);
});

test('casarNome: borda de palavra, não casa no meio de uma palavra', () => {
  assert.equal(casarNome(['Rua Doutor João Colin'], 'tor joao').casa, false);
  assert.equal(casarNome(['Rua Albano Schmidt'], 'bano').casa, false);
  assert.equal(casarNome(['Rua Albano Schmidt'], 'mid').casa, false);
  assert.equal(casarNome(['Rua Albano Schmidt'], 'schmidt').casa, true);
});

test('casarNome: lista com dois nomes devolve o primeiro que casou', () => {
  const nomes = ['Rua Aubé', 'Rua Albano Schmidt'];
  assert.equal(casarNome(nomes, 'albano').oficial, 'Rua Albano Schmidt');
  assert.equal(casarNome(nomes, 'aube').oficial, 'Rua Aubé');
});

test('casarNome: rua fora do trajeto e trecho sem nome não casam', () => {
  assert.deepEqual(casarNome(['Rua Aubé'], 'Rua XV de Novembro'), { casa: false, oficial: null, motivo: null });
  assert.equal(casarNome([], 'aube').casa, false);
  assert.equal(casarNome(undefined, 'aube').casa, false);
});

test('resolverIntervalo: intervalo válido inclui o trecho sem nome do meio', () => {
  // Centro: Plácido (13–15), trecho sem nome (16), Ponte (17–20)
  const r = resolverIntervalo(CENTRO, 'Doutor Plácido', 'Albertinho');
  assert.deepEqual(r.indices, faixa(13, 20));
  assert.ok(r.indices.includes(16));
  assert.ok(r.mensagem.startsWith('Trecho entre Rua Doutor Plácido Olímpio de Oliveira e Ponte Albertinho Bornschein neste trajeto:'));
  assert.ok(r.mensagem.includes(L_AREA));
});

test('resolverIntervalo: Príncipe até Horto Florestal cobre o trajeto inteiro', () => {
  const r = resolverIntervalo(CENTRO, 'Rua do Príncipe', 'Horto Florestal');
  assert.deepEqual(r.indices, faixa(0, 34));
  assert.ok(r.mensagem.includes(L_AREA) && r.mensagem.includes(L_NAO));
});

test('resolverIntervalo: Aubé até Albano Schmidt usa o primeiro de Aubé e o último de Albano', () => {
  const r = resolverIntervalo(CENTRO, 'Aubé', 'Albano Schmidt');
  assert.deepEqual(r.indices, faixa(21, 33));
  assert.ok(r.mensagem.startsWith('Trecho entre Rua Aubé e Rua Albano Schmidt neste trajeto:'));
});

test('resolverIntervalo: destino antes do início não destaca nada', () => {
  const r = resolverIntervalo(CENTRO, 'Horto Florestal', 'Abdon Batista');
  assert.deepEqual(r, { indices: [], mensagem: 'A rua de destino vem antes da rua de início neste trajeto.' });
});

test('resolverIntervalo: ordem pelo primeiro índice; ruas que dividem o trecho 22 não passam ao contrário', () => {
  const INVERTIDA = { indices: [], mensagem: 'A rua de destino vem antes da rua de início neste trajeto.' };
  assert.deepEqual(resolverIntervalo(CENTRO, 'Albano Schmidt', 'Aubé'), INVERTIDA);
  assert.deepEqual(resolverIntervalo(CENTRO, 'Aubé', 'Albano Schmidt').indices, faixa(21, 33));
  assert.deepEqual(resolverIntervalo(RODOV, 'Padre Antônio Vieira', 'Doutor João Colin'), INVERTIDA);
});

test('resolverIntervalo: mesma rua mostra a rua inteira', () => {
  const r = resolverIntervalo(CENTRO, 'Abdon Batista', 'rua abdon');
  assert.deepEqual(r.indices, faixa(4, 7));
  assert.equal(r.mensagem, 'Início e destino na mesma rua: mostrando a rua inteira neste trajeto.');
});

test('resolverIntervalo: só um campo preenchido destaca todos os trechos da rua', () => {
  const a = resolverIntervalo(CENTRO, 'Horto Florestal', '');
  assert.deepEqual(a.indices, [34]);
  assert.equal(a.mensagem, `A rua digitada faz parte deste trajeto. Trecho: ${L_NAO}.`);
  assert.deepEqual(resolverIntervalo(CENTRO, '', 'Procópio').indices, faixa(8, 12));
  assert.deepEqual(resolverIntervalo(CENTRO, 'Ponte', 'ab').indices, []); // só denominação e texto curto: sem busca
});

test('resolverIntervalo: campos vazios ou curtos não fazem nada', () => {
  assert.deepEqual(resolverIntervalo(CENTRO, '', ''), { indices: [], mensagem: '' });
  assert.deepEqual(resolverIntervalo(CENTRO, 'Rua', 'ab'), { indices: [], mensagem: '' });
});

test('resolverIntervalo: rua fora do trajeto diz qual campo falhou e não destaca', () => {
  assert.deepEqual(resolverIntervalo(CENTRO, 'Rua XV de Novembro', 'Horto Florestal'), { indices: [], mensagem: `Rua de início: ${FORA}` });
  assert.deepEqual(resolverIntervalo(CENTRO, 'Horto Florestal', 'Rua XV de Novembro'), { indices: [], mensagem: `Rua de destino: ${FORA}` });
  const dois = resolverIntervalo(CENTRO, 'Rua XV de Novembro', 'Rua das Palmeiras');
  assert.deepEqual(dois.indices, []);
  assert.ok(dois.mensagem.includes('Rua de início:') && dois.mensagem.includes('Rua de destino:'));
});

test('resolverIntervalo: Padre Antônio Vieira aparece em duas partes (22–23 e 25) e gera a nota', () => {
  const r = resolverIntervalo(RODOV, 'Doutor João Colin', 'Padre Antônio Vieira');
  assert.deepEqual(r.indices, faixa(14, 25)); // inclui o trecho 24, sem nome
  assert.ok(r.mensagem.includes('Trecho entre Rua Doutor João Colin e Rua Padre Antônio Vieira neste trajeto:'));
  assert.ok(r.mensagem.endsWith('Rua Padre Antônio Vieira aparece mais de uma vez neste trajeto; usei a primeira ocorrência para o início e a última para o destino.'));
  const so = resolverIntervalo(RODOV, 'Padre Antônio Vieira', '');
  assert.deepEqual(so.indices, [22, 23, 25]); // um campo só: os trechos da rua, sem nota
  assert.ok(!so.mensagem.includes('mais de uma vez'));
  assert.ok(!resolverIntervalo(CENTRO, 'Príncipe', 'Horto Florestal').mensagem.includes('mais de uma vez'));
});

test('resolverIntervalo: Príncipe e Padre Antônio Vieira são de trajetos diferentes', () => {
  const r = resolverIntervalo(CENTRO, 'Rua do Príncipe', 'Padre Antônio Vieira');
  assert.deepEqual(r.indices, []);
  assert.ok(r.mensagem.startsWith('Rua de destino:'));
  assert.ok(resolverIntervalo(RODOV, 'Rua do Príncipe', 'Padre Antônio Vieira').mensagem.startsWith('Rua de início:'));
});

test('resolverIntervalo: usa o nome oficial da via, não o digitado', () => {
  const r = resolverIntervalo(CENTRO, 'principe', 'horto');
  assert.ok(r.mensagem.startsWith('Trecho entre Rua do Príncipe e Rua Horto Florestal neste trajeto:'));
});

test('textos novos não usam as palavras vetadas', () => {
  const VETADAS = /segur|mancha|caminho até|\brota\b/i;
  const textos = [
    resolverIntervalo(CENTRO, 'principe', 'horto').mensagem, // intervalo
    resolverIntervalo(CENTRO, 'horto', 'abdon').mensagem, // ordem invertida
    resolverIntervalo(CENTRO, 'abdon', 'abdon').mensagem, // mesma rua
    resolverIntervalo(CENTRO, 'xv de novembro', '').mensagem, // fora do trajeto
    resolverIntervalo(CENTRO, 'horto', '').mensagem, // um campo só
    resolverIntervalo(RODOV, 'joao colin', 'padre antonio').mensagem, // rua repetida, com nota
  ];
  for (const t of textos) assert.ok(t.length > 0 && !VETADAS.test(t), t);
});

test('rótulos das classes são os da legenda do index.html', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const rotulo of Object.values(ROTULO_CLASSE)) assert.ok(html.includes(rotulo), rotulo);
});

// --- caminho livre, textos e altitude (12/11/2026) ---------------------------------------------------
const { urlRota, resumoCaminho, rotuloOpcao, interpretarRota, TEXTOS_ROTA } = require('../mapa.js');
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

test('rótulo do trajeto da Rodoviária descreve o ponto médio do trecho', () => {
  assert.match(html, /<option value="rodoviaria_padre_antonio_vieira">Rodoviária → meio da Rua Padre Antônio Vieira<\/option>/);
  assert.ok(!html.includes('Rodoviária → Rua Padre'));
});
