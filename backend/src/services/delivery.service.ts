import prisma from "../prisma";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { DELIVERY_SKU } from "./sale/sale.types";

const DEFAULT_PRICE_PER_KM = Number(process.env.DELIVERY_PRICE_PER_KM ?? 8000);
// OSRM: routing por calles real, gratis y sin API key (demo server publico de
// project-osrm.org). Se puede apuntar a un servidor propio via OSRM_BASE_URL
// si en algun momento hace falta mas volumen/SLA que el demo publico.
const OSRM_BASE_URL = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";
const OSRM_TIMEOUT_MS = Number(process.env.OSRM_TIMEOUT_MS ?? 8000);
const DELIVERY_FALLBACK_MULTIPLIER = Number(process.env.DELIVERY_FALLBACK_MULTIPLIER ?? 1.4);

// OSRM puede devolver rutas alternativas; elegimos la de mayor distancia
// (mismo criterio de negocio que se usaba antes con Google Routes).
const ROUTING_USE_LONGEST_ALTERNATIVE =
  String(process.env.ROUTING_USE_LONGEST_ALTERNATIVE ?? "true").toLowerCase() !== "false";

type DeliveryRouteSource = "OSRM" | "COORDINATES_FALLBACK";

type OsrmRouteResponse = {
  code?: string;
  routes?: {
    distance?: number;
    duration?: number;
  }[];
};

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function isValidCoordinate(lat: unknown, lng: unknown) {
  const latitude = Number(lat);
  const longitude = Number(lng);

  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function haversineKm(params: {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}) {
  const earthRadiusKm = 6371;

  const dLat = toRad(params.destinationLat - params.originLat);
  const dLng = toRad(params.destinationLng - params.originLng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(params.originLat)) *
      Math.cos(toRad(params.destinationLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

function buildClientAddress(client: {
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressFloor?: string | null;
  addressApartment?: string | null;
  addressCity?: string | null;
  addressProvince?: string | null;
  addressPostalCode?: string | null;
  addressNotes?: string | null;
}) {
  const street = [client.addressStreet, client.addressNumber].filter(Boolean).join(" ");

  const floor = [
    client.addressFloor ? `Piso ${client.addressFloor}` : "",
    client.addressApartment ? `Dto ${client.addressApartment}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const city = [client.addressCity, client.addressProvince, client.addressPostalCode]
    .filter(Boolean)
    .join(", ");

  return [street, floor, city, client.addressNotes].filter(Boolean).join(" - ");
}

function buildLocationAddress(location: {
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressCity?: string | null;
  addressProvince?: string | null;
  addressPostalCode?: string | null;
  addressNotes?: string | null;
}) {
  const street = [location.addressStreet, location.addressNumber].filter(Boolean).join(" ");

  const city = [location.addressCity, location.addressProvince, location.addressPostalCode]
    .filter(Boolean)
    .join(", ");

  return [street, city, location.addressNotes].filter(Boolean).join(" - ");
}

function selectOsrmRoute(routes?: OsrmRouteResponse["routes"]) {
  const validRoutes = (routes ?? []).filter((route) => {
    const distance = Number(route.distance);
    return Number.isFinite(distance) && distance > 0;
  });

  if (!validRoutes.length) return null;

  if (!ROUTING_USE_LONGEST_ALTERNATIVE) {
    return {
      route: validRoutes[0],
      routeIndex: 0,
      alternativesCount: validRoutes.length,
      routeStrategy: "DEFAULT_ROUTE" as const,
    };
  }

  let longestRoute = validRoutes[0];
  let longestRouteIndex = 0;

  validRoutes.forEach((route, index) => {
    if (Number(route.distance) > Number(longestRoute.distance)) {
      longestRoute = route;
      longestRouteIndex = index;
    }
  });

  return {
    route: longestRoute,
    routeIndex: longestRouteIndex,
    alternativesCount: validRoutes.length,
    routeStrategy: "LONGEST_ALTERNATIVE" as const,
  };
}

// OSRM (Open Source Routing Machine), demo server publico: gratis, sin API
// key, ruteo real por calles. Si no responde (caido, timeout, sin conexion),
// calculate() cae solo al fallback Haversine*multiplicador mas abajo.
async function getOsrmRoute(params: {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

  try {
    const coords =
      `${params.originLng},${params.originLat};` +
      `${params.destinationLng},${params.destinationLat}`;
    const url =
      `${OSRM_BASE_URL}/route/v1/driving/${coords}` +
      `?overview=false&alternatives=${ROUTING_USE_LONGEST_ALTERNATIVE ? "true" : "false"}`;

    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("OSRM API error:", response.status, text);
      return null;
    }

    const json = (await response.json()) as OsrmRouteResponse;

    if (json.code !== "Ok") return null;

    const selectedRoute = selectOsrmRoute(json.routes);
    if (!selectedRoute) return null;

    const distanceMeters = Number(selectedRoute.route.distance);
    if (!distanceMeters || !Number.isFinite(distanceMeters)) return null;

    const durationSeconds = Number(selectedRoute.route.duration);

    return {
      distanceKm: distanceMeters / 1000,
      durationMinutes: Number.isFinite(durationSeconds) ? round2(durationSeconds / 60) : null,
      routeIndex: selectedRoute.routeIndex,
      alternativesCount: selectedRoute.alternativesCount,
      routeStrategy: selectedRoute.routeStrategy,
    };
  } catch (error) {
    console.error("OSRM API request failed:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// El item "envio" se carga en la venta como un Product mas (ver DELIVERY_SKU
// en sale.types.ts) con precio manual = costo calculado. Si el tenant todavia
// no tiene ese producto (nadie lo creo a mano), lo creamos la primera vez.
async function ensureDeliveryProduct() {
  const scope = tenantScope();
  const existing = await prisma.product.findFirst({ where: { sku: DELIVERY_SKU, ...scope } });
  if (existing) return existing;

  return prisma.product.create({
    data: {
      name: "Costo de envío",
      sku: DELIVERY_SKU,
      type: "SIMPLE",
      saleUnit: "UNIT",
      isService: true,
      price: 0,
      clientPrice: 0,
      wholesalePrice: 0,
      tenantId: currentTenantId(),
    },
  });
}

export const deliveryService = {
  ensureDeliveryProduct,

  async calculate(params: {
    businessLocationId: string;
    clientId: string;
    pricePerKm?: number | null;
  }) {
    const pricePerKm = Number(params.pricePerKm ?? DEFAULT_PRICE_PER_KM);

    if (!Number.isFinite(pricePerKm) || pricePerKm <= 0) {
      throw new Error("El precio por km debe ser mayor a 0");
    }

    const [location, client] = await Promise.all([
      prisma.businessLocation.findFirst({
        where: { id: params.businessLocationId, ...tenantScope() },
        select: {
          id: true,
          name: true,
          isActive: true,
          addressStreet: true,
          addressNumber: true,
          addressCity: true,
          addressProvince: true,
          addressPostalCode: true,
          addressNotes: true,
          latitude: true,
          longitude: true,
        },
      }),
      prisma.client.findFirst({
        where: { id: params.clientId, ...tenantScope() },
        select: {
          id: true,
          nombre: true,
          apellido: true,
          addressStreet: true,
          addressNumber: true,
          addressFloor: true,
          addressApartment: true,
          addressCity: true,
          addressProvince: true,
          addressPostalCode: true,
          addressNotes: true,
          latitude: true,
          longitude: true,
        },
      }),
    ]);

    if (!location) throw new Error("Sucursal/depósito no encontrado");

    if (!location.isActive) {
      throw new Error("La sucursal/depósito seleccionada está inactiva");
    }

    if (!client) throw new Error("Cliente no encontrado");

    if (!isValidCoordinate(location.latitude, location.longitude)) {
      throw new Error("La sucursal/depósito no tiene coordenadas válidas cargadas");
    }

    if (!isValidCoordinate(client.latitude, client.longitude)) {
      throw new Error("El cliente no tiene coordenadas válidas cargadas");
    }

    const originLat = Number(location.latitude);
    const originLng = Number(location.longitude);
    const destinationLat = Number(client.latitude);
    const destinationLng = Number(client.longitude);

    const straightDistanceKm = haversineKm({
      originLat,
      originLng,
      destinationLat,
      destinationLng,
    });

    let source: DeliveryRouteSource = "COORDINATES_FALLBACK";
    let durationMinutes: number | null = null;
    let routeIndex: number | null = null;
    let alternativesCount: number | null = null;
    let routeStrategy: "LONGEST_ALTERNATIVE" | "DEFAULT_ROUTE" | "FALLBACK" = "FALLBACK";

    const osrmRoute = await getOsrmRoute({
      originLat,
      originLng,
      destinationLat,
      destinationLng,
    });

    let distanceKm: number;

    if (osrmRoute) {
      source = "OSRM";
      distanceKm = osrmRoute.distanceKm;
      durationMinutes = osrmRoute.durationMinutes;
      routeIndex = osrmRoute.routeIndex;
      alternativesCount = osrmRoute.alternativesCount;
      routeStrategy = osrmRoute.routeStrategy;
    } else {
      const multiplier =
        Number.isFinite(DELIVERY_FALLBACK_MULTIPLIER) && DELIVERY_FALLBACK_MULTIPLIER > 0
          ? DELIVERY_FALLBACK_MULTIPLIER
          : 1.4;

      distanceKm = straightDistanceKm * multiplier;
    }

    const roundedDistanceKm = round2(distanceKm);
    const deliveryCost = round2(roundedDistanceKm * pricePerKm);

    const originAddress = buildLocationAddress(location);
    const destinationAddress = buildClientAddress(client);
    const deliveryProduct = await ensureDeliveryProduct();

    return {
      distanceKm: roundedDistanceKm,
      deliveryProduct,
      straightDistanceKm: round2(straightDistanceKm),
      durationMinutes,
      pricePerKm,
      deliveryCost,
      source,

      // Info extra para saber qué hizo el backend.
      routeStrategy,
      routeIndex,
      alternativesCount,

      businessLocationId: location.id,
      businessLocationName: location.name,
      clientId: client.id,
      clientName: `${client.nombre} ${client.apellido}`.trim(),
      originAddress,
      destinationAddress,
      deliveryAddressSnapshot: destinationAddress,
    };
  },
};