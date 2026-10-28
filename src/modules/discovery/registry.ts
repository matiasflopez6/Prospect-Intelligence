import { googlePlacesProvider } from "./providers/google-places";
import { openStreetMapProvider } from "./providers/openstreetmap";
import type { DiscoveryProvider } from "./types";

/** Para añadir una fuente: crear providers/<id>.ts y registrarla aquí. */
export const discoveryProviders: DiscoveryProvider[] = [googlePlacesProvider, openStreetMapProvider];

export function getProvider(id: string): DiscoveryProvider | undefined {
  return discoveryProviders.find((p) => p.id === id);
}

export function configuredProviders(): DiscoveryProvider[] {
  return discoveryProviders.filter((p) => p.availability().configured);
}
