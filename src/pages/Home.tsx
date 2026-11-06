import { lazy, Suspense, useMemo, useState, useEffect, useRef, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router";
import { Search, LocateFixed, SlidersHorizontal, List, Map as MapIcon, Plus, ShieldAlert, X, Clock3, ThumbsUp, ThumbsDown, Navigation, Check, Mail, Settings, Gauge, Fuel, Download, ChevronDown, ChevronUp, Info, Layers, Briefcase, MapPin, Home as HomeIcon, Trash2, ChevronRight, Car as CarIcon, Bike as BikeIcon, Package as PackageIcon, Zap as ZapIcon, Accessibility as AccessibilityIcon } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import ParkingMap, { type MapReport, type MapBounds, type MapStreetSpot } from "@/components/ParkingMap";
import { Map3DBoundary } from "@/components/Map3DBoundary";
import type { ParisPick } from "@/components/ParkingMap3D";
import { detectWebGL, importWithRetry } from "@/lib/webgl";
const ParkingMap3D = lazy(() => importWithRetry(() => import("@/components/ParkingMap3D")));
const initialWebGL = detectWebGL();
import { Modal } from "@/components/Modal";
import { AuthGate } from "@/components/AuthGate";
import { STATUS_COLORS, statePillLabel } from "@contracts/parking-status";
import { bboxAround } from "@contracts/parking-search";
import { agoText, reportSuccessText, STREET_RULES } from "@contracts/street-reports";
import { GeolocError, getDevicePosition } from "@/lib/street";
import { DEFAULT_CONSUMPTION, NO_TRAFFIC, DEFAULT_FUEL_PRICE_EUR_L, formatDistance, formatDuration, formatEuro, bikeDurationSeconds, isSamePlace, routeEndpoints, straightLineEstimate, summaryLine, tripCostEur } from "@/lib/route-calc";
import { getGeolocDiag, noteGeolocError, subscribeGeolocDiag, refreshPermissionState, reportPositionIssue } from "@/lib/geoloc";
import { NavigationMode } from "@/components/NavigationMode";
import { mapOsrmSteps, type NavDest, type RouteStep } from "@/lib/guidance";
import { fetchOsrmRoute } from "@/lib/routing";
import { loadParisSpots, type ParisLoad } from "@/lib/paris-spots";
import { PARIS_ATTRIBUTION, PARIS_SOURCE, SPOT_TYPE, SPOT_TYPE_CODES, formatStreet, interpretRegime, type OfficialSpot, type ParisSpot } from "@contracts/paris-spots";
import { StreetPanel, type StreetPanelState } from "@/components/StreetPanel";
import { VEHICLE_SPOT_TYPES, DEFAULT_VEHICLE, DISPLAY_CHIP, isDisplayType, type DisplayType, VEHICLE_CHIP, VEHICLE_NAME, VEHICLE_TYPES, fromProfileVehicle, isVehicleType, mergeByVehicle, spotTypesToShow, vehicleTypesForSpot, type VehicleType } from "@contracts/vehicle-types";
import { PARIS_POLYGONS_ATTRIBUTION, PARIS_POLYGONS_NOTE, PARIS_POLYGONS_SOURCE } from "@contracts/paris-polygons";
import { PlaceSheet } from "@/components/PlaceSheet";
import { parisSheetContent, type ParisSpotInfo } from "@/lib/place-sheet";
import { FORBIDDEN_ATTRIBUTION, FORBIDDEN_SOURCE } from "@contracts/paris-forbidden";
import { spotContext, type SpotContext } from "@/lib/spot-context";
import { WORKS_SOURCE, worksAttribution } from "@contracts/paris-works";
import { TARIFF_SOURCE, tariffAttribution } from "@contracts/paris-tariffs";
import { loadTariffs } from "@/lib/paris-tariffs";
import { tariffLineFor } from "@contracts/paris-tariffs";
import { loadLayerPrefs, saveLayerPrefs } from "@/lib/layer-prefs";
import { getMapDiag, mapDiagLine } from "@/lib/map-diag";
import { nearCountLabel, NEAR_COUNT_RADIUS_M } from "@/lib/near-label";
import { addRecent, getFavorite, loadPlaces as loadSavedPlaces, removeFavorite, removeRecent, savePlaces as saveSavedPlaces, setFavorite, KIND_NAME, MAX_NAME, type PlacesStore, type SavedKind } from "@/lib/saved-places";
import { ZFE_SOURCE, zfeAttribution, type ZfeFile } from "@contracts/paris-zfe";
import { IRVE_SOURCE, irveAttribution, irveSheet } from "@contracts/paris-irve";
import { loadZfe } from "@/lib/paris-zfe";
import { capAlternatives, routeCrossesZfe, tripTag, viaRoad } from "@/lib/route-compare";
import { modeTabs } from "@/lib/route-modes";
import { ARRIVAL_RADIUS_M, arrivalBounds, arrivalReports, arrivalSentence, countStreetPlaces, reportsSentence } from "@/lib/arrival-parking";
import { loadLayerIndex } from "@/lib/geo-layers";
import { OfflineBanner, OfflineDownloadModal } from "@/components/OfflineUI";
import { loadPlaces, offlineStatus, savePlaces, straightLineKm, useOnlineStatus } from "@/lib/offline";
import { ago, distanceMeters, euros, fullDate, placeTypeLabel, shortDate, toLocalInput } from "@/lib/format";

type Filters = { maxPrice: number; maxDistance: number; type: string; covered: string; minHeight: number; minLength: number; minWidth: number; accessible: boolean; priceMode: "tous" | "free" | "paid"; category: "private" | "public" | "collective"; from: string; to: string };
const initialFilters: Filters = { maxPrice: 350, maxDistance: 30, type: "tous", covered: "tous", minHeight: 0, minLength: 0, minWidth: 0, accessible: false, priceMode: "tous", category: "private", from: "", to: "" };
const reportTitle = { free: "Place signalée libre", occupied: "Place signalée occupée", departure: "Départ annoncé" };
type RouteService = { id: string; lat: number; lng: number; name: string; kind: "charge" | "rest" | "parking" | "truck" | "restaurant" | "fuel"; detail?: string; price?: number; priceUpdated?: string };
type DrivingRoute = { id: string; label: string; coordinates: [number, number][]; distance: number; duration: number; destinationId: number; steps: RouteStep[]; fuelCost?: number; fuelPrice?: number; score?: number; offline?: boolean; costEur?: number; costAssumed?: boolean; profile?: VehicleType; estimate?: boolean; via?: string | null };
function distanceToSegmentMeters(point: {lat:number;lng:number}, a: [number,number], b: [number,number]) {
  const latScale = 111320, lngScale = 111320 * Math.cos(point.lat * Math.PI / 180);
  const px = point.lng * lngScale, py = point.lat * latScale;
  const ax = a[1] * lngScale, ay = a[0] * latScale, bx = b[1] * lngScale, by = b[0] * latScale;
  const dx = bx-ax, dy = by-ay; const t = Math.max(0, Math.min(1, ((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy || 1)));
  return Math.hypot(px-(ax+t*dx), py-(ay+t*dy));
}
function distanceToRoute(point: {lat:number;lng:number}, line: [number,number][]) {
  let best = Infinity; for (let i=1;i<line.length;i++) best=Math.min(best,distanceToSegmentMeters(point,line[i-1],line[i])); return best;
}

type AddressSuggestion = { label: string; lat: number; lng: number; kind: "listing" | "address"; subtitle?: string };

// Île-de-France : centre de Paris pour le biais de localisation et cadre approximatif (lon min, lat min, lon max, lat max).
const NO_PARIS: ParisSpot[] = [];
// Tableau stable (une nouvelle valeur à chaque rendu relançait l'effet des marqueurs de services de la carte à chaque position GPS).
const NO_FUEL: Array<{ id: number; lat: number; lng: number; name: string }> = [];
// Rayons de la liste « Places près de [adresse] ».
const DEST_STREET_RADIUS_M = 300;
const DEST_PRIVATE_RADIUS_M = 2000;
const PARIS_CENTER = { lat: 48.8566, lng: 2.3522 };
const IDF_BOX = { west: 1.45, south: 48.12, east: 3.56, north: 49.25 };
const inIleDeFrance = (lat: number, lng: number) => lat >= IDF_BOX.south && lat <= IDF_BOX.north && lng >= IDF_BOX.west && lng <= IDF_BOX.east;

type BanFeature = { geometry: { coordinates: [number, number] }; properties: { label: string; context?: string } };
type NominatimItem = { name?: string; display_name: string; lat: string; lon: string };

// Recherche d'adresse en priorité en Île-de-France : api-adresse.data.gouv.fr (biais Paris) pour les adresses,
// Nominatim (cadre Île-de-France) en complément pour les monuments et lieux, que la base d'adresses ne connaît pas.
// Les résultats hors Île-de-France ne sont affichés que s'il n'y en a aucun dans la région.
async function geocodeFR(query: string, signal: AbortSignal): Promise<AddressSuggestion[]> {
  const q = encodeURIComponent(query);
  const looksLikeAddress = /^\s*\d/.test(query);
  const banRequest = (async (): Promise<AddressSuggestion[]> => {
    const response = await fetch(`https://api-adresse.data.gouv.fr/search/?limit=10&lat=${PARIS_CENTER.lat}&lon=${PARIS_CENTER.lng}&q=${q}`, { signal });
    if (!response.ok) return [];
    const body = await response.json() as { features?: BanFeature[] };
    return (body.features ?? []).map((f) => ({ label: f.properties.label, subtitle: f.properties.context, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], kind: "address" as const }));
  })();
  const nominatimRequest = (async (): Promise<AddressSuggestion[]> => {
    if (looksLikeAddress) return [];
    const viewbox = `${IDF_BOX.west},${IDF_BOX.north},${IDF_BOX.east},${IDF_BOX.south}`;
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&countrycodes=fr&viewbox=${viewbox}&q=${q}`, { signal, headers: { Accept: "application/json" } });
    if (!response.ok) return [];
    const data = await response.json() as NominatimItem[];
    return data.map((item) => {
      const parts = item.display_name.split(", ");
      const named = Boolean(item.name) && parts[0] === item.name;
      return { label: named ? parts[0] : parts.slice(0, 3).join(", "), subtitle: parts.slice(named ? 1 : 3, named ? 4 : 5).join(", "), lat: Number(item.lat), lng: Number(item.lon), kind: "address" as const };
    });
  })();
  const [ban, nominatim] = await Promise.allSettled([banRequest, nominatimRequest]);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const banResults = ban.status === "fulfilled" ? ban.value : [];
  const nominatimResults = nominatim.status === "fulfilled" ? nominatim.value : [];
  const all = [...nominatimResults, ...banResults];
  const seen = new Set<string>();
  const unique = all.filter((item) => { const key = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`; if (seen.has(key)) return false; seen.add(key); return true; });
  const local = unique.filter((item) => inIleDeFrance(item.lat, item.lng));
  return (local.length > 0 ? local : unique).slice(0, 5);
}

/** Types d'affichage seulement proposés dans le sélecteur. */
const DISPLAY_CHIPS: DisplayType[] = ["pmr", "ev"];
/** Pictogrammes des puces « Mon véhicule » (lucide n'a pas de moto sûre dans la version utilisée : petit dessin local). */
const MotoIcon = ({ size = 18 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="5" cy="17" r="3" /><circle cx="19" cy="17" r="3" /><path d="M5 17h4l3-6h4l3 6M12 11 10 7H7M15 7h3" /></svg>;
const CHIP_ICON: Record<VehicleType, JSX.Element> = { car: <CarIcon size={18} aria-hidden="true" />, moto: <MotoIcon />, delivery: <PackageIcon size={18} aria-hidden="true" />, bike: <BikeIcon size={18} aria-hidden="true" /> };
const DISPLAY_ICON: Record<DisplayType, JSX.Element> = { pmr: <AccessibilityIcon size={18} aria-hidden="true" />, ev: <ZapIcon size={18} aria-hidden="true" /> };

export default function Home() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { isAuthenticated, user } = useAuth();
  const utils = trpc.useUtils();
  const reportsQuery = trpc.govapark.community.list.useQuery(undefined, { refetchInterval: 30000 });
  const myReservations = trpc.govapark.reservations.mine.useQuery(undefined, { enabled: isAuthenticated });
  const [view, setView] = useState<"map" | "list">("map");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Légende des couleurs et sources : repliées derrière le bouton « i » (une carte lisible d'abord).
  const [infoOpen, setInfoOpen] = useState(false);
  // Mobile : panneau des places privées replié au départ (la carte et les places en rue restent lisibles) ; ouvert sur grand écran.
  // Feuille basse à 3 états : replié (poignée + une ligne), mi-hauteur (cartes), plein (liste complète). Un toucher sur la poignée passe à l'état suivant.
  const [sheetMode, setSheetMode] = useState<"closed" | "half" | "full">(() => (typeof window === "undefined" || window.innerWidth >= 900 ? "half" : "closed"));
  const sheetOpen = sheetMode !== "closed";
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [search, setSearch] = useState("");
  // Destination choisie dans la recherche : la carte se centre dessus et le panneau du bas liste les places autour. Aucun itinéraire n'est calculé tant que l'utilisateur ne touche pas « Y aller ».
  const [destination, setDestination] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: number; lat: number; lng: number; zoom: number } | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  // Raccourcis (Domicile, Travail, lieux nommés) et dernières destinations : stockés sur l'appareil seulement (src/lib/saved-places.ts).
  const [places, setPlaces] = useState<PlacesStore>(() => loadSavedPlaces());
  const [pendingFav, setPendingFav] = useState<{ kind: SavedKind; name?: string } | null>(null);
  const [newFavName, setNewFavName] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const updatePlaces = (next: PlacesStore) => { setPlaces(next); saveSavedPlaces(next); };
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [target, setTarget] = useState({ lat: 48.8566, lng: 2.3522 });
  const [visibleCenter, setVisibleCenter] = useState(target);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportKind, setReportKind] = useState<"free" | "occupied" | "departure">("free");
  const [reportAddress, setReportAddress] = useState("Rue de Rivoli, Paris 4ᵉ");
  const [departureAt, setDepartureAt] = useState(toLocalInput(new Date(Date.now() + 15 * 60000)));
  const [locating, setLocating] = useState(false);
  const locatingRef = useRef(false);
  const geolocDiag = useSyncExternalStore(subscribeGeolocDiag, getGeolocDiag, getGeolocDiag);
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [fuelStations, setFuelStations] = useState<Array<{id:number;lat:number;lng:number;name:string}>>([]);
  const [vehiclePrefs] = useState(() => { try { return JSON.parse(localStorage.getItem("govapark.preferences.v1") || "{}"); } catch { return {}; } });
  const [trackingGps, setTrackingGps] = useState(false);
  const [originNote, setOriginNote] = useState<string | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [routeFocus, setRouteFocus] = useState(0);
  const [drivingRoute, setDrivingRoute] = useState<DrivingRoute | null>(null);
  const [routeOptions, setRouteOptions] = useState<DrivingRoute[]>([]);
  const [routeServices, setRouteServices] = useState<RouteService[]>([]);
  const [routeFuelType, setRouteFuelType] = useState<"gazole" | "e10" | "sp98" | "sp95" | "e85">("gazole");
  const [fuelConsumption, setFuelConsumption] = useState(7.2);
  const [routeLoading, setRouteLoading] = useState(false);
  // Départ et arrivée du dernier trajet calculé (pour les onglets de mode) ; durée voiture de référence quand le trajet affiché est un trajet vélo.
  const lastTrip = useRef<{ origin: { lat: number; lng: number }; dest: { lat: number; lng: number } } | null>(null);
  const [carBase, setCarBase] = useState<{ durationS: number } | null>(null);
  // Navigation plein écran : destination (avec l'état du signalement pour le rappel d'arrivée), cap/recentrage.
  const [navActive, setNavActive] = useState(false);
  const [navFollow, setNavFollow] = useState(true);
  const [navDest, setNavDest] = useState<NavDest | null>(null);
  // Lu par le suivi GPS (fonction créée une fois) : le recentrage automatique ne vaut QU'EN navigation, et pas en « Vue d'ensemble ».
  const navFollowRef = useRef({ active: false, follow: true });
  navFollowRef.current = { active: navActive, follow: navFollow };
  // L'utilisateur a choisi où regarder (adresse, place, trajet) : la position demandée à l'ouverture ne recentre plus la carte.
  const mapIntent = useRef(false);
  const voiceSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [voiceGuidanceEnabled, setVoiceGuidanceEnabled] = useState(false);
  const [backgroundAlertsEnabled, setBackgroundAlertsEnabled] = useState(false);
  const spokenStepIndex = useRef(0);
  const [proximityAlertsEnabled, setProximityAlertsEnabled] = useState(false);
  const alertedListingIds = useRef<Set<number>>(new Set());
  const watchId = useRef<number | null>(null);
  const gpsInitialized = useRef(false);
  const originRef = useRef<{ lat: number; lng: number } | null>(null);
  const [departureUpdate, setDepartureUpdate] = useState(toLocalInput(new Date(Date.now() + 15 * 60000)));
  // Clé arrondie à 0,01° (≈ 1 km) : une nouvelle position GPS ne relance plus une requête à chaque fois.
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const learnedPredictions = trpc.govapark.intelligence.predictions.useQuery({ latitude: round2(userPosition?.lat ?? visibleCenter.lat), longitude: round2(userPosition?.lng ?? visibleCenter.lng), radiusKm: 5 }, { refetchInterval: 60000, staleTime: 30000 });
  // Chargement par zone : seule la zone affichée (ou le trajet) est demandée au serveur, avec les filtres et une limite.
  const searchInput = useMemo(() => {
    const round = (v: number) => Math.round(v * 100) / 100;
    let bbox = bboxAround(visibleCenter.lat, visibleCenter.lng, filters.maxDistance);
    if (drivingRoute && drivingRoute.coordinates.length > 1) {
      const lats = drivingRoute.coordinates.map((c) => c[0]), lngs = drivingRoute.coordinates.map((c) => c[1]);
      bbox = { south: Math.min(...lats) - 0.012, north: Math.max(...lats) + 0.012, west: Math.min(...lngs) - 0.018, east: Math.max(...lngs) + 0.018 };
    }
    const from = filters.from ? new Date(filters.from) : undefined, to = filters.to ? new Date(filters.to) : undefined;
    return {
      bbox: { south: round(bbox.south), north: round(bbox.north), west: round(bbox.west), east: round(bbox.east) }, limit: 300, category: filters.category,
      maxHourlyCents: filters.maxPrice < 350 ? filters.maxPrice : undefined, placeType: filters.type === "tous" ? undefined : filters.type as "garage" | "residence" | "entreprise" | "parking",
      covered: filters.covered === "tous" ? undefined : filters.covered === "couvert", accessible: filters.accessible || undefined, priceMode: filters.priceMode === "tous" ? undefined : filters.priceMode,
      minLengthM: filters.minLength || undefined, minWidthM: filters.minWidth || undefined, minHeightCm: filters.minHeight || undefined,
      onlyAvailable: onlyAvailable || undefined, from: from && to && to > from ? from : undefined, to: from && to && to > from ? to : undefined,
    };
  }, [visibleCenter.lat, visibleCenter.lng, filters, onlyAvailable, drivingRoute]);
  const searchQuery = trpc.govapark.listings.search.useQuery(searchInput, { staleTime: 10000, refetchInterval: 30000, placeholderData: (previous) => previous });
  // Mode hors ligne : jamais de "disponible" issu d'un cache. Hors ligne (ou serveur en erreur), les places affichées
  // viennent de la dernière réponse enregistrée localement et passent en gris avec la date d'actualisation.
  const online = useOnlineStatus();
  const [offlineOpen, setOfflineOpen] = useState(false);
  const cacheMode = !online || searchQuery.isError;
  const cachedPlaces = useMemo(() => (cacheMode ? loadPlaces<NonNullable<typeof searchQuery.data>["items"][number]>() : null), [cacheMode]);
  const placesSavedAt = cacheMode ? (searchQuery.data && searchQuery.dataUpdatedAt ? searchQuery.dataUpdatedAt : cachedPlaces?.savedAt ?? 0) : 0;
  useEffect(() => {
    if (online && !searchQuery.isError && !searchQuery.isPlaceholderData && searchQuery.data?.items.length) savePlaces(searchQuery.data.items);
  }, [online, searchQuery.isError, searchQuery.isPlaceholderData, searchQuery.data]);
  const listingsData = useMemo(() => {
    if (!cacheMode) return searchQuery.data?.items;
    const base = searchQuery.data?.items?.length ? searchQuery.data.items : cachedPlaces?.items ?? [];
    const status = offlineStatus(placesSavedAt, online ? "server" : "offline");
    return base.map((item) => ({ ...item, currentAvailability: "unknown" as unknown as typeof item.currentAvailability, parkingStatus: status as unknown as typeof item.parkingStatus }));
  }, [cacheMode, online, searchQuery.data, cachedPlaces, placesSavedAt]);
  const listingsQuery = { data: listingsData, isLoading: searchQuery.isLoading, error: cacheMode ? null : searchQuery.error, refetch: searchQuery.refetch };

  const listings = useMemo(() => listingsQuery.data ?? [], [listingsQuery.data]);
  const searchNote = searchQuery.data?.note ?? null;
  const searchTruncated = searchQuery.data?.truncated ?? false;
  // Hors ligne : les signalements communautaires (périssables) ne sont pas réaffichés depuis la mémoire.
  const reports = useMemo(() => (online ? reportsQuery.data ?? [] : []), [online, reportsQuery.data]);
  // Couche « Places en rue » (gratuites, signalées par la communauté) : séparée des places privées, chargée pour la zone affichée, avec limite.
  const [initialLayers] = useState(() => loadLayerPrefs());
  const [streetOn, setStreetOn] = useState(initialLayers.street);
  const [layersOpen, setLayersOpen] = useState(false);
  const [visibleBounds, setVisibleBounds] = useState<MapBounds | null>(null);
  const [selectedStreetId, setSelectedStreetId] = useState<number | null>(null);
  const [streetLocating, setStreetLocating] = useState(false);
  // Couche « Emplacements de Paris » (Ville de Paris, ODbL) : emplacements officiels en gris, colorés seulement par un signalement récent.
  const [parisOn, setParisOn] = useState(initialLayers.paris);
  const [forbiddenOn, setForbiddenOn] = useState(initialLayers.forbidden);
  // Par défaut : seulement les emplacements où une voiture peut se garer (payant, mixte, gratuit) ; livraison, vélos, deux-roues, autocars, PMR et le reste s'activent par le filtre.
  // « Mon véhicule » : voiture par défaut ; mémorisé dans le navigateur seulement (aucun champ de profil serveur n'existe pour le type de véhicule). « Tout » affiche tous les types sur la carte.
  // `display` : type d'AFFICHAGE SEULEMENT (PMR) : il montre les places de ce type, sans signalement (le véhicule de signalement reste celui d'avant).
  type VehicleChoice = { vehicle: VehicleType; all: boolean; display?: DisplayType | null };
  const [vehicleChoice, setVehicleChoice] = useState<VehicleChoice>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("govapark.mapVehicle.v1") || "null");
      if (saved && isVehicleType(saved.vehicle)) return { vehicle: saved.vehicle, all: saved.all === true, display: isDisplayType(saved.display) ? saved.display : null };
    } catch { /* stockage indisponible : choix par défaut */ }
    return { vehicle: fromProfileVehicle(vehiclePrefs.vehicle) ?? DEFAULT_VEHICLE, all: false, display: null };
  });
  const vehicle = vehicleChoice.vehicle;
  const displayType = vehicleChoice.display ?? null;
  const chooseVehicle = (next: VehicleChoice) => {
    setVehicleChoice(next);
    try { localStorage.setItem("govapark.mapVehicle.v1", JSON.stringify(next)); } catch { /* facultatif */ }
  };
  // Consommation et carburant par défaut selon le véhicule (réglables ensuite dans le panneau de trajet).
  useEffect(() => { setFuelConsumption(DEFAULT_CONSUMPTION[vehicle] || DEFAULT_CONSUMPTION.car); setRouteFuelType(vehicle === "moto" ? "e10" : "gazole"); }, [vehicle]);
  const parisTypes = useMemo(() => (displayType === "pmr" ? new Set<number>([SPOT_TYPE.pmr]) : displayType ? new Set<number>() : spotTypesToShow(vehicle, vehicleChoice.all, SPOT_TYPE_CODES)), [vehicle, vehicleChoice.all, displayType]);
  const [parisLoad, setParisLoad] = useState<ParisLoad | null>(null);
  const [selectedParis, setSelectedParis] = useState<ParisSpotInfo | null>(null);
  const [parisRegimes, setParisRegimes] = useState<Array<[string, string]>>([]);
  // Chantiers (Ville de Paris, non exhaustifs, peuvent être périmés) : couche désactivée par défaut ; la date des données vient du fichier généré.
  const [worksOn, setWorksOn] = useState(initialLayers.works);
  const [worksDate, setWorksDate] = useState<string | null>(null);
  // Zone à faibles émissions de Paris : limite seulement, désactivée par défaut ; liens de l'arrêté lus dans le fichier généré.
  const [zfeOn, setZfeOn] = useState(initialLayers.zfe);
  const [zfeFile, setZfeFile] = useState<ZfeFile | null>(null);
  // Le périmètre sert aussi à dire si un trajet le traverse, même si la couche ZFE est masquée (petit fichier du site, aucun service externe).
  useEffect(() => { if (zfeOn || routeOptions.length > 0) void loadZfe().then(setZfeFile); }, [zfeOn, routeOptions.length]);
  const zfeCrossing = useMemo(() => Object.fromEntries(routeOptions.map((o) => [o.id, !o.offline && o.profile !== "bike" && routeCrossesZfe(o.coordinates, zfeFile?.ring)])) as Record<string, boolean>, [routeOptions, zfeFile]);
  // Onglets de mode : durée voiture = meilleure option du réseau routier ; si le trajet affiché est un tracé vélo, la durée voiture vient d'un appel OSRM voiture (service déjà utilisé).
  const carNetworkNow = !!drivingRoute && !drivingRoute.offline && (drivingRoute.profile ?? vehicle) !== "bike";
  const bikeNow = !!drivingRoute && !drivingRoute.offline && drivingRoute.profile === "bike";
  const bikeAny = !!drivingRoute && drivingRoute.profile === "bike" && (!drivingRoute.offline || !!drivingRoute.estimate);
  useEffect(() => {
    setCarBase(null);
    if (!bikeAny || !lastTrip.current) return;
    let alive = true;
    void fetchOsrmRoute(lastTrip.current.origin, lastTrip.current.dest).then((r) => { if (alive && r) setCarBase({ durationS: r.duration }); });
    return () => { alive = false; };
  }, [bikeAny, drivingRoute?.id]);
  const modeTabsNow = useMemo(() => {
    const trip = lastTrip.current;
    if (!drivingRoute || !trip || (drivingRoute.offline && !drivingRoute.estimate)) return [];
    const best = (list: DrivingRoute[]) => list.length ? Math.min(...list.map((o) => o.duration)) : null;
    return modeTabs({
      carDurationS: carNetworkNow ? best(routeOptions) : carBase?.durationS ?? null,
      bikeServiceDurationS: bikeNow ? best(routeOptions) : null,
      straightDurationS: straightLineEstimate(trip.origin, trip.dest).durationS,
    });
  }, [drivingRoute, routeOptions, carBase, carNetworkNow, bikeNow]);
  // Toucher un onglet = choisir ce véhicule dans « Mon véhicule » et recalculer le même trajet. Vélo : AUCUN appel au service vélo (non confirmé par Anas), estimation à vol d'oiseau étiquetée.
  const switchMode = (mode: VehicleType) => {
    const trip = lastTrip.current;
    if (!trip || !drivingRoute || mode === (drivingRoute.profile ?? vehicle)) return;
    chooseVehicle({ vehicle: mode, all: false, display: null });
    if (mode === "bike") {
      const est = straightLineEstimate(trip.origin, trip.dest);
      const line: DrivingRoute = { id: "offline-line", label: "À vol d’oiseau, estimation (tracé vélo non calculé)", coordinates: [[trip.origin.lat, trip.origin.lng], [trip.dest.lat, trip.dest.lng]], distance: est.distanceM, duration: est.durationS, destinationId: drivingRoute.destinationId, steps: [], offline: true, estimate: true, costEur: 0, profile: "bike" };
      setRouteOptions([line]); setDrivingRoute(line); return;
    }
    void calculateRoutes(trip.dest, navDest?.label ?? "Destination", drivingRoute.destinationId, navDest ?? undefined, mode);
  };
  // Stationnement à l'arrivée : places en rue officielles (tuiles existantes) et signalements récents du même type de véhicule, à moins de 200 m de la destination. Rien d'autre, aucune note.
  const arrivalDest = drivingRoute && navDest ? { lat: navDest.lat, lng: navDest.lng } : null;
  const arrivalVehicle: VehicleType = drivingRoute?.profile ?? vehicle;
  const [arrivalLoad, setArrivalLoad] = useState<ParisLoad | null>(null);
  const [arrivalTariff, setArrivalTariff] = useState<string | null>(null);
  const [arrivalTick, setArrivalTick] = useState(0);
  const arrivalBox = useMemo(() => { if (!arrivalDest) return null; const b = arrivalBounds(arrivalDest); const r = (v: number) => Math.round(v * 1e5) / 1e5; return { south: r(b.south), north: r(b.north), west: r(b.west), east: r(b.east) }; }, [arrivalDest?.lat, arrivalDest?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const arrivalStreetQuery = trpc.govapark.street.list.useQuery(arrivalBox ?? { south: 0, north: 0.01, west: 0, east: 0.01 }, { enabled: arrivalBox !== null && online, refetchInterval: 30000 });
  useEffect(() => {
    setArrivalLoad(null);
    if (!arrivalDest) return;
    let alive = true;
    void loadParisSpots(arrivalBounds(arrivalDest), arrivalDest, new Set(VEHICLE_SPOT_TYPES[arrivalVehicle])).then((load) => { if (alive) setArrivalLoad(load); });
    return () => { alive = false; };
  }, [arrivalDest?.lat, arrivalDest?.lng, arrivalVehicle]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!arrivalDest) return; const timer = window.setInterval(() => setArrivalTick((n) => n + 1), 30000); return () => window.clearInterval(timer); }, [arrivalDest?.lat, arrivalDest?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const arrival = useMemo(() => {
    if (!arrivalDest) return null;
    const views = online && arrivalStreetQuery.data ? arrivalReports(arrivalStreetQuery.data.spots, arrivalDest, arrivalVehicle, new Date()) : null;
    if (arrivalLoad?.status !== "ok" || arrivalLoad.mode !== "detail") return { state: arrivalLoad === null ? "loading" as const : "unavailable" as const, count: null, views, sentence: null };
    const count = countStreetPlaces(arrivalLoad.spots, arrivalDest, arrivalVehicle);
    return { state: "ok" as const, count, views, sentence: arrivalSentence(count, views, arrivalVehicle) };
  }, [arrivalDest?.lat, arrivalDest?.lng, arrivalVehicle, arrivalLoad, arrivalStreetQuery.data, online, arrivalTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const arrivalPaid = arrival?.count?.paidSections ?? 0;
  useEffect(() => {
    setArrivalTariff(null);
    if (!arrivalDest || arrivalPaid === 0) return;
    let alive = true;
    void loadTariffs().then((file) => { if (alive) setArrivalTariff(tariffLineFor(file, arrivalVehicle === "moto" ? SPOT_TYPE.moto : SPOT_TYPE.paid, arrivalDest.lat, arrivalDest.lng)); });
    return () => { alive = false; };
  }, [arrivalDest?.lat, arrivalDest?.lng, arrivalVehicle, arrivalPaid]); // eslint-disable-line react-hooks/exhaustive-deps
  // Bornes de recharge (IRVE) : couche « Bornes de recharge » OU type « Électrique » du sélecteur (affichage seulement, ni signalement ni disponibilité).
  const [chargeOn, setChargeOn] = useState(initialLayers.charge);
  const [irveDate, setIrveDate] = useState<string | null>(null);
  const [selectedIrve, setSelectedIrve] = useState<{ lat: number; lng: number; props: Array<string | number | null> } | null>(null);
  const irveShown = chargeOn || displayType === "ev";
  useEffect(() => { if (irveShown) void loadLayerIndex("/data/paris-irve").then((index) => setIrveDate(index?.dataDate ?? null)).catch(() => setIrveDate(null)); }, [irveShown]);
  useEffect(() => { saveLayerPrefs({ street: streetOn, paris: parisOn, forbidden: forbiddenOn, works: worksOn, zfe: zfeOn, charge: chargeOn }); }, [streetOn, parisOn, forbiddenOn, worksOn, zfeOn, chargeOn]);
  // Tarifs de stationnement : date du fichier pour le panneau « i » (la ligne de fiche n'apparaît que pour une place payante).
  const [tariffDate, setTariffDate] = useState<string | null | undefined>(undefined);
  useEffect(() => { if (parisOn) void loadTariffs().then((file) => setTariffDate(file ? file.dataDate : undefined)); }, [parisOn]);
  useEffect(() => { if (worksOn) void loadLayerIndex("/data/paris-works").then((index) => setWorksDate(index?.dataDate ?? null)).catch(() => setWorksDate(null)); }, [worksOn]);
  // Contexte de la fiche (tarif confirmé, alertes proches), lu dans les couches de données autour de la place sélectionnée.
  const [spotCtx, setSpotCtx] = useState<SpotContext>({ tariff: null, alerts: [] });
  useEffect(() => {
    setSpotCtx({ tariff: null, alerts: [] });
    const point = selectedParis ? { lat: selectedParis.lat, lng: selectedParis.lng, t: selectedParis.t } : null;
    const streetPoint = !point && selectedStreetId != null ? streetSpots.find((spot) => spot.id === selectedStreetId) : null;
    const at = point ?? (streetPoint ? { lat: streetPoint.latitude, lng: streetPoint.longitude, t: 0 } : null);
    if (!at) return;
    let cancelled = false;
    void spotContext(at.lat, at.lng, at.t).then((context) => { if (!cancelled) setSpotCtx(context); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedParis, selectedStreetId]);
  const streetInput = useMemo(() => {
    const r = (v: number) => Math.round(v * 1000) / 1000;
    const b = visibleBounds ?? { south: visibleCenter.lat - 0.01, north: visibleCenter.lat + 0.01, west: visibleCenter.lng - 0.015, east: visibleCenter.lng + 0.015 };
    if (b.north - b.south > STREET_RULES.maxSpanDeg - 0.01 || b.east - b.west > STREET_RULES.maxSpanDeg - 0.01) return null; // trop dézoomé : on ne charge rien
    return { south: r(b.south), north: r(b.north), west: r(b.west), east: r(b.east), limit: STREET_RULES.defaultLimit };
  }, [visibleBounds, visibleCenter.lat, visibleCenter.lng]);
  const streetQuery = trpc.govapark.street.list.useQuery(streetInput ?? { south: 0, north: 0.01, west: 0, east: 0.01 }, { enabled: streetOn && online && streetInput !== null, refetchInterval: 15000, placeholderData: (previous) => previous });
  type StreetSpotData = NonNullable<typeof streetQuery.data>["spots"][number];
  const streetSpots = useMemo<StreetSpotData[]>(() => (streetOn && online && streetInput ? streetQuery.data?.spots ?? [] : []), [streetOn, online, streetInput, streetQuery.data]);
  const streetPanelState: StreetPanelState = !streetOn ? "off" : !online ? "offline" : streetInput === null ? "zoom" : streetQuery.isError ? "error" : streetQuery.isLoading ? "loading" : "ok";
  const selectedStreet = streetSpots.find((spot) => spot.id === selectedStreetId) ?? null;
  // Compteur, liste « Places près de… » et « Je me gare » : seulement les signalements du type de véhicule choisi. La carte montre tous les types avec « Tout ».
  // Type d'affichage seulement (PMR) : aucun signalement possible, donc aucune place en rue, aucun compteur, aucune barre « Je libère / Je me gare ».
  const streetOfVehicle = useMemo(() => (displayType ? [] : streetSpots.filter((spot) => spot.vehicleType === vehicle)), [streetSpots, vehicle, displayType]);
  useEffect(() => {
    if (!parisOn || !visibleBounds) { setParisLoad(null); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const result = await loadParisSpots(visibleBounds, visibleCenter, parisTypes);
      if (!cancelled) { setParisLoad(result); if (result.status === "ok") setParisRegimes(result.regimes); }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [parisOn, visibleBounds, visibleCenter, parisTypes, online]);
  // Fusion : un signalement à moins de 15 m d'un emplacement le colore ; ce signalement n'est alors plus dessiné à part.
  const parisMerged = useMemo(() => {
    const officials: OfficialSpot[] = parisLoad?.status === "ok" ? parisLoad.spots : [];
    if (parisLoad?.status !== "ok" || parisLoad.mode !== "detail") return { gray: officials.map((s): ParisSpot => ({ ...s, color: "gray", reportId: 0 })), hot: [] as ParisSpot[], matched: new Set<number>() };
    // Un signalement ne colore que les places du MÊME type de véhicule (un signalement moto ne colore jamais une place voiture).
    const merged = mergeByVehicle(officials, streetSpots.map((r) => ({ id: r.id, latitude: r.latitude, longitude: r.longitude, color: r.color, reportedAt: r.reportedAt, vehicleType: r.vehicleType })));
    return { gray: merged.spots.filter((x) => x.reportId === 0), hot: merged.spots.filter((x) => x.reportId !== 0), matched: merged.matchedReportIds };
  }, [parisLoad, streetSpots]);
  const streetSpotsOnMap = useMemo(() => (displayType ? [] : vehicleChoice.all ? streetSpots : streetOfVehicle).filter((x) => !parisMerged.matched.has(x.id)), [streetSpots, streetOfVehicle, vehicleChoice.all, displayType, parisMerged]);
  const [streetDone, setStreetDone] = useState<"free" | "taken" | null>(null);
  useEffect(() => { if (!streetDone) return; const t = window.setTimeout(() => setStreetDone(null), 1500); return () => window.clearTimeout(t); }, [streetDone]);
  const streetCreate = trpc.govapark.street.create.useMutation({
    onSuccess: (result, variables) => {
      setStreetDone(variables.status);
      toast.success(reportSuccessText(variables.status, result.example, variables.vehicleType), { duration: 6000 });
      setSelectedStreetId(null); utils.govapark.street.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  // Signaler une place en rue : la position GPS de l'appareil est demandée au toucher (obligatoire pour SIGNALER seulement, vérifiée par le serveur).
  // Chaque toucher a une réponse visible : bouton « Localisation… » puis « Envoi… », puis toast de confirmation ou message court.
  const reportStreet = async (status: "free" | "taken", spot?: { latitude: number; longitude: number }, forVehicle: VehicleType = vehicle) => {
    if (!isAuthenticated) { toast.message("Connectez-vous pour signaler une place.", { id: "street-report" }); requireAuth(); return; }
    setStreetLocating(true);
    try {
      const device = await getDevicePosition();
      // Signalement seulement : position à 50 m près et de moins de 30 s, sinon refus clair (le bouton « Ma position » n'est pas concerné).
      const issue = reportPositionIssue(device);
      if (issue) { toast.error(issue, { id: "street-report", duration: 9000 }); return; }
      let place = { latitude: device.latitude, longitude: device.longitude };
      if (spot) place = { latitude: spot.latitude, longitude: spot.longitude };
      else if (status === "taken") {
        // « Je me gare » : si une place verte ou orange est à moins de 50 m, c'est elle qui passe en rouge.
        const near = streetSpots.filter((s) => s.vehicleType === forVehicle && s.status === "free" && distanceMeters(device.latitude, device.longitude, s.latitude, s.longitude) <= STREET_RULES.deviceMaxMeters)
          .sort((a, b) => distanceMeters(device.latitude, device.longitude, a.latitude, a.longitude) - distanceMeters(device.latitude, device.longitude, b.latitude, b.longitude))[0];
        if (near) place = { latitude: near.latitude, longitude: near.longitude };
      }
      streetCreate.mutate({ status, vehicleType: forVehicle, ...place, deviceLatitude: device.latitude, deviceLongitude: device.longitude });
    } catch (error) {
      toast.error(error instanceof GeolocError ? error.message : "Signalement impossible pour le moment.", { id: "street-report", duration: 9000 });
    } finally { setStreetLocating(false); }
  };
  const filtered = useMemo(() => listings.filter((listing) => {
    const distance = distanceMeters(visibleCenter.lat, visibleCenter.lng, listing.latitude, listing.longitude) / 1000;
    return listing.hourlyCents <= filters.maxPrice && distance <= filters.maxDistance &&
      (filters.type === "tous" || listing.placeType === filters.type) &&
      (filters.covered === "tous" || (filters.covered === "couvert" ? listing.covered : !listing.covered)) &&
      listing.heightCm >= filters.minHeight &&
      (!onlyAvailable || listing.currentAvailability === "available");
  }), [listings, filters, visibleCenter, onlyAvailable]);
  const confirmedIds = useMemo(() => new Set((myReservations.data ?? []).filter((r) => ["confirmed", "in_progress"].includes(r.status)).map((r) => r.listingId)), [myReservations.data]);
  const selectedReport = reports.find((report) => report.id === selectedReportId) ?? null;
  const routeListingIds = useMemo(() => new Set(drivingRoute ? listings.filter((item) => item.currentAvailability === "available" && distanceToRoute({lat:item.latitude,lng:item.longitude}, drivingRoute.coordinates) <= 900).map((item) => item.id) : []), [drivingRoute, listings]);
  const routeListings = useMemo(() => listings.filter((item) => routeListingIds.has(item.id)), [listings, routeListingIds]);
  const routeStreetReports = useMemo(() => drivingRoute ? reports.filter((item) => item.kind === "free" && distanceToRoute({lat:item.latitude,lng:item.longitude}, drivingRoute.coordinates) <= 600) : [], [drivingRoute,reports]);
  // Prévision prudente : uniquement les départs annoncés par la communauté,
  // pondérés par leur fraîcheur, leur confiance et l'heure estimée.
  const predictedDepartures = useMemo(() => {
    const now = Date.now();
    const reference = userPosition ?? visibleCenter;
    return reports.flatMap((report) => {
      if (report.kind !== "departure" || !report.estimatedDeparture) return [];
      const departureTime = new Date(report.estimatedDeparture).getTime();
      const minutesUntil = (departureTime - now) / 60000;
      if (!Number.isFinite(departureTime) || minutesUntil < -5 || minutesUntil > 60) return [];
      const ageMinutes = Math.max(0, (now - new Date(report.updatedAt).getTime()) / 60000);
      if (ageMinutes > 30) return [];
      const timeScore = Math.max(0, 100 - Math.abs(minutesUntil - 15) * 1.45);
      const freshnessScore = Math.max(0, 100 - ageMinutes * 3.2);
      const confidence = Math.max(0, Math.min(100, report.confidence ?? 50));
      const index = Math.round(confidence * 0.55 + timeScore * 0.25 + freshnessScore * 0.20);
      return [{ ...report, minutesUntil: Math.max(0, Math.round(minutesUntil)), distance: distanceMeters(reference.lat, reference.lng, report.latitude, report.longitude), potentialIndex: index }];
    }).filter((report) => report.distance <= 5000).sort((a,b) => b.potentialIndex - a.potentialIndex).slice(0, 5);
  }, [reports, userPosition, visibleCenter]);
  const listingSuggestions: AddressSuggestion[] = search.length > 1 ? listings.filter((l) => `${l.title} ${l.approxAddress}`.toLowerCase().includes(search.toLowerCase())).slice(0, 4).map((l) => ({ label: l.approxAddress, subtitle: l.title, lat: l.latitude, lng: l.longitude, kind: "listing" as const })) : [];
  const suggestions = [...listingSuggestions, ...addressSuggestions].slice(0, 6);

  // Recherche d’adresses : les annonces Govapark restent prioritaires, puis l’utilisateur
  // peut rechercher une vraie adresse/quartier pour déplacer la carte.
  useEffect(() => {
    const query = search.trim();
    if (query.length < 3) { setAddressSuggestions([]); setSearchingAddress(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchingAddress(true);
      try {
        const found = await geocodeFR(query, controller.signal);
        setAddressSuggestions(found);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setAddressSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearchingAddress(false);
      }
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search]);



  const createReport = trpc.govapark.community.create.useMutation({
    onSuccess: () => { toast.success("Signalement publié pour 30 minutes maximum"); setReportOpen(false); utils.govapark.community.list.invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const vote = trpc.govapark.community.vote.useMutation({
    onSuccess: () => { toast.success("Merci, le niveau de confiance a été mis à jour"); utils.govapark.community.list.invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const updateDeparture = trpc.govapark.community.updateDeparture.useMutation({ onSuccess: () => { toast.success("Heure de départ mise à jour"); utils.govapark.community.list.invalidate(); } });
  const stopDeparture = trpc.govapark.community.stopDeparture.useMutation({ onSuccess: () => { toast.success("Départ arrêté et retiré de la carte"); setSelectedReportId(null); utils.govapark.community.list.invalidate(); } });
  const autoRelease = trpc.govapark.community.autoRelease.useMutation({ onSuccess: () => { toast.success("Votre départ a été détecté : la place est signalée libre, à confirmer par la communauté."); setSelectedReportId(null); utils.govapark.community.list.invalidate(); }, onError: (error) => toast.error(error.message) });

  // « Ma position » : CHAQUE toucher redemande la position (essai précis, puis essai réseau si le GPS tarde), centre la carte et
  // affiche le point bleu. Aucun état « refusé » n'est mémorisé. soft = true (bouton Démarrer) : message discret au lieu d'un toast.
  const applyPosition = (position: { latitude: number; longitude: number; accuracy: number }, speed: number | null | undefined, centre: boolean) => {
    const next = { lat: position.latitude, lng: position.longitude, accuracy: position.accuracy };
    setUserPosition(next);
    if (speed !== undefined) setSpeedKmh(speed == null ? null : Math.max(0, Math.round(speed * 3.6)));
    setTrackingGps(true); setGpsNote(null);
    if (centre) { setTarget({ lat: next.lat, lng: next.lng }); setVisibleCenter({ lat: next.lat, lng: next.lng }); gpsInitialized.current = true; }
    else if (navFollowRef.current.active && navFollowRef.current.follow) {
      // En navigation (recentrage actif) seulement : suivi doux du véhicule, recentrer après environ 50 m de déplacement.
      // Hors navigation, seule la position (point bleu) change : la carte reste là où l'utilisateur l'a mise.
      setTarget((previous) => {
        const moved = Math.hypot((next.lat - previous.lat) * 111000, (next.lng - previous.lng) * 75000);
        return moved >= 50 ? { lat: next.lat, lng: next.lng } : previous;
      });
    }
  };
  const startWatch = () => {
    if (watchId.current !== null || !navigator.geolocation) return;
    // Suivi en continu une fois la première position obtenue ; ses erreurs ne cassent rien (le diagnostic les garde).
    watchId.current = navigator.geolocation.watchPosition(
      (p) => applyPosition({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }, p.coords.speed, false),
      (e) => noteGeolocError(e.code),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 60000 },
    );
  };
  // opening = true : demande sans geste (ouverture de la carte, retour depuis une fiche) : centre au plus une fois, seulement si
  // l'utilisateur n'a encore rien choisi, et SANS suivi continu. Le suivi (startWatch) ne part que d'un toucher sur « Ma position » ou de la navigation.
  const wantWatch = useRef(false);
  const locate = async (soft = false, opening = false) => {
    if (!opening) wantWatch.current = true; // demandé pendant une autre recherche : le suivi démarrera à la fin de celle-ci
    if (locatingRef.current) return; // pas d'appels concurrents
    locatingRef.current = true; setLocating(true);
    try {
      const device = await getDevicePosition(); // lancé directement dans le geste de l'utilisateur
      applyPosition(device, undefined, !opening || !mapIntent.current);
      if (!soft) toast.success(device.accuracy > 500 ? `Position approximative (± ${Math.round(device.accuracy)} m)` : "Vous êtes ici", { id: "locate" });
      if (wantWatch.current) startWatch();
    } catch (error) {
      const message = error instanceof GeolocError ? error.message : "Position indisponible pour le moment. Réessayez.";
      setGpsNote(message);
      if (!soft) toast.error(message, { id: "locate", duration: 15000 });
    } finally { locatingRef.current = false; setLocating(false); }
  };
  useEffect(() => () => { if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current); }, []);
  // À l'ouverture : demande la position une seule fois (message discret, pas de toast), point bleu et centrage unique, sans suivi continu.
  // Un refus ne bloque rien : « Ma position » redemande à chaque toucher.
  useEffect(() => { if (!gpsInitialized.current) void locate(true, true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submitReport = () => {
    createReport.mutate({ kind: reportKind, latitude: visibleCenter.lat, longitude: visibleCenter.lng, address: reportAddress,
      estimatedDeparture: reportKind === "departure" ? new Date(departureAt) : undefined });
  };
  const requireAuth = () => { sessionStorage.setItem("govaparkReturn", "/"); navigate("/login"); };
  const refreshRouteServices = async (route: DrivingRoute) => {
    setRouteServices([]);
    try {
      const samples=route.coordinates.filter((_,i)=>i%Math.max(1,Math.floor(route.coordinates.length/7))===0).slice(0,8);
      const clauses=samples.flatMap(pt=>[
        `node(around:1400,${pt[0]},${pt[1]})[amenity=charging_station];way(around:1400,${pt[0]},${pt[1]})[amenity=charging_station];`,
        `node(around:1400,${pt[0]},${pt[1]})[highway~"^(rest_area|services)$"];way(around:1400,${pt[0]},${pt[1]})[highway~"^(rest_area|services)$"];`,
        `node(around:1400,${pt[0]},${pt[1]})[amenity=parking];way(around:1400,${pt[0]},${pt[1]})[amenity=parking];`,
        `node(around:1400,${pt[0]},${pt[1]})[hgv=designated];way(around:1400,${pt[0]},${pt[1]})[hgv=designated];`,
        `node(around:1400,${pt[0]},${pt[1]})[amenity=restaurant];way(around:1400,${pt[0]},${pt[1]})[amenity=restaurant];`,
        `node(around:1400,${pt[0]},${pt[1]})[amenity=fuel];way(around:1400,${pt[0]},${pt[1]})[amenity=fuel];`
      ]);
      const query=`[out:json][timeout:25];(${clauses.join("")});out center tags;`;
      void query; // Overpass désactivé : on n'affiche que les stations-service du flux officiel, le long du trajet
      const response={ok:false} as Response;
      const found:RouteService[]=[];
      if(response.ok){const payload=await response.json() as {elements?:Array<{id:number;lat?:number;lon?:number;center?:{lat:number;lon:number};tags?:Record<string,string>}>};
        for(const item of payload.elements??[]){const lat=item.lat??item.center?.lat,lng=item.lon??item.center?.lon,tags=item.tags??{};if(lat==null||lng==null||distanceToRoute({lat,lng},route.coordinates)>1600)continue;
          let kind:RouteService["kind"]|null=null;if(tags.amenity==="charging_station")kind="charge";else if(tags.highway==="rest_area"||tags.highway==="services")kind="rest";else if(tags.hgv==="designated"||tags.amenity==="parking"&&tags.hgv)kind="truck";else if(tags.amenity==="parking")kind="parking";else if(tags.amenity==="restaurant")kind="restaurant";else if(tags.amenity==="fuel")kind="fuel";if(!kind)continue;
          found.push({id:`osm-${item.id}`,lat,lng,name:tags.name??(kind==="charge"?"Borne de recharge":kind==="rest"?"Aire de repos":kind==="truck"?"Stationnement poids lourds":kind==="parking"?"Parking":kind==="restaurant"?"Restauration":"Station-service"),kind,detail:[tags.operator,tags.capacity?`${tags.capacity} places`:null,tags.cuisine].filter(Boolean).join(" · ")});
        }
      }
      const mid=route.coordinates[Math.floor(route.coordinates.length/2)];
      const where=`within_distance(geom, geom'POINT (${mid[1]} ${mid[0]})', 18000m)`;
      const fields="id,geom,adresse,ville,gazole_prix,gazole_maj,e10_prix,e10_maj,sp98_prix,sp98_maj,sp95_prix,sp95_maj,e85_prix,e85_maj,services_service";
      const fuelUrl=`https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?limit=100&select=${encodeURIComponent(fields)}&where=${encodeURIComponent(where)}`;
      const fuelResponse=await fetch(fuelUrl);
      if(fuelResponse.ok){const fuelData=await fuelResponse.json() as {results?:Array<{id:number;geom?:{lat:number;lon:number};adresse?:string;ville?:string;gazole_prix?:number;e10_prix?:number;sp98_prix?:number;sp95_prix?:number;e85_prix?:number;gazole_maj?:string;e10_maj?:string;sp98_maj?:string;sp95_maj?:string;e85_maj?:string;services_service?:string[]}>};
        const field=({gazole:"gazole_prix",e10:"e10_prix",sp98:"sp98_prix",sp95:"sp95_prix",e85:"e85_prix"} as const)[routeFuelType];const updateField=({gazole:"gazole_maj",e10:"e10_maj",sp98:"sp98_maj",sp95:"sp95_maj",e85:"e85_maj"} as const)[routeFuelType];
        for(const station of fuelData.results??[]){const lat=station.geom?.lat,lng=station.geom?.lon,price=station[field];if(lat==null||lng==null||price==null||distanceToRoute({lat,lng},route.coordinates)>800)continue;const truck=station.services_service?.some(service=>/piste poids lourds/i.test(service))??false;found.push({id:`fuel-${station.id}`,lat,lng,name:`${station.adresse??"Station"}, ${station.ville??""}`.trim(),kind:truck?"truck":"fuel",price,priceUpdated:station[updateField],detail:station.services_service?.join(" · ")});}
      }
      setRouteServices(found.slice(0,6));
    }catch{toast.message("Les services routiers sont temporairement indisponibles. Le trajet reste affiché.");}
  };

  const startRoute = async (listingId: number) => {
    const destination = listings.find((item) => item.id === listingId);
    if (!destination) return;
    originRef.current = { lat: visibleCenter.lat, lng: visibleCenter.lng };
    await calculateRoutes({ lat: destination.latitude, lng: destination.longitude }, destination.title, listingId, { kind: "listing" });
  };

  const calculateRoutes = async (destination: {lat:number;lng:number}, destinationName: string, listingId = 0, info?: Partial<NavDest>, mode?: VehicleType) => {
    // `mode` : onglet de mode touché sur l'écran de trajet (la préférence « Mon véhicule » n'a pas encore eu le temps de changer). Sinon le véhicule choisi.
    const veh: VehicleType = mode ?? vehicle;
    mapIntent.current = true;
    const consumption = mode ? (DEFAULT_CONSUMPTION[mode] || DEFAULT_CONSUMPTION.car) : fuelConsumption;
    const fuelKind: typeof routeFuelType = mode ? (mode === "moto" ? "e10" : "gazole") : routeFuelType;
    setNavDest({ lat: destination.lat, lng: destination.lng, label: destinationName || "Destination", kind: "address", ...info });
    // Départ : position GPS si elle est déjà connue, sinon centre de la carte (celui d'avant la recherche de destination).
    // On n'attend JAMAIS la géolocalisation (refusée, indisponible ou en attente d'autorisation) : le trajet part tout de suite.
    const origin: { lat: number; lng: number } = userPosition ?? originRef.current ?? { lat: visibleCenter.lat, lng: visibleCenter.lng };
    setOriginNote(userPosition ? null : "Départ : ancien centre de la carte (position GPS non activée)");
    if (!Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) return;
    if (isSamePlace(origin, destination)) {
      // Départ = position réelle : on est déjà sur place. Départ = simple centre de la carte : ce n'est pas une position, on le dit sans erreur.
      setNavDest(null);
      toast.message(userPosition ? "Vous êtes à moins de 100 m de cette destination." : "Position non activée : touchez « Ma position » (la cible en haut) pour calculer le trajet depuis chez vous.", { id: "route-near" });
      return;
    }
    lastTrip.current = { origin: { lat: origin.lat, lng: origin.lng }, dest: { lat: destination.lat, lng: destination.lng } };
    setRouteLoading(true); setRouteOptions([]); setRouteServices([]);
    try {
      // Plusieurs serveurs de calcul d'itinéraire : si le premier est saturé ou injoignable, on essaie le suivant.
      const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
      // Voiture, livraison et moto : réseau routier voiture. Vélo : service gratuit routing.openstreetmap.de (profil vélo), appelé pour ce profil seulement.
      const endpoints = routeEndpoints(veh, coords);
      let response: Response | null = null;
      for (const url of endpoints) {
        try {
          const attempt = await fetch(url, { signal: AbortSignal.timeout(12000) });
          if (attempt.ok) { response = attempt; break; }
        } catch { /* serveur suivant */ }
      }
      if (!response) {
        // Pas d'itinéraire fabriqué : distance à vol d'oiseau et ligne droite étiquetée, sans guidage.
        const km = straightLineKm(origin.lat, origin.lng, destination.lat, destination.lng);
        const est = veh === "bike" ? straightLineEstimate(origin, destination) : null;
        const line: DrivingRoute = est
          ? { id: "offline-line", label: "À vol d’oiseau, estimation (service vélo injoignable)", coordinates: [[origin.lat, origin.lng], [destination.lat, destination.lng]], distance: est.distanceM, duration: est.durationS, destinationId: listingId, steps: [], offline: true, estimate: true, costEur: 0, profile: "bike" }
          : { id: "offline-line", label: navigator.onLine === false ? "Itinéraire indisponible hors ligne" : "Itinéraire indisponible (service injoignable)", coordinates: [[origin.lat, origin.lng], [destination.lat, destination.lng]], distance: km * 1000, duration: 0, destinationId: listingId, steps: [], offline: true };
        setRouteOptions([line]); setDrivingRoute(line);
        return;
      }
      const data = await response.json() as { routes?: Array<{geometry:{coordinates:[number,number][]};distance:number;duration:number;legs?:Array<{steps?:Array<{distance:number;name?:string;mode?:string;maneuver?:{type?:string;modifier?:string;location:[number,number]}}>}>}>};
      const rawRoutes = data.routes ?? [];
      if (!rawRoutes.length) throw new Error("Aucun itinéraire trouvé");
      // Alternatives : uniquement celles que le service d'itinéraire renvoie (3 au plus). Aucun trajet n'est fabriqué par un point de passage décalé ; une seule route reçue = une seule route montrée.
      const mapped: DrivingRoute[] = capAlternatives(rawRoutes.map((route) => ({ route, distance: route.distance, duration: route.duration, coordinates: route.geometry.coordinates }))).map(({ route }, index) => {
        const rawSteps = route.legs?.flatMap((leg) => leg.steps ?? []) ?? [];
        const steps: RouteStep[] = mapOsrmSteps(rawSteps as Parameters<typeof mapOsrmSteps>[0], [destination.lat, destination.lng]);
        return { id: `route-${index}`, label: `Option ${index+1}`, coordinates:route.geometry.coordinates.map(([lng,lat])=>[lat,lng]), distance:route.distance, duration:route.duration, destinationId:listingId, steps, profile: veh, via: viaRoad(steps) };
      });
      if (veh === "bike") {
        // Vélo : durée du service (sinon 15 km/h), coût 0 €, pas de carburant ni de station. Les alternatives du service sont gardées telles quelles.
        const bikeRoutes = mapped.map((r) => ({ ...r, duration: bikeDurationSeconds(r.duration, r.distance), costEur: 0 }));
        const quickest = [...bikeRoutes].sort((x, y) => x.duration - y.duration)[0];
        const labelledBike = bikeRoutes.map((r) => ({ ...r, label: r.id === quickest.id ? "Le plus rapide" : "Alternative" }));
        setRouteOptions(labelledBike);
        const chosen = labelledBike.find((r) => r.id === quickest.id) ?? labelledBike[0];
        setDrivingRoute(chosen); spokenStepIndex.current = 0;
        return;
      }
      const fields="id,geom,adresse,ville,gazole_prix,gazole_maj,e10_prix,e10_maj,sp98_prix,sp98_maj,sp95_prix,sp95_maj,e85_prix,e85_maj,services_service";
      const field=({gazole:"gazole_prix",e10:"e10_prix",sp98:"sp98_prix",sp95:"sp95_prix",e85:"e85_prix"} as const)[fuelKind]; const updateField=({gazole:"gazole_maj",e10:"e10_maj",sp98:"sp98_maj",sp95:"sp95_maj",e85:"e85_maj"} as const)[fuelKind];
      const fuelResults=await Promise.all(mapped.map(async route=>{
        const mid=route.coordinates[Math.floor(route.coordinates.length/2)];
        const where=`within_distance(geom, geom'POINT (${mid[1]} ${mid[0]})', 18000m)`;
        const fuelUrl=`https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?limit=100&select=${encodeURIComponent(fields)}&where=${encodeURIComponent(where)}`;
        try {
          const fuelResponse=await fetch(fuelUrl); if(!fuelResponse.ok)return {route,stations:[] as RouteService[]};
          const fuelData=await fuelResponse.json() as {results?:Array<{id:number;geom?:{lat:number;lon:number};adresse?:string;ville?:string;gazole_prix?:number;e10_prix?:number;sp98_prix?:number;sp95_prix?:number;e85_prix?:number;gazole_maj?:string;e10_maj?:string;sp98_maj?:string;sp95_maj?:string;e85_maj?:string;services_service?:string[]}>};
          const stations=(fuelData.results??[]).flatMap(station=>{const lat=station.geom?.lat,lng=station.geom?.lon,price=station[field];if(lat==null||lng==null||price==null||distanceToRoute({lat,lng},route.coordinates)>12000)return[];return[{id:`fuel-${station.id}`,lat,lng,name:`${station.adresse??"Station"}, ${station.ville??""}`.trim(),kind:(station.services_service?.some(service=>/piste poids lourds/i.test(service))?"truck":"fuel") as "truck"|"fuel",price,priceUpdated:station[updateField],detail:station.services_service?.join(" · ")}];}).sort((a,b)=>(a.price??999)-(b.price??999));
          return {route,stations};
        } catch { return {route,stations:[] as RouteService[]}; }
      }));
      const pricedRoutes=fuelResults.map(({route,stations})=>{const cheapest=stations[0]?.price;return {...route,fuelPrice:cheapest,fuelCost:cheapest==null?undefined:tripCostEur(veh,route.distance,consumption,cheapest),costEur:tripCostEur(veh,route.distance,consumption,cheapest??DEFAULT_FUEL_PRICE_EUR_L),costAssumed:cheapest==null};});
      const fastest=[...pricedRoutes].sort((a,b)=>a.duration-b.duration)[0];
      const costRank=[...pricedRoutes].filter(r=>r.fuelCost!=null).sort((a,b)=>(a.fuelCost??Infinity)-(b.fuelCost??Infinity));
      const cheapest=costRank.find(r=>r.id!==fastest.id)??costRank[0]??[...pricedRoutes].filter(r=>r.id!==fastest.id).sort((a,b)=>a.distance-b.distance)[0]??fastest;
      const remaining=pricedRoutes.filter(r=>r.id!==fastest.id&&r.id!==cheapest.id);
      const durations=pricedRoutes.map(r=>r.duration),distances=pricedRoutes.map(r=>r.distance),costs=pricedRoutes.flatMap(r=>r.fuelCost==null?[]:[r.fuelCost]);
      const norm=(value:number,values:number[])=>values.length<2||Math.max(...values)===Math.min(...values)?0:(value-Math.min(...values))/(Math.max(...values)-Math.min(...values));
      const bestValue=[...remaining].sort((a,b)=>{
        const score=(r:DrivingRoute)=>costs.length?0.35*norm(r.duration,durations)+0.2*norm(r.distance,distances)+0.45*(r.fuelCost==null?0.5:norm(r.fuelCost,costs)):0.55*norm(r.duration,durations)+0.45*norm(r.distance,distances);
        return score(a)-score(b);
      })[0]??remaining[0];
      const labelled=pricedRoutes.map(route=>({...route,label:route.id===fastest.id?"Le plus rapide":route.id===cheapest.id?(costRank.length?"Le moins cher":"Le plus court · prix indisponible"):bestValue&&route.id===bestValue.id?(bestValue.fuelCost!=null?"Meilleur rapport qualité/prix":"Meilleur compromis · prix incomplet"):"Alternative"}));
      setRouteOptions(labelled);
      const selected=labelled.find(route=>route.id===(bestValue?.id??cheapest.id))??labelled[0];
      setDrivingRoute(selected);
      void refreshRouteServices(selected);
      const bestPrice=fuelResults.find(item=>item.route.id===selected.id)?.stations[0]?.price;
      if(bestPrice!=null) toast.message(`Prix indicatif carburant repéré : ${bestPrice.toFixed(3)} €/L`);
      spokenStepIndex.current=0;
    } catch(error){toast.error(error instanceof Error?error.message:"Impossible de calculer l’itinéraire");}
    finally{setRouteLoading(false);}
  };
  // Guidage vocal déclenché uniquement après activation explicite par le conducteur.
  useEffect(() => {
    if (navActive || !voiceGuidanceEnabled || !userPosition || !drivingRoute || !("speechSynthesis" in window)) return;
    const steps = drivingRoute.steps;
    while (spokenStepIndex.current < steps.length) {
      const step = steps[spokenStepIndex.current];
      const distance = distanceMeters(userPosition.lat, userPosition.lng, step.location[0], step.location[1]);
      if (distance > 280) break;
      const utterance = new SpeechSynthesisUtterance(step.instruction);
      utterance.lang = "fr-FR";
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
      spokenStepIndex.current += 1;
    }
  }, [navActive, voiceGuidanceEnabled, userPosition, drivingRoute]);

  const enableBackgroundAlerts = async () => {
    if (!("serviceWorker" in navigator) || !("Notification" in window)) {
      toast.error("Les alertes en arrière-plan ne sont pas prises en charge ici");
      return;
    }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") { toast.error("Autorisez les notifications pour recevoir les alertes"); return; }
    try {
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({ type: "GOVAPARK_ENABLE_PARKING_ALERTS" });
      setBackgroundAlertsEnabled(true);
      toast.success("Notifications système activées. Les alertes distantes nécessitent encore le serveur push GOVAPARK.");
    } catch { toast.error("Impossible d'activer les notifications système"); }
  };

  const enableProximityAlerts = async () => {
    if (!("Notification" in window)) { toast.error("Les notifications ne sont pas prises en charge par ce navigateur"); return; }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") { toast.error("Autorisez les notifications pour recevoir les alertes"); return; }
    setProximityAlertsEnabled(true); toast.success("Alertes de proximité activées sur cet appareil");
  };
  useEffect(() => {
    if (!proximityAlertsEnabled || !userPosition) return;
    for (const item of listings) {
      if (item.currentAvailability !== "available" || alertedListingIds.current.has(item.id)) continue;
      const distance = distanceMeters(userPosition.lat,userPosition.lng,item.latitude,item.longitude);
      if (distance <= 800) {
        alertedListingIds.current.add(item.id);
        if (Notification.permission === "granted") { try { new Notification("Place disponible près de vous", { body: `${item.title} · à ${Math.round(distance)} m · ouvrez GOVAPARK pour vérifier.` }); } catch { /* notifications système indisponibles dans ce contexte */ } }
        toast.message(`Place disponible à ${Math.round(distance)} m : ${item.title}`);
      }
    }
  }, [proximityAlertsEnabled, userPosition, listings]);

  const nearby = useMemo(() => {
    const from = userPosition ?? visibleCenter;
    return [...filtered]
      .map((item) => ({ item, meters: distanceMeters(from.lat, from.lng, item.latitude, item.longitude) }))
      .sort((a, b) => a.meters - b.meters)
      .slice(0, 8);
  }, [filtered, userPosition, visibleCenter]);
  // Liste du bas : les places EN RUE signalées d'abord (libres avant prises, puis la plus proche), puis les places privées (jamais mêlées).
  const nearStreet = useMemo(() => {
    const from = userPosition ?? visibleCenter;
    const rank: Record<string, number> = { green: 0, orange: 1, red: 2, gray: 3 };
    return streetOfVehicle
      .map((spot) => ({ spot, meters: distanceMeters(from.lat, from.lng, spot.latitude, spot.longitude) }))
      .sort((a, b) => (rank[a.spot.color] ?? 3) - (rank[b.spot.color] ?? 3) || a.meters - b.meters)
      .slice(0, 8);
  }, [streetOfVehicle, userPosition, visibleCenter]);
  // Pendant un trajet : uniquement les places proches du trajet ou de l'arrivée.
  const routeEnd = drivingRoute ? drivingRoute.coordinates[drivingRoute.coordinates.length - 1] : null;
  const mapListings = useMemo(() => !drivingRoute || !routeEnd ? filtered : filtered.filter((item) => distanceMeters(routeEnd[0], routeEnd[1], item.latitude, item.longitude) <= 2500 || distanceToRoute({ lat: item.latitude, lng: item.longitude }, drivingRoute.coordinates) <= 1000), [filtered, drivingRoute, routeEnd]);
  const nearArrival = useMemo(() => !routeEnd ? [] : [...mapListings]
    .map((item) => ({ item, meters: distanceMeters(routeEnd[0], routeEnd[1], item.latitude, item.longitude) }))
    .sort((a, b) => (Number(b.item.currentAvailability === "available") - Number(a.item.currentAvailability === "available")) || a.meters - b.meters)
    .slice(0, 4), [mapListings, routeEnd]);
  // Une adresse choisie centre la carte (zoom rue) et affiche les places autour : AUCUN itinéraire n'est calculé ici.
  // Places autour de la destination choisie : places en rue signalées d'abord (libres avant prises, puis la plus proche), puis places privées.
  const destPlaces = useMemo(() => {
    if (!destination) return null;
    const rank: Record<string, number> = { green: 0, orange: 1, red: 2, gray: 3 };
    const street = streetOfVehicle
      .map((spot) => ({ spot, meters: distanceMeters(destination.lat, destination.lng, spot.latitude, spot.longitude) }))
      .filter((entry) => entry.meters <= DEST_STREET_RADIUS_M)
      .sort((a, b) => (rank[a.spot.color] ?? 3) - (rank[b.spot.color] ?? 3) || a.meters - b.meters)
      .slice(0, 8);
    const privatePlaces = filtered
      .map((item) => ({ item, meters: distanceMeters(destination.lat, destination.lng, item.latitude, item.longitude) }))
      .filter((entry) => entry.meters <= DEST_PRIVATE_RADIUS_M)
      .sort((a, b) => a.meters - b.meters)
      .slice(0, 4);
    return { street, privatePlaces };
  }, [destination, streetOfVehicle, filtered]);
  const chooseSuggestion = (suggestion: AddressSuggestion) => {
    // Définition d'un raccourci (Domicile, Travail, lieu nommé) : l'adresse est enregistrée sur l'appareil, la carte ne bouge pas.
    if (pendingFav) {
      updatePlaces(setFavorite(places, pendingFav.kind, suggestion, pendingFav.name));
      toast.message(`${pendingFav.kind === "custom" ? pendingFav.name : KIND_NAME[pendingFav.kind]} enregistré sur cet appareil.`, { id: "places" });
      setPendingFav(null); setNewFavName(null); setSearch(""); setSearchFocused(false);
      return;
    }
    updatePlaces(addRecent(places, suggestion, Date.now()));
    mapIntent.current = true;
    // Le point de départ d'un éventuel « Y aller » est mémorisé AVANT que la carte se recentre sur la destination.
    originRef.current = userPosition ? { lat: userPosition.lat, lng: userPosition.lng } : { lat: visibleCenter.lat, lng: visibleCenter.lng };
    setDrivingRoute(null); setRouteOptions([]); setRouteServices([]);
    setDestination({ lat: suggestion.lat, lng: suggestion.lng, label: suggestion.label });
    setSearch(suggestion.label); setSearchFocused(false);
    setStreetOn(true); setParisOn(true);
    setTarget({ lat: suggestion.lat, lng: suggestion.lng });
    setFocusRequest((previous) => ({ id: (previous?.id ?? 0) + 1, lat: suggestion.lat, lng: suggestion.lng, zoom: 17 }));
  };
  // Le panneau « raccourcis + récents » se ferme au toucher en dehors de la barre de recherche.
  useEffect(() => {
    if (!searchFocused) return;
    const close = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.(".m-search")) { setSearchFocused(false); setPendingFav(null); setNewFavName(null); } };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [searchFocused]);
  const startPending = (next: { kind: SavedKind; name?: string }) => { setPendingFav(next); setNewFavName(null); setSearch(""); setDestination(null); setSearchFocused(true); window.setTimeout(() => searchInputRef.current?.focus(), 0); };
  const pickSaved = (item: { label: string; lat: number; lng: number }) => chooseSuggestion({ label: item.label, lat: item.lat, lng: item.lng, kind: "address" });
  const toggleRoute = () => {
    if (drivingRoute) { setDrivingRoute(null); setRouteOptions([]); setRouteServices([]); return; }
    if (destination) { void calculateRoutes({ lat: destination.lat, lng: destination.lng }, destination.label); return; }
    if (search.trim().length > 0) { toast.message("Choisis une adresse dans les suggestions."); return; }
    const candidate = nearby.find((entry) => entry.item.currentAvailability === "available") ?? nearby[0];
    if (candidate) void startRoute(candidate.item.id); else toast.message("Cherche une destination pour calculer un trajet.");
  };
  const toggleVoice = () => {
    if (!drivingRoute) return;
    if (voiceGuidanceEnabled) { window.speechSynthesis?.cancel(); setVoiceGuidanceEnabled(false); toast.message("Guidage vocal arrêté"); return; }
    setVoiceGuidanceEnabled(true); spokenStepIndex.current = 0;
    const first = drivingRoute.steps[0];
    if (first && "speechSynthesis" in window) { const speech = new SpeechSynthesisUtterance(`Guidage vocal activé. ${first.instruction}`); speech.lang = "fr-FR"; window.speechSynthesis.speak(speech); spokenStepIndex.current = 1; }
  };
  // ----- Navigation plein écran -----
  const requestLocation = () => { if (watchId.current === null) void locate(true); };
  // Écran allumé pendant le guidage (Screen Wake Lock) : pris au démarrage, rendu à l'arrêt et à la sortie de la page,
  // repris au retour de visibilité (le navigateur le rend quand la page passe en arrière-plan). Silencieux si non pris en charge.
  type WakeLockLike = { released?: boolean; release: () => Promise<void> };
  const wakeLock = useRef<WakeLockLike | null>(null);
  const acquireWakeLock = async () => {
    try {
      const api = (navigator as unknown as { wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> } }).wakeLock;
      if (!api || document.visibilityState !== "visible" || (wakeLock.current && !wakeLock.current.released)) return;
      const lock = await api.request("screen");
      // Guidage arrêté pendant la demande : on rend aussitôt l'écran.
      if (!navFollowRef.current.active) { lock.release().catch(() => { /* déjà rendu */ }); return; }
      wakeLock.current = lock;
    } catch { /* refusé ou non pris en charge : sans effet */ }
  };
  const releaseWakeLock = () => {
    const lock = wakeLock.current; wakeLock.current = null;
    if (lock && !lock.released) lock.release().catch(() => { /* déjà rendu */ });
  };
  useEffect(() => {
    if (!navActive) { releaseWakeLock(); return; }
    const onVisible = () => { if (document.visibilityState === "visible") void acquireWakeLock(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [navActive]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => releaseWakeLock(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const startNavigation = () => {
    if (!drivingRoute || drivingRoute.offline || !navDest) return;
    setNavActive(true); setNavFollow(true); setRouteFocus((n) => n + 1);
    void acquireWakeLock(); // dans le geste de l'utilisateur
    // Position demandée sans bloquer : sans autorisation, le guidage démarre quand même depuis le départ choisi.
    requestLocation();
    // Premier message vocal dans le geste de l'utilisateur (obligatoire sur iPhone pour autoriser la voix).
    if (voiceSupported) { setVoiceGuidanceEnabled(true); try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance("Guidage démarré"); u.lang = "fr-FR"; window.speechSynthesis.speak(u); } catch { /* voix indisponible */ } }
  };
  const stopNavigation = () => {
    try { window.speechSynthesis?.cancel(); } catch { /* ignoré */ }
    releaseWakeLock();
    setNavActive(false); setDrivingRoute(null); setRouteOptions([]); setRouteServices([]);
  };
  const toggleNavVoice = () => {
    if (voiceGuidanceEnabled) { try { window.speechSynthesis?.cancel(); } catch { /* ignoré */ } setVoiceGuidanceEnabled(false); return; }
    setVoiceGuidanceEnabled(true);
  };
  // Recalcul : nouvel itinéraire depuis la position actuelle vers la même destination (OSRM public). Rien n'est inventé en cas d'échec.
  const rerouteFrom = async (from: { lat: number; lng: number }) => {
    if (!navDest) return false;
    const next = await fetchOsrmRoute(from, navDest);
    if (!next) return false;
    setDrivingRoute((previous) => ({ id: `route-nav-${Date.now()}`, label: "Recalculé", coordinates: next.coordinates, distance: next.distance, duration: next.duration, destinationId: previous?.destinationId ?? 0, steps: next.steps }));
    setOriginNote(null);
    return true;
  };
  useEffect(() => { if (!navActive) return; document.body.classList.add("is-navigating"); return () => document.body.classList.remove("is-navigating"); }, [navActive]);
  // Arrivée depuis une fiche (page place) : « Y aller » calcule le trajet depuis la POSITION de l'appareil, jamais depuis le centre de Paris.
  // Position déjà connue : calcul immédiat. Sinon elle est demandée, et le trajet est calculé dès qu'elle arrive (même plus tard, via « Ma position »).
  type GoTo = { lat: number; lng: number; label: string; id?: number };
  const goToHandled = useRef(false);
  const pendingGoTo = useRef<GoTo | null>(null);
  useEffect(() => {
    const goTo = (routerLocation.state as { goTo?: GoTo } | null)?.goTo;
    if (!goTo || goToHandled.current) return;
    goToHandled.current = true; mapIntent.current = true;
    navigate(".", { replace: true, state: null });
    setTarget({ lat: goTo.lat, lng: goTo.lng });
    if (userPosition) { void calculateRoutes({ lat: goTo.lat, lng: goTo.lng }, goTo.label, goTo.id ?? 0, { kind: "listing" }); return; }
    pendingGoTo.current = goTo;
    toast.message("Recherche de votre position pour calculer le trajet…", { id: "route-near" });
    void locate(true, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state]);
  useEffect(() => {
    const goTo = pendingGoTo.current;
    if (!goTo) return;
    if (userPosition) { pendingGoTo.current = null; void calculateRoutes({ lat: goTo.lat, lng: goTo.lng }, goTo.label, goTo.id ?? 0, { kind: "listing" }); return; }
    if (!locating && gpsNote) toast.message(`${gpsNote} Le trajet partira de votre position dès qu’elle sera connue (touchez « Ma position »).`, { id: "route-near", duration: 12000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPosition, locating, gpsNote]);
  const meters = (value: number) => value < 1000 ? `${Math.round(value)} m` : `${(value / 1000).toFixed(1).replace(".", ",")} km`;

  // Mémorisé : un nouveau tableau à chaque rendu (donc à chaque position GPS) faisait redessiner le trajet et ses alternatives sur la carte.
  const altRoutes = useMemo(() => routeOptions.filter((o) => o.id !== drivingRoute?.id), [routeOptions, drivingRoute?.id]);
  const mapProps = {
    center: target, focus: focusRequest, listings: mapListings, altRoutes,
    onPickRoute: (id: string) => { const o = routeOptions.find((x) => x.id === id); if (o) { setDrivingRoute(o); void refreshRouteServices(o); spokenStepIndex.current = 0; } },
    reports, userPosition, confirmedIds, fuelStations: NO_FUEL,
    vehicleType: vehiclePrefs.vehicle || "car", vehicleColor: vehiclePrefs.vehicleColor || "#2563eb",
    // Caméra qui suit la voiture : en navigation seulement, et pas en « Vue d'ensemble ».
    driving: !!drivingRoute && navActive && navFollow, routeFocus, routeCoordinates: drivingRoute?.coordinates, routeListingIds, routeServices,
    onListing: (id: number) => navigate(`/place/${id}`), onBook: (id: number) => navigate(`/reserver/${id}`), canBook: online, onRoute: startRoute,
    onReport: (report: MapReport) => setSelectedReportId(report.id), onMove: (center: { lat: number; lng: number }, bounds?: MapBounds) => { setVisibleCenter(center); if (bounds) setVisibleBounds(bounds); },
    streetSpots: streetSpotsOnMap, onStreetSpot: (spot: MapStreetSpot) => setSelectedStreetId(spot.id),
    parisSpots: parisOn ? parisMerged.gray : NO_PARIS, parisHot: parisOn ? parisMerged.hot : NO_PARIS,
    onIrve: (pick: { lat: number; lng: number; props: Array<string | number | null> }) => { setSelectedParis(null); setSelectedStreetId(null); setSelectedIrve(pick); },
    onParisSpot: (spot: ParisPick) => setSelectedParis({ lat: spot.lat, lng: spot.lng, t: spot.t, places: spot.places, regime: spot.regime, street: spot.street, num: spot.num, color: spot.color, reportId: spot.reportId }),
  };
  // Carte 3D : si elle ne peut pas s'afficher, on l'explique (au lieu d'un repli silencieux) et on réessaie automatiquement.
  const [map3dFail, setMap3dFail] = useState<null | "webgl" | "load">(initialWebGL ? null : "webgl");
  const [map3dKey, setMap3dKey] = useState(0);
  // Nouveau test WebGL à chaque essai : sur iPhone, le contexte peut revenir après une perte ou une mise en veille.
  const retry3D = () => { if (!detectWebGL()) { setMap3dFail("webgl"); return; } setMap3dFail(null); setMap3dKey((k) => k + 1); };
  const autoRetries = useRef(0);
  useEffect(() => {
    if (!map3dFail || autoRetries.current >= 3) return;
    const timer = window.setTimeout(() => { autoRetries.current += 1; retry3D(); }, 20000);
    return () => window.clearTimeout(timer);
  }, [map3dFail]);

  // Détail de l'état de la couche Paris, affiché dans le panneau « i » (le texte court reste sur la carte).
  const parisNote = parisLoad === null ? "" : parisLoad.status === "missing" ? "Emplacements de Paris : données non installées sur ce site (import non exécuté), rien n’est affiché."
    : parisLoad.status === "error" ? "Emplacements de Paris indisponibles pour le moment (réseau)."
    : `${parisLoad.mode === "overview" ? "Zoomez pour voir chaque emplacement." : ""}${parisLoad.truncated ? " Affichage limité aux plus proches du centre." : ""}`.trim();

  // Première ligne du panneau replié : la place la plus proche, sans disponibilité inventée (place en rue : couleur ET mot d'un signalement ; place privée : photo, prix de l'annonce, statut seulement si une source le donne).
  const peekRow = nearStreet[0] ? (() => { const { spot, meters: away } = nearStreet[0]; return <button type="button" className="m-peek" onClick={() => setSelectedStreetId(spot.id)}>
    <span className="m-peek-thumb" data-vt={vehicle} aria-hidden="true">P</span>
    <span className="m-peek-main"><strong>{spot.label}</strong><small>{meters(away)} · Place en rue · signalée par un utilisateur{spot.example ? " (exemple)" : ""}</small></span>
    <span className={`m-state ${spot.color}`}>{spot.color === "orange" ? "Peut-être libre" : spot.status === "free" ? "Libre" : "Prise"}</span>
  </button>; })() : nearby[0] ? (() => { const { item, meters: away } = nearby[0]; const pill = statePillLabel(item.parkingStatus); return <button type="button" className="m-peek" onClick={() => navigate(`/place/${item.id}`)}>
    <img className="m-peek-thumb" src={item.photos[item.mainPhoto] || item.photos[0]} alt="" loading="lazy" />
    <span className="m-peek-main"><strong>{item.title}</strong><small>{meters(away)} · Place privée{pill && <> · <span className={`m-state ${item.parkingStatus?.color ?? "gray"}`}>{pill}</span></>}</small></span>
    <span className="m-peek-price">{euros(item.hourlyCents)}<small>/h</small></span>
  </button>; })() : null;
  // Compteur de la poignée : places à moins de 1 km de la position (sinon du centre de la carte), places prises exclues
  // (places en rue signalées prises, places privées occupées). Ce n'est pas un nombre de places libres.
  const nearCount = useMemo(() => {
    const from = userPosition ?? visibleCenter;
    const street = streetOfVehicle.filter((spot) => spot.status !== "taken" && distanceMeters(from.lat, from.lng, spot.latitude, spot.longitude) <= NEAR_COUNT_RADIUS_M).length;
    const privatePlaces = filtered.filter((item) => item.parkingStatus?.color !== "red" && distanceMeters(from.lat, from.lng, item.latitude, item.longitude) <= NEAR_COUNT_RADIUS_M).length;
    return street + privatePlaces;
  }, [streetOfVehicle, filtered, userPosition, visibleCenter]);
  const placesNear = nearCountLabel(nearCount, !!userPosition);
  return (
    <div className={`home-screen view-${view}${drivingRoute ? " has-route" : ""}${navActive && drivingRoute ? " is-navigating" : ""}${online ? "" : " is-offline"}`}>
      <OfflineBanner online={online} savedAt={placesSavedAt} />
      {offlineOpen && <OfflineDownloadModal center={visibleCenter} basemap={map3dFail === "webgl" ? "raster" : "vector"} onClose={() => setOfflineOpen(false)} />}
      <section className="map-workspace" aria-label="Recherche de stationnement">
        <div className={`map-area ${view === "list" ? "mobile-hidden" : ""}`}>
          {map3dFail && <div className="map3d-notice" role="status">
            <span>{map3dFail === "webgl" ? "Carte 3D indisponible sur cet appareil (WebGL)" : "Carte 3D indisponible pour le moment (chargement impossible)"}</span>
            {map3dFail && <button type="button" onClick={retry3D}>Réessayer</button>}
          </div>}
          {map3dFail ? <ParkingMap {...mapProps} /> : (
            <Map3DBoundary key={map3dKey} fallback={<ParkingMap {...mapProps} />} onError={() => setMap3dFail("load")}>
              <Suspense fallback={null}><ParkingMap3D {...mapProps} polygonsOn={parisOn} polygonTypes={parisTypes} irveOn={irveShown} forbiddenOn={forbiddenOn} worksOn={worksOn} zfeOn={zfeOn} typeColorKey={displayType ?? (vehicleChoice.all ? "all" : vehicle)} onUnavailable={() => setMap3dFail("load")} /></Suspense>
            </Map3DBoundary>
          )}
        </div>

        <div className="m-top">
          <div className="m-search">
            <Search size={20} />
            <input ref={searchInputRef} value={search} onChange={(e) => { setSearch(e.target.value); setDestination(null); }} onFocus={() => setSearchFocused(true)}
              onKeyDown={(e) => { if (e.key === "Enter" && suggestions[0]) { e.preventDefault(); chooseSuggestion(suggestions[0]); } }}
              placeholder={pendingFav ? `Adresse de « ${pendingFav.kind === "custom" ? pendingFav.name : KIND_NAME[pendingFav.kind]} »` : "Où tu veux te garer ?"} aria-label="Rechercher une adresse" />
            {search && <button className="m-clear" onClick={() => { setSearch(""); setDestination(null); }} aria-label="Effacer la recherche"><X size={18} /></button>}
            {searchFocused && search.trim().length === 0 && <div className="search-suggestions m-places" role="group" aria-label="Raccourcis et destinations récentes">
              {pendingFav ? <div className="m-places-hint"><span>Tapez l’adresse de « {pendingFav.kind === "custom" ? pendingFav.name : KIND_NAME[pendingFav.kind]} »</span><button type="button" onClick={() => { setPendingFav(null); setNewFavName(null); }}>Annuler</button></div> : <>
                <div className="m-fav-row">
                  {(["home", "work"] as const).map((kind) => { const fav = getFavorite(places, kind); const Icon = kind === "home" ? HomeIcon : Briefcase; return fav
                    ? <span className="m-fav" key={kind}><button type="button" className="m-fav-main" onClick={() => pickSaved(fav)}><Icon size={16} /><span>{fav.name}<small>{fav.label}</small></span></button><button type="button" className="m-fav-del" aria-label={`Supprimer ${fav.name}`} onClick={() => updatePlaces(removeFavorite(places, fav.id))}><X size={14} /></button></span>
                    : <button type="button" className="m-fav m-fav-main m-fav-empty" key={kind} onClick={() => startPending({ kind })}><Icon size={16} /><span>{KIND_NAME[kind]}<small>À définir</small></span></button>; })}
                  {places.favorites.filter((f) => f.kind === "custom").map((fav) => <span className="m-fav" key={fav.id}><button type="button" className="m-fav-main" onClick={() => pickSaved(fav)}><MapPin size={16} /><span>{fav.name}<small>{fav.label}</small></span></button><button type="button" className="m-fav-del" aria-label={`Supprimer ${fav.name}`} onClick={() => updatePlaces(removeFavorite(places, fav.id))}><X size={14} /></button></span>)}
                  {newFavName === null && <button type="button" className="m-fav m-fav-main m-fav-new" onClick={() => setNewFavName("")}><Plus size={16} /><span>Nouveau</span></button>}
                </div>
                {newFavName !== null && <form className="m-fav-form" onSubmit={(e) => { e.preventDefault(); const name = newFavName.trim(); if (name) startPending({ kind: "custom", name }); }}>
                  <input autoFocus value={newFavName} maxLength={MAX_NAME} onChange={(e) => setNewFavName(e.target.value)} placeholder="Nom du lieu (ex. Salle de sport)" aria-label="Nom du nouveau lieu" />
                  <button type="submit" disabled={!newFavName.trim()}>Suivant</button>
                </form>}
                {places.recents.length > 0 && <>
                  <p className="m-places-title">Récemment</p>
                  {places.recents.map((r, index) => <div className="m-recent" key={`${r.lat}-${r.lng}-${r.at}`}>
                    <button type="button" className="m-recent-main" onClick={() => pickSaved(r)}><Clock3 size={15} /><span>{r.label}{r.subtitle && <small>{r.subtitle}</small>}</span></button>
                    <button type="button" className="m-recent-del" aria-label={`Retirer ${r.label} des destinations récentes`} onClick={() => updatePlaces(removeRecent(places, index))}><Trash2 size={15} /></button>
                  </div>)}
                </>}
                <small className="m-places-note">Enregistré sur cet appareil seulement.</small>
              </>}
            </div>}
            {searchFocused && search.length > 1 && <div className="search-suggestions">
              {suggestions.map((suggestion, index) => <button key={`${suggestion.kind}-${suggestion.lat}-${suggestion.lng}-${index}`} onClick={() => chooseSuggestion(suggestion)}><Navigation size={15} /><span>{suggestion.label}<small>{suggestion.subtitle ?? (suggestion.kind === "address" ? "Adresse ou quartier" : "Place Govapark")}</small></span></button>)}
              {searchingAddress && <p>Recherche en cours…</p>}
              {!searchingAddress && suggestions.length === 0 && <p>Aucun résultat. Essaie une adresse, une ville ou un quartier.</p>}
            </div>}
          </div>
          <button className={`m-round ${trackingGps ? "on" : ""}`} onClick={() => void locate()} disabled={locating} aria-label="Ma position"><LocateFixed size={22} className={locating ? "spinning" : ""} /></button>
          {locating && <div className="m-locating" role="status" aria-live="polite">Localisation…</div>}
          <button className="m-round" onClick={() => setMenuOpen((open) => !open)} aria-label="Plus d’options" aria-expanded={menuOpen}><SlidersHorizontal size={21} /></button>
        </div>

        <div className="m-chips">
          {VEHICLE_TYPES.map((v) => <button key={v} data-vt={v} className={`m-chip ${vehicle === v && !displayType ? "on" : ""}`} aria-pressed={vehicle === v && !displayType} aria-label={`Mon véhicule : ${VEHICLE_NAME[v]}`} onClick={() => chooseVehicle({ vehicle: v, all: false, display: null })}>{CHIP_ICON[v]}{VEHICLE_CHIP[v]}</button>)}
          {DISPLAY_CHIPS.map((d) => <button key={d} data-vt={d} className={`m-chip ${displayType === d ? "on" : ""}`} aria-pressed={displayType === d} aria-label={d === "pmr" ? "Afficher les places PMR (affichage seulement)" : "Afficher les bornes de recharge (affichage seulement)"} onClick={() => chooseVehicle({ vehicle, all: false, display: displayType === d ? null : d })}>{DISPLAY_ICON[d]}{DISPLAY_CHIP[d]}</button>)}
          <button data-vt="all" className={`m-chip ${vehicleChoice.all && !displayType ? "on" : ""}`} aria-pressed={vehicleChoice.all && !displayType} aria-label="Afficher tous les types de places sur la carte" onClick={() => chooseVehicle({ vehicle, all: !vehicleChoice.all, display: null })}>Tout</button>
        </div>

        <button type="button" className={`m-round m-layers-btn${layersOpen ? " on" : ""}`} aria-label="Couches de la carte" aria-expanded={layersOpen} onClick={() => setLayersOpen((open) => !open)}><Layers size={22} /></button>
        {layersOpen && <div className="m-layers" role="dialog" aria-label="Couches de la carte">
          <div className="m-layers-head"><b>Couches</b><button type="button" className="m-layers-close" onClick={() => setLayersOpen(false)} aria-label="Fermer les couches"><X size={20} /></button></div>
            <button type="button" role="switch" aria-checked={streetOn} className={`gp-switch${streetOn ? " on" : ""}`} onClick={() => setStreetOn(!streetOn)}><span>Places en rue</span><i aria-hidden="true" /></button>
            <button type="button" role="switch" aria-checked={parisOn} className={`gp-switch${parisOn ? " on" : ""}`} onClick={() => setParisOn(!parisOn)}><span>Emplacements de Paris</span><i aria-hidden="true" /></button>
            <button type="button" role="switch" aria-checked={forbiddenOn} className={`gp-switch${forbiddenOn ? " on" : ""}`} onClick={() => setForbiddenOn(!forbiddenOn)}><span>Interdictions de stationner</span><i aria-hidden="true" /></button>
            <button type="button" role="switch" aria-checked={worksOn} className={`gp-switch${worksOn ? " on" : ""}`} onClick={() => setWorksOn(!worksOn)}><span>Chantiers</span><i aria-hidden="true" /></button>
            <button type="button" role="switch" aria-checked={chargeOn} className={`gp-switch${chargeOn ? " on" : ""}`} onClick={() => setChargeOn(!chargeOn)}><span>Bornes de recharge</span><i aria-hidden="true" /></button>
            <button type="button" role="switch" aria-checked={zfeOn} className={`gp-switch${zfeOn ? " on" : ""}`} onClick={() => setZfeOn(!zfeOn)}><span>Zone à faibles émissions</span><i aria-hidden="true" /></button>
            <button type="button" role="switch" aria-checked={onlyAvailable} className={`gp-switch${onlyAvailable ? " on" : ""}`} onClick={() => setOnlyAvailable(!onlyAvailable)}><span>Dispo maintenant (places privées)</span><i aria-hidden="true" /></button>
          <p className="m-layers-note">Les places privées et collectives restent dans la liste du bas, jamais mêlées aux places en rue.</p>
        </div>}

        {menuOpen && <div className="m-menu" role="menu">
          <button onClick={() => { setMenuOpen(false); setDraftFilters(filters); setFiltersOpen(true); }}><SlidersHorizontal size={19} />Tous les filtres</button>
          <button onClick={() => { setMenuOpen(false); setReportOpen(true); }}><Plus size={19} />Partager une information</button>
          <button onClick={() => { setMenuOpen(false); setView("list"); }}><List size={19} />Voir en liste</button>
          <button onClick={() => { setMenuOpen(false); void enableProximityAlerts(); }}><ThumbsUp size={19} />Alerte place à 800 m</button>
          <button onClick={() => { setMenuOpen(false); void enableBackgroundAlerts(); }}><Clock3 size={19} />Alertes en arrière-plan</button>
          {drivingRoute && <button onClick={() => { setMenuOpen(false); toggleVoice(); }}><Navigation size={19} />{voiceGuidanceEnabled ? "Couper la voix" : "Guidage vocal"}</button>}
          <button onClick={() => { setMenuOpen(false); setOfflineOpen(true); }}><Download size={19} />Carte hors ligne</button>
          <button onClick={() => navigate("/messages")}><Mail size={19} />Messages</button>
          <button onClick={() => navigate("/mobilite")}><Fuel size={19} />Mobilité</button>
          <p className="m-menu-note"><ShieldAlert size={14} />Voie publique : infos de la communauté, sans garantie de place libre.</p>
          <p className="m-version" aria-label="Version de l’application">Version {__APP_VERSION__}</p>
        </div>}

        <div className={`m-sheet${sheetOpen ? "" : " is-closed"}${sheetMode === "full" ? " is-full" : ""}`}>
          <div className="m-meta">
            <button type="button" className="m-info" aria-expanded={infoOpen} aria-label="Légende des couleurs et sources" onClick={() => setInfoOpen((open) => !open)}><Info size={17} /></button>
            {trackingGps && speedKmh != null && vehiclePrefs.speedometer !== false && <span className="m-speed"><Gauge size={16} />{speedKmh} km/h</span>}
            {infoOpen && <div className="m-info-panel" role="dialog" aria-label="Légende et sources">
              <h3 className="m-info-h">Légende</h3>
              <ul className="m-legend" aria-label="Légende des couleurs des places">
                <li><i className="green" />Libre (signalé il y a X min)</li><li><i className="orange" />Peut-être libre</li><li><i className="red" />Prise</li><li><i className="gray" />Place</li>
              </ul>
              <p>Chercher des places ne demande aucune position. Seuls « Je libère » et « Je me gare » utilisent celle de votre appareil.</p>
              <h3 className="m-info-h">Sources et licences</h3>
              <p>{PARIS_ATTRIBUTION}</p>
              {parisOn && parisNote && <p>{parisNote}</p>}
              {parisOn && <p>{PARIS_POLYGONS_NOTE}</p>}
              {parisOn && <p>{PARIS_POLYGONS_ATTRIBUTION}</p>}
              <a href={PARIS_SOURCE.url} target="_blank" rel="noopener noreferrer">Source : data.gouv.fr</a>
              {forbiddenOn && <p>{FORBIDDEN_ATTRIBUTION}</p>}
              {parisOn && tariffDate !== undefined && <p>{tariffAttribution(tariffDate)}</p>}
              {zfeOn && zfeFile && <p>{zfeAttribution(zfeFile.dataDate)}</p>}
              {zfeOn && zfeFile?.urlArrete && <a href={zfeFile.urlArrete} target="_blank" rel="noopener noreferrer">Voir l'arrêté de la ZFE</a>}
              {zfeOn && zfeFile?.urlSite && <a href={zfeFile.urlSite} target="_blank" rel="noopener noreferrer">Site d'information de la ZFE</a>}
              {zfeOn && zfeFile && <a href={ZFE_SOURCE.url} target="_blank" rel="noopener noreferrer">Source de la ZFE : data.gouv.fr</a>}
              {worksOn && <p>{worksAttribution(worksDate)}</p>}
              {irveShown && <p>{irveAttribution(irveDate)}</p>}
              {irveShown && <a href={IRVE_SOURCE.url} target="_blank" rel="noopener noreferrer">Source des bornes : data.gouv.fr</a>}
              {parisOn && tariffDate !== undefined && <a href={TARIFF_SOURCE.url} target="_blank" rel="noopener noreferrer">Source des tarifs : data.gouv.fr</a>}
              {worksOn && <a href={WORKS_SOURCE.url} target="_blank" rel="noopener noreferrer">Source des chantiers : data.gouv.fr</a>}
              {forbiddenOn && <a href={FORBIDDEN_SOURCE.url} target="_blank" rel="noopener noreferrer">Source du stationnement interdit : data.gouv.fr</a>}
              {parisOn && <a href={PARIS_POLYGONS_SOURCE.url} target="_blank" rel="noopener noreferrer">Source des contours : data.gouv.fr</a>}
              <p className="m-diag" onClick={() => void refreshPermissionState()}>Diagnostic position : autorisation {geolocDiag.permission} · dernière erreur {geolocDiag.lastCode ?? "aucune"}{geolocDiag.lastReason ? ` (${geolocDiag.lastReason})` : ""} · précision {geolocDiag.accuracy != null ? `${geolocDiag.accuracy} m (${geolocDiag.attempt})` : "aucune"}</p>
              <p className="m-diag">{mapDiagLine(getMapDiag())}</p>
              <button type="button" className="m-info-close" onClick={() => setInfoOpen(false)} aria-label="Fermer la légende"><X size={18} /></button>
            </div>}
          </div>
          {!displayType && <StreetPanel vehicle={vehicle} state={streetPanelState} spots={streetOfVehicle} reference={userPosition ?? visibleCenter} hasPosition={!!userPosition}
            busy={streetLocating || streetCreate.isPending} busyLabel={streetLocating ? "Localisation…" : "Envoi…"} done={streetDone}
            onFree={() => void reportStreet("free")} onTaken={() => void reportStreet("taken")}
            onRetry={() => void streetQuery.refetch()} onEnableLayer={() => setStreetOn(true)} />}
          {drivingRoute ? <><div className="m-route">
            <div className="m-route-main">{drivingRoute.offline ? <><strong>{drivingRoute.estimate ? `${meters(drivingRoute.distance)} · ${Math.max(1, Math.round(drivingRoute.duration / 60))} min` : meters(drivingRoute.distance)}</strong><span>{drivingRoute.estimate ? `${drivingRoute.label} · 0 € · Vélo · ${NO_TRAFFIC}` : `à vol d’oiseau · ${drivingRoute.label}`}</span></> : <><strong>{Math.max(1, Math.round(drivingRoute.duration / 60))} min</strong><span>{summaryLine({ vehicle: drivingRoute.profile ?? vehicle, distanceM: drivingRoute.distance, durationS: drivingRoute.duration, costEur: drivingRoute.costEur ?? 0, costAssumed: drivingRoute.costAssumed }).split(" · ").slice(1).join(" · ")}{drivingRoute.label ? ` · ${drivingRoute.label}` : ""}</span></>}</div>
            <div className="m-route-body">
{originNote && <small className="route-origin-note">{originNote}</small>}
{gpsNote && !trackingGps && <small className="route-origin-note">{gpsNote}</small>}
{modeTabsNow.length > 0 && <div className="m-mode-tabs" role="tablist" aria-label="Mode de déplacement">
  {modeTabsNow.map((tab) => <button type="button" role="tab" key={tab.mode} data-vt={tab.mode} aria-selected={(drivingRoute.profile ?? vehicle) === tab.mode} className={(drivingRoute.profile ?? vehicle) === tab.mode ? "on" : ""} disabled={routeLoading} onClick={() => switchMode(tab.mode)}><span>{tab.label}</span><b>{tab.durationS === null ? "—" : `${tab.estimate ? "≈ " : ""}${formatDuration(tab.durationS)}`}</b></button>)}
  {modeTabsNow.find((t) => t.mode === (drivingRoute.profile ?? vehicle))?.note && <small className="m-mode-note">{modeTabsNow.find((t) => t.mode === (drivingRoute.profile ?? vehicle))?.note}</small>}
</div>}
{!drivingRoute.offline && <div className="m-trip-list" role="group" aria-label="Trajets comparés">
  {routeOptions.map((option) => { const tag = tripTag(option.label); const bike = option.profile === "bike"; return <button type="button" key={option.id} className={`m-trip-card${drivingRoute.id === option.id ? " on" : ""}`} aria-pressed={drivingRoute.id === option.id} onClick={() => { setDrivingRoute(option); void refreshRouteServices(option); spokenStepIndex.current = 0; }}>
    <span className="m-trip-top"><b>{formatDuration(option.duration)}</b><span>{formatDistance(option.distance)}</span>{tag && <em>{tag}</em>}</span>
    <span className="m-trip-line" title={option.via ? `via ${option.via}` : undefined}>{bike ? "0 € · vélo" : `${formatEuro(option.costEur ?? 0)}${option.costAssumed ? " (prix supposé)" : ""} de carburant${option.profile === "moto" ? " · estimation" : ""}`}{option.via ? ` · via ${option.via}` : ""}</span>
    {zfeCrossing[option.id] && <span className="m-trip-zfe">Traverse la zone à faibles émissions de Paris</span>}
  </button>; })}
  <small className="m-trip-note">{routeOptions.length > 1 ? "Durées" : "Un seul itinéraire proposé pour ce trajet. Durée"} {NO_TRAFFIC}.</small>
</div>}
{drivingRoute.offline ? <small className="route-offline-note">Ligne droite indicative, sans guidage. Reconnectez-vous pour calculer un vrai trajet.</small> : <button className="m-route-start" onClick={startNavigation}><Navigation size={18} />Y aller</button>}
{arrival && <section className="m-arrival" aria-label="Stationnement à l’arrivée">
  <h3>Stationnement à l’arrivée</h3>
  <p className="m-arrival-main">{arrival.state === "loading" ? "Recherche des places autour de l’arrivée…" : arrival.sentence ?? (arrival.views ? `Nombre de places en rue indisponible pour le moment · ${reportsSentence(arrival.views)}` : "Places en rue indisponibles pour le moment.")}</p>
  {(arrival.views?.length || arrivalTariff || arrival.state === "ok") && <details className="m-arrival-more"><summary>Détails</summary>
    {arrival.views?.slice(0, 3).map((v) => <p className="m-arrival-rep" key={v.id}><i className={`dot ${v.color}`} aria-hidden="true" /><b>{v.word}</b> à {v.time} · à {v.meters} m<small>Signalé par un utilisateur{v.example ? " (exemple)" : ""} · rien n’est garanti</small></p>)}
    {arrivalTariff && <p className="m-arrival-tariff">{arrivalTariff}<small>Stationnement payant dans le rayon · à vérifier sur paris.fr</small></p>}
    <small className="m-arrival-src">Rayon {ARRIVAL_RADIUS_M} m. Places : Ville de Paris, licence ODbL, non exhaustives (Paris seulement). Les signalements sont des avis d’utilisateurs.</small>
  </details>}
</section>}
</div>
            <button className="m-route-stop" onClick={toggleRoute} aria-label="Arrêter le trajet"><X size={18} /><span>Arrêter</span></button>
          </div>
          <div className="m-sheet-title">Places près de l’arrivée<span>{nearArrival.length}</span></div>
          <div className="m-cards">
            {nearArrival.length === 0 && <div className="m-empty">Aucune place Govapark près de cette arrivée pour l’instant.</div>}
            {nearArrival.map(({ item, meters: away }) => <article className="m-card" key={`arr-${item.id}`}>
              <button className="m-card-open" onClick={() => navigate(`/place/${item.id}`)}>
                <img src={item.photos[item.mainPhoto] || item.photos[0]} alt="" loading="lazy" />
                {statePillLabel(item.parkingStatus) && <span className={`m-state ${item.parkingStatus?.color ?? "gray"}`}>{statePillLabel(item.parkingStatus)}</span>}
                <span className="m-card-body"><span className="m-card-row"><strong className="m-price">{euros(item.hourlyCents)}<small>/h</small></strong><span className="m-dist">{meters(away)}</span></span><span className="m-title">{item.title}</span></span>
              </button>
              <button className="m-card-go" disabled={!online} title={online ? undefined : "La réservation demande une connexion"} onClick={() => navigate(`/reserver/${item.id}`)}>{online ? "Réserver" : "Indisponible hors ligne"}</button>
            </article>)}
          </div></> : destination && destPlaces ? <>
            <div className="m-dest-head">
              <b title={destination.label}>Places près de {destination.label}</b>
              <button type="button" className="m-dest-go" disabled={routeLoading} onClick={toggleRoute}><Navigation size={16} />{routeLoading ? "Calcul…" : "Y aller"}</button>
            </div>
            <div className="m-cards m-cards-dest">
              {destPlaces.street.map(({ spot, meters: away }) => <button type="button" className="m-card m-scard" key={`dest-street-${spot.id}`} onClick={() => setSelectedStreetId(spot.id)}>
                <span className={`m-state ${spot.color}`}>{spot.color === "orange" ? "Peut-être libre" : spot.status === "free" ? "Libre" : "Prise"}</span>
                <span className="m-scard-main"><strong>{spot.label}</strong><small>Place en rue · signalée par un utilisateur{spot.example ? " (exemple)" : ""}</small></span>
                <span className="m-dist">{meters(away)}</span>
              </button>)}
              {destPlaces.street.length === 0 && <div className="m-empty m-empty-line">{streetPanelState === "ok" ? "Aucune place signalée libre ici pour l’instant." : "Places en rue indisponibles pour le moment."}</div>}
              {destPlaces.privatePlaces.map(({ item, meters: away }) => <button type="button" className="m-card m-scard" key={`dest-priv-${item.id}`} onClick={() => navigate(`/place/${item.id}`)}>
                {statePillLabel(item.parkingStatus) && <span className={`m-state ${item.parkingStatus?.color ?? "gray"}`}>{statePillLabel(item.parkingStatus)}</span>}
                <span className="m-scard-main"><strong>{item.title}</strong><small>Place privée · {euros(item.hourlyCents)}/h</small></span>
                <span className="m-dist">{meters(away)}</span>
              </button>)}
            </div>
          </> : <>
            <div className="m-panel">
            <button type="button" className="m-sheet-title m-sheet-toggle" aria-expanded={sheetOpen} aria-label={`${placesNear}. ${sheetMode === "closed" ? "Ouvrir la liste" : sheetMode === "half" ? "Agrandir la liste" : "Fermer la liste"}`} onClick={() => setSheetMode((mode) => (mode === "closed" ? "half" : mode === "half" ? "full" : "closed"))}>
              <i className="m-grip" aria-hidden="true" />
              <b>{placesNear}</b>
              <span aria-hidden="true">{sheetMode === "closed" ? <>Voir la liste<ChevronRight size={18} /></> : sheetMode === "full" ? <ChevronDown size={20} /> : <ChevronUp size={20} />}</span>
            </button>
            {!sheetOpen && peekRow}
            </div>
            <div className="m-cards" hidden={!sheetOpen}>
              {listingsQuery.isLoading && [1, 2, 3].map((item) => <div className="m-card m-card-skeleton" key={item} role="status" aria-label="Chargement des places" />)}
              {searchNote && <div className="m-empty">{searchNote}</div>}
              {searchTruncated && <div className="m-empty">Trop de places dans cette zone : seules les 300 premières sont chargées. Zoomez ou affinez les filtres.</div>}
              {nearStreet.map(({ spot, meters: away }) => <button type="button" className="m-card m-scard" key={`near-street-${spot.id}`} onClick={() => setSelectedStreetId(spot.id)}>
                <span className={`m-state ${spot.color}`}>{spot.color === "orange" ? "Peut-être libre" : spot.status === "free" ? "Libre" : "Prise"}</span>
                <span className="m-scard-main"><strong>{spot.label}</strong><small>Place en rue · signalée par un utilisateur{spot.example ? " (exemple)" : ""}</small></span>
                <span className="m-dist">{meters(away)}</span>
              </button>)}
              {!listingsQuery.isLoading && !searchNote && nearby.length === 0 && <div className="m-empty">Aucune place avec ces filtres. <button onClick={() => { setFilters(initialFilters); setOnlyAvailable(false); }}>Tout afficher</button></div>}
              {nearby.map(({ item, meters: away }) => <article className="m-card" key={item.id}>
                <button className="m-card-open" onClick={() => navigate(`/place/${item.id}`)}>
                  <img src={item.photos[item.mainPhoto] || item.photos[0]} alt="" loading="lazy" />
                  {statePillLabel(item.parkingStatus) && <span className={`m-state ${item.parkingStatus?.color ?? "gray"}`}>{statePillLabel(item.parkingStatus)}</span>}
                  <span className="m-card-body"><span className="m-card-row"><strong className="m-price">{euros(item.hourlyCents)}<small>/h</small></strong><span className="m-dist">{meters(away)}</span></span><span className="m-title">{item.title}</span><span className="m-sub">Place privée · {item.covered ? "Couvert" : "Extérieur"} · ★ {item.rating.toFixed(1)}</span></span>
                </button>
                <button className="m-card-go" onClick={() => void startRoute(item.id)}><Navigation size={16} />Y aller</button>
              </article>)}
            </div>
          </>}
        </div>
      </section>

      {navActive && drivingRoute && navDest && <NavigationMode route={drivingRoute} dest={navDest} position={userPosition} speedKmh={trackingGps ? speedKmh : null} online={online}
        voiceOn={voiceGuidanceEnabled && voiceSupported} voiceSupported={voiceSupported} onToggleVoice={toggleNavVoice} follow={navFollow} onToggleFollow={() => setNavFollow((v) => !v)}
        originNote={originNote} tracking={trackingGps} onRequestLocation={requestLocation} onStop={stopNavigation} onReroute={rerouteFrom} />}

      <aside className={`results-panel ${view === "map" ? "desktop-only" : ""}`}>
        {view === "list" && <section className="prediction-panel" aria-label="Prévision des départs de stationnement">
          <div className="prediction-heading"><div><span className="eyebrow">GOVAPARK INTELLIGENCE</span><h2>Places susceptibles de se libérer</h2></div><span className="prediction-live">En direct</span></div>
          <p className="prediction-explainer">Estimation basée sur les départs annoncés récemment par la communauté, leur heure prévue et leur niveau de confiance. Ce n’est pas une garantie de place libre.</p>
          {predictedDepartures.length === 0 ? <div className="prediction-empty">Aucun départ annoncé suffisamment récent dans un rayon de 5 km. Les places privées disponibles restent affichées ci-dessous.</div> : predictedDepartures.map((item) => <div className="prediction-row" key={`prediction-${item.id}`}>
            <div className="prediction-score" aria-label={`Indice ${item.potentialIndex} sur 100`}>{item.potentialIndex}<small>/100</small></div>
            <div className="prediction-copy"><strong>{item.address}</strong><span>{item.minutesUntil === 0 ? "Départ prévu maintenant" : `Départ annoncé dans ${item.minutesUntil} min`} · à ${item.distance < 1000 ? `${Math.round(item.distance)} m` : `${(item.distance/1000).toFixed(1)} km`}</span><small>Confiance communautaire : {item.confidence}% · actualisé {ago(item.updatedAt)}</small></div>
          </div>)}
          <div className="learned-zone-panel"><strong>Historique intelligent des zones</strong><small>{learnedPredictions.data?.totalObservations ?? 0} observations enregistrées dans un rayon de 5 km · 90 derniers jours</small>{(learnedPredictions.data?.predictions ?? []).slice(0,3).map((zone) => <div key={`${zone.cellKey}-${zone.weekday}-${zone.hour}`}><span>{zone.score}/100 · {zone.confidence === "élevée" ? "confiance élevée" : zone.confidence === "moyenne" ? "confiance moyenne" : "confiance faible"}</span><small>{zone.observations} observations · {zone.freeSignals} libres · {zone.occupiedSignals} occupées</small></div>)}{!learnedPredictions.data?.predictions.length && <small>Le moteur attend davantage de confirmations réelles pour établir des tendances horaires fiables.</small>}</div>
          <small className="prediction-footnote">Indice expérimental. Les prévisions reposent sur les observations communautaires des 90 derniers jours, regroupées par zone, jour et heure. Elles ne garantissent jamais une place libre.</small>
        </section>}
        {drivingRoute && !drivingRoute.offline && <section className="route-results"><div><strong>{routeOptions.length > 1 ? `Vos ${routeOptions.length} alternatives de trajet` : "Votre trajet"}</strong><span>{(drivingRoute.distance/1000).toFixed(1)} km · {Math.round(drivingRoute.duration/60)} min</span></div>
          <div className="route-options">{routeOptions.map((option)=> <button key={option.id} className={`route-option ${drivingRoute.id===option.id?"selected":""}`} onClick={()=>{setDrivingRoute(option);void refreshRouteServices(option);spokenStepIndex.current=0;}}><strong>{option.label}</strong><span>{(option.distance/1000).toFixed(1)} km · {Math.round(option.duration/60)} min</span>{option.profile==="bike"?<small>Coût : 0 € · Vélo · {NO_TRAFFIC}</small>:option.fuelPrice!=null?<small>Carburant estimé : {((option.distance/1000)*(fuelConsumption/100)*option.fuelPrice).toFixed(2)} €</small>:<small>Coût carburant indisponible</small>}</button>)}</div>
          {drivingRoute.profile!=="bike"&&<div className="route-cost-controls"><label>Carburant<select value={routeFuelType} onChange={e=>setRouteFuelType(e.target.value as typeof routeFuelType)}><option value="gazole">Gazole</option><option value="e10">SP95-E10</option><option value="sp95">SP95</option><option value="sp98">SP98</option><option value="e85">E85</option></select></label><label>Consommation moyenne<input type="number" min="1" max="60" step="0.1" value={fuelConsumption} onChange={e=>setFuelConsumption(Math.max(1,Math.min(60,Number(e.target.value)||7.2)))}/><small>L/100 km</small></label><button className="btn btn-secondary" onClick={()=>{if(drivingRoute?.destinationId)void startRoute(drivingRoute.destinationId);else if(destination)void calculateRoutes({lat:destination.lat,lng:destination.lng},destination.label);else toast.message("Sélectionnez d’abord une destination.");}}>Actualiser les prix</button></div>}
          <p>{routeServices.length} services et points d’intérêt repérés autour du trajet sélectionné · {routeListings.length} place(s) privée(s) disponible(s) à moins de 900 m</p>
          <div className="route-service-legend"><span>⚡ Bornes électriques</span><span>🅿️ Parkings</span><span>🛣️ Aires de repos</span><span>🚛 Poids lourds</span><span>🍴 Restauration</span><span>⛽ Carburant</span></div>
          <small className="route-cost-note">Après modification du type de carburant, relancez le calcul d’itinéraire pour actualiser les prix. Le coût carburant est une estimation à partir des prix du flux officiel du ministère de l’Économie repérés près du trajet et de votre consommation déclarée. Péages, trafic en temps réel, restrictions poids lourds et prix des recharges ne sont pas encore inclus. Vérifiez les prix et services avant le départ.</small>
          {routeListings.map((item)=><button key={item.id} onClick={()=>navigate(`/place/${item.id}`)}><strong>{item.title}</strong><span>{item.approxAddress} · {euros(item.hourlyCents)}/h</span></button>)}
          {drivingRoute.steps.length > 0 && <details className="route-directions"><summary>Afficher les {drivingRoute.steps.length} instructions de route</summary>{drivingRoute.steps.map((step,index)=><div key={`${index}-${step.instruction}`}><span>{index+1}</span><p>{step.instruction}<small>{Math.round(step.distance)} m</small></p></div>)}</details>}
          <small className="route-background-note">Le guidage vocal fonctionne lorsque GOVAPARK est actif. Le GPS continu écran verrouillé n'est pas garanti par un site web/PWA ; une application native et un service de notifications push sont nécessaires pour un suivi fiable en arrière-plan.</small>{routeStreetReports.length>0 && <><p>Places de rue signalées libres · non garanties</p>{routeStreetReports.map((item)=><div className="route-street-report" key={`street-${item.id}`}><strong>{item.address}</strong><span>Confiance {item.confidence}% · actualisé {ago(item.updatedAt)}</span></div>)}</>}</section>}
        <div className="results-head"><div><span className="eyebrow">Île-de-France · démo</span><h1>Se garer, simplement.</h1></div><div className="results-head-actions"><span className="result-count">{filtered.length}</span>{view === "list" && <button className="btn btn-secondary" onClick={() => setView("map")}><MapIcon size={16} />Carte</button>}</div></div>
        <p className="results-intro">Places privées réservables et informations partagées par la communauté.</p>
        <div className="quick-filters">
          <button className={filters.covered === "couvert" ? "active" : ""} onClick={() => setFilters({ ...filters, covered: filters.covered === "couvert" ? "tous" : "couvert" })}>Couvert</button>
          <button className={filters.type === "garage" ? "active" : ""} onClick={() => setFilters({ ...filters, type: filters.type === "garage" ? "tous" : "garage" })}>Garages</button>
          <button onClick={() => { setDraftFilters(filters); setFiltersOpen(true); }}>Prix · hauteur</button>
        </div>
        <div className="listing-results">
          {cacheMode && <div className="empty-state">{online
            ? <p><b>Serveur injoignable pour le moment – disponibilité non actualisée.</b> Places enregistrées lors de la dernière connexion ; réessayez dans un instant.</p>
            : <p><b>Hors ligne – disponibilité non actualisée.</b> Places enregistrées lors de la dernière connexion ; vérifiez la disponibilité une fois reconnecté.</p>}</div>}
          {listingsQuery.isLoading && [1,2,3].map((item) => <div className="listing-skeleton" key={item} role="status" aria-label="Chargement des places" />)}
          {listingsQuery.error && <div className="empty-state"><p>Impossible de charger les annonces.</p><button className="btn btn-secondary" onClick={() => listingsQuery.refetch()}>Réessayer</button></div>}
          {!listingsQuery.isLoading && filtered.length === 0 && <div className="empty-state"><h3>Aucune place ne correspond</h3><p>Élargissez vos filtres ou déplacez la carte.</p><button className="btn btn-secondary" onClick={() => setFilters(initialFilters)}>Réinitialiser les filtres</button></div>}
          {filtered.map((listing) => <button className="listing-row" key={listing.id} onClick={() => navigate(`/place/${listing.id}`)}>
            <img src={listing.photos[listing.mainPhoto] || listing.photos[0]} alt="" />
            <span className="listing-row-content"><span className="listing-row-top"><strong>{listing.title}</strong><span className="listing-price">{euros(listing.hourlyCents)}<small>/h</small></span></span>
              <span className="listing-address">{listing.approxAddress}</span>
              <span className="listing-meta">{placeTypeLabel(listing.placeType)} · {listing.covered ? "Couvert" : "Extérieur"} · {listing.heightCm} cm</span>
              <span className="listing-bottom"><span className={listing.bookingMode === "instant" ? "instant-badge" : "validation-badge"}>{listing.bookingMode === "instant" ? "Instantanée" : "Sur validation"}</span><span>★ {listing.rating.toFixed(1)}</span></span>
            </span>
          </button>)}
        </div>
      </aside>

      {filtersOpen && <Modal title="Filtrer les places privées" onClose={() => setFiltersOpen(false)}>
        <div className="form-stack">
          <label>Prix horaire maximum <strong>{euros(draftFilters.maxPrice)}</strong><input type="range" min="100" max="350" step="10" value={draftFilters.maxPrice} onChange={(e) => setDraftFilters({ ...draftFilters, maxPrice: Number(e.target.value) })} /></label>
          <label>Distance depuis le centre de la carte <strong>{draftFilters.maxDistance} km</strong><input type="range" min="1" max="30" value={draftFilters.maxDistance} onChange={(e) => setDraftFilters({ ...draftFilters, maxDistance: Number(e.target.value) })} /></label>
          <label>Type de place<select value={draftFilters.type} onChange={(e) => setDraftFilters({ ...draftFilters, type: e.target.value })}><option value="tous">Tous les types</option><option value="garage">Garage / box</option><option value="residence">Résidence</option><option value="entreprise">Entreprise</option><option value="parking">Parking privé</option></select></label>
          <label>Couverture<select value={draftFilters.covered} onChange={(e) => setDraftFilters({ ...draftFilters, covered: e.target.value })}><option value="tous">Couvert ou extérieur</option><option value="couvert">Couvert</option><option value="exterieur">Extérieur</option></select></label>
          <label>Hauteur minimale de la place<div className="input-suffix"><input type="number" min="0" max="450" value={draftFilters.minHeight || ""} placeholder="Indifférent" onChange={(e) => setDraftFilters({ ...draftFilters, minHeight: Number(e.target.value) })} /><span>cm</span></div></label>
          <label>Catégorie<select value={draftFilters.category} onChange={(e) => setDraftFilters({ ...draftFilters, category: e.target.value as Filters["category"] })}><option value="private">Places privées à louer</option><option value="public">Stationnement public (voirie)</option><option value="collective">Parkings collectifs</option></select></label>
          {draftFilters.category !== "private" && <p className="field-help">Aucune donnée réelle n’est encore branchée pour cette catégorie : rien n’est affiché plutôt que d’inventer des places.</p>}
          <label>Tarif<select value={draftFilters.priceMode} onChange={(e) => setDraftFilters({ ...draftFilters, priceMode: e.target.value as Filters["priceMode"] })}><option value="tous">Gratuit ou payant</option><option value="free">Gratuit</option><option value="paid">Payant</option></select></label>
          <label className="check-row"><input type="checkbox" checked={draftFilters.accessible} onChange={(e) => setDraftFilters({ ...draftFilters, accessible: e.target.checked })} /> Accessible PMR uniquement</label>
          <label>Longueur minimale<div className="input-suffix"><input type="number" min="0" max="20" step="0.1" value={draftFilters.minLength || ""} placeholder="Indifférent" onChange={(e) => setDraftFilters({ ...draftFilters, minLength: Number(e.target.value) })} /><span>m</span></div></label>
          <label>Largeur minimale<div className="input-suffix"><input type="number" min="0" max="5" step="0.1" value={draftFilters.minWidth || ""} placeholder="Indifférent" onChange={(e) => setDraftFilters({ ...draftFilters, minWidth: Number(e.target.value) })} /><span>m</span></div></label>
          <label>Libre à partir de<input type="datetime-local" value={draftFilters.from} onChange={(e) => setDraftFilters({ ...draftFilters, from: e.target.value })} /></label>
          <label>Jusqu’à<input type="datetime-local" value={draftFilters.to} onChange={(e) => setDraftFilters({ ...draftFilters, to: e.target.value })} /></label>
          <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setDraftFilters(initialFilters)}>Réinitialiser</button><button className="btn btn-primary" onClick={() => { setFilters(draftFilters); setFiltersOpen(false); }}>Afficher les résultats</button></div>
        </div>
      </Modal>}

      {reportOpen && <Modal title="Partager une information" onClose={() => setReportOpen(false)}>
        <div className="declaration-warning"><ShieldAlert size={21} /><strong>Ceci est une déclaration, pas une réservation. Govapark ne vend, ne loue ni ne garantit aucune place sur la voie publique.</strong></div>
        {!isAuthenticated ? <AuthGate compact title="Un compte est requis pour signaler" /> : <div className="form-stack">
          <div className="report-kind-picker">{(["free", "occupied", "departure"] as const).map((kind) => <button key={kind} className={reportKind === kind ? `active ${kind}` : ""} onClick={() => setReportKind(kind)}>{kind === "free" ? "Place libre" : kind === "occupied" ? "Place occupée" : "Je pars bientôt"}</button>)}</div>
          <label>Adresse approximative<input value={reportAddress} onChange={(e) => setReportAddress(e.target.value)} /></label>
          <p className="field-help">Position : centre actuel de la carte ({visibleCenter.lat.toFixed(4)}, {visibleCenter.lng.toFixed(4)}). Déplacez la carte avant de signaler.</p>
          {reportKind === "departure" && <label>Heure estimée de départ<input type="datetime-local" value={departureAt} onChange={(e) => setDepartureAt(e.target.value)} /></label>}
          <div className="report-rules"><Clock3 size={17} /><span>Masquage automatique après 30 min · limite de 5 signalements par heure.</span></div>
          <button className="btn btn-primary btn-full" disabled={createReport.isPending || reportAddress.length < 3} onClick={submitReport}>{createReport.isPending ? "Publication…" : "Publier la déclaration"}</button>
        </div>}
      </Modal>}

      {selectedStreet && (() => {
        const spot = selectedStreet;
        const minutes = Math.max(0, Math.floor((Date.now() - new Date(spot.reportedAt).getTime()) / 60000));
        return <PlaceSheet title={`Place en rue · ${VEHICLE_NAME[spot.vehicleType]}`} chips={[spot.reliabilityText ? `Fiabilité ${spot.reliabilityText}` : "", spot.agreeing > 1 ? `${spot.agreeing} utilisateurs concordants` : ""].filter(Boolean)}
          status={{ text: `${spot.status === "free" ? "Signalée libre" : "Signalée prise"} ${agoText(minutes)} à ${new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(spot.reportedAt))} · signalé par un utilisateur`, color: STATUS_COLORS[spot.color] }}
          alerts={spotCtx.alerts} warning={spot.example ? "Exemple de démonstration : ce signalement a été créé en mode démo, il ne reflète aucune situation réelle." : "Signalement d'utilisateur, pas une vérité garantie : la place a pu être prise depuis. Govapark ne la réserve pas."}
          onClose={() => setSelectedStreetId(null)}
          onGo={() => { setSelectedStreetId(null); setTarget({ lat: spot.latitude, lng: spot.longitude }); void calculateRoutes({ lat: spot.latitude, lng: spot.longitude }, "Place en rue", 0, { kind: "street", reportedAt: spot.reportedAt, status: spot.status, example: spot.example }); }}
          actions={spot.status === "free" ? [{ label: "Je m'y gare", busy: streetLocating || streetCreate.isPending, onClick: () => void reportStreet("taken", spot, spot.vehicleType) }] : []} />;
      })()}

      {selectedParis && (() => {
        const spot = selectedParis;
        const rep = spot.reportId > 0 ? streetSpots.find((r) => r.id === spot.reportId) ?? null : null;
        const [regimePrio, regimePart] = parisRegimes[spot.regime] ?? ["", ""];
        const info = interpretRegime(regimePrio, regimePart);
        const content = parisSheetContent(spot, parisRegimes, rep ? { status: rep.status, reportedAt: rep.reportedAt, example: rep.example } : null, userPosition);
        const reportType = vehicleTypesForSpot(spot.t)[0] ?? vehicle;
        return <PlaceSheet title={content.title} chips={content.places ? [content.places] : []} note={content.note} status={content.status} tariff={spotCtx.tariff} alerts={spotCtx.alerts}
          onClose={() => setSelectedParis(null)}
          onGo={() => { setSelectedParis(null); setTarget({ lat: spot.lat, lng: spot.lng }); void calculateRoutes({ lat: spot.lat, lng: spot.lng }, formatStreet(spot.street, spot.num) || info.title, 0, { kind: "street" }); }}
          actions={content.canReport ? [
            { label: "Je libère cette place", onClick: () => { setSelectedParis(null); void reportStreet("free", { latitude: spot.lat, longitude: spot.lng }, reportType); } },
            { label: "Je m'y gare", onClick: () => { setSelectedParis(null); void reportStreet("taken", { latitude: spot.lat, longitude: spot.lng }, reportType); } },
          ] : []} />;
      })()}

      {selectedIrve && (() => {
        const irve = irveSheet(selectedIrve.props);
        return <PlaceSheet title={irve.title} chips={irve.chips} note={irve.note}
          onClose={() => setSelectedIrve(null)}
          onGo={() => { const at = { lat: selectedIrve.lat, lng: selectedIrve.lng }; setSelectedIrve(null); setTarget(at); void calculateRoutes(at, irve.note?.split(" · ").at(-1) ?? irve.title, 0, { kind: "street" }); }} />;
      })()}

      {selectedReport && <Modal title={reportTitle[selectedReport.kind]} onClose={() => setSelectedReportId(null)}>
        <div className={`report-detail-head ${selectedReport.kind}`}><span className="report-status-dot" style={{ background: STATUS_COLORS[selectedReport.parkingStatus?.color ?? "gray"] }} /><div><strong>{selectedReport.address}</strong><p>{selectedReport.parkingStatus?.label} · {selectedReport.parkingStatus?.detail}</p></div></div>
        <dl className="report-facts"><div><dt>Mise à jour</dt><dd>{ago(selectedReport.updatedAt)} · {shortDate(selectedReport.updatedAt)}</dd></div><div><dt>Source</dt><dd>{selectedReport.source}</dd></div><div><dt>Fiabilité</dt><dd>{selectedReport.confidence}% · {selectedReport.confidence >= 75 ? "moyenne à bonne" : selectedReport.confidence >= 50 ? "modérée" : "faible"}</dd></div><div><dt>Expire</dt><dd>{selectedReport.parkingStatus?.expiresAt ? shortDate(selectedReport.parkingStatus.expiresAt) : "—"}</dd></div></dl>
        <div className="confidence-track"><span style={{ width: `${selectedReport.confidence}%` }} /></div>
        {selectedReport.kind === "departure" && <DeparturePanel report={selectedReport} isOwner={selectedReport.userId === user?.id} update={departureUpdate} setUpdate={setDepartureUpdate}
          onUpdate={() => updateDeparture.mutate({ id: selectedReport.id, estimatedDeparture: new Date(departureUpdate) })} onStop={() => stopDeparture.mutate({ id: selectedReport.id })}
          onAutoRelease={(latitude, longitude, accuracy) => autoRelease.mutate({ id: selectedReport.id, latitude, longitude, accuracy })} autoReleasePending={autoRelease.isPending} />}
        <p className="report-caution">Un départ annoncé ou une place libre signalée reste une simple information. Vous ne pouvez pas réserver cet emplacement public avec Govapark.</p>
        <div className="vote-actions"><button className="btn btn-secondary" onClick={() => isAuthenticated ? vote.mutate({ reportId: selectedReport.id, vote: "confirm" }) : requireAuth()}><ThumbsUp size={17} />Confirmer ({selectedReport.confirmations})</button><button className="btn btn-secondary" onClick={() => isAuthenticated ? vote.mutate({ reportId: selectedReport.id, vote: "contradict" }) : requireAuth()}><ThumbsDown size={17} />Contredire ({selectedReport.contradictions})</button></div>
      </Modal>}
    </div>
  );
}

function DeparturePanel({ report, isOwner, update, setUpdate, onUpdate, onStop, onAutoRelease, autoReleasePending }: {
  report: NonNullable<ReturnType<typeof useReportSelection>>; isOwner: boolean; update: string; setUpdate: (value: string) => void; onUpdate: () => void; onStop: () => void;
  onAutoRelease: (latitude:number,longitude:number,accuracy:number)=>void; autoReleasePending:boolean;
}) {
  const [, tick] = useState(0); const [watching,setWatching]=useState(false); const watchRef=useRef<number|null>(null); const farCount=useRef(0);
  useEffect(() => { const timer = setInterval(() => tick((n) => n + 1), 1000); return () => { clearInterval(timer); if(watchRef.current!==null) navigator.geolocation?.clearWatch(watchRef.current); }; }, []);
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(report.createdAt).getTime()) / 60000));
  const beginAutoRelease=()=>{
    if(!navigator.geolocation){toast.error("GPS indisponible sur cet appareil");return;}
    setWatching(true); farCount.current=0;
    watchRef.current=navigator.geolocation.watchPosition((position)=>{
      const accuracy=position.coords.accuracy; if(accuracy>60) return;
      const lat=position.coords.latitude,lng=position.coords.longitude;
      const dLat=(lat-report.latitude)*111320,dLng=(lng-report.longitude)*111320*Math.cos(report.latitude*Math.PI/180);
      if(Math.hypot(dLat,dLng)>=120) farCount.current+=1; else farCount.current=0;
      if(farCount.current>=2){ if(watchRef.current!==null) navigator.geolocation.clearWatch(watchRef.current); watchRef.current=null; setWatching(false); onAutoRelease(lat,lng,accuracy); }
    },()=>{setWatching(false);toast.error("Autorisez le GPS pour détecter le départ")},{enableHighAccuracy:true,maximumAge:3000,timeout:20000});
  };
  return <div className="departure-panel"><div><span>Départ estimé</span><strong>{report.estimatedDeparture ? fullDate(report.estimatedDeparture) : "Non renseigné"}</strong><small>Déclaration active depuis {elapsed} min</small></div>{isOwner && <div className="departure-owner"><label>Modifier l’heure<input type="datetime-local" value={update} onChange={(e) => setUpdate(e.target.value)} /></label><button className="btn btn-secondary" onClick={onUpdate}><Check size={16} />Mettre à jour</button><button className="btn btn-secondary" disabled={watching||autoReleasePending} onClick={beginAutoRelease}>{watching?"Détection GPS active…":autoReleasePending?"Mise à jour…":"Détecter automatiquement mon départ"}</button><small>Avec votre accord GPS : si votre téléphone s’éloigne d’au moins 120 m avec deux positions fiables, GOVAPARK signale la place comme potentiellement libre. Le suivi s’arrête ensuite.</small><button className="btn btn-ghost" onClick={onStop}>Arrêter le compteur</button></div>}</div>;
}

function useReportSelection() { return null as null | (MapReport & { createdAt: Date; estimatedDeparture: Date | null }); }
