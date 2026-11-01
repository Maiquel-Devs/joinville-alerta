// Rodar: node --test
// Compara o pip.js com o oráculo shapely (teste/pip_oraculo.json, gerado por scripts/gerar_oraculo_pip.py):
// 12.000 pontos aleatórios sobre as áreas mapeadas, para cada faixa.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const PIP = require('../pip.js');
const RUAS = require('../ruas.js');

const raiz = path.join(__dirname, '..');
const lerJson = (rel) => JSON.parse(fs.readFileSync(path.join(raiz, rel), 'utf8'));
const oraculo = lerJson('teste/pip_oraculo.json');

test('o oráculo tem 12.000 pontos e uma resposta por ponto e por faixa', () => {
  assert.strictEqual(oraculo.pontos.length, 12000);
  for (const f of RUAS.FAIXAS) assert.strictEqual(oraculo.esperado[f.id].length, 12000, f.id);
});

for (const faixa of RUAS.FAIXAS) {
  test(`pip.js concorda com o shapely: ${faixa.id}`, () => {
    const colecao = lerJson(faixa.mancha);
    const filtro = RUAS.filtroDe(faixa.id);
    const esperado = oraculo.esperado[faixa.id];
    const divergentes = [];
    let dentro = 0;
    oraculo.pontos.forEach(([lng, lat], i) => {
      const r = PIP.pontoNaColecao(colecao, lng, lat, filtro);
      if (r) dentro++;
      if (r !== (esperado[i] === '1')) divergentes.push([lng, lat]);
    });
    assert.ok(dentro > 0, 'o teste precisa ter pontos dentro da área');
    assert.deepStrictEqual(divergentes.slice(0, 5), [], `${divergentes.length} pontos divergentes`);
  });
}
