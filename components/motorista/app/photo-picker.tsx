"use client";

// Fotos do comprovante (seção 5.7): câmera traseira quando o aparelho permite, compressão no
// celular, pré-visualização e remoção. Até 3.

import { CameraIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { MAX_PROOF_PHOTOS } from "@/domain/delivery";
import { compressPhoto } from "@/lib/driver-app/photo-compress";

export type Photo = { id: string; blob: Blob };

function Preview({ photo, index, onRemove }: { photo: Photo; index: number; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo.blob);
    // Atualiza a pré-visualização quando a foto muda; a URL é liberada ao sair.
    const frame = requestAnimationFrame(() => setUrl(objectUrl));
    return () => {
      cancelAnimationFrame(frame);
      URL.revokeObjectURL(objectUrl);
    };
  }, [photo.blob]);
  return (
    <li className="relative size-24 overflow-hidden rounded-lg border bg-muted">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- pré-visualização local (blob:), sem otimização de imagem
        <img src={url} alt={`Foto ${index + 1} do comprovante`} className="size-full object-cover" />
      )}
      <Button type="button" size="icon" variant="secondary" className="absolute top-1 right-1 size-12" aria-label={`Remover foto ${index + 1}`} onClick={onRemove}>
        <XIcon aria-hidden />
      </Button>
    </li>
  );
}

export function PhotoPicker({ photos, onChange, hint }: { photos: Photo[]; onChange: (photos: Photo[]) => void; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    const next = [...photos];
    for (const file of Array.from(files)) {
      if (next.length >= MAX_PROOF_PHOTOS) break;
      try {
        next.push({ id: crypto.randomUUID(), blob: await compressPhoto(file) });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Não foi possível ler a foto.");
      }
    }
    setBusy(false);
    onChange(next);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-3" aria-label="Fotos do comprovante">
          {photos.map((photo, index) => (
            <Preview key={photo.id} photo={photo} index={index} onRemove={() => onChange(photos.filter((item) => item.id !== photo.id))} />
          ))}
        </ul>
      )}
      <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Escolher foto" tabIndex={-1} onChange={(event) => void add(event.target.files)} />
      <Button type="button" variant="outline" className="h-12 self-start text-base" disabled={busy || photos.length >= MAX_PROOF_PHOTOS} onClick={() => input.current?.click()}>
        <CameraIcon aria-hidden />
        {busy ? "Preparando foto..." : photos.length === 0 ? "Tirar foto" : `Tirar outra foto (${photos.length}/${MAX_PROOF_PHOTOS})`}
      </Button>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
