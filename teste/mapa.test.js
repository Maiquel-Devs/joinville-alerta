const test = require('node:test');
const assert = require('node:assert/strict');
const { decidirMapa, estiloDoTrecho, formatarKm, LEAFLET } = require('../mapa.js');

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
