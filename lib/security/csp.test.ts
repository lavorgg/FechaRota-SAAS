import { describe, expect, it } from "vitest";

import { buildCsp, createNonce, storageOrigin } from "./csp";

describe("CSP", () => {
  it("origem do storage: path style ou bucket no subdomínio", () => {
    expect(storageOrigin({ endpoint: "http://localhost:9000", bucket: "fecharota-e2e", forcePathStyle: true })).toBe("http://localhost:9000");
    expect(storageOrigin({ endpoint: "https://conta.r2.cloudflarestorage.com", bucket: "fecharota-prod", forcePathStyle: false })).toBe("https://fecharota-prod.conta.r2.cloudflarestorage.com");
    expect(storageOrigin({ endpoint: undefined, bucket: "x", forcePathStyle: true })).toBeNull();
    expect(storageOrigin({ endpoint: "não é url", bucket: "x", forcePathStyle: true })).toBeNull();
  });

  it("produção: nonce, strict-dynamic, sem eval, storage e ViaCEP liberados, sem iframe", () => {
    const csp = buildCsp({ nonce: "abc", dev: false, storageOrigin: "https://b.conta.r2.cloudflarestorage.com", upgradeInsecureRequests: true });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("img-src 'self' blob: data: https://b.conta.r2.cloudflarestorage.com");
    expect(csp).toContain("connect-src 'self' https://b.conta.r2.cloudflarestorage.com https://viacep.com.br");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp.endsWith("upgrade-insecure-requests")).toBe(true);
  });

  it("desenvolvimento: eval liberado para o React; sem upgrade para o storage local em http", () => {
    const csp = buildCsp({ nonce: "abc", dev: true, storageOrigin: "http://localhost:9000", upgradeInsecureRequests: false });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("nonce muda a cada chamada", () => {
    expect(createNonce()).not.toBe(createNonce());
    expect(createNonce().length).toBeGreaterThanOrEqual(24);
  });
});
