# backend/rota_exposicao.py
# Caminho de menor exposição às faixas do PDDU entre duas ruas informadas (Etapa 10, Parte B1).
# É uma MÉTRICA DE EXPOSIÇÃO, não um julgamento de que um caminho é melhor: o app só avalia
# o que está dentro das áreas mapeadas pelo PDDU, e fora delas não sabe nada. Sempre devolve os dois
# caminhos (o mais curto e o de menor exposição) para o front comparar.
# Usa networkx e o grafo reduzido data/grafo_reduzido.json.gz (gerado por scripts/gerar_grafo_reduzido.py).
# Sem osmnx aqui: custo zero no Render. Nenhum texto para o usuário é gerado neste módulo.
import difflib
import gzip
import json
import math
import os
import re
import threading
import unicodedata
from datetime import datetime
from pathlib import Path

import networkx as nx

from config import IDADE_MAX_MIN
from risk_engine import INDISPONIVEL, faixas_ativas as faixas_ativas_do_estado
from trajetos import AREA_SEM_FAIXA_ATIVA, CLASSES, FAIXA_ATIVA, NAO_AVALIADO, classificar_trecho

# Como em trajetos.py: calculado a partir deste arquivo. GRAFO_REDUZIDO é uma sobrescrita opcional.
ARQ_PADRAO = Path(__file__).resolve().parent.parent / "data" / "grafo_reduzido.json.gz"

K_PADRAO = 3.0  # peso = comprimento * (1 + K * expo)
TETO_PADRAO = 0.20  # desvio máximo aceito sobre o caminho mais curto
EXPO = {FAIXA_ATIVA: 1.0, AREA_SEM_FAIXA_ATIVA: 0.5, NAO_AVALIADO: 0.0}
RAIO_HOMONIMO_M = 500  # trechos do mesmo nome a até 500 m um do outro são a mesma rua (igual ao front)
MIN_LETRAS = 3
MAX_OPCOES = 5
MAX_SUGESTOES = 3
CORTE_SUGESTAO = 0.6
DENOMINACOES = {"rua", "av", "avenida", "servidao", "travessa", "alameda", "ponte", "rodovia", "praca", "estrada"}

# --- nomes: mesma regra de mapa.js (casarNome) ---------------------------------------------------


class TextoCurto(ValueError):
    """Texto com menos de 3 letras depois de tirar a denominação inicial (rua, avenida...)."""


