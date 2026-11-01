// Rodar: node --test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const RUAS = require('../ruas.js');
const IDADE = require('../idade.js');

const colecao = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'ruas_risco.geojson'), 'utf8'));
const indice = RUAS.construirIndice(colecao);
const porNome = (nome) => indice.ruas.find((r) => r.nome === nome);
const todas = (v) => () => v;

// Expressões que a regra de linguagem proíbe (espelha backend/textos.py PROIBIDAS).
const PROIBIDAS = ['alagad', 'sem risco', 'cidade segura', 'situação segura', 'zona segura', 'sob controle', 'mancha', 'normal'];

// --- estado (8.4) -----------------------------------------------------------------------------
test('estadoDeFaixas: ativa vence indisponível, que vence inativa', () => {
  const es = { a: 'ativa', b: 'inativa', c: 'indisponivel' };
  const f = (id) => es[id];
  assert.strictEqual(RUAS.estadoDeFaixas(['a', 'b', 'c'], f), 'ativa');
  assert.strictEqual(RUAS.estadoDeFaixas(['b', 'c'], f), 'indisponivel');
  assert.strictEqual(RUAS.estadoDeFaixas(['b'], f), 'inativa');
});

test('estadoDeFaixas: sem nenhuma faixa conhecida nunca tranquiliza', () => {
  assert.strictEqual(RUAS.estadoDeFaixas([], todas('inativa')), 'indisponivel');
});

test('dado vencido: toda rua, vizinha e faixa vira indisponível (diagnóstico, entorno, lista, GPS)', () => {
  const agora = Date.parse('2026-11-01T15:00:00Z');
  const dados = { status: 'ok', gerado_em: new Date(agora - 180 * 60000).toISOString(), faixas: { mare_1_6: 'ativa', mare_2_5: 'inativa', pluvial_vn_tr5: 'ativa' } };
  const estadoDe = (id) => IDADE.estadoFaixa(dados, id, agora);
  for (const f of RUAS.FAIXAS) assert.strictEqual(RUAS.estadoDeFaixas([f.id], estadoDe), 'indisponivel');
  for (const g of indice.grupos) assert.strictEqual(RUAS.estadoDaRua(g, estadoDe), 'indisponivel');
  const sl = porNome('Rua São Leopoldo').grupos[0];
  const viz = RUAS.vizinhas(indice, sl, estadoDe, { excluir: sl.nome });
  assert.ok(viz.length > 0);
  for (const v of viz) assert.strictEqual(v.estado, 'indisponivel');
});

// --- cenários (8.1) -----------------------------------------------------------------------------
test('cenariosDaVia: devolve o de menor tempo de retorno de cada família', () => {
  const c = RUAS.cenariosDaVia(['pluvial_vn_tr25', 'pluvial_vn_tr10', 'mare_2_5']);
  assert.deepStrictEqual(c.map((x) => x.faixa), ['mare_2_5', 'pluvial_vn_tr10']);
  assert.match(RUAS.cenariosDaVia(['pluvial_vn_tr5'])[0].texto, /cheia de 5 anos, o mais frequente/);
  assert.match(RUAS.cenariosDaVia(['pluvial_vn_tr25'])[0].texto, /25 anos, o mais raro/);
  assert.deepStrictEqual(RUAS.cenariosDaVia([]), []);
});

test('textos de cenário respeitam a regra de linguagem', () => {
  const textos = [...Object.values(RUAS.CENARIO), ...RUAS.FAMILIAS.map((f) => f.explica), ...RUAS.FAIXAS.flatMap((f) => [f.rotulo, f.curto])];
  for (const t of textos) for (const p of PROIBIDAS) assert.ok(!t.toLowerCase().includes(p), `"${t}" contém "${p}"`);
});

test('toda rua do arquivo cai em faixas conhecidas, com cenário', () => {
  const ids = new Set(RUAS.FAIXAS.map((f) => f.id));
  for (const g of indice.grupos) {
    assert.ok(g.faixas.size > 0);
    for (const id of g.faixas) assert.ok(ids.has(id), `faixa desconhecida ${id}`);
    assert.ok(RUAS.cenariosDaVia(g.faixas).length > 0);
  }
});

