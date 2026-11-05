import { bearingBetween, carBadgeTransform, metersBetween } from "@/lib/heading";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapListing, MapReport, MapStreetSpot, MapBounds } from "./ParkingMap";
import { clusterPoints } from "@/lib/cluster";
import { STATUS_COLORS } from "@contracts/parking-status";
import { DEFAULT_SPOT_TYPES, SPOT_TYPE_CODES, SPOT_TYPE_GLYPH, type ParisSpot } from "@contracts/paris-spots";
import { POLY, buildPolygonFeatures, polygonsVisible, spotAnchorKey, type ParisPolygon, type PolygonColor } from "@contracts/paris-polygons";
import { loadParisPolygons } from "@/lib/paris-polygons";
import { LAYER, layerVisible, toGeoJson, type DecodedFeature } from "@contracts/geo-layers";
import { loadLayer } from "@/lib/geo-layers";
import { VEHICLE_SPOT_TYPES, VEHICLE_TYPES } from "@contracts/vehicle-types";

export type { MapListing, MapReport, MapStreetSpot, MapBounds };
type Center = { lat: number; lng: number };
type GpsPosition = Center & { accuracy?: number };
type RouteService = { id: string; lat: number; lng: number; name: string; kind: "charge" | "rest" | "parking" | "truck" | "restaurant" | "fuel"; detail?: string; price?: number; priceUpdated?: string };
type LatLng = [number, number];

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const REST_PITCH = 60;
const DRIVE_PITCH = 60;
const FLAT_PITCH = 0;
const START_ZOOM = 15;
const PLOT_COLORS: Record<string, string> = { ...STATUS_COLORS, blue: "#2f6df6" };
const DEFAULT_POLYGON_TYPES: ReadonlySet<number> = new Set(DEFAULT_SPOT_TYPES);

// Place en « plot » 3D : petit rectangle (environ 6 m x 3 m) autour de la position, extrudé par MapLibre.
function plotPolygon(lat: number, lng: number): GeoJSON.Polygon {
  const dLat = 1.5 / 111320, dLng = 3 / (111320 * Math.cos((lat * Math.PI) / 180));
  return { type: "Polygon", coordinates: [[[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat]]] };
}

// Bouton « 2D / 3D » : bascule l'inclinaison de la carte.
class TiltControl implements maplibregl.IControl {
  private map?: maplibregl.Map; private box?: HTMLDivElement; private button?: HTMLButtonElement;
  private sync = () => {
    if (!this.map || !this.button) return;
    const tilted = this.map.getPitch() > 5;
    this.button.textContent = tilted ? "2D" : "3D";
    const label = tilted ? "Passer en vue 2D (à plat)" : "Passer en vue 3D (inclinée)";
    this.button.title = label; this.button.setAttribute("aria-label", label);
  };
  onAdd(map: maplibregl.Map) {
    this.map = map;
    this.box = document.createElement("div"); this.box.className = "maplibregl-ctrl maplibregl-ctrl-group gp-tilt";
    this.button = document.createElement("button"); this.button.type = "button"; this.button.className = "gp-tilt-btn";
    this.button.onclick = () => map.easeTo({ pitch: map.getPitch() > 5 ? FLAT_PITCH : REST_PITCH, duration: 600 });
    this.box.append(this.button);
    map.on("pitch", this.sync); this.sync();
    return this.box;
  }
  onRemove() { this.map?.off("pitch", this.sync); this.box?.remove(); this.map = undefined; }
}

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