def normalizar(texto) -> str:
    """Sem acento, minúsculas, só letras e números, espaços simples (como `normalizar` de mapa.js)."""
    sem_acento = "".join(c for c in unicodedata.normalize("NFD", str(texto or "")) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", sem_acento.lower()).strip()


def consulta(texto) -> str | None:
    """Texto normalizado e sem a denominação inicial; None se sobrar menos de 3 letras."""
    palavras = normalizar(texto).split()
    if palavras and palavras[0] in DENOMINACOES:
        palavras = palavras[1:]
    q = " ".join(palavras)
    return q if len(q) >= MIN_LETRAS else None


def casa(nome, q: str) -> bool:
    """O texto começa o nome ou alguma palavra dele, em sequência ("principe" em "Rua do Príncipe")."""
    palavras = normalizar(nome).split()
    return any(" ".join(palavras[k:]).startswith(q) for k in range(len(palavras)))


# --- a rede ---------------------------------------------------------------------------------------


class Rede:
    """DiGraph do grafo reduzido + índice de nomes. Nós: lat, lon. Arestas: length, osmid, nomes, faixas."""

    def __init__(self, nos, arestas):
        g = nx.DiGraph()
        for id_, lat, lon in nos:
            g.add_node(id_, lat=lat, lon=lon)
        for u, v, comprimento, osmid, nomes, faixas in arestas:
            if g.has_edge(u, v) and g[u][v]["length"] <= comprimento:
                continue  # aresta paralela: fica a mais curta (como o shortest_path do osmnx)
            g.add_edge(u, v, length=comprimento, osmid=osmid, nomes=nomes, faixas=faixas)
        self.g = g
        self.por_nome: dict[str, list[tuple[int, int]]] = {}
        for u, v, d in g.edges(data=True):
            for nome in d["nomes"]:
                self.por_nome.setdefault(nome, []).append((u, v))
        self._x0 = math.cos(math.radians(-26.30)) * 111320.0

    def metros(self, no):
        d = self.g.nodes[no]
        return d["lon"] * self._x0, d["lat"] * 110574.0


def carregar(caminho: Path) -> Rede:
    with gzip.open(caminho, "rt", encoding="utf-8") as f:
        dados = json.load(f)
    return Rede(dados["nos"], dados["arestas"])


_lock = threading.Lock()
_rede: Rede | None = None


def rede() -> Rede:
    """Carrega o grafo uma vez só, na primeira consulta."""
    global _rede
    if _rede is None:
        with _lock:
            if _rede is None:
                _rede = carregar(Path(os.getenv("GRAFO_REDUZIDO") or ARQ_PADRAO))
    return _rede


# --- resolver: texto -> candidatos ----------------------------------------------------------------


def _agrupar(rede_: Rede, nos) -> list[set]:
    """Agrupa nós a até RAIO_HOMONIMO_M um do outro em cadeia (ligação simples, com grade de 500 m)."""
    nos = list(nos)
    pai = {n: n for n in nos}

    def raiz(n):
        while pai[n] != n:
            pai[n] = pai[pai[n]]
            n = pai[n]
        return n

    grade: dict[tuple[int, int], list] = {}
    pos = {n: rede_.metros(n) for n in nos}
    for n in nos:
        x, y = pos[n]
        grade.setdefault((int(x // RAIO_HOMONIMO_M), int(y // RAIO_HOMONIMO_M)), []).append(n)
    for n in nos:
        x, y = pos[n]
        cx, cy = int(x // RAIO_HOMONIMO_M), int(y // RAIO_HOMONIMO_M)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for m in grade.get((cx + dx, cy + dy), ()):
                    if m != n and math.hypot(x - pos[m][0], y - pos[m][1]) <= RAIO_HOMONIMO_M:
                        pai[raiz(m)] = raiz(n)
    grupos: dict = {}
    for n in nos:
        grupos.setdefault(raiz(n), set()).add(n)
    return list(grupos.values())


def _pontas(rede_: Rede, grupo) -> tuple:
    """As duas pontas do grupo: o nó mais longe do centro e o nó mais longe desse (aproxima o diâmetro)."""
    pos = {n: rede_.metros(n) for n in grupo}
    cx = sum(x for x, _ in pos.values()) / len(pos)
    cy = sum(y for _, y in pos.values()) / len(pos)
    a = max(grupo, key=lambda n: (math.hypot(pos[n][0] - cx, pos[n][1] - cy), n))
    b = max(grupo, key=lambda n: (math.hypot(pos[n][0] - pos[a][0], pos[n][1] - pos[a][1]), n))
    return a, b


def _cruza(rede_: Rede, no, oficial: str) -> str | None:
    """Nome mais frequente entre as arestas do nó que não são da própria rua; sem nome ou sem vizinha: None.
    Empate: ordem alfabética. Aresta sem nome não conta."""
    cont: dict[str, int] = {}
    vizinhas = [rede_.g[no][v] for v in rede_.g.successors(no)] + [rede_.g[u][no] for u in rede_.g.predecessors(no)]
    for d in vizinhas:
        if d["nomes"] and oficial not in d["nomes"]:
            cont[d["nomes"][0]] = cont.get(d["nomes"][0], 0) + 1
    return min(cont, key=lambda n: (-cont[n], n)) if cont else None


def resolver(rede_: Rede, texto) -> dict:
    """Candidatos para o texto: {"ambiguo": bool, "total_opcoes": n, "opcoes": [...]}.

    Os trechos que casam são agrupados pelo nome oficial (o primeiro nome da aresta que casou) e cada
    nome é separado em ruas distintas quando os trechos ficam a mais de 500 m um do outro. Mais de um
    grupo = ambíguo: devolve as opções, sem escolher. Cada opção tem um nó representativo (o nó do grupo
    mais perto do centro dele), lat, lon o rótulo, o número de trechos, o comprimento total (km, uma casa) e a rua que cruza em cada ponta
    (cruza_inicio, cruza_fim; None no fim de via). No máximo MAX_OPCOES, das mais longas em trechos.
    Levanta TextoCurto se o texto tem menos de 3 letras depois de tirar a denominação.
    """
    q = consulta(texto)
    if q is None:
        raise TextoCurto(texto)
    nomes_que_casam = {nome for nome in rede_.por_nome if casa(nome, q)}
    por_oficial: dict[str, list[tuple[int, int]]] = {}
    for nome in nomes_que_casam:
        for u, v in rede_.por_nome[nome]:
            primeiro = next(n for n in rede_.g[u][v]["nomes"] if n in nomes_que_casam)
            if primeiro == nome:
                por_oficial.setdefault(nome, []).append((u, v))
    opcoes = []
    for oficial, arestas in por_oficial.items():
        nos = {n for aresta in arestas for n in aresta}
        for grupo in _agrupar(rede_, nos):
            unicas = {frozenset(a): a for a in arestas if a[0] in grupo}  # os dois sentidos contam uma vez
            n_trechos = len(unicas)
            km = round(sum(rede_.g[u][v]["length"] for u, v in unicas.values()) / 1000, 1)
            xs, ys = zip(*(rede_.metros(n) for n in grupo))
            cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
            rep = min(grupo, key=lambda n: math.hypot(rede_.metros(n)[0] - cx, rede_.metros(n)[1] - cy))
            d = rede_.g.nodes[rep]
            ini, fim = _pontas(rede_, grupo)
            opcoes.append({"nome": oficial, "rotulo": f"{oficial} ({n_trechos} trechos)", "trechos": n_trechos,
                           "km": km, "cruza_inicio": _cruza(rede_, ini, oficial),
                           "cruza_fim": _cruza(rede_, fim, oficial), "no": rep, "lat": d["lat"], "lon": d["lon"]})
    opcoes.sort(key=lambda o: (-o["trechos"], o["nome"]))
    return {"ambiguo": len(opcoes) > 1, "total_opcoes": len(opcoes), "opcoes": opcoes[:MAX_OPCOES]}


def sugerir(rede_: Rede, texto) -> list[str]:
    """Até 3 nomes oficiais parecidos com o texto (difflib), para quando nada casa. Não calcula nada."""
    q = consulta(texto)
    if q is None:
        return []
    chaves: dict[str, str] = {}  # nome sem a denominação inicial, normalizado -> nome oficial
    for nome in rede_.por_nome:
        palavras = normalizar(nome).split()
        if palavras and palavras[0] in DENOMINACOES:
            palavras = palavras[1:]
        chaves.setdefault(" ".join(palavras), nome)
    achadas = difflib.get_close_matches(q, list(chaves), n=MAX_SUGESTOES, cutoff=CORTE_SUGESTAO)
    return [chaves[c] for c in achadas]


# --- estado atual -----------------------------------------------------------------------------------


def faixas_ativas_validas(status: dict, agora: datetime) -> tuple[str, ...] | None:
    """Faixas ativas do cache `status` (formato de status_geral()), ou None se não há dado válido:
    cache vazio, status indisponível, alguma faixa sem dado ou dado mais velho que IDADE_MAX_MIN."""
    faixas = status.get("faixas") or {}
    if status.get("status") != "ok" or not faixas or INDISPONIVEL in faixas.values():
        return None
    try:
        idade_min = (agora - datetime.fromisoformat(status["gerado_em"])).total_seconds() / 60
    except (KeyError, TypeError, ValueError):
        return None
    if idade_min > IDADE_MAX_MIN:
        return None
    return faixas_ativas_do_estado(faixas)


# --- classe e peso ---------------------------------------------------------------------------------


def classe_da_aresta(aresta: dict, faixas_ativas) -> str:
    """faixa_ativa se alguma faixa da aresta está ativa; area_sem_faixa_ativa se tem faixas mas nenhuma
    ativa; nao_avaliado se não tem faixas (fora das áreas mapeadas: nunca conta como zero de risco)."""
    return classificar_trecho(aresta["faixas"], faixas_ativas)


def expo(aresta: dict, faixas_ativas) -> float:
    return EXPO[classe_da_aresta(aresta, faixas_ativas)]


# --- caminhos --------------------------------------------------------------------------------------


def _metros_inteiros(exatos: list[float]) -> list[int]:
    """Inteiros pelo maior resto: a soma bate com o total exato arredondado (como gerar_trajetos.py)."""
    base = [max(1, int(x)) for x in exatos]
    falta = round(sum(exatos)) - sum(base)
    ordem = sorted(range(len(exatos)), key=lambda i: exatos[i] - int(exatos[i]), reverse=falta > 0)
    i = 0
    while falta != 0 and ordem:
        k = ordem[i % len(ordem)]
        if falta > 0:
            base[k] += 1
            falta -= 1
        elif base[k] > 1:
            base[k] -= 1
            falta += 1
        i += 1
    return base


def descrever(rede_: Rede, caminho: list, faixas_ativas) -> dict:
    """Totais em km por classe e FeatureCollection de LineString (classe, m, nomes, osmid), na ordem do caminho.
    Arestas vizinhas de mesma classe e mesmo nome viram um só trecho."""
    metros = dict.fromkeys(CLASSES, 0.0)
    trechos: list[dict] = []
    for u, v in zip(caminho[:-1], caminho[1:]):
        d = rede_.g[u][v]
        classe = classe_da_aresta(d, faixas_ativas)
        metros[classe] += d["length"]
        par = [[rede_.g.nodes[u]["lon"], rede_.g.nodes[u]["lat"]], [rede_.g.nodes[v]["lon"], rede_.g.nodes[v]["lat"]]]
        if trechos and trechos[-1]["classe"] == classe and trechos[-1]["nomes"] == d["nomes"]:
            trechos[-1]["coords"].append(par[1])
            trechos[-1]["m"] += d["length"]
            trechos[-1]["osmid"].update(d["osmid"])
        else:
            trechos.append({"classe": classe, "nomes": list(d["nomes"]), "coords": par, "m": d["length"],
                            "osmid": set(d["osmid"])})
    inteiros = _metros_inteiros([t["m"] for t in trechos])
    feats = []
    for t, m in zip(trechos, inteiros):
        ids = sorted(t["osmid"])
        props = {"classe": t["classe"], "m": m, "nomes": t["nomes"], "osmid": ids[0] if len(ids) == 1 else ids}
        feats.append({"type": "Feature", "properties": props, "geometry": {"type": "LineString", "coordinates": t["coords"]}})
    return {
        "km": round(sum(metros.values()) / 1000, 3),
        "km_por_classe": {c: round(metros[c] / 1000, 3) for c in CLASSES},
        "trechos": {"type": "FeatureCollection", "features": feats},
    }


def _comprimento(rede_: Rede, caminho: list) -> float:
    return sum(rede_.g[u][v]["length"] for u, v in zip(caminho[:-1], caminho[1:]))


def calcular(rede_: Rede, no_origem, no_destino, faixas_ativas, K: float = K_PADRAO, teto: float = TETO_PADRAO) -> dict:
    """Os dois caminhos entre dois nós: o mais curto (peso = comprimento) e o de menor exposição
    (peso = comprimento * (1 + K * expo)). Se o de menor exposição for mais de `teto` (20%) maior que o
    mais curto, devolve o mais curto no lugar dele e marca teto_aplicado."""
    g = rede_.g
    if no_origem not in g or no_destino not in g:
        return {"status": "sem_caminho"}
    ativas = set(faixas_ativas)

    def peso(u, v, d):
        return d["length"] * (1 + K * EXPO[classe_da_aresta(d, ativas)])

    try:
        curto = nx.shortest_path(g, no_origem, no_destino, weight="length")
        exposicao = nx.shortest_path(g, no_origem, no_destino, weight=peso)
    except nx.NetworkXNoPath:
        return {"status": "sem_caminho"}
    teto_aplicado = _comprimento(rede_, exposicao) > (1 + teto) * _comprimento(rede_, curto)
    if teto_aplicado:
        exposicao = curto
    d_curto, d_expo = descrever(rede_, curto, ativas), descrever(rede_, exposicao, ativas)
    return {
        "status": "ok",
        "caminho_curto": d_curto,
        "caminho_exposicao": d_expo,
        "diferenca_km": round(d_expo["km"] - d_curto["km"], 3),
        "teto_aplicado": teto_aplicado,
        "k": K,
        "teto": teto,
    }
