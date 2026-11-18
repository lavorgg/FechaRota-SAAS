import { describe, expect, it } from "vitest";

import { MAPS_MAX_WAYPOINTS, type MapsPlace, addressLine, buildMapsSegments, coordinatesIfSameAddress, placeParam } from "./maps";

const place = (n: number, coords = false): MapsPlace => ({
  address: `Rua ${n}, ${n}, Centro, Ribeirão Preto - SP, 14010-000`,
  latitude: coords ? -21 - n / 1000 : null,
  longitude: coords ? -47 - n / 1000 : null,
});

function params(url: string) {
  return new URL(url).searchParams;
}

describe("buildMapsSegments", () => {
  it("rota curta: um link, do depósito até a última parada, com as intermediárias na ordem", () => {
    const depot = place(0);
    const [segment, ...rest] = buildMapsSegments(depot, [place(1), place(2, true), place(3)]);
    expect(rest).toEqual([]);
    expect(segment).toMatchObject({ fromStop: 1, toStop: 3 });
    const p = params(segment?.url ?? "");
    expect(segment?.url.startsWith("https://www.google.com/maps/dir/?api=1&")).toBe(true);
    expect(p.get("origin")).toBe(depot.address);
    expect(p.get("destination")).toBe(place(3).address);
    expect(p.get("waypoints")).toBe(`${place(1).address}|-21.002,-47.002`);
    expect(p.get("travelmode")).toBe("driving");
  });

  it("sem depósito, o link não tem origem (o Maps usa a localização do aparelho)", () => {
    const [segment] = buildMapsSegments(null, [place(1)]);
    expect(params(segment?.url ?? "").has("origin")).toBe(false);
    expect(params(segment?.url ?? "").has("waypoints")).toBe(false);
  });

  it(`acima de ${MAPS_MAX_WAYPOINTS} paradas intermediárias, divide em trechos encadeados`, () => {
    const stops = Array.from({ length: 23 }, (_, i) => place(i + 1));
    const segments = buildMapsSegments(place(0), stops);
    expect(segments.map((s) => [s.fromStop, s.toStop])).toEqual([
      [1, 10],
      [11, 20],
      [21, 23],
    ]);
    for (const segment of segments) {
      const waypoints = params(segment.url).get("waypoints")?.split("|") ?? [];
      expect(waypoints.length).toBeLessThanOrEqual(MAPS_MAX_WAYPOINTS);
    }
    // O 2º trecho parte da última parada do 1º.
    expect(params(segments[1]?.url ?? "").get("origin")).toBe(place(10).address);
    expect(params(segments[1]?.url ?? "").get("destination")).toBe(place(20).address);
    expect(params(segments[2]?.url ?? "").get("origin")).toBe(place(20).address);
  });

  it("todas as paradas aparecem uma única vez, na ordem", () => {
    const stops = Array.from({ length: 21 }, (_, i) => place(i + 1));
    const visited = buildMapsSegments(null, stops).flatMap((segment) => {
      const p = params(segment.url);
      return [...(p.get("waypoints")?.split("|") ?? []), p.get("destination") ?? ""];
    });
    expect(visited).toEqual(stops.map((s) => s.address));
  });

  it("sem paradas, nenhum link", () => {
    expect(buildMapsSegments(place(0), [])).toEqual([]);
  });

  it("endereço e coordenadas", () => {
    expect(placeParam({ address: "x", latitude: -21.1775, longitude: -47.8103 })).toBe("-21.1775,-47.8103");
    expect(placeParam({ address: "x", latitude: null, longitude: -47.8 })).toBe("x");
    expect(addressLine({ street: "Rua General Osório", number: "410", neighborhood: "Centro", city: "Ribeirão Preto", state: "SP", zipCode: "14010000" })).toBe(
      "Rua General Osório, 410, Centro, Ribeirão Preto - SP, 14010-000",
    );
  });
});

describe("addressLine sem espaços sobrando", () => {
  it("apara e junta espaços da grafia original", () => {
    expect(addressLine({ street: "Rua  Álvares Cabral", number: "88", neighborhood: "centro ", city: " Ribeirão Preto", state: "SP", zipCode: "14010080" })).toBe(
      "Rua Álvares Cabral, 88, centro, Ribeirão Preto - SP, 14010-080",
    );
  });
});

describe("coordinatesIfSameAddress", () => {
  const snapshot = { zipCode: "14010000", street: "Rua Um", number: "10", city: "Franca" };
  it("usa as coordenadas do cadastro só se o endereço é o mesmo do pedido", () => {
    expect(coordinatesIfSameAddress(snapshot, { ...snapshot, latitude: -20.5, longitude: -47.4 })).toEqual({ latitude: -20.5, longitude: -47.4 });
    expect(coordinatesIfSameAddress(snapshot, { ...snapshot, number: "12", latitude: -20.5, longitude: -47.4 })).toEqual({ latitude: null, longitude: null });
  });
});
