import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, useMap, useMapEvents, TileLayer, Circle, Popup, Polyline, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapListing = {
  id: number;
  title: string;
  latitude: number;
  longitude: number;
  currentAvailability?: "available" | "unavailable" | "unknown";
  hourlyCents?: number;
  approxAddress?: string;
};
export type MapReport = {
  id: number;
  kind: "free" | "occupied" | "departure";
  latitude: number;
  longitude: number;
  address: string;
};
type Center = { lat: number; lng: number };
type GpsPosition = Center & { accuracy?: number };
type RouteService = { id:string; lat:number; lng:number; name:string; kind:"charge"|"rest"|"parking"|"truck"|"restaurant"|"fuel"; detail?:string; price?:number; priceUpdated?:string };

function ZoomTracker({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  useEffect(() => { onZoom(map.getZoom()); }, [map, onZoom]);
  return null;
}

// Cadre automatiquement le trajet entier dans la carte.
function FitRoute({ coords }: { coords?: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!coords || coords.length < 2) return;
    map.fitBounds(L.latLngBounds(coords), { paddingTopLeft: [60, 150], paddingBottomRight: [60, 170], maxZoom: 16 });
  }, [coords, map]);
  return null;
}

function Recenter({ center }: { center: Center }) {
  const map = useMap();
  const previous = useRef(center);
  useEffect(() => {
    const changed = previous.current.lat !== center.lat || previous.current.lng !== center.lng;
    previous.current = center;
    if (!changed) return;
    map.flyTo([center.lat, center.lng], Math.max(map.getZoom(), 14), { duration: 0.45 });
  }, [center, map]);
  return null;
}