// Icône d'un emplacement (carré arrondi aux couleurs du statut, symbole du type) dessinée une fois par couleur et par type.
const PARIS_COLORS: Record<string, string> = { gray: STATUS_COLORS.gray, green: STATUS_COLORS.green, orange: STATUS_COLORS.orange, red: STATUS_COLORS.red };
function parisIcon(color: string, glyph: string): ImageData | null {
  const size = 72, canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#ffffff"; g.beginPath(); g.roundRect(4, 4, size - 8, size - 8, 20); g.fill();
  g.fillStyle = color; g.beginPath(); g.roundRect(10, 10, size - 20, size - 20, 15); g.fill();
  g.fillStyle = "#ffffff"; g.font = `800 ${glyph.length > 1 ? 21 : 34}px Manrope, system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(glyph, size / 2, size / 2 + 2);
  return g.getImageData(0, 0, size, size);
}
// Contours des emprises en POINTILLÉS (zoom rue) et séparateurs INDICATIFS : sous les icônes et les compteurs, couleur = statut d'un signalement récent, sinon gris.
const colorByStatus = (): maplibregl.ExpressionSpecification => ["match", ["get", "c"], "green", STATUS_COLORS.green, "orange", STATUS_COLORS.orange, "red", STATUS_COLORS.red, "#6b7080"] as maplibregl.ExpressionSpecification;
function addPolygonLayers(map: maplibregl.Map) {
  try {
    map.addSource("gp-poly", { type: "geojson", data: emptyFc() });
    map.addSource("gp-poly-sep", { type: "geojson", data: emptyFc() });
    map.addLayer({
      id: "gp-poly-line", type: "line", source: "gp-poly", minzoom: POLY.minZoom, layout: { "line-join": "round" },
      paint: { "line-color": colorByStatus(), "line-width": ["interpolate", ["linear"], ["zoom"], 17, 0.9, 19, 1.8] as maplibregl.ExpressionSpecification, "line-opacity": 0.95, "line-dasharray": [2, 1.5] },
    });
    map.addLayer({
      id: "gp-poly-sep-line", type: "line", source: "gp-poly-sep", minzoom: POLY.minZoom,
      paint: { "line-color": colorByStatus(), "line-width": ["interpolate", ["linear"], ["zoom"], 17, 0.7, 19, 1.4] as maplibregl.ExpressionSpecification, "line-opacity": 0.85, "line-dasharray": [1.5, 1.5] },
    });
  } catch (error) { console.warn("[GOVAPARK] Couche des contours d'emprises impossible", error); }
}
// Stationnement INTERDIT (Ville de Paris) : trait rouge FIN au zoom rue, jamais de remplissage ni de plein écran rouge.
export const FORBIDDEN_BASE = "/data/paris-forbidden";
function addForbiddenLayers(map: maplibregl.Map) {
  try {
    map.addSource("gp-forbidden", { type: "geojson", data: emptyFc() });
    map.addLayer({
      id: "gp-forbidden-line", type: "line", source: "gp-forbidden", minzoom: LAYER.streetZoom, filter: ["!=", ["geometry-type"], "Point"] as maplibregl.FilterSpecification, layout: { "line-join": "round", "line-cap": "butt" },
      paint: { "line-color": "#d6362c", "line-width": ["interpolate", ["linear"], ["zoom"], 16, 0.8, 19, 1.8] as maplibregl.ExpressionSpecification, "line-opacity": 0.8, "line-dasharray": [3, 1.2] },
    });
    map.addLayer({
      id: "gp-forbidden-pt", type: "circle", source: "gp-forbidden", minzoom: LAYER.streetZoom, filter: ["==", ["geometry-type"], "Point"] as maplibregl.FilterSpecification,
      paint: { "circle-color": "#d6362c", "circle-radius": ["interpolate", ["linear"], ["zoom"], 16, 2, 19, 4] as maplibregl.ExpressionSpecification, "circle-opacity": 0.8, "circle-stroke-color": "#ffffff", "circle-stroke-width": 0.8 },
    });
  } catch (error) { console.warn("[GOVAPARK] Couche du stationnement interdit impossible", error); }
}
export type ParisPick = { lat: number; lng: number; t: number; reportId: number; color: string; places: number; regime: number; street: string; num: number };
function addParisLayers(map: maplibregl.Map, onPick: (props: ParisPick) => void) {
  try {
    for (const [name, color] of Object.entries(PARIS_COLORS)) for (const t of SPOT_TYPE_CODES) {
      const img = parisIcon(color, SPOT_TYPE_GLYPH[t]);
      if (img && !map.hasImage(`ps-${name}-${t}`)) map.addImage(`ps-${name}-${t}`, img, { pixelRatio: 2 });
    }
    // Source regroupée par MapLibre : le total d'un groupe additionne `w` = nombre de PLACES (celles du tronçon, ou le total d'une cellule de la vue d'ensemble `a` = 1).
    map.addSource("gp-paris", { type: "geojson", data: emptyFc(), cluster: true, clusterRadius: 40, clusterMaxZoom: 15, clusterProperties: { total: ["+", ["get", "w"]] } });
    map.addSource("gp-paris-hot", { type: "geojson", data: emptyFc() });
    // Groupes légers : disque violet translucide, contour fin, petits chiffres (1,8k au-delà de 1000) — jamais de grosse tache sombre.
    const group = "rgba(109, 74, 224, 0.84)";
    const radius = (field: string): maplibregl.ExpressionSpecification => ["step", ["get", field], 12, 10, 14, 100, 17, 1000, 20];
    const countText = (field: string): maplibregl.ExpressionSpecification => ["case", [">=", ["get", field], 1000], ["concat", ["number-format", ["/", ["get", field], 1000], { locale: "fr-FR", "max-fraction-digits": 1 }], "k"], ["to-string", ["get", field]]] as maplibregl.ExpressionSpecification;
    const textLayout = { "text-font": ["Noto Sans Bold"], "text-size": 11, "text-allow-overlap": true, "text-ignore-placement": true };
    map.addLayer({ id: "gp-paris-cluster", type: "circle", source: "gp-paris", filter: ["has", "point_count"], paint: { "circle-color": group, "circle-radius": radius("total"), "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 } });
    map.addLayer({ id: "gp-paris-cluster-n", type: "symbol", source: "gp-paris", filter: ["has", "point_count"], layout: { ...textLayout, "text-field": countText("total") }, paint: { "text-color": "#ffffff" } });
    map.addLayer({ id: "gp-paris-agg", type: "circle", source: "gp-paris", filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "a"], 1]], paint: { "circle-color": group, "circle-radius": radius("w"), "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 } });
    map.addLayer({ id: "gp-paris-agg-n", type: "symbol", source: "gp-paris", filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "a"], 1]], layout: { ...textLayout, "text-field": countText("w") }, paint: { "text-color": "#ffffff" } });
    // Un marqueur par tronçon, anti-chevauchement : MapLibre masque une icône qui en recouvrirait une autre (la plus grosse en places gagne) ; plus on zoome, plus elles apparaissent.
    // Pas de groupes numérotés à partir du zoom 16 (clusterMaxZoom 15) : les places s'affichent une à une, icônes petites. Le nombre de places s'affiche à côté de l'icône, discret, dès le zoom 17 seulement (masqué s'il gêne, jamais empilé).
    const icon: maplibregl.ExpressionSpecification = ["concat", "ps-", ["get", "c"], "-", ["to-string", ["get", "t"]]];
    const iconSize = ["interpolate", ["linear"], ["zoom"], 14, 0.45, 18, 0.8] as maplibregl.ExpressionSpecification;
    const placesText = ["step", ["zoom"], "", 17, ["case", [">", ["get", "p"], 1], ["to-string", ["get", "p"]], ""]] as maplibregl.ExpressionSpecification;
    map.addLayer({
      id: "gp-paris-point", type: "symbol", source: "gp-paris", filter: ["all", ["!", ["has", "point_count"]], ["!=", ["get", "a"], 1]],
      layout: {
        "icon-image": icon, "icon-size": iconSize, "icon-allow-overlap": false, "icon-padding": 3, "symbol-sort-key": ["*", -1, ["get", "w"]],
        "text-field": placesText, "text-font": ["Noto Sans Bold"], "text-size": 10, "text-anchor": "left", "text-offset": [1.15, 0], "text-optional": true, "text-allow-overlap": false,
      } as maplibregl.SymbolLayerSpecification["layout"],
      paint: { "text-color": "#17142b", "text-halo-color": "#ffffff", "text-halo-width": 1.6, "icon-opacity": ["case", ["==", ["get", "o"], 1], 0, 1] as maplibregl.ExpressionSpecification },
    });
    // Emplacements colorés par un signalement : toujours visibles (par-dessus), jamais masqués par la collision.
    // Quand le contour d'un emplacement est dessiné (zoom rue, propriété « o »), son icône en doublon est masquée (le nombre de places reste affiché) ; l'icône d'un emplacement coloré reste, plus discrète.
    map.addLayer({ id: "gp-paris-hot-point", type: "symbol", source: "gp-paris-hot", layout: { "icon-image": icon, "icon-size": iconSize, "icon-allow-overlap": true } as maplibregl.SymbolLayerSpecification["layout"], paint: { "icon-opacity": ["case", ["==", ["get", "o"], 1], 0.65, 1] as maplibregl.ExpressionSpecification } });
    map.on("click", "gp-paris-cluster", async (e) => {
      const f = e.features?.[0]; if (!f || f.geometry.type !== "Point") return;
      try {
        const zoom = await (map.getSource("gp-paris") as maplibregl.GeoJSONSource).getClusterExpansionZoom(Number(f.properties?.cluster_id));
        map.easeTo({ center: f.geometry.coordinates as [number, number], zoom: Math.min(zoom + 0.5, 18.5), duration: 500 });
      } catch { map.easeTo({ center: f.geometry.coordinates as [number, number], zoom: map.getZoom() + 2, duration: 500 }); }
    });
    map.on("click", "gp-paris-agg", (e) => { const f = e.features?.[0]; if (f && f.geometry.type === "Point") map.easeTo({ center: f.geometry.coordinates as [number, number], zoom: Math.max(map.getZoom() + 2, 14.5), duration: 500 }); });
    for (const layer of ["gp-paris-point", "gp-paris-hot-point"]) {
      map.on("click", layer, (e) => {
        const f = e.features?.[0]; if (!f || f.geometry.type !== "Point") return;
        const [lng, lat] = f.geometry.coordinates as [number, number];
        const pr = f.properties ?? {};
        onPick({ lat, lng, t: Number(pr.t ?? 0), reportId: Number(pr.r ?? 0), color: String(pr.c ?? "gray"), places: Number(pr.p ?? 0), regime: Number(pr.g ?? -1), street: String(pr.s ?? ""), num: Number(pr.u ?? 0) });
      });
    }
    for (const layer of ["gp-paris-cluster", "gp-paris-agg", "gp-paris-point", "gp-paris-hot-point"]) {
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
    }
  } catch (error) { console.warn("[GOVAPARK] Couche des emplacements de Paris impossible", error); }
}

export default function ParkingMap3D({
  center, focus = null, listings, reports, streetSpots = [], onStreetSpot, parisSpots = [], parisHot = [], onParisSpot, polygonsOn = false, polygonTypes = DEFAULT_POLYGON_TYPES, forbiddenOn = false, confirmedIds, onListing, onBook, onRoute, onReport, onMove, userPosition, routeCoordinates, routeFocus = 0, routeListingIds, routeServices = [], fuelStations = [], vehicleType = "car", driving = false, canBook = true, altRoutes = [], onPickRoute, onUnavailable,
}: {
  center: Center;
  /** Demande de cadrage « zoom rue » sur une adresse choisie (un nouvel `id` = un nouveau cadrage). */
  focus?: { id: number; lat: number; lng: number; zoom: number } | null;
  listings: MapListing[];
  reports: MapReport[];
  streetSpots?: MapStreetSpot[];
  onStreetSpot?: (spot: MapStreetSpot) => void;
  /** Emplacements officiels de Paris (gris, regroupés) et ceux colorés par un signalement (jamais regroupés). */
  parisSpots?: ParisSpot[]; parisHot?: ParisSpot[]; onParisSpot?: (spot: ParisPick) => void;
  /** Contours en pointillés des emprises de Paris (zoom rue seulement) : couche active et types cochés (le filtre « Voitures et motos / Tout afficher »). Carte 3D uniquement. */
  polygonsOn?: boolean; polygonTypes?: ReadonlySet<number>;
  /** Tracés du stationnement interdit (Ville de Paris), au zoom rue seulement. Carte 3D uniquement. */
  forbiddenOn?: boolean;
  confirmedIds: Set<number>;
  onListing: (id: number) => void;
  onBook: (id: number) => void;
  canBook?: boolean;
  onRoute: (id: number) => void;
  routeCoordinates?: LatLng[];
  routeFocus?: number;
  routeListingIds?: Set<number>;
  routeServices?: RouteService[];
  onReport: (report: MapReport) => void;
  onMove?: (center: Center, bounds?: MapBounds) => void;
  userPosition?: GpsPosition | null;
  fuelStations?: Array<{ id: number; lat: number; lng: number; name: string }>;
  onUnavailable?: () => void;
  vehicleType?: string; vehicleColor?: string; driving?: boolean; altRoutes?: Array<{ id: string; coordinates: LatLng[] }>; onPickRoute?: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(12);
  const [heading, setHeading] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [generation, setGeneration] = useState(0); // recréation après une perte de contexte WebGL (iPhone)
  const lastView = useRef<{ center: [number, number]; zoom: number; pitch: number; bearing: number } | null>(null);
  const detailed = zoom >= 14;

  // Callbacks toujours à jour sans recréer les marqueurs.
  const cb = useRef({ onListing, onBook, onRoute, onReport, onMove, onPickRoute, onUnavailable, onStreetSpot, onParisSpot });
  cb.current = { onListing, onBook, onRoute, onReport, onMove, onPickRoute, onUnavailable, onStreetSpot, onParisSpot };

  const listingMarkers = useRef<maplibregl.Marker[]>([]);
  const reportMarkers = useRef<maplibregl.Marker[]>([]);
  const streetMarkers = useRef<maplibregl.Marker[]>([]);
  const serviceMarkers = useRef<maplibregl.Marker[]>([]);
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const carBadge = useRef<HTMLElement | null>(null);
  const lastFix = useRef<Center | null>(null);
  const previousCenter = useRef(center);
  const initialCenter = useRef(center);
  const autoFitDone = useRef(false); // cadrage initial : une seule fois, jamais après une action de l'utilisateur

  // Création de la carte (une seule fois).
  useEffect(() => {
    if (!container.current) return;
    // Échec de chargement (style OpenFreeMap injoignable, WebGL refusé) : on réessaie 2 fois, puis on prévient la page.
    let removed = false, loaded = false, failed = false, retryTimer: number | undefined, watchdog: number | undefined;
    const giveUp = () => {
      if (failed || loaded || removed) return;
      failed = true;
      window.clearTimeout(watchdog);
      if (attempt < 2) retryTimer = window.setTimeout(() => setAttempt((n) => n + 1), 2000 + attempt * 3000);
      else cb.current.onUnavailable?.();
    };
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: STYLE_URL,
        center: lastView.current?.center ?? [center.lng, center.lat],
        zoom: lastView.current?.zoom ?? START_ZOOM,
        pitch: lastView.current?.pitch ?? REST_PITCH,
        bearing: lastView.current?.bearing ?? 0,
        minZoom: 3,
        maxZoom: 19,
        maxPitch: 70,
        dragRotate: true,
        touchPitch: true,
        touchZoomRotate: true,
        failIfMajorPerformanceCaveat: false,
        attributionControl: { compact: true },
      });
    } catch (error) {
      console.warn("[GOVAPARK] Carte 3D impossible à créer", error);
      giveUp();
      return () => { removed = true; window.clearTimeout(retryTimer); };
    }
    mapRef.current = map;
    // Seule une erreur de style (sans tuile ni source) bloque vraiment la carte ; une tuile manquante n'est pas fatale.
    map.on("error", (e) => {
      const ev = e as unknown as { sourceId?: string; tile?: unknown; error?: Error };
      if (!loaded && !ev.sourceId && !ev.tile) { console.warn("[GOVAPARK] Erreur de style de carte", ev.error); giveUp(); }
    });
    watchdog = window.setTimeout(giveUp, 20000);
    // Contexte WebGL perdu (mémoire, veille) : MapLibre le restaure seul ; sinon, après 4 s, on recrée la carte à la même vue.
    let lostTimer: number | undefined;
    const canvas = map.getCanvas();
    const onLost = () => { window.clearTimeout(lostTimer); lostTimer = window.setTimeout(() => { if (!removed) setGeneration((n) => n + 1); }, 4000); };
    const onRestored = () => window.clearTimeout(lostTimer);
    canvas.addEventListener("webglcontextlost", onLost); canvas.addEventListener("webglcontextrestored", onRestored);
    // Gestes à deux doigts : pincer = zoom, tourner = cap, glisser verticalement = inclinaison.
    map.touchZoomRotate.enable(); map.touchZoomRotate.enableRotation(); map.touchPitch.enable(); map.dragRotate.enable();
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }), "bottom-right");
    map.addControl(new TiltControl(), "bottom-right");
    map.on("movestart", (e) => { if ((e as { originalEvent?: unknown }).originalEvent) autoFitDone.current = true; });
    map.on("zoomend", () => setZoom(map.getZoom()));
    map.on("moveend", () => { const c = map.getCenter(); lastView.current = { center: [c.lng, c.lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }; const b = map.getBounds(); cb.current.onMove?.({ lat: c.lat, lng: c.lng }, { south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() }); });
    map.on("load", () => {
      loaded = true;
      window.clearTimeout(watchdog);
      // Bâtiments en volume bien visibles dès le zoom 15 : on renforce la couche du style (hauteur pleine dès z15), sinon on l'ajoute.
      const heightExpr: maplibregl.ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 14, 0, 15, ["coalesce", ["get", "render_height"], 9]];
      const baseExpr: maplibregl.ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 14, 0, 15, ["coalesce", ["get", "render_min_height"], 0]];
      const extrusions = (map.getStyle().layers ?? []).filter((l) => l.type === "fill-extrusion");
      if (extrusions.length) {
        extrusions.forEach((l) => {
          try {
            map.setPaintProperty(l.id, "fill-extrusion-height", heightExpr);
            map.setPaintProperty(l.id, "fill-extrusion-base", baseExpr);
            map.setPaintProperty(l.id, "fill-extrusion-opacity", 0.5);
            map.setPaintProperty(l.id, "fill-extrusion-color", ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 9], 0, "#f4f1ea", 40, "#ece8df", 120, "#e2ddd2"]);
          } catch (error) { console.warn("[GOVAPARK] Réglage des bâtiments 3D", error); }
        });
      } else {
        const source = Object.entries(map.getStyle().sources).find(([, s]) => s.type === "vector")?.[0];
        if (source) {
          map.addLayer({
            id: "gp-buildings-3d", type: "fill-extrusion", source, "source-layer": "building", minzoom: 14,
            paint: { "fill-extrusion-color": "#f1eee7", "fill-extrusion-height": heightExpr, "fill-extrusion-base": baseExpr, "fill-extrusion-opacity": 0.5 },
          });
        }
      }
      // Lumière douce depuis l'avant-gauche pour que les volumes ressortent.
      try { map.setLight({ anchor: "viewport", color: "#ffffff", intensity: 0.25, position: [1.4, 210, 45] }); } catch { /* facultatif */ }
      // Places en plots 3D colorés (même couleur que les pastilles).
      map.addSource("gp-spots", { type: "geojson", data: emptyFc() });
      map.addLayer({
        id: "gp-spots-3d", type: "fill-extrusion", source: "gp-spots", minzoom: 16,
        paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": 2.2, "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.95 },
      });
      map.addSource("gp-route", { type: "geojson", data: emptyFc() });
      map.addSource("gp-alts", { type: "geojson", data: emptyFc() });
      map.addLayer({ id: "gp-alts-line", type: "line", source: "gp-alts", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#9aa0b4", "line-width": 7, "line-opacity": 0.9 } });
      map.addLayer({ id: "gp-route-casing", type: "line", source: "gp-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 11 } });
      map.addLayer({ id: "gp-route-line", type: "line", source: "gp-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#2f6df6", "line-width": 6.5 } });
      map.on("click", "gp-alts-line", (e) => { const id = e.features?.[0]?.properties?.id; if (id != null) cb.current.onPickRoute?.(String(id)); });
      map.on("mouseenter", "gp-alts-line", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "gp-alts-line", () => { map.getCanvas().style.cursor = ""; });
      addPolygonLayers(map);
      addForbiddenLayers(map);
      addParisLayers(map, (props) => cb.current.onParisSpot?.(props));
      setZoom(map.getZoom());
      setReady(true);
    });
    return () => { removed = true; window.clearTimeout(retryTimer); window.clearTimeout(watchdog); window.clearTimeout(lostTimer); canvas.removeEventListener("webglcontextlost", onLost); canvas.removeEventListener("webglcontextrestored", onRestored); setReady(false); map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, generation]);

  // Recentrage quand la cible change.
  useEffect(() => {
    const map = mapRef.current;
    const changed = previousCenter.current.lat !== center.lat || previousCenter.current.lng !== center.lng;
    previousCenter.current = center;
    if (changed) autoFitDone.current = true;
    if (!map || !changed) return;
    map.flyTo({ center: [center.lng, center.lat], zoom: Math.max(map.getZoom(), START_ZOOM), duration: 600 });
  }, [center]);

  // Adresse choisie dans la recherche : zoom rue sur la destination (après le recentrage ci-dessus, qui garde sinon le zoom courant).
  const lastFocus = useRef(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!focus || focus.id === lastFocus.current || !map || !ready) return;
    lastFocus.current = focus.id;
    autoFitDone.current = true;
    map.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom, bearing: 0, duration: 700 });
  }, [focus, ready]);

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
  }, [ready, routeCoordinates, following, routeFocus]);

  // Cadrage initial (sans trajet ni recherche) : les places les plus proches du centre sont visibles, au-dessus du panneau du bas et sous la barre du haut.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || autoFitDone.current || listings.length === 0) return;
    if (routeCoordinates && routeCoordinates.length > 1) { autoFitDone.current = true; return; }
    if (userPosition) { autoFitDone.current = true; return; }
    autoFitDone.current = true;
    const from = initialCenter.current;
    // Cadrage sur Paris (ou la position connue) : si la place la plus proche est à plus de 8 km du centre voulu, on ne se laisse pas
    // entraîner ailleurs en Île-de-France, on reste sur le centre à un zoom de quartier.
    const nearest = listings.reduce((best, l) => Math.min(best, metersBetween(from, { lat: l.latitude, lng: l.longitude })), Infinity);
    if (nearest > 8000) { map.jumpTo({ center: [from.lng, from.lat], zoom: 13.5, pitch: REST_PITCH, bearing: 0 }); return; }
    const candidates = [...listings]
      .map((l) => ({ lat: l.latitude, lng: l.longitude, d: metersBetween(from, { lat: l.latitude, lng: l.longitude }) }))
      .sort((a, b) => a.d - b.d).slice(0, 8);
    const box = map.getContainer().getBoundingClientRect();
    const sheet = document.querySelector(".m-sheet")?.getBoundingClientRect();
    const chips = document.querySelector(".m-chips")?.getBoundingClientRect();
    const top = Math.round(Math.max(110, (chips ? chips.bottom - box.top : 0) + 16));
    const bottom = Math.round(Math.max(120, sheet ? box.bottom - sheet.top + 24 : 260));
    const padding = { top, bottom: Math.min(bottom, Math.round(box.height * 0.6)), left: 50, right: 50 };
    const areaW = box.width - padding.left - padding.right, areaH = box.height - padding.top - padding.bottom;
    try {
      // Zoom fixe « de quartier » (bâtiments 3D visibles) : on garde la place la plus proche, puis on ajoute les suivantes tant qu'elles tiennent dans la zone libre.
      map.jumpTo({ center: [candidates[0].lng, candidates[0].lat], zoom: 14.4, pitch: REST_PITCH, bearing: 0 });
      const kept = [candidates[0]];
      const extent = (set: typeof kept) => {
        const px = set.map((pt) => map.project([pt.lng, pt.lat]));
        const xs = px.map((q) => q.x), ys = px.map((q) => q.y);
        return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
      };
      for (const candidate of candidates.slice(1)) {
        const e = extent([...kept, candidate]);
        if (e.maxX - e.minX <= areaW && e.maxY - e.minY <= areaH) kept.push(candidate);
      }
      const e = extent(kept);
      const dx = (e.minX + e.maxX) / 2 - (padding.left + areaW / 2);
      const dy = (e.minY + e.maxY) / 2 - (padding.top + areaH / 2);
      map.panBy([dx, dy], { animate: false });
    } catch (error) { console.warn("[GOVAPARK] Cadrage initial impossible", error); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, listings, routeCoordinates, userPosition]);

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
      const statusText = listing.parkingStatus?.label ?? "Aucun signalement récent";
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
      actions.append(go);
      if (canBook) { const book = text("button", "Réserver"); book.type = "button"; book.onclick = () => cb.current.onBook(listing.id); actions.append(book); }
      box.append(actions);
      const popup = new maplibregl.Popup({ offset: 18, closeButton: true, maxWidth: "260px" }).setDOMContent(box);
      return new maplibregl.Marker({ element: node }).setLngLat([listing.longitude, listing.latitude]).setPopup(popup).addTo(map);
    })];
  }, [ready, listings, confirmedIds, detailed, routeListingIds, canBook, Math.floor(zoom)]);

  // Plots 3D des places : vert uniquement si le statut est vert (source fiable), jamais par défaut.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource("gp-spots") as maplibregl.GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: listings.map((listing) => {
        const key = listing.parkingStatus?.color ?? (confirmedIds.has(listing.id) ? "blue" : "gray");
        return { type: "Feature" as const, properties: { color: PLOT_COLORS[key] ?? PLOT_COLORS.gray }, geometry: plotPolygon(listing.latitude, listing.longitude) };
      }),
    });
  }, [ready, listings, confirmedIds]);

  // Signalements.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    reportMarkers.current.forEach((m) => m.remove());
    reportMarkers.current = reports.map((report) => {
      const symbol = report.kind === "free" ? "?" : report.kind === "occupied" ? "×" : "↗";
      const node = el("span", `pk-bubble pk-b-${report.parkingStatus?.color ?? "gray"}${detailed ? "" : " pk-sm"}`, `<i class="pk-ring"></i><b>${detailed ? symbol : ""}</b>`);
      const rlabel = `${report.address} — ${report.parkingStatus?.label ?? "Aucun signalement récent"}`; node.title = rlabel; node.setAttribute("aria-label", rlabel); node.style.cursor = "pointer";
      node.addEventListener("click", (e) => { e.stopPropagation(); cb.current.onReport(report); });
      return new maplibregl.Marker({ element: node }).setLngLat([report.longitude, report.latitude]).addTo(map);
    });
  }, [ready, reports, detailed]);

  // Places gratuites en rue (couche communautaire séparée) : carrés arrondis aux couleurs du statut.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    streetMarkers.current.forEach((m) => m.remove());
    streetMarkers.current = streetSpots.map((spot) => {
      const node = el("span", `pk-street pk-s-${spot.color}`, spot.status === "free" ? "P" : "×");
      const slabel = `Place en rue · ${spot.label}${spot.example ? " (exemple)" : ""}`; node.title = slabel; node.setAttribute("aria-label", slabel); node.style.cursor = "pointer";
      node.addEventListener("click", (e) => { e.stopPropagation(); cb.current.onStreetSpot?.(spot); });
      return new maplibregl.Marker({ element: node }).setLngLat([spot.longitude, spot.latitude]).addTo(map);
    });
  }, [ready, streetSpots]);

  // Contours des emprises : à partir du zoom rue, seulement les tuiles visibles (avec limite), rechargées après chaque déplacement.
  const [polys, setPolys] = useState<ParisPolygon[]>([]);
  // Seuls les types de véhicule dont un type d'emplacement est coché sont téléchargés (économie réseau).
  const polygonVehicleKey = VEHICLE_TYPES.filter((v) => VEHICLE_SPOT_TYPES[v].some((t) => polygonTypes.has(t))).join(",");
  const polygonVehicles = useMemo(() => (polygonVehicleKey ? polygonVehicleKey.split(",") : []) as Array<(typeof VEHICLE_TYPES)[number]>, [polygonVehicleKey]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false, timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (!polygonsVisible(map.getZoom(), polygonsOn)) { if (!cancelled) setPolys((previous) => (previous.length ? [] : previous)); return; }
        const b = map.getBounds(), c = map.getCenter();
        const result = await loadParisPolygons({ south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() }, { lat: c.lat, lng: c.lng }, polygonVehicles);
        if (!cancelled) setPolys(result.status === "ok" ? result.polys : []);
      }, 250);
    };
    map.on("moveend", refresh); refresh();
    return () => { cancelled = true; window.clearTimeout(timer); map.off("moveend", refresh); };
  }, [ready, polygonsOn, polygonVehicles]);
  // Entités dessinées : filtre de types, couleur d'un signalement récent via le point d'ancrage (emplacement correspondant), sinon gris.
  const polygonFeatures = useMemo(() => {
    const colorOf = new Map<string, PolygonColor>();
    for (const s of parisHot) if (s.color !== "gray") colorOf.set(spotAnchorKey(s.lat, s.lng), s.color);
    return buildPolygonFeatures(polys, colorOf, polygonTypes);
  }, [polys, parisHot, polygonTypes]);
  const drawnAnchors = useMemo(() => {
    const set = new Set<string>();
    for (const p of polys) if (polygonTypes.has(p.t) && p.ring.length >= 3) set.add(p.anchor);
    return set;
  }, [polys, polygonTypes]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("gp-poly") as maplibregl.GeoJSONSource | undefined)?.setData(polygonFeatures.outlines);
    (map.getSource("gp-poly-sep") as maplibregl.GeoJSONSource | undefined)?.setData(polygonFeatures.separators);
  }, [ready, polygonFeatures]);

  // Stationnement interdit : tuiles de la zone visible, au zoom rue seulement (fichiers absents : rien n'est dessiné).
  const [forbidden, setForbidden] = useState<DecodedFeature[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false, timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (!layerVisible(map.getZoom(), LAYER.streetZoom, forbiddenOn)) { if (!cancelled) setForbidden((previous) => (previous.length ? [] : previous)); return; }
        const b = map.getBounds(), c = map.getCenter();
        const result = await loadLayer(FORBIDDEN_BASE, { south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() }, { lat: c.lat, lng: c.lng });
        if (!cancelled) setForbidden(result.status === "ok" ? result.features : []);
      }, 250);
    };
    map.on("moveend", refresh); refresh();
    return () => { cancelled = true; window.clearTimeout(timer); map.off("moveend", refresh); };
  }, [ready, forbiddenOn]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("gp-forbidden") as maplibregl.GeoJSONSource | undefined)?.setData(toGeoJson(forbidden));
  }, [ready, forbidden]);

  // Emplacements officiels de Paris : regroupement natif MapLibre (gris, jamais de disponibilité) + emplacements colorés par un signalement.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const feature = (s: ParisSpot): GeoJSON.Feature<GeoJSON.Point> => ({ type: "Feature", properties: { w: s.places, a: s.agg ? 1 : 0, p: s.places, t: s.t, c: s.color, r: s.reportId, g: s.g, s: s.street, u: s.num, o: !s.agg && drawnAnchors.has(spotAnchorKey(s.lat, s.lng)) ? 1 : 0 }, geometry: { type: "Point", coordinates: [s.lng, s.lat] } });
    (map.getSource("gp-paris") as maplibregl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: parisSpots.map(feature) });
    (map.getSource("gp-paris-hot") as maplibregl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: parisHot.map(feature) });
  }, [ready, parisSpots, parisHot, drawnAnchors]);

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
