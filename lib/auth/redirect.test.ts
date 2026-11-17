import { describe, expect, it } from "vitest";

import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it.each([
    ["/app/dashboard", "/app/dashboard"],
    ["/app/usuarios?q=ana&pagina=2", "/app/usuarios?q=ana&pagina=2"],
    ["/app", "/app"],
    ["/motorista", "/motorista"],
    ["/app/../app/dashboard", "/app/dashboard"],
  ])("aceita %j", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "https://golpe.example/app",
    "//golpe.example/app",
    "/\\golpe.example",
    "\\\\golpe.example",
    "javascript:alert(1)",
    "/login",
    "/",
    "/apparente",
    "/app/../login",
    "/motorista/manifest.webmanifest",
    "/app\n/dashboard",
    `/app/${"x".repeat(600)}`,
  ])("recusa %j", (input) => {
    expect(safeNextPath(input)).toBeNull();
  });
});