// --- geometria (8.5) ----------------------------------------------------------------------------
test('distPontoSegmento: projeta no segmento e limita nas pontas', () => {
  assert.strictEqual(RUAS.distPontoSegmento([5, 3], [0, 0], [10, 0]), 3);
  assert.strictEqual(RUAS.distPontoSegmento([-4, 3], [0, 0], [10, 0]), 5);
  assert.strictEqual(RUAS.distPontoSegmento([3, 4], [0, 0], [0, 0]), 5);
});

test('distSegmentoSegmento: segmentos que se cruzam estão a 0 m (vértice-vértice dava > 0)', () => {
  const a = [-100, 0], b = [100, 0], c = [0, -100], d = [0, 100];
  assert.strictEqual(RUAS.distSegmentoSegmento(a, b, c, d), 0);
  assert.strictEqual(RUAS.distSegmentoSegmento([0, 0], [10, 0], [0, 7], [10, 7]), 7);
  assert.strictEqual(RUAS.distSegmentoSegmento([0, 0], [10, 0], [13, 4], [20, 4]), 5);
});

test('projetar: 0,001° de latitude ≈ 110,5 m', () => {
  const [, y0] = RUAS.projetar(-48.85, -26.3);
  const [, y1] = RUAS.projetar(-48.85, -26.299);
  assert.ok(Math.abs(y1 - y0 - 110.54) < 0.01);
});

test('pares que o vértice-vértice perdia agora entram a ≤ 300 m', () => {
  const dist = (a, b) => Math.min(...porNome(a).grupos.flatMap((g) => porNome(b).grupos.map((h) => RUAS.distLinhas(g.linhas, h.linhas))));
  for (const [a, b] of [['Rua São Leopoldo', 'Rua Índia'], ['Rua Gardênias', 'Rua Padre Augusto']]) {
    assert.ok(dist(a, b) <= 300, `${a} × ${b}: ${dist(a, b)} m`);
  }
});

test('vizinhas: acha Rua Índia ao redor da Rua São Leopoldo com raio 300 m e ordena por faixa ativa e distância', () => {
  const sl = porNome('Rua São Leopoldo').grupos[0];
  const grande = RUAS.vizinhas(indice, sl, todas('inativa'), { excluir: sl.nome, max: 1000 });
  assert.ok(grande.some((v) => v.grupo.nome === 'Rua Índia'));
  assert.ok(grande.every((v) => v.d <= 300 && v.grupo.nome !== sl.nome));
  const ordenadas = [...grande].sort((a, b) => a.d - b.d).map((v) => v.grupo.nome);
  assert.deepStrictEqual(grande.map((v) => v.grupo.nome), ordenadas);
  // com uma faixa ativa na vizinha, ela sobe para o topo mesmo sendo mais distante
  const alvo = grande[grande.length - 1].grupo;
  const ativaSo = (id) => (alvo.faixas.has(id) ? 'ativa' : 'inativa');
  const comAtiva = RUAS.vizinhas(indice, sl, ativaSo, { excluir: sl.nome, max: 1000 });
  assert.strictEqual(comAtiva[0].estado, 'ativa');
  assert.strictEqual(RUAS.vizinhas(indice, sl, todas('inativa'), { excluir: sl.nome }).length, 4); // MAX padrão
});

test('vizinhas de um ponto: ponto em cima da rua a 0 m; ponto longe não acha nada', () => {
  const [lng, lat] = colecao.features[0].geometry.coordinates[0];
  const perto = RUAS.vizinhas(indice, RUAS.refDoPonto(lng, lat), todas('inativa'));
  assert.ok(perto.length > 0 && perto[0].d < 5);
  assert.deepStrictEqual(RUAS.vizinhas(indice, RUAS.refDoPonto(-48.0, -26.0), todas('inativa')), []);
});

