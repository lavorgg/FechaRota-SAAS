import { Skeleton } from "@/components/ui/skeleton";

export default function PanelLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
