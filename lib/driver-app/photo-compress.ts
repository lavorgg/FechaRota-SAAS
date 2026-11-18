// Compressão da foto no celular (seção 5.7): lado maior 1600 px, JPEG ~0,7, orientação EXIF
// respeitada. Se passar de 400 KB, baixa a qualidade e depois o tamanho (domain/photo.ts).

import { PHOTO_MAX_SIDE, PHOTO_QUALITY, PHOTO_TARGET_BYTES, fitWithin, nextCompressionStep } from "../../domain/photo";

type Source = { image: CanvasImageSource; width: number; height: number; release: () => void };

async function load(file: Blob): Promise<Source> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    // Navegador sem createImageBitmap com opções: <img> já aplica a orientação EXIF sozinho.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { image: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error("Não foi possível ler a foto. Tente tirar de novo.");
    }
  }
}

function encode(source: Source, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Não foi possível preparar a foto."));
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source.image, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível preparar a foto."))), "image/jpeg", quality);
  });
}

export async function compressPhoto(file: Blob): Promise<Blob> {
  const source = await load(file);
  try {
    let step: { quality: number; maxSide: number } | null = { quality: PHOTO_QUALITY, maxSide: PHOTO_MAX_SIDE };
    let result: Blob | null = null;
    while (step) {
      const size = fitWithin(source.width, source.height, step.maxSide);
      result = await encode(source, size.width, size.height, step.quality);
      if (result.size <= PHOTO_TARGET_BYTES) return result;
      step = nextCompressionStep(step);
    }
    if (!result) throw new Error("Não foi possível preparar a foto.");
    return result;
  } finally {
    source.release();
  }
}
