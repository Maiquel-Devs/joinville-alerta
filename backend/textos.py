# backend/textos.py
# Texto do alerta por tabela fixa. O risk_engine decide o nível e as faixas;
# aqui só se escolhe a frase, que é revisável e testada. Sem IA no caminho.

CAUSA_FAIXA = {
    "mare_1_6": "maré alta no Rio Cachoeira (patamar de 1,6 m)",
    "mare_2_5": "maré muito alta no Rio Cachoeira (patamar de 2,5 m)",
    "pluvial_vn_tr5": "chuva muito forte em 24 h na região do Vila Nova (cenário de cheia de 5 anos)",
    "pluvial_vn_tr10": "chuva muito forte em 24 h na região do Vila Nova (cenário de cheia de 10 anos)",
    "pluvial_vn_tr25": "chuva extrema em 24 h na região do Vila Nova (cenário de cheia de 25 anos)",
}

# Faixas de chuva aninhadas: se a de TR maior está ativa, as menores também estão.
# O texto cita só a de maior TR, para não repetir a mesma chuva três vezes.
FAIXAS_CHUVA_POR_TR = ("pluvial_vn_tr5", "pluvial_vn_tr10", "pluvial_vn_tr25")

# Rótulo do título por nível; qualquer nível fora da tabela cai em "atenção".
ROTULO_NIVEL = {"alto": "nível alto", "atencao": "nível de atenção"}

ORIENTACAO = "Evite as áreas baixas mapeadas pelo PDDU e acompanhe a Defesa Civil."

AVISO_FINAL = (
    "Fora das áreas mapeadas pelo PDDU também pode alagar. "
    "Este app não substitui a Defesa Civil (199)."
)

# Aviso geral de chuva (interino até a Etapa 6). Não pinta ruas.
AVISO_CHUVA = (
    "Chuva forte acumulada nas últimas 24 h: atenção a pontos baixos. "
    "Fora das áreas mapeadas pelo PDDU também pode alagar. Em emergência, ligue 199."
)

# Expressões que a regra de linguagem proíbe (CLAUDE.md); usadas nos testes.
PROIBIDAS = ("alagad", "sem risco", "cidade segura", "situação segura", "zona segura", "sob controle", "mancha")


def texto(nivel: str, faixas_ativas: tuple[str, ...], atencao_geral: dict | None = None) -> dict:
    """Devolve {"titulo", "mensagem"} para o par (nível, faixas ativas)."""
    if nivel == "indisponivel":
        return {
            "titulo": "Dados indisponíveis",
            "mensagem": "Não foi possível avaliar o risco de alagar agora. "
            "Isso não significa que não haja risco. " + AVISO_FINAL,
        }
    if not faixas_ativas:
        base = "Nenhuma faixa de risco de alagar está ativa neste momento. "
        ag = atencao_geral or {}
        if ag.get("chuva"):
            fim = AVISO_CHUVA
        elif ag.get("mare"):
            fim = "Há maré forte na região: atenção a pontos baixos. " + AVISO_FINAL
        else:
            fim = AVISO_FINAL
        return {"titulo": "Nenhuma faixa ativa agora", "mensagem": base + fim}
    chuvas = [f for f in FAIXAS_CHUVA_POR_TR if f in faixas_ativas]
    mostrar = [f for f in faixas_ativas if f not in FAIXAS_CHUVA_POR_TR] + chuvas[-1:]
    causas = "; ".join(CAUSA_FAIXA[f] for f in mostrar)
    return {
        "titulo": f"Risco de alagar: {ROTULO_NIVEL.get(nivel, 'nível de atenção')}",
        "mensagem": f"Faixas ativas: {causas}. {ORIENTACAO} {AVISO_FINAL}",
    }
