"""
生成 Habit DB 图标
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size=256, output_dir="."):
    """创建应用图标"""
    # 创建透明背景
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 背景渐变圆形
    margin = size // 8
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        fill=(10, 132, 255, 255)  # 蓝色
    )

    # 内部圆形
    inner_margin = size // 4
    draw.ellipse(
        [inner_margin, inner_margin, size - inner_margin, size - inner_margin],
        fill=(28, 28, 30, 255)  # 深色
    )

    # 中心图案 - 简化的 "H"
    center = size // 2
    h_size = size // 6
    h_width = size // 16

    # 左竖
    draw.rectangle(
        [center - h_size, center - h_size, center - h_size + h_width, center + h_size],
        fill=(10, 132, 255, 255)
    )

    # 右竖
    draw.rectangle(
        [center + h_size - h_width, center - h_size, center + h_size, center + h_size],
        fill=(10, 132, 255, 255)
    )

    # 横
    draw.rectangle(
        [center - h_size, center - h_width // 2, center + h_size, center + h_width // 2],
        fill=(10, 132, 255, 255)
    )

    # 保存不同尺寸
    sizes = [16, 32, 48, 64, 128, 256]
    for s in sizes:
        resized = img.resize((s, s), Image.Resampling.LANCZOS)
        resized.save(os.path.join(output_dir, f"icon_{s}.png"))

    # 保存主图标
    img.save(os.path.join(output_dir, "icon.png"))

    # 创建托盘图标 (16x16)
    tray_icon = img.resize((16, 16), Image.Resampling.LANCZOS)
    tray_icon.save(os.path.join(output_dir, "tray-icon.png"))

    print(f"图标已生成到: {output_dir}")


if __name__ == "__main__":
    create_icon()
