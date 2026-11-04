import { bearingBetween, carBadgeTransform, metersBetween } from "@/lib/heading";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapListing, MapReport } from "./ParkingMap";
import { clusterPoints } from "@/lib/cluster";

export type { MapListing, MapReport };
type Center = { lat: number; lng: number };
type GpsPosition = Center & { accuracy?: number };
type RouteService = { id: string; lat: number; lng: number; name: string; kind: "charge" | "rest" | "parking" | "truck" | "restaurant" | "fuel"; detail?: string; price?: number; priceUpdated?: string };
type LatLng = [number, number];

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const REST_PITCH = 45;
const DRIVE_PITCH = 55;

const formatRate = (cents?: number) => cents == null ? "P" : `${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 1).replace(".", ",")} €/h`;
const toLine = (coords: LatLng[]): GeoJSON.Feature<GeoJSON.LineString> => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords.map(([lat, lng]) => [lng, lat]) } });
const emptyFc = (): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features: [] });

function el(tag: string, className?: string, html?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}
function text(tag: string, value: string, className?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

export default function ParkingMap3D({
  center, listings, reports, confirmedIds, onListing, onBook, onRoute, onReport, onMove, userPosition, routeCoordinates, routeListingIds, routeServices = [], fuelStations = [], vehicleType = "car", driving = false, altRoutes = [], onPickRoute,
}: {
  center: Center;
  listings: MapListing[];
  reports: MapReport[];
  confirmedIds: Set<number>;
  onListing: (id: number) => void;
  onBook: (id: number) => void;
  onRoute: (id: number) => void;
  routeCoordinates?: LatLng[];
  routeListingIds?: Set<number>;
  routeServices?: RouteService[];
  onReport: (report: MapReport) => void;
  onMove?: (center: Center) => void;
  userPosition?: GpsPosition | null;
  fuelStations?: Array<{ id: number; lat: number; lng: number; name: string }>;
  vehicleType?: string; vehicleColor?: string; driving?: boolean; altRoutes?: Array<{ id: string; coordinates: LatLng[] }>; onPickRoute?: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(12);
  const [heading, setHeading] = useState<number | null>(null);
  const detailed = zoom >= 14;

  // Callbacks toujours à jour sans recréer les marqueurs.
  const cb = useRef({ onListing, onBook, onRoute, onReport, onMove, onPickRoute });
  cb.current = { onListing, onBook, onRoute, onReport, onMove, onPickRoute };

  const listingMarkers = useRef<maplibregl.Marker[]>([]);
  const reportMarkers = useRef<maplibregl.Marker[]>([]);
  const serviceMarkers = useRef<maplibregl.Marker[]>([]);
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const carBadge = useRef<HTMLElement | null>(null);
  const lastFix = useRef<Center | null>(null);
  const previousCenter = useRef(center);

  // Création de la carte (une seule fois).
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: [center.lng, center.lat],
      zoom: 12,
      pitch: REST_PITCH,
      minZoom: 3,
      maxZoom: 19,
      maxPitch: 70,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map.on("zoomend", () => setZoom(map.getZoom()));
    map.on("moveend", () => { const c = map.getCenter(); cb.current.onMove?.({ lat: c.lat, lng: c.lng }); });
    map.on("load", () => {
      // Bâtiments en volume : on ajoute la couche si le style n'en a pas.
      const layers = map.getStyle().layers ?? [];
      if (!layers.some((l) => l.type === "fill-extrusion")) {
        const source = Object.entries(map.getStyle().sources).find(([, s]) => s.type === "vector")?.[0];
        if (source) {
          map.addLayer({
            id: "gp-buildings-3d", type: "fill-extrusion", source, "source-layer": "building", minzoom: 14,
            paint: {
              "fill-extrusion-color": "#d9d6cf",
              "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": 0.85,
            },
          });
        }
      }
      map.addSource("gp-route", { type: "geojson", data: emptyFc() });
      map.addSource("gp-alts", { type: "geojson", data: emptyFc() });
      map.addLayer({ id: "gp-alts-line", type: "line", source: "gp-alts", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#9aa0b4", "line-width": 7, "line-opacity": 0.9 } });
      map.addLayer({ id: "gp-route-casing", type: "line", source: "gp-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 11 } });
      map.addLayer({ id: "gp-route-line", type: "line", source: "gp-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#2f6df6", "line-width": 6.5 } });
      map.on("click", "gp-alts-line", (e) => { const id = e.features?.[0]?.properties?.id; if (id != null) cb.current.onPickRoute?.(String(id)); });
      map.on("mouseenter", "gp-alts-line", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "gp-alts-line", () => { map.getCanvas().style.cursor = ""; });
      setZoom(map.getZoom());
      setReady(true);
    });
    return () => { setReady(false); map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recentrage quand la cible change.
  useEffect(() => {
    const map = mapRef.current;
    const changed = previousCenter.current.lat !== center.lat || previousCenter.current.lng !== center.lng;
    previousCenter.current = center;
    if (!map || !changed) return;
    map.flyTo({ center: [center.lng, center.lat], zoom: Math.max(map.getZoom(), 14), duration: 600 });
  }, [center]);

  // Cap calculé depuis les positions successives.
  useEffect(() => {
    if (!userPosition) return;
    const last = lastFix.current;
    if (!last) { lastFix.current = { lat: userPosition.lat, lng: userPosition.lng }; return; }
    if (metersBetween(last, userPosition) < 6) return;
    setHeading(bearingBetween(last, userPosition));
    lastFix.current = { lat: userPosition.lat, lng: userPosition.lng };
  }, [userPosition]);
  useEffect(() => { if (!driving) setHeading(null); }, [driving]);
  const following = driving && heading !== null && !!userPosition;

  // Trajet et alternatives.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("gp-route") as maplibregl.GeoJSONSource).setData(routeCoordinates && routeCoordinates.length > 1 ? toLine(routeCoordinates) : emptyFc());
    (map.getSource("gp-alts") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: altRoutes.filter((a) => a.coordinates.length > 1).map((a) => ({ ...toLine(a.coordinates), properties: { id: a.id } })),
    });
  }, [ready, routeCoordinates, altRoutes]);

  // Hors suivi : on cadre le trajet entier.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || following || !routeCoordinates || routeCoordinates.length < 2) return;
    const bounds = new maplibregl.LngLatBounds();
    routeCoordinates.forEach(([lat, lng]) => bounds.extend([lng, lat]));
    map.fitBounds(bounds, { padding: { top: 150, bottom: 170, left: 60, right: 60 }, maxZoom: 16, pitch: REST_PITCH, bearing: 0, duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, routeCoordinates, following]);

  // Caméra qui suit la voiture en 3D.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !following || !userPosition || heading === null) return;
    map.easeTo({ center: [userPosition.lng, userPosition.lat], bearing: heading, pitch: DRIVE_PITCH, zoom: Math.max(map.getZoom(), 16.5), duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, following, userPosition, heading]);

  // Retour à la vue de repos à la fin du suivi.
  const wasFollowing = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (map && ready && wasFollowing.current && !following) map.easeTo({ pitch: REST_PITCH, bearing: 0, duration: 700 });
    wasFollowing.current = following;
  }, [ready, following]);

  // Position de l'utilisateur / voiture orientée.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    userMarker.current?.remove(); userMarker.current = null; carBadge.current = null;
    if (!userPosition) return;
    let node: HTMLElement;
    if (driving) {
      node = el("span", "pk-car", `<i></i><b>🚗</b>`);
      carBadge.current = node.querySelector("b");
    } else {
      node = el("span", "pk-you", `<i></i><b></b>`);
    }
    node.title = `Votre position GPS · ${vehicleType}`;
    userMarker.current = new maplibregl.Marker({ element: node, rotationAlignment: "map", pitchAlignment: "map" }).setLngLat([userPosition.lng, userPosition.lat]).addTo(map);
    userMarker.current.getElement().style.zIndex = "900";
  }, [ready, userPosition, driving, vehicleType]);
  useEffect(() => {
    const badge = carBadge.current;
    if (!badge) return;
    // L'emoji regarde vers la gauche : on le retourne côté est pour qu'il ne soit jamais à l'envers.
    badge.style.transform = carBadgeTransform(heading);
    badge.style.transition = "transform .4s ease";
  }, [heading, userPosition, driving, ready]);

  // Places de parking.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    listingMarkers.current.forEach((m) => m.remove());
    const groups = clusterPoints(listings, zoom);
    const singles = groups.filter((g) => g.items.length === 1).map((g) => g.items[0]);
    const clusters = groups.filter((g) => g.items.length > 1).map((g) => {
      const node = text("span", String(g.items.length), "pk-cluster");
      node.title = `${g.items.length} places dans cette zone : toucher pour zoomer`; node.setAttribute("aria-label", node.title); node.style.cursor = "pointer";
      node.addEventListener("click", (e) => { e.stopPropagation(); map.easeTo({ center: [g.lng, g.lat], zoom: Math.min(map.getZoom() + 2, 16), duration: 500 }); });
      return new maplibregl.Marker({ element: node }).setLngLat([g.lng, g.lat]).addTo(map);
    });
    listingMarkers.current = [...clusters, ...singles.map((listing) => {
      const color = listing.parkingStatus?.color ?? (confirmedIds.has(listing.id) ? "blue" : "gray");
      const statusText = listing.parkingStatus?.label ?? "Disponibilité inconnue";
      const label = `${listing.title} — ${statusText}`;
      const node = detailed
        ? text("span", formatRate(listing.hourlyCents), `pk-pill pk-${color}`)
        : el("span", `pk-dot pk-${color}`);
      node.setAttribute("aria-label", label); node.title = label; node.style.cursor = "pointer";
      const box = el("div", "map-listing-popup");
      box.append(text("strong", listing.title));
      if (listing.hourlyCents != null) box.append(text("b", formatRate(listing.hourlyCents), "popup-price"));
      box.append(text("span", statusText));
      if (listing.approxAddress) box.append(text("small", listing.approxAddress));
      if (routeListingIds?.has(listing.id)) box.append(text("small", "Sur votre trajet", "route-nearby-tag"));
      const actions = el("div", "map-popup-actions");
      const go = text("button", "Itinéraire"); go.type = "button"; go.onclick = () => cb.current.onRoute(listing.id);
      const book = text("button", "Réserver"); book.type = "button"; book.onclick = () => cb.current.onBook(listing.id);
      actions.append(go, book); box.append(actions);
      const popup = new maplibregl.Popup({ offset: 18, closeButton: true, maxWidth: "260px" }).setDOMContent(box);
      return new maplibregl.Marker({ element: node }).setLngLat([listing.longitude, listing.latitude]).setPopup(popup).addTo(map);
    })];
  }, [ready, listings, confirmedIds, detailed, routeListingIds, Math.floor(zoom)]);

  // Signalements.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    reportMarkers.current.forEach((m) => m.remove());
    reportMarkers.current = reports.map((report) => {
      const symbol = report.kind === "free" ? "?" : report.kind === "occupied" ? "×" : "↗";
      const node = el("span", `pk-bubble pk-b-${report.parkingStatus?.color ?? "gray"}${detailed ? "" : " pk-sm"}`, `<i class="pk-ring"></i><b>${detailed ? symbol : ""}</b>`);
      const rlabel = `${report.address} — ${report.parkingStatus?.label ?? "Disponibilité inconnue"}`; node.title = rlabel; node.setAttribute("aria-label", rlabel); node.style.cursor = "pointer";
      node.addEventListener("click", (e) => { e.stopPropagation(); cb.current.onReport(report); });
      return new maplibregl.Marker({ element: node }).setLngLat([report.longitude, report.latitude]).addTo(map);
    });
  }, [ready, reports, detailed]);

  // Stations et services du trajet.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    serviceMarkers.current.forEach((m) => m.remove());
    const made: maplibregl.Marker[] = [];
    const add = (lat: number, lng: number, color: string, symbol: string, name: string, content: HTMLElement) => {
      const node = text("span", symbol, `pk-svc pk-${color}`);
      node.title = name; node.setAttribute("aria-label", name); node.style.cursor = "pointer";
      const popup = new maplibregl.Popup({ offset: 14, maxWidth: "260px" }).setDOMContent(content);
      made.push(new maplibregl.Marker({ element: node }).setLngLat([lng, lat]).setPopup(popup).addTo(map));
    };
    routeServices.forEach((service) => {
      const symbol = service.kind === "charge" ? "⚡" : service.kind === "rest" ? "🛣" : service.kind === "truck" ? "🚛" : service.kind === "restaurant" ? "🍴" : service.kind === "parking" ? "P" : "⛽";
      const color = service.kind === "charge" ? "green" : service.kind === "truck" ? "orange" : service.kind === "fuel" ? "blue" : "violet";
      const kindLabel = service.kind === "charge" ? "Borne de recharge électrique" : service.kind === "rest" ? "Aire de repos ou de service" : service.kind === "truck" ? "Infrastructure poids lourds signalée" : service.kind === "restaurant" ? "Restauration" : service.kind === "parking" ? "Parking" : "Station-service";
      const box = el("div", "map-listing-popup");
      box.append(text("strong", service.name), text("span", kindLabel));
      if (service.price != null) {
        box.append(text("b", `${service.price.toFixed(3)} €/L`, "popup-price"));
        box.append(text("small", `Prix officiel · mise à jour ${service.priceUpdated ? new Date(service.priceUpdated).toLocaleString("fr-FR") : "non précisée"}`));
      }
      if (service.detail) box.append(text("small", service.detail));
      add(service.lat, service.lng, color, symbol, service.name, box);
    });
    fuelStations.forEach((station) => {
      const box = el("div", "map-listing-popup");
      box.append(text("strong", station.name), text("span", "Station-service · données OpenStreetMap"));
      add(station.lat, station.lng, "blue", "⛽", station.name, box);
    });
    serviceMarkers.current = made;
  }, [ready, routeServices, fuelStations]);

  return <div ref={container} className="parking-map" />;
}
