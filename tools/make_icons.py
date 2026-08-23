"""Window Tagger のアイコンを生成する。

デザイン: 重なった2枚のタグ。奥がオレンジ、手前が青。
「複数のタスクを色で見分ける」という拡張の性格をそのまま形にした。
16px でも潰れないよう、要素は2つだけに絞り、穴は大きめに取っている。

512px で描いてから縮小することで、輪郭を滑らかにしている。
"""

from PIL import Image, ImageDraw

S = 512  # 作業解像度
BLUE = (30, 136, 229, 255)
ORANGE = (244, 81, 30, 255)
SIZES = [16, 32, 48, 128]


def tag_polygon(x, y, w, h, notch):
    """左が尖ったタグ形の頂点を返す。"""
    return [
        (x + notch, y),
        (x + w, y),
        (x + w, y + h),
        (x + notch, y + h),
        (x, y + h / 2),
    ]


def rounded_tag(draw, x, y, w, h, notch, color, radius=44):
    # 角丸の胴体と尖った先端を重ねて、擬似的に角丸のタグを作る
    draw.rounded_rectangle(
        [x + notch - radius, y, x + w, y + h], radius=radius, fill=color
    )
    draw.polygon(tag_polygon(x, y, w, h, notch), fill=color)


def build():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 奥のタグ（少し上・左にずらして重なりを見せる）
    rounded_tag(d, 96, 100, 340, 146, 92, ORANGE)

    # 手前のタグとの境界を透明で抜き、重なりを明示する
    d.rounded_rectangle([64, 246, 470, 286], radius=20, fill=(0, 0, 0, 0))

    # 手前のタグ
    rounded_tag(d, 64, 272, 384, 158, 100, BLUE)

    # 紐を通す穴（手前のタグのみ。奥は隠れている想定）
    d.ellipse([146, 326, 196, 376], fill=(0, 0, 0, 0))

    for s in SIZES:
        img.resize((s, s), Image.LANCZOS).save(f"icons/icon{s}.png")
        print(f"icons/icon{s}.png")

    # ウェブストアのタイル用に大きいものも残しておく
    img.save("icons/icon512.png")


if __name__ == "__main__":
    build()
