import { strToU8, zipSync } from "fflate";
import type { DocumentBlock, EquationCrop } from "~/recognition/types";

export function figureCropBounds(width: number, height: number, crop: EquationCrop) {
  if (![width, height, crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) ||
      width <= 0 || height <= 0 || crop.x < 0 || crop.y < 0 ||
      crop.width <= 0 || crop.height <= 0 ||
      crop.x + crop.width > 1.000001 || crop.y + crop.height > 1.000001) {
    throw new Error("Select a valid illustration region.");
  }
  const x = Math.floor(crop.x * width);
  const y = Math.floor(crop.y * height);
  return { x, y, width: Math.min(width - x, Math.max(1, Math.ceil(crop.width * width))),
    height: Math.min(height - y, Math.max(1, Math.ceil(crop.height * height))) };
}

export async function cropFigure(file: File, crop: EquationCrop): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const bounds = figureCropBounds(image.naturalWidth, image.naturalHeight, crop);
    const canvas = document.createElement("canvas");
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image cropping is unavailable in this browser.");
    context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height,
      0, 0, bounds.width, bounds.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function createDocumentArchive(latex: string, blocks: DocumentBlock[]): Uint8Array {
  const files: Record<string, Uint8Array> = { "main.tex": strToU8(latex) };
  for (const block of blocks) {
    if (block.type !== "figure") continue;
    if (!/^figures\/figure-[a-z0-9-]+\.png$/.test(block.asset.path) ||
        !block.asset.dataUrl.startsWith("data:image/png;base64,")) {
      throw new Error("Invalid illustration asset.");
    }
    const bytes = atob(block.asset.dataUrl.slice("data:image/png;base64,".length));
    files[block.asset.path] = Uint8Array.from(bytes, (char) => char.charCodeAt(0));
  }
  return zipSync(files);
}
