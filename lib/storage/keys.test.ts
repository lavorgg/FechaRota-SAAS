import { describe, expect, it } from "vitest";

import { StorageKeyError, assertKeyOfCompany, buildProofFileKey, companyPrefix, isAllowedUploadType, isKeyOfCompany } from "./keys";

const A = "cmpA123";
const B = "cmpB456";

describe("chaves de arquivo", () => {
  it("buildProofFileKey segue companies/{companyId}/proofs/{orderId}/{uuid}.ext", () => {
    const jpg = buildProofFileKey({ companyId: A, orderId: "ord1", contentType: "image/jpeg" });
    const png = buildProofFileKey({ companyId: A, orderId: "ord1", contentType: "image/png" });
    expect(jpg).toMatch(/^companies\/cmpA123\/proofs\/ord1\/[0-9a-f-]{36}\.jpg$/);
    expect(png).toMatch(/^companies\/cmpA123\/proofs\/ord1\/[0-9a-f-]{36}\.png$/);
    expect(jpg.slice(0, -4)).not.toBe(png.slice(0, -4));
  });

  it("recusa companyId ou orderId que poderiam escapar do prefixo", () => {
    expect(() => companyPrefix("../outra")).toThrow(StorageKeyError);
    expect(() => companyPrefix("")).toThrow(StorageKeyError);
    expect(() => companyPrefix("a/b")).toThrow(StorageKeyError);
    expect(() => buildProofFileKey({ companyId: A, orderId: "../../x", contentType: "image/png" })).toThrow(StorageKeyError);
  });

  it("aceita chave da própria empresa", () => {
    const key = buildProofFileKey({ companyId: A, orderId: "ord1", contentType: "image/jpeg" });
    expect(isKeyOfCompany(key, A)).toBe(true);
    expect(() => assertKeyOfCompany(key, A)).not.toThrow();
  });

  it("recusa chave de outra empresa", () => {
    const key = buildProofFileKey({ companyId: A, orderId: "ord1", contentType: "image/jpeg" });
    expect(isKeyOfCompany(key, B)).toBe(false);
    expect(() => assertKeyOfCompany(key, B)).toThrow("Arquivo não pertence a esta empresa.");
  });

  it.each([
    `companies/${B}/proofs/o/x.jpg`,
    `companies/${A}/../${B}/proofs/o/x.jpg`,
    `companies/${A}`,
    `companies/${A}/`,
    `companies/${A}x/proofs/o/x.jpg`,
    `/companies/${A}/proofs/o/x.jpg`,
    `companies//${A}/proofs/o/x.jpg`,
    `companies/${A}/proofs//x.jpg`,
    `companies/${A}/proofs/o/x.jpg?versionId=1`,
    `companies/${A}/proofs/o/x y.jpg`,
    `companies/${A}/proofs/o/%2e%2e/x.jpg`,
    "x.jpg",
    "",
  ])("recusa %j para a empresa A", (key) => {
    expect(isKeyOfCompany(key, A)).toBe(false);
  });

  it("prefixo de uma empresa não vale para outra de id parecido", () => {
    expect(isKeyOfCompany("companies/cmpA1234/proofs/o/x.jpg", "cmpA123")).toBe(false);
  });

  it("só JPEG e PNG são aceitos", () => {
    expect(isAllowedUploadType("image/jpeg")).toBe(true);
    expect(isAllowedUploadType("image/png")).toBe(true);
    expect(isAllowedUploadType("image/svg+xml")).toBe(false);
    expect(isAllowedUploadType("application/pdf")).toBe(false);
    expect(isAllowedUploadType("toString")).toBe(false);
  });
});
