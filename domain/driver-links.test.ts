import { describe, expect, it } from "vitest";

import { arrivalMessage, googleMapsSearchUrl, wazeUrl, whatsappUrl } from "./driver-links";

const withCoords = { latitude: -21.1775, longitude: -47.8103, address: "Rua General Osório, 410" };
const withoutCoords = { latitude: null, longitude: null, address: "Rua São Sebastião, 1250, Centro, Ribeirão Preto - SP" };

describe("links do motorista", () => {
  it("Google Maps usa coordenadas quando há, senão o endereço codificado", () => {
    expect(googleMapsSearchUrl(withCoords)).toBe("https://www.google.com/maps/search/?api=1&query=-21.1775%2C-47.8103");
    expect(googleMapsSearchUrl(withoutCoords)).toBe(
      "https://www.google.com/maps/search/?api=1&query=Rua%20S%C3%A3o%20Sebasti%C3%A3o%2C%201250%2C%20Centro%2C%20Ribeir%C3%A3o%20Preto%20-%20SP",
    );
  });

  it("Waze navega para as coordenadas ou busca o endereço", () => {
    expect(wazeUrl(withCoords)).toBe("https://waze.com/ul?ll=-21.1775%2C-47.8103&navigate=yes");
    expect(wazeUrl(withoutCoords)).toMatch(/^https:\/\/waze\.com\/ul\?q=Rua%20S%C3%A3o/);
  });

  it("WhatsApp só com telefone brasileiro válido, mensagem opcional", () => {
    expect(whatsappUrl("5516999991002")).toBe("https://wa.me/5516999991002");
    expect(whatsappUrl("551633330000", "Oi")).toBe("https://wa.me/551633330000?text=Oi");
    expect(whatsappUrl(null)).toBeNull();
    expect(whatsappUrl("16999991002")).toBeNull();
    expect(whatsappUrl("5516999991002", arrivalMessage({ companyName: "Distribuidora", orderNumber: 7 }))).toBe(
      "https://wa.me/5516999991002?text=Ol%C3%A1!%20Aqui%20%C3%A9%20o%20motorista%20da%20Distribuidora.%20Estou%20a%20caminho%20com%20o%20seu%20pedido%20n%C2%BA%207.",
    );
  });
});