function markerIcon(color: string, text: string, label: string) {
  const safeLabel = label.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
  return L.divIcon({
    className: "govapark-marker-wrap",
    html: `<span class="map-marker marker-${color}" aria-label="${safeLabel}"><span class="marker-symbol">${text}</span></span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -22],
  });
}

// Pastille de prix : on lit le tarif directement sur la carte.
function pricePill(color: string, text: string, label: string) {
  const safe = label.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
  return L.divIcon({
    className: "govapark-marker-wrap",
    html: `<span class="pk-pill pk-${color}" aria-label="${safe}">${text}</span>`,
    iconSize: [64, 30],
    iconAnchor: [32, 15],
    popupAnchor: [0, -18],
  });
}
// De loin, une simple pastille de couleur : les prix ne se chevauchent pas.
function dotIcon(color: string, label: string) {
  const safe = label.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
  return L.divIcon({
    className: "govapark-marker-wrap",
    html: `<span class="pk-dot pk-${color}" aria-label="${safe}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}
// Bulle ronde de signalement, avec un halo qui pulse.
function reportBubble(kind: "free" | "occupied" | "departure", symbol: string, label: string, small = false) {
  const safe = label.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
  return L.divIcon({
    className: "govapark-marker-wrap",
    html: `<span class="pk-bubble pk-b-${kind}${small ? " pk-sm" : ""}" aria-label="${safe}"><i class="pk-ring"></i><b>${small ? "" : symbol}</b></span>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
  });
}
// Station sur le trajet : petite pastille discrète, le prix s'affiche au toucher.
function serviceIcon(color: string, symbol: string, label: string) {
  const safe = label.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
  return L.divIcon({
    className: "govapark-marker-wrap",
    html: `<span class="pk-svc pk-${color}" aria-label="${safe}">${symbol}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}
const youIcon = L.divIcon({
  className: "govapark-marker-wrap",
  html: `<span class="pk-you"><i></i><b></b></span>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});
// Voiture qui avance avec toi pendant un trajet.
const carIcon = L.divIcon({
  className: "govapark-marker-wrap",
  html: `<span class="pk-car"><i></i><b>🚗</b></span>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  popupAnchor: [0, -22],
});
const formatRate = (cents?: number) => cents == null ? "P" : `${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 1).replace(".", ",")} €/h`;

export default function ParkingMap({
  center, listings, reports, confirmedIds, onListing, onBook, onRoute, onReport, onMove, userPosition, routeCoordinates, routeListingIds, routeServices = [], fuelStations = [], vehicleType = "car", vehicleColor = "#2563eb", driving = false, altRoutes = [], onPickRoute,
}: {
  center: Center;
  listings: MapListing[];
  reports: MapReport[];
  confirmedIds: Set<number>;
  onListing: (id: number) => void;
  onBook: (id: number) => void;
  onRoute: (id: number) => void;
  routeCoordinates?: [number, number][];
  routeListingIds?: Set<number>;
  routeServices?: RouteService[];
  onReport: (report: MapReport) => void;
  onMove?: (center: Center) => void;
  userPosition?: GpsPosition | null;
  fuelStations?: Array<{id:number;lat:number;lng:number;name:string}>;
  vehicleType?: string; vehicleColor?: string; driving?: boolean; altRoutes?: Array<{ id: string; coordinates: [number, number][] }>; onPickRoute?: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(12);
  const detailed = zoom >= 14;
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={12} zoomControl={false} className="parking-map" scrollWheelZoom minZoom={3} maxZoom={19}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <ZoomControl position="bottomright" />
      <ZoomTracker onZoom={setZoom} />
      <Recenter center={center} />
      <FitRoute coords={routeCoordinates} />
      <MapMove onMove={onMove} />
      {altRoutes.map((alt) => <Polyline key={alt.id} positions={alt.coordinates} pathOptions={{ color: "#9aa0b4", weight: 6, opacity: 0.85, lineCap: "round", lineJoin: "round" }} eventHandlers={{ click: () => onPickRoute?.(alt.id) }} />)}
      {routeCoordinates && routeCoordinates.length > 1 && <>
        <Polyline positions={routeCoordinates} pathOptions={{ color: "#ffffff", weight: 11, opacity: 0.95, lineCap: "round", lineJoin: "round" }} />
        <Polyline positions={routeCoordinates} pathOptions={{ color: "#2f6df6", weight: 6.5, opacity: 1, lineCap: "round", lineJoin: "round" }} />
      </>}
      {userPosition && <>
        <Circle
          center={[userPosition.lat, userPosition.lng]}
          radius={Math.max(20, Math.min(userPosition.accuracy ?? 35, 120))}
          pathOptions={{ color: "#2563eb", fillColor: "#60a5fa", fillOpacity: 0.12, weight: 1 }}
        />
        <Marker position={[userPosition.lat, userPosition.lng]} icon={driving ? carIcon : youIcon} zIndexOffset={900}>
          <Popup>Votre position GPS · {vehicleType}</Popup>
        </Marker>
      </>}
      {listings.map((listing) => {
        const statusColor = listing.currentAvailability === "available"
          ? "green"
          : listing.currentAvailability === "unavailable"
            ? "red"
            : confirmedIds.has(listing.id) ? "blue" : "violet";
        const statusText = listing.currentAvailability === "available"
          ? "Disponible actuellement"
          : listing.currentAvailability === "unavailable"
            ? "Indisponible actuellement"
            : "Disponibilité à vérifier";
        return <Marker
          key={`l-${listing.id}`}
          position={[listing.latitude, listing.longitude]}
          title={`${listing.title} — ${statusText}`}
          icon={detailed ? pricePill(statusColor, listing.currentAvailability === "unavailable" ? "Complet" : formatRate(listing.hourlyCents), `${listing.title} — ${statusText}`) : dotIcon(statusColor, `${listing.title} — ${statusText}`)}
        >
          <Popup>
            <div className="map-listing-popup"><strong>{listing.title}</strong>{listing.hourlyCents != null && <b className="popup-price">{formatRate(listing.hourlyCents)}</b>}<span>{statusText}</span>{listing.approxAddress && <small>{listing.approxAddress}</small>}
              {routeListingIds?.has(listing.id) && <small className="route-nearby-tag">Sur votre trajet</small>}
              <div className="map-popup-actions"><button type="button" onClick={() => onRoute(listing.id)}>Itinéraire</button><button type="button" onClick={() => onBook(listing.id)}>Réserver</button></div>
            </div>
          </Popup>
        </Marker>;
      })}
      {routeServices.map((service) => {
        const symbol = service.kind === "charge" ? "⚡" : service.kind === "rest" ? "🛣" : service.kind === "truck" ? "🚛" : service.kind === "restaurant" ? "🍴" : service.kind === "parking" ? "P" : "⛽";
        const color = service.kind === "charge" ? "green" : service.kind === "truck" ? "orange" : service.kind === "fuel" ? "blue" : "violet";
        return <Marker key={service.id} position={[service.lat,service.lng]} icon={serviceIcon(color,symbol,service.name)}><Popup><strong>{service.name}</strong><br/>{service.kind === "charge" ? "Borne de recharge électrique" : service.kind === "rest" ? "Aire de repos ou de service" : service.kind === "truck" ? "Infrastructure poids lourds signalée" : service.kind === "restaurant" ? "Restauration" : service.kind === "parking" ? "Parking" : "Station-service"}{service.price != null && <><br/><strong>{service.price.toFixed(3)} €/L</strong><br/><small>Prix officiel · mise à jour {service.priceUpdated ? new Date(service.priceUpdated).toLocaleString("fr-FR") : "non précisée"}</small></>}{service.detail && <><br/><small>{service.detail}</small></>}</Popup></Marker>;
      })}
      {fuelStations.map((station) => <Marker key={`fuel-${station.id}`} position={[station.lat,station.lng]} icon={markerIcon("blue", "⛽", station.name)}><Popup><strong>{station.name}</strong><br/>Station-service · données OpenStreetMap</Popup></Marker>)}
      {reports.map((report) => {
        const color = report.kind === "free" ? "green" : report.kind === "occupied" ? "red" : "orange";
        const text = report.kind === "free" ? "✓" : report.kind === "occupied" ? "×" : "↗";
        return <Marker
          key={`r-${report.id}`}
          position={[report.latitude, report.longitude]}
          title={report.address}
          icon={reportBubble(report.kind, text, report.address, !detailed)}
          eventHandlers={{ click: () => onReport(report) }}
        />;
      })}
    </MapContainer>
  );
}

function MapMove({ onMove }: { onMove?: (center: Center) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!onMove) return;
    const handler = () => {
      const value = map.getCenter();
      onMove({ lat: value.lat, lng: value.lng });
    };
    map.on("moveend", handler);
    return () => { map.off("moveend", handler); };
  }, [map, onMove]);
  return null;
}
