// Link de rota no Google Maps (seção 5.6): URL de direções com as paradas na ordem; acima do
// limite de paradas intermediárias, a rota vira vários trechos, um link por trecho.

/**
 * Paradas intermediárias por link. A documentação do Maps URLs não pôde ser consultada deste
 * ambiente (rede bloqueada); 9 é o limite conhecido para navegador de computador. Se o link
 * abrir truncado em algum aparelho, basta reduzir este número.
 */
export const MAPS_MAX_WAYPOINTS = 9;

export type MapsPlace = { address: string; latitude: number | null; longitude: number | null };

export type MapsSegment = {
  /** Primeira e última parada do trecho (numeradas a partir de 1). */
  fromStop: number;
  toStop: number;
  url: string;
};

/** Coordenadas quando houver; senão, o endereço escrito. */
export function placeParam(place: MapsPlace): string {
  return place.latitude !== null && place.longitude !== null ? `${place.latitude},${place.longitude}` : place.address;
}

/**
 * Um link por trecho. O 1º trecho parte do depósito (ou, sem depósito, da localização do
 * aparelho: o parâmetro `origin` fica de fora); cada trecho seguinte parte da última parada
 * do anterior. Cada trecho cobre até `maxWaypoints + 1` paradas.
 */
export function buildMapsSegments(origin: MapsPlace | null, stops: ReadonlyArray<MapsPlace>, maxWaypoints = MAPS_MAX_WAYPOINTS): MapsSegment[] {
  if (!Number.isInteger(maxWaypoints) || maxWaypoints < 0) throw new Error("Limite de paradas inválido.");
  const perSegment = maxWaypoints + 1;
  const segments: MapsSegment[] = [];
  for (let start = 0; start < stops.length; start += perSegment) {
    const chunk = stops.slice(start, start + perSegment);
    const destination = chunk[chunk.length - 1];
    if (!destination) break;
    const from = start === 0 ? origin : (stops[start - 1] ?? null);
    const params = new URLSearchParams({ api: "1" });
    if (from) params.set("origin", placeParam(from));
    params.set("destination", placeParam(destination));
    const waypoints = chunk.slice(0, -1).map(placeParam);
    if (waypoints.length > 0) params.set("waypoints", waypoints.join("|"));
    params.set("travelmode", "driving");
    segments.push({ fromStop: start + 1, toStop: start + chunk.length, url: `https://www.google.com/maps/dir/?${params.toString()}` });
  }
  return segments;
}

/** Endereço em uma linha, como o Maps entende melhor. */
export function addressLine(address: { street: string; number: string; neighborhood: string; city: string; state: string; zipCode: string }): string {
  // O cadastro guarda a grafia original (ex.: "centro "); na linha impressa, sem espaço sobrando.
  const clean = (text: string) => text.replace(/\s+/g, " ").trim();
  const zip = clean(address.zipCode);
  const cep = /^\d{8}$/.test(zip) ? `${zip.slice(0, 5)}-${zip.slice(5)}` : zip;
  return `${clean(address.street)}, ${clean(address.number)}, ${clean(address.neighborhood)}, ${clean(address.city)} - ${clean(address.state)}, ${cep}`;
}

/**
 * O pedido não guarda coordenadas: elas vêm do cadastro atual do cliente, e só valem se o
 * cadastro ainda aponta para o mesmo endereço do pedido.
 */
export function coordinatesIfSameAddress(
  snapshot: { zipCode: string; street: string; number: string; city: string },
  customer: { zipCode: string; street: string; number: string; city: string; latitude: number | null; longitude: number | null },
): { latitude: number | null; longitude: number | null } {
  const same = customer.zipCode === snapshot.zipCode && customer.street === snapshot.street && customer.number === snapshot.number && customer.city === snapshot.city;
  return same ? { latitude: customer.latitude, longitude: customer.longitude } : { latitude: null, longitude: null };
}
