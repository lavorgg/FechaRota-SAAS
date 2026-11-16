// Gerador mínimo de PNG (RGB, 8 bits), sem dependências. Usado pelo seed e pelos testes para
// produzir fotos e assinaturas de exemplo sem versionar binários no repositório.

import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.byteLength);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

export type Rgb = readonly [number, number, number];

/** Codifica uma imagem RGB. `pixel(x, y)` devolve a cor de cada ponto. */
export function encodePng(width: number, height: number, pixel: (x: number, y: number) => Rgb): Uint8Array {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filtro "None" em cada linha
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const offset = y * stride + 1 + x * 3;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits por canal
  header[9] = 2; // RGB
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", new Uint8Array()),
    ]),
  );
}

/** Assinatura de exemplo: traço escuro ondulado sobre fundo branco. `seed` varia o desenho. */
export function sampleSignaturePng(seed: number): Uint8Array {
  const width = 480;
  const height = 160;
  const curve = (x: number) =>
    height / 2 + Math.sin(x / (14 + (seed % 5))) * 34 + Math.sin(x / (5 + (seed % 3))) * 12 - (x - width / 2) * 0.05;
  return encodePng(width, height, (x, y) => {
    const inside = x > 40 && x < width - 40 && Math.abs(y - curve(x)) < 2.2;
    return inside ? [20, 24, 60] : [255, 255, 255];
  });
}

/** "Foto" de exemplo: degradê com faixas, só para a tela de fechamento ter o que mostrar. */
export function samplePhotoPng(seed: number): Uint8Array {
  const width = 640;
  const height = 480;
  return encodePng(width, height, (x, y) => {
    const band = Math.floor((x + y + seed * 37) / 80) % 2 === 0 ? 18 : 0;
    return [
      Math.min(255, 90 + Math.floor((x / width) * 110) + band),
      Math.min(255, 110 + Math.floor((y / height) * 90) + band),
      Math.min(255, 120 + ((seed * 29) % 80) + band),
    ];
  });
}
