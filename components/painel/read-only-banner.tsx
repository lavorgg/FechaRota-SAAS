import { TriangleAlertIcon } from "lucide-react";

import { MESSAGES } from "@/lib/errors";

export function ReadOnlyBanner() {
  return (
    <div role="status" className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
      <TriangleAlertIcon className="size-4 shrink-0" aria-hidden />
      <span>{MESSAGES.readOnly} Fale com o suporte para regularizar.</span>
    </div>
  );
}
