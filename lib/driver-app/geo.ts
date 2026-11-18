// Localização no momento da confirmação (seção 5.7): no máximo 5 segundos. Negada, sem GPS ou
// demorada demais: a entrega segue sem ela. Sem rastreamento contínuo.

export type Position = { latitude: number; longitude: number; accuracyMeters: number | null };

export function currentPosition(timeoutMs = 5_000): Promise<Position | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const guard = setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(guard);
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null });
      },
      () => {
        clearTimeout(guard);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