// --- homônimos (8.5) ---------------------------------------------------------------------------
test('homônimos a mais de 500 m viram grupos separados; trechos próximos ficam juntos', () => {
  const sint = (nome, lng) => ({ type: 'Feature', properties: { nome, faixas: ['mare_1_6'], m: 50 }, geometry: { type: 'LineString', coordinates: [[lng, -26.3], [lng + 0.001, -26.3]] } });
  // 0,001° ≈ 100 m: trechos em -48.85, -48.848 (≈ 100 m de vão) e -48.84 (≈ 800 m)
  const ix = RUAS.construirIndice({ features: [sint('Rua A', -48.85), sint('Rua A', -48.848), sint('Rua A', -48.84)] });
  assert.strictEqual(ix.ruas.length, 1);
  assert.strictEqual(ix.ruas[0].grupos.length, 2);
  assert.deepStrictEqual(ix.ruas[0].grupos.map((g) => g.m).sort((a, b) => a - b), [50, 100]);
});

test('o arquivo real tem homônimos (Rua Urussanga) e cada grupo reúne trechos próximos', () => {
  const urus = porNome('Rua Urussanga');
  assert.ok(urus.grupos.length > 1);
  assert.ok(indice.ruas.filter((r) => r.grupos.length > 1).length >= 5);
});

test('escolherGrupo com posição: devolve o grupo mais próximo do GPS, em qualquer um dos grupos', () => {
  const feats = colecao.features.filter((f) => f.properties.nome === 'Rua Urussanga');
  const rua = porNome('Rua Urussanga');
  const achados = new Set();
  for (const f of feats) {
    const c = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates[0][0] : f.geometry.coordinates[0];
    const g = RUAS.escolherGrupo(rua, c, todas('inativa'));
    assert.ok(RUAS.distLinhas(RUAS.refDoPonto(c[0], c[1]).linhas, g.linhas) < 1);
    achados.add(g);
  }
  assert.strictEqual(achados.size, rua.grupos.length);
});

test('escolherGrupo sem posição: prefere o grupo com faixa ativa, depois o de maior trecho', () => {
  const rua = porNome('Rua Urussanga');
  const [g1, g2] = rua.grupos;
  const so = (g) => (id) => (g.faixas.has(id) && ![...(g === g1 ? g2 : g1).faixas].includes(id) ? 'ativa' : 'inativa');
  const unico1 = [...g1.faixas].filter((id) => !g2.faixas.has(id));
  if (unico1.length) assert.strictEqual(RUAS.escolherGrupo(rua, null, so(g1)), g1);
  const maior = [...rua.grupos].sort((a, b) => b.m - a.m)[0];
  assert.strictEqual(RUAS.escolherGrupo(rua, null, todas('inativa')), maior);
});

// --- busca (8.6) --------------------------------------------------------------------------------
test('achar: ignora acento e caixa, exige 3 letras, nome exato antes de "contém"', () => {
  assert.deepStrictEqual(RUAS.achar(indice, 'ur'), []);
  const r = RUAS.achar(indice, 'rua sao leopoldo');
  assert.strictEqual(r[0].nome, 'Rua São Leopoldo');
  const q = RUAS.achar(indice, 'URUSSANGA');
  assert.ok(q.length >= 1 && q.every((x) => x.chave.includes('urussanga')));
  assert.deepStrictEqual(RUAS.achar(indice, 'zzzzqq'), []);
});

test('filtrarRuasDaFaixa: busca no rótulo da faixa mostra todas; senão filtra por nome', () => {
  const ruas = [{ chave: 'rua a' }, { chave: 'rua b' }];
  assert.strictEqual(RUAS.filtrarRuasDaFaixa(ruas, 'Maré — Cachoeira', ''), ruas);
  assert.strictEqual(RUAS.filtrarRuasDaFaixa(ruas, 'Maré — Cachoeira', 'mare'), ruas);
  assert.deepStrictEqual(RUAS.filtrarRuasDaFaixa(ruas, 'Maré — Cachoeira', 'rua b'), [{ chave: 'rua b' }]);
});

test('filtroDe: só Vila Nova tem filtro, e só o cenário Atual do TR da faixa', () => {
  assert.strictEqual(RUAS.filtroDe('mare_1_6'), undefined);
  const f = RUAS.filtroDe('pluvial_vn_tr10');
  assert.ok(f({ properties: { status_1: 'Atual', tempretor: '10 anos' } }));
  assert.ok(!f({ properties: { status_1: 'Futuro', tempretor: '10 anos' } }));
  assert.ok(!f({ properties: { status_1: 'Atual', tempretor: '5 anos' } }));
});
