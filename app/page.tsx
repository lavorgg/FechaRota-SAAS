import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">FechaRota</h1>
      <p className="text-lg text-neutral-700">
        Romaneio de carga, sequência de entregas e comprovante de entrega para distribuidoras com frota própria.
      </p>
      <ul className="flex flex-col gap-2 text-base">
        <li>
          <Link className="font-medium text-brand underline underline-offset-4" href="/motorista">
            Área do motorista
          </Link>
        </li>
        <li>
          <a className="font-medium text-brand underline underline-offset-4" href="/api/health">
            Situação do sistema
          </a>
        </li>
      </ul>
    </main>
  );
}
