// Destino depois do login (?proximo=...). Só caminhos internos das áreas logadas são aceitos:
// qualquer outra coisa vira o início do papel. Impede redirecionamento para site externo.

const ALLOWED_PREFIXES = ["/app", "/motorista"] as const;

export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 500) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  // Sem caracteres de controle nem esquemas escondidos depois de decodificar.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;

  let url: URL;
  try {
    url = new URL(raw, "http://interno.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "http://interno.invalid") return null;

  const allowed = ALLOWED_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
  if (!allowed) return null;
  // O manifest não é página: voltar para ele depois do login não faz sentido.
  if (url.pathname === "/motorista/manifest.webmanifest") return null;
  return `${url.pathname}${url.search}`;
}
