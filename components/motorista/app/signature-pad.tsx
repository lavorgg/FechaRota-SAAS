"use client";

// Assinatura (seção 5.7): Pointer Events (dedo, caneta e mouse), touch-action none, escala pelo
// devicePixelRatio, redesenho ao girar a tela, "Limpar" e PNG de fundo branco recortado no
// desenho. A regra de "traço insignificante" está em domain/signature.ts.

import { EraserIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { type Point, type Stroke, cropRect, scaleStrokes, strokesBounds } from "@/domain/signature";

const LINE_WIDTH = 2.5;
const HEIGHT = 200;

function draw(canvas: HTMLCanvasElement, strokes: ReadonlyArray<Stroke>): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ratio = window.devicePixelRatio || 1;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = LINE_WIDTH;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#111827";
  for (const stroke of strokes) {
    const [first, ...rest] = stroke;
    if (!first) continue;
    context.beginPath();
    context.moveTo(first.x, first.y);
    if (rest.length === 0) context.lineTo(first.x + 0.1, first.y + 0.1);
    for (const point of rest) context.lineTo(point.x, point.y);
    context.stroke();
  }
}

/** PNG de fundo branco, recortado no desenho (2× para ficar nítido na impressão). */
export async function exportSignaturePng(strokes: ReadonlyArray<Stroke>, size: { width: number; height: number }): Promise<Blob> {
  const bounds = strokesBounds(strokes);
  if (!bounds) throw new Error("Assinatura vazia.");
  const crop = cropRect(bounds, size);
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(crop.width * scale);
  canvas.height = Math.round(crop.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível gerar a assinatura.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.setTransform(scale, 0, 0, scale, -crop.x * scale, -crop.y * scale);
  context.lineWidth = LINE_WIDTH;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#000000";
  for (const stroke of strokes) {
    const [first, ...rest] = stroke;
    if (!first) continue;
    context.beginPath();
    context.moveTo(first.x, first.y);
    if (rest.length === 0) context.lineTo(first.x + 0.1, first.y + 0.1);
    for (const point of rest) context.lineTo(point.x, point.y);
    context.stroke();
  }
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível gerar a assinatura."))), "image/png"));
}

export type SignatureValue = { strokes: Stroke[]; width: number; height: number };

export function SignaturePad({ value, onChange, invalid }: { value: SignatureValue; onChange: (value: SignatureValue) => void; invalid?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const valueRef = useRef(value);
  const current = useRef<Point[] | null>(null);

  useEffect(() => {
    valueRef.current = value;
    if (canvasRef.current) draw(canvasRef.current, value.strokes);
  }, [value]);

  // Tamanho real do canvas = tamanho na tela × devicePixelRatio. Ao girar a tela, os traços
  // são reescalados para a nova largura e redesenhados.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const width = canvas.clientWidth;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(HEIGHT * ratio);
      const previous = valueRef.current;
      if (previous.width > 0 && previous.width !== width && previous.strokes.length > 0) {
        onChange({ strokes: scaleStrokes(previous.strokes, width / previous.width, 1), width, height: HEIGHT });
      } else {
        if (previous.width !== width) onChange({ ...previous, width, height: HEIGHT });
        draw(canvas, previous.strokes);
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [onChange]);

  function point(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        data-testid="assinatura"
        aria-label="Área para o recebedor assinar com o dedo"
        role="img"
        className={`h-[200px] w-full touch-none rounded-xl border-2 bg-white ${invalid ? "border-destructive" : "border-input"}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          current.current = [point(event)];
          const strokes = [...valueRef.current.strokes, current.current];
          onChange({ ...valueRef.current, strokes });
        }}
        onPointerMove={(event) => {
          if (!current.current) return;
          current.current.push(point(event));
          const strokes = [...valueRef.current.strokes.slice(0, -1), [...current.current]];
          onChange({ ...valueRef.current, strokes });
        }}
        onPointerUp={() => {
          current.current = null;
        }}
        onPointerCancel={() => {
          current.current = null;
        }}
      />
      <Button type="button" variant="outline" className="h-12 self-start text-base" onClick={() => onChange({ ...valueRef.current, strokes: [] })} disabled={value.strokes.length === 0}>
        <EraserIcon aria-hidden />
        Limpar assinatura
      </Button>
    </div>
  );
}
