# backend/config.py
# Constantes de calibração. PROVISÓRIAS: dependem das decisões da Etapa 0
# (fonte da maré, referencial vertical, limiar pluvial). Trocar só aqui.

# Joinville (Open-Meteo)
LATITUDE = -26.3045
LONGITUDE = -48.8456

# Ciclo do scheduler e validade do dado (o dobro do ciclo)
CICLO_MIN = 15
VALIDADE_MIN = 30

# Gatilhos de maré: metros ACIMA do nível médio (não da régua). Ver 0.2/0.3.
# PROVISÓRIOS: sem calibração por frequência até a tarefa 6.5 (relação CIRAM × Iate Clube e
# referencial vertical). ativacoes.md, seção Maré: na régua do Iate Clube 1,60 m passou 1,5x/ano,
# e 2,53 m nunca; com a hipótese "acima da mediana da régua" seriam 0,4x/ano e 0x/ano.
MARE_1_6_M = 1.60
MARE_2_5_M = 2.53  # PDDU 2011: cheia de ~10 anos; a faixa mantém o nome mare_2_5. Itaum fica aqui.

# Chuva acumulada em 24 h (mm), referência: Open-Meteo (é a fonte de produção, então o viés
# dela já está embutido nos limiares). Decisão do autor de 01/11/2026. Fonte dos números:
# data/derivados/ativacoes.md (seção Chuva, coluna "Open-Meteo 2018–2026 (produção)").
# Aviso geral: não pinta ruas. Linha "Aviso geral, menos frequente: 3/ano" -> 53 mm.
LIMIAR_AVISO_CHUVA_24H_MM = 53.0
# Faixas de rua de Vila Nova, pelo nível de retorno de Gumbel (IC 95% por bootstrap):
# Linha "Faixa TR 5 (0.2/ano)": Gumbel 97.8 mm, IC 75.8–123.7 -> 98 mm. Série de 8,7 anos.
LIMIAR_TR5_24H_MM = 98.0
# Linha "Faixa TR 10 (0.1/ano)": Gumbel 110.0 mm, IC 81.2–142.4 -> 110 mm. EXTRAPOLAÇÃO (a curva
# observada só chega a 143 mm com 8,7 anos de série).
LIMIAR_TR10_24H_MM = 110.0
# Linha "Faixa TR 25 (0.04/ano)": Gumbel 125.4 mm, IC 87.5–166.9 -> 125 mm. EXTRAPOLAÇÃO.
LIMIAR_TR25_24H_MM = 125.0

# Marégrafo CIRAM/Epagri "Joinville" (uso em produção depende de autorização, 0.1)
CIRAM_MARE_URL = "https://ciram.epagri.sc.gov.br/graficos/getDataMare11_2913.php"
# Leitura medida mais antiga que isto é descartada; sem ela, usa-se a previsão
MARE_IDADE_MAX_MIN = 60

# Nível de cada faixa quando ativa. Nomes provisórios (1.4).
# Ordem crescente de gravidade: o nível global é o maior entre as faixas ativas.
# "nenhum" = nenhuma faixa de rua ativa e nenhum aviso geral (nunca "normal").
NIVEIS = ("nenhum", "atencao_geral", "atencao", "alto")
NIVEL_DA_FAIXA = {
    "mare_1_6": "atencao",
    "mare_2_5": "alto",
    "pluvial_vn_tr5": "atencao",
    "pluvial_vn_tr10": "atencao",
    "pluvial_vn_tr25": "alto",
}
FAIXAS = tuple(NIVEL_DA_FAIXA)

# Limiar de chuva de cada faixa de rua. O aninhamento (TR25 ativa => TR10 e TR5 ativas) sai
# destes números, não de regra à parte.
LIMIAR_CHUVA_DA_FAIXA = {
    "pluvial_vn_tr5": LIMIAR_TR5_24H_MM,
    "pluvial_vn_tr10": LIMIAR_TR10_24H_MM,
    "pluvial_vn_tr25": LIMIAR_TR25_24H_MM,
}
