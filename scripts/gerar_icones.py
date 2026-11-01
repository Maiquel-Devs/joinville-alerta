"""Gera icons/icon-192.png, icon-512.png e icon-maskable-512.png: gota com um "J" (Joinville) sobre fundo azul-marinho.
Desenho próprio, sem logotipo de terceiros. Uso: python scripts/gerar_icones.py"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SAIDA = Path(__file__).resolve().parent.parent / "icons"
FUNDO = (15, 23, 42)       # #0f172a, igual ao theme_color
GOTA = (56, 189, 248)      # azul claro
ONDA = (14, 116, 144)
LETRA = (15, 23, 42)
SS = 4  # supersampling para suavizar as bordas


def gota(d, cx, cy, r, cor):
    """Gota: círculo embaixo e ponta em cima."""
    ponta = (cx, cy - 1.9 * r)
    ang = math.asin(1 / 1.9)  # tangentes da ponta ao círculo
    p1 = (cx - r * math.cos(ang), cy - r * math.sin(ang))
    p2 = (cx + r * math.cos(ang), cy - r * math.sin(ang))
    d.polygon([ponta, p2, p1], fill=cor)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=cor)


def desenhar(tam, escala_conteudo, arredondar):
    n = tam * SS
    img = Image.new("RGBA", (n, n), FUNDO + (255,))
    d = ImageDraw.Draw(img)
    cx = n / 2
    r = n * 0.25 * escala_conteudo
    cy = n * 0.5 + r * 0.45
    gota(d, cx, cy, r, GOTA)
    # ondas na base da gota, recortadas pela forma dela
    ondas = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    do = ImageDraw.Draw(ondas)
    for k, dy in enumerate((0.45, 0.8)):
        y = cy + r * dy
        pts = [(cx - r * 1.1 + i * (r * 2.2 / 40), y + math.sin(i / 40 * 2 * math.pi * 1.5 + k) * r * 0.07) for i in range(41)]
        do.line(pts, fill=ONDA, width=int(r * 0.09))
    forma = Image.new("L", (n, n), 0)
    gota(ImageDraw.Draw(forma), cx, cy, r, 255)
    img.paste(ondas, (0, 0), Image.composite(ondas.getchannel("A"), Image.new("L", (n, n), 0), forma))
    # letra J
    fonte = None
    for nome in ("arialbd.ttf", "DejaVuSans-Bold.ttf", "Arial Bold.ttf"):
        try:
            fonte = ImageFont.truetype(nome, int(r * 1.35))
            break
        except OSError:
            pass
    fonte = fonte or ImageFont.load_default()
    d.text((cx, cy - r * 0.2), "J", font=fonte, fill=LETRA, anchor="mm")
    if arredondar:  # ícones "any": cantos arredondados; o maskable fica em tela cheia
        m = Image.new("L", (n, n), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.18, fill=255)
        img.putalpha(m)
    return img.resize((tam, tam), Image.LANCZOS)


if __name__ == "__main__":
    SAIDA.mkdir(exist_ok=True)
    desenhar(512, 1.0, True).save(SAIDA / "icon-512.png")
    desenhar(192, 1.0, True).save(SAIDA / "icon-192.png")
    # maskable: conteúdo dentro da zona segura (círculo central de 80%)
    desenhar(512, 0.78, False).save(SAIDA / "icon-maskable-512.png")
