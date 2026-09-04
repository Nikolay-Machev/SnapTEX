from __future__ import annotations

import struct
import zlib
from pathlib import Path

from .inkml import Ink


def _line(canvas: list[bytearray], start: tuple[int, int], end: tuple[int, int]) -> None:
    x0, y0 = start
    x1, y1 = end
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    step_x = 1 if x0 < x1 else -1
    step_y = 1 if y0 < y1 else -1
    error = dx + dy
    while True:
        for offset_y in (-1, 0, 1):
            for offset_x in (-1, 0, 1):
                x, y = x0 + offset_x, y0 + offset_y
                if 0 <= y < len(canvas) and 0 <= x < len(canvas[0]):
                    canvas[y][x] = 0
        if (x0, y0) == (x1, y1):
            break
        twice_error = 2 * error
        if twice_error >= dy:
            error += dy
            x0 += step_x
        if twice_error <= dx:
            error += dx
            y0 += step_y


def _chunk(kind: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def render_ink_png(
    ink: Ink,
    output: Path,
    *,
    max_width: int = 768,
    max_height: int = 256,
    margin: int = 16,
) -> None:
    points = [point for stroke in ink.strokes for point in stroke]
    min_x = min(point[0] for point in points)
    max_x = max(point[0] for point in points)
    min_y = min(point[1] for point in points)
    max_y = max(point[1] for point in points)
    content_width = max(max_x - min_x, 1)
    content_height = max(max_y - min_y, 1)
    scale = min(
        (max_width - 2 * margin) / content_width,
        (max_height - 2 * margin) / content_height,
        4.0,
    )
    width = max(32, min(max_width, round(content_width * scale) + 2 * margin))
    height = max(32, min(max_height, round(content_height * scale) + 2 * margin))
    canvas = [bytearray([255] * width) for _ in range(height)]

    def transform(point: tuple[float, float]) -> tuple[int, int]:
        return (
            round((point[0] - min_x) * scale) + margin,
            round((point[1] - min_y) * scale) + margin,
        )

    for stroke in ink.strokes:
        transformed = [transform(point) for point in stroke]
        if len(transformed) == 1:
            _line(canvas, transformed[0], transformed[0])
        else:
            for start, end in zip(transformed, transformed[1:]):
                _line(canvas, start, end)

    raw = b"".join(b"\x00" + row for row in canvas)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
        + _chunk(b"IDAT", zlib.compress(raw, level=9))
        + _chunk(b"IEND", b"")
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(png)
