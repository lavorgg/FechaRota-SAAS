// Links que o motorista abre na parada atual (seção 5.7): navegação e WhatsApp.

export type PlaceForLink = { latitude: number | null; longitude: number | null; address: string };

function query(place: PlaceForLink): string {
  return place.latitude !== null && place.longitude !== null ? `${place.latitude},${place.longitude}` : place.address;
}

/** Google Maps: busca pelas coordenadas, se houver; senão pelo endereço. */
export function googleMapsSearchUrl(place: PlaceForLink): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query(place))}`;
}

/** Waze: navega direto para as coordenadas, ou busca o endereço. */
export function wazeUrl(place: PlaceForLink): string {
  if (place.latitude !== null && place.longitude !== null) {
    return `https://waze.com/ul?ll=${encodeURIComponent(`${place.latitude},${place.longitude}`)}&navigate=yes`;
  }
  return `https://waze.com/ul?q=${encodeURIComponent(place.address)}&navigate=yes`;
}

/**
 * WhatsApp (wa.me). O telefone do cadastro já está só com dígitos e DDI 55.
 * Devolve null se não houver telefone utilizável.
 */
export function whatsappUrl(phone: string | null, message?: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!/^55\d{10,11}$/.test(digits)) return null;
  const text = message?.trim();
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`;
}

export function arrivalMessage(params: { companyName: string; orderNumber: number }): string {
  return `Olá! Aqui é o motorista da ${params.companyName}. Estou a caminho com o seu pedido nº ${params.orderNumber}.`;
}
