// Rodar: node --test
const test = require('node:test');
const assert = require('node:assert');
const { IDADE_MAX_MIN, idadeMin, vencido, estadoFaixa } = require('../idade.js');

const AGORA = Date.parse('2026-10-29T15:00:00Z');
const antes = (min) => new Date(AGORA - min * 60000).toISOString();
const dados = (min, extra = {}) => ({ status: 'ok', gerado_em: antes(min), faixas: { mare_1_6: 'ativa', mare_2_5: 'inativa' }, ...extra });

test('teto é 120 min', () => assert.strictEqual(IDADE_MAX_MIN, 120));

test('idadeMin: calcula e devolve null para data inválida', () => {
  assert.strictEqual(idadeMin(antes(30), AGORA), 30);
  assert.strictEqual(idadeMin(undefined, AGORA), null);
  assert.strictEqual(idadeMin('lixo', AGORA), null);
});

test('dado de 119 e 120 min vale; de 121 min vence', () => {
  assert.strictEqual(vencido(dados(119), AGORA), false);
  assert.strictEqual(vencido(dados(120), AGORA), false);
  assert.strictEqual(vencido(dados(121), AGORA), true);
});

test('dado de 3 h: todas as faixas ficam indisponíveis, inclusive a ativa e a inativa', () => {
  const d = dados(180);
  assert.strictEqual(estadoFaixa(d, 'mare_1_6', AGORA), 'indisponivel');
  assert.strictEqual(estadoFaixa(d, 'mare_2_5', AGORA), 'indisponivel');
});

test('dado fresco repete o que o back-end decidiu', () => {
  const d = dados(10);
  assert.strictEqual(estadoFaixa(d, 'mare_1_6', AGORA), 'ativa');
  assert.strictEqual(estadoFaixa(d, 'mare_2_5', AGORA), 'inativa');
});

test('sem dado, sem gerado_em, status indisponivel ou faixa ausente: indisponível', () => {
  assert.strictEqual(estadoFaixa(null, 'mare_1_6', AGORA), 'indisponivel');
  assert.strictEqual(estadoFaixa({ status: 'ok', faixas: { mare_1_6: 'inativa' } }, 'mare_1_6', AGORA), 'indisponivel');
  assert.strictEqual(estadoFaixa(dados(10, { status: 'indisponivel' }), 'mare_1_6', AGORA), 'indisponivel');
  assert.strictEqual(estadoFaixa(dados(10), 'outra', AGORA), 'indisponivel');
});
