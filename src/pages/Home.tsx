import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Search, LocateFixed, SlidersHorizontal, List, Map as MapIcon, Plus, ShieldAlert, X, Clock3, ThumbsUp, ThumbsDown, Navigation, Check, Mail, Settings, Gauge, Fuel } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import ParkingMap, { type MapReport } from "@/components/ParkingMap";
import { Modal } from "@/components/Modal";
import { AuthGate } from "@/components/AuthGate";
import { ago, distanceMeters, euros, fullDate, placeTypeLabel, shortDate, toLocalInput } from "@/lib/format";

type Filters = { maxPrice: number; maxDistance: number; type: string; covered: string; minHeight: number };
const initialFilters: Filters = { maxPrice: 350, maxDistance: 30, type: "tous", covered: "tous", minHeight: 0 };
const reportTitle = { free: "Place signalée libre", occupied: "Place signalée occupée", departure: "Départ annoncé" };
type RouteStep = { instruction: string; distance: number; location: [number, number] };
type RouteService = { id: string; lat: number; lng: number; name: string; kind: "charge" | "rest" | "parking" | "truck" | "restaurant" | "fuel"; detail?: string; price?: number; priceUpdated?: string };
type DrivingRoute = { id: string; label: string; coordinates: [number, number][]; distance: number; duration: number; destinationId: number; steps: RouteStep[]; fuelCost?: number; fuelPrice?: number; score?: number };
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

export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const utils = trpc.useUtils();
  const listingsQuery = trpc.govapark.listings.list.useQuery(undefined, { staleTime: 10000, refetchInterval: 30000 });
  const reportsQuery = trpc.govapark.community.list.useQuery(undefined, { refetchInterval: 30000 });
  const myReservations = trpc.govapark.reservations.mine.useQuery(undefined, { enabled: isAuthenticated });
  const [view, setView] = useState<"map" | "list">("map");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [search, setSearch] = useState("");
  const [destinationChosen, setDestinationChosen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
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
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [fuelStations, setFuelStations] = useState<Array<{id:number;lat:number;lng:number;name:string}>>([]);
  const [vehiclePrefs] = useState(() => { try { return JSON.parse(localStorage.getItem("govapark.preferences.v1") || "{}"); } catch { return {}; } });
  const [trackingGps, setTrackingGps] = useState(false);
  const [drivingRoute, setDrivingRoute] = useState<DrivingRoute | null>(null);
  const [routeOptions, setRouteOptions] = useState<DrivingRoute[]>([]);
  const [routeServices, setRouteServices] = useState<RouteService[]>([]);
  const [routeFuelType, setRouteFuelType] = useState<"gazole" | "e10" | "sp98" | "sp95" | "e85">("gazole");
  const [fuelConsumption, setFuelConsumption] = useState(7.2);
  const [routeLoading, setRouteLoading] = useState(false);
  const [voiceGuidanceEnabled, setVoiceGuidanceEnabled] = useState(false);
  const [backgroundAlertsEnabled, setBackgroundAlertsEnabled] = useState(false);
  const spokenStepIndex = useRef(0);
  const [proximityAlertsEnabled, setProximityAlertsEnabled] = useState(false);
  const alertedListingIds = useRef<Set<number>>(new Set());
  const watchId = useRef<number | null>(null);
  const gpsInitialized = useRef(false);
  const [departureUpdate, setDepartureUpdate] = useState(toLocalInput(new Date(Date.now() + 15 * 60000)));
  const learnedPredictions = trpc.govapark.intelligence.predictions.useQuery({ latitude: userPosition?.lat ?? visibleCenter.lat, longitude: userPosition?.lng ?? visibleCenter.lng, radiusKm: 5 }, { refetchInterval: 60000, staleTime: 30000 });

  const listings = useMemo(() => listingsQuery.data ?? [], [listingsQuery.data]);
  const reports = useMemo(() => reportsQuery.data ?? [], [reportsQuery.data]);
  const filtered = useMemo(() => listings.filter((listing) => {
    const distance = distanceMeters(visibleCenter.lat, visibleCenter.lng, listing.latitude, listing.longitude) / 1000;
    return listing.hourlyCents <= filters.maxPrice && distance <= filters.maxDistance &&
      (filters.type === "tous" || listing.placeType === filters.type) &&
      (filters.covered === "tous" || (filters.covered === "couvert" ? listing.covered : !listing.covered)) &&
      listing.heightCm >= filters.minHeight;
  }), [listings, filters, visibleCenter]);
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
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&countrycodes=fr&q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Recherche indisponible");
        const data = await response.json() as Array<{ display_name: string; lat: string; lon: string }>;
        setAddressSuggestions(data.map((item) => ({ label: item.display_name, lat: Number(item.lat), lng: Number(item.lon), kind: "address" as const })));
      } catch (error) {
        if ((error as Error).name !== "AbortError") setAddressSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearchingAddress(false);
      }
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search]);

  useEffect(() => {
    if (vehiclePrefs.fuelStations === false) { setFuelStations([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const around = userPosition ?? visibleCenter;
      const query = `[out:json][timeout:15];(node[amenity=fuel](around:5000,${around.lat},${around.lng});way[amenity=fuel](around:5000,${around.lat},${around.lng}););out center tags;`;
      try {
        const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) return;
        const payload = await response.json() as { elements?: Array<{id:number;lat?:number;lon?:number;center?:{lat:number;lon:number};tags?:{name?:string}} > };
        setFuelStations((payload.elements ?? []).flatMap(item => { const lat=item.lat ?? item.center?.lat, lng=item.lon ?? item.center?.lon; return lat == null || lng == null ? [] : [{id:item.id,lat,lng,name:item.tags?.name || "Station-service"}]; }).slice(0,80));
      } catch { /* le fond de carte reste disponible si Overpass est inaccessible */ }
    }, 700);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [visibleCenter.lat, visibleCenter.lng, userPosition?.lat, userPosition?.lng, vehiclePrefs.fuelStations]);

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

  const locate = () => {
    if (!navigator.geolocation) { toast.error("La géolocalisation n’est pas disponible sur cet appareil"); return; }
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setTrackingGps(false);
      toast.message("Suivi GPS arrêté");
      return;
    }
    setLocating(true);
    gpsInitialized.current = false;
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = navigator.geolocation.watchPosition((position) => {
      const next = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy };
      setUserPosition(next);
      setSpeedKmh(position.coords.speed == null ? null : Math.max(0, Math.round(position.coords.speed * 3.6)));
      setTrackingGps(true);
      if (!gpsInitialized.current) {
        setTarget({ lat: next.lat, lng: next.lng });
        setVisibleCenter({ lat: next.lat, lng: next.lng });
        gpsInitialized.current = true;
        toast.success("GPS activé : votre position est suivie");
      } else {
        // Suivi doux du véhicule : recentrer après environ 50 m de déplacement.
        setTarget((previous) => {
          const moved = Math.hypot((next.lat - previous.lat) * 111000, (next.lng - previous.lng) * 75000);
          return moved >= 50 ? { lat: next.lat, lng: next.lng } : previous;
        });
      }
      setLocating(false);
    }, () => { setLocating(false); toast.error("Position non partagée. Vérifiez l’autorisation de localisation."); }, {
      enableHighAccuracy: true, maximumAge: 5000, timeout: 15000,
    });
  };
  useEffect(() => () => { if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current); }, []);

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
      const response=await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      const found:RouteService[]=[];
      if(response.ok){const payload=await response.json() as {elements?:Array<{id:number;lat?:number;lon?:number;center?:{lat:number;lon:number};tags?:Record<string,string>}>};
        for(const item of payload.elements??[]){const lat=item.lat??item.center?.lat,lng=item.lon??item.center?.lon,tags=item.tags??{};if(lat==null||lng==null||distanceToRoute({lat,lng},route.coordinates)>1600)continue;
          let kind:RouteService["kind"]|null=null;if(tags.amenity==="charging_station")kind="charge";else if(tags.highway==="rest_area"||tags.highway==="services")kind="rest";else if(tags.hgv==="designated"||tags.amenity==="parking"&&tags.hgv)kind="truck";else if(tags.amenity==="parking")kind="parking";else if(tags.amenity==="restaurant")kind="restaurant";else if(tags.amenity==="fuel")kind="fuel";if(!kind)continue;
          found.push({id:`osm-${item.id}`,lat,lng,name:tags.name??(kind==="charge"?"Borne de recharge":kind==="rest"?"Aire de repos":kind==="truck"?"Stationnement poids lourds":kind==="parking"?"Parking":kind==="restaurant"?"Restauration":"Station-service"),kind,detail:[tags.operator,tags.capacity?`${tags.capacity} places`:null,tags.cuisine].filter(Boolean).join(" · ")});
        }
      }
      const mid=route.coordinates[Math.floor(route.coordinates.length/2)];
      const where=`within_distance(geom, geom'POINT (${mid[1]} ${mid[0]})', 18000)`;
      const fields="id,geom,adresse,ville,gazole_prix,gazole_maj,e10_prix,e10_maj,sp98_prix,sp98_maj,sp95_prix,sp95_maj,e85_prix,e85_maj,services_service";
      const fuelUrl=`https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?limit=100&select=${encodeURIComponent(fields)}&where=${encodeURIComponent(where)}`;
      const fuelResponse=await fetch(fuelUrl);
      if(fuelResponse.ok){const fuelData=await fuelResponse.json() as {results?:Array<{id:number;geom?:{lat:number;lon:number};adresse?:string;ville?:string;gazole_prix?:number;e10_prix?:number;sp98_prix?:number;sp95_prix?:number;e85_prix?:number;gazole_maj?:string;e10_maj?:string;sp98_maj?:string;sp95_maj?:string;e85_maj?:string;services_service?:string[]}>};
        const field=({gazole:"gazole_prix",e10:"e10_prix",sp98:"sp98_prix",sp95:"sp95_prix",e85:"e85_prix"} as const)[routeFuelType];const updateField=({gazole:"gazole_maj",e10:"e10_maj",sp98:"sp98_maj",sp95:"sp95_maj",e85:"e85_maj"} as const)[routeFuelType];
        for(const station of fuelData.results??[]){const lat=station.geom?.lat,lng=station.geom?.lon,price=station[field];if(lat==null||lng==null||price==null||distanceToRoute({lat,lng},route.coordinates)>12000)continue;const truck=station.services_service?.some(service=>/piste poids lourds/i.test(service))??false;found.push({id:`fuel-${station.id}`,lat,lng,name:`${station.adresse??"Station"}, ${station.ville??""}`.trim(),kind:truck?"truck":"fuel",price,priceUpdated:station[updateField],detail:station.services_service?.join(" · ")});}
      }
      setRouteServices(found);
    }catch{toast.message("Les services routiers sont temporairement indisponibles. Le trajet reste affiché.");}
  };

  const startRoute = async (listingId: number) => {
    const destination = listings.find((item) => item.id === listingId);
    if (!destination) return;
    await calculateRoutes({ lat: destination.latitude, lng: destination.longitude }, destination.title, listingId);
  };

  const calculateRoutes = async (destination: {lat:number;lng:number}, destinationName: string, listingId = 0) => {
    // Départ : position GPS si connue, sinon on la demande une fois (comme Google Maps),
    // sinon le centre de la carte.
    let origin: { lat: number; lng: number } = userPosition ?? { lat: visibleCenter.lat, lng: visibleCenter.lng };
    if (!userPosition && navigator.geolocation) {
      const here = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
        navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { timeout: 6000, maximumAge: 60000 });
      });
      if (here) { origin = here; setUserPosition({ ...here }); }
    }
    if (distanceMeters(origin.lat, origin.lng, destination.lat, destination.lng) < 100) {
      toast.error("Choisissez une destination différente de votre position."); return;
    }
    setRouteLoading(true); setRouteOptions([]); setRouteServices([]);
    try {
      // Plusieurs serveurs de calcul d'itinéraire : si le premier est saturé ou injoignable, on essaie le suivant.
      const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
      const endpoints = [
        `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&alternatives=3`,
        `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&alternatives=true`,
        `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`,
      ];
      let response: Response | null = null;
      for (const url of endpoints) {
        try {
          const attempt = await fetch(url, { signal: AbortSignal.timeout(12000) });
          if (attempt.ok) { response = attempt; break; }
        } catch { /* serveur suivant */ }
      }
      if (!response) throw new Error("Aucun serveur d’itinéraire ne répond pour le moment. Réessayez dans quelques instants.");
      const data = await response.json() as { routes?: Array<{geometry:{coordinates:[number,number][]};distance:number;duration:number;legs?:Array<{steps?:Array<{distance:number;name?:string;mode?:string;maneuver?:{type?:string;modifier?:string;location:[number,number]}}>}>}>};
      const rawRoutes = data.routes ?? [];
      if (!rawRoutes.length) throw new Error("Aucun itinéraire trouvé");
      const mapped: DrivingRoute[] = rawRoutes.slice(0,3).map((route,index) => {
        const rawSteps = route.legs?.flatMap((leg) => leg.steps ?? []) ?? [];
        const steps: RouteStep[] = rawSteps.map((step) => {
          const action = step.maneuver?.type === "turn" ? `Tournez ${step.maneuver.modifier ?? ""}` : step.maneuver?.type === "roundabout" ? "Prenez le rond-point" : step.maneuver?.type === "arrive" ? "Vous arrivez à destination" : step.maneuver?.type === "depart" ? "Démarrez" : "Continuez";
          const road = step.name ? ` sur ${step.name}` : "";
          return { instruction: `${action}${road}`.replace(/\s+/g, " ").trim(), distance: step.distance, location: [step.maneuver?.location?.[1] ?? destination.lat, step.maneuver?.location?.[0] ?? destination.lng] };
        });
        return { id: `route-${index}`, label: `Option ${index+1}`, coordinates:route.geometry.coordinates.map(([lng,lat])=>[lat,lng]), distance:route.distance, duration:route.duration, destinationId:listingId, steps };
      });
      const fields="id,geom,adresse,ville,gazole_prix,gazole_maj,e10_prix,e10_maj,sp98_prix,sp98_maj,sp95_prix,sp95_maj,e85_prix,e85_maj,services_service";
      const field=({gazole:"gazole_prix",e10:"e10_prix",sp98:"sp98_prix",sp95:"sp95_prix",e85:"e85_prix"} as const)[routeFuelType]; const updateField=({gazole:"gazole_maj",e10:"e10_maj",sp98:"sp98_maj",sp95:"sp95_maj",e85:"e85_maj"} as const)[routeFuelType];
      const fuelResults=await Promise.all(mapped.map(async route=>{
        const mid=route.coordinates[Math.floor(route.coordinates.length/2)];
        const where=`within_distance(geom, geom'POINT (${mid[1]} ${mid[0]})', 18000)`;
        const fuelUrl=`https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?limit=100&select=${encodeURIComponent(fields)}&where=${encodeURIComponent(where)}`;
        try {
          const fuelResponse=await fetch(fuelUrl); if(!fuelResponse.ok)return {route,stations:[] as RouteService[]};
          const fuelData=await fuelResponse.json() as {results?:Array<{id:number;geom?:{lat:number;lon:number};adresse?:string;ville?:string;gazole_prix?:number;e10_prix?:number;sp98_prix?:number;sp95_prix?:number;e85_prix?:number;gazole_maj?:string;e10_maj?:string;sp98_maj?:string;sp95_maj?:string;e85_maj?:string;services_service?:string[]}>};
          const stations=(fuelData.results??[]).flatMap(station=>{const lat=station.geom?.lat,lng=station.geom?.lon,price=station[field];if(lat==null||lng==null||price==null||distanceToRoute({lat,lng},route.coordinates)>12000)return[];return[{id:`fuel-${station.id}`,lat,lng,name:`${station.adresse??"Station"}, ${station.ville??""}`.trim(),kind:(station.services_service?.some(service=>/piste poids lourds/i.test(service))?"truck":"fuel") as "truck"|"fuel",price,priceUpdated:station[updateField],detail:station.services_service?.join(" · ")}];}).sort((a,b)=>(a.price??999)-(b.price??999));
          return {route,stations};
        } catch { return {route,stations:[] as RouteService[]}; }
      }));
      const pricedRoutes=fuelResults.map(({route,stations})=>{const cheapest=stations[0]?.price;return {...route,fuelPrice:cheapest,fuelCost:cheapest==null?undefined:(route.distance/1000)*(fuelConsumption/100)*cheapest};});
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
    if (!voiceGuidanceEnabled || !userPosition || !drivingRoute || !("speechSynthesis" in window)) return;
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
  }, [voiceGuidanceEnabled, userPosition, drivingRoute]);

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

  return (
    <div className={`home-screen view-${view}`}>
      <section className="map-workspace" aria-label="Recherche de stationnement">
        <div className={`map-area ${view === "list" ? "mobile-hidden" : ""}`}>
          <ParkingMap center={target} listings={filtered} reports={reports} userPosition={userPosition} confirmedIds={confirmedIds} fuelStations={fuelStations} vehicleType={vehiclePrefs.vehicle || "car"} vehicleColor={vehiclePrefs.vehicleColor || "#2563eb"}
            routeCoordinates={drivingRoute?.coordinates} routeListingIds={routeListingIds} routeServices={routeServices}
            onListing={(id) => navigate(`/place/${id}`)} onBook={(id) => navigate(`/reserver/${id}`)} onRoute={startRoute}
            onReport={(report) => setSelectedReportId(report.id)} onMove={setVisibleCenter} />
          {vehiclePrefs.speedometer !== false && <div className="speedometer-card"><Gauge size={17}/><strong>{speedKmh == null ? "—" : speedKmh}</strong><small>km/h · GPS</small></div>}
          <span className="map-credit">© OpenStreetMap · disponibilité indicative, selon la dernière mise à jour</span>
          {vehiclePrefs.compass !== false && <div className="map-compass" aria-label="Boussole : nord en haut"><span>▲</span><small>N</small></div>}
          <div className="map-status-legend" aria-label="Légende de disponibilité">
            <span><i className="legend-dot legend-available" />Libre / disponible</span>
            <span><i className="legend-dot legend-unavailable" />Occupée / indisponible</span>
            <span><i className="legend-dot legend-community" />Signalement communautaire</span>
            {userPosition && <span><i className="legend-dot legend-position" />Votre position GPS</span>}
          </div>
        </div>
        <div className="map-topbar">
          <div className="map-greeting"><div><strong>Bonjour{user?.name ? ` ${user.name.split(" ")[0]}` : ""} 👋</strong><span>Planifier un trajet</span></div><div className="map-greeting-actions"><button onClick={()=>navigate("/messages")} aria-label="Boîte de réception" title="Boîte de réception"><Mail size={18}/></button><button onClick={()=>navigate("/mobilite")} aria-label="Services de mobilité" title="Services de mobilité"><Fuel size={18}/></button><button onClick={()=>navigate("/profil")} aria-label="Paramètres" title="Paramètres"><Settings size={18}/></button></div></div>
          <div className="map-search-row"><div className="search-wrap">
            <Search size={19} />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setDestinationChosen(false); }} onFocus={() => setSearchFocused(true)}
              placeholder="Où souhaitez-vous aller ?" aria-label="Rechercher une adresse" />
            {search && <button onClick={() => setSearch("")} aria-label="Effacer la recherche"><X size={17} /></button>}
            {searchFocused && search.length > 1 && <div className="search-suggestions">
              {suggestions.map((suggestion, index) => <button key={`${suggestion.kind}-${suggestion.lat}-${suggestion.lng}-${index}`} onClick={() => {
                setSearch(suggestion.label); setDestinationChosen(true); setTarget({ lat: suggestion.lat, lng: suggestion.lng }); setVisibleCenter({ lat: suggestion.lat, lng: suggestion.lng }); setSearchFocused(false);
              }}><Navigation size={15} /><span>{suggestion.label}<small>{suggestion.subtitle ?? (suggestion.kind === "address" ? "Adresse ou quartier" : "Place Govapark")}</small></span></button>)}
              {searchingAddress && <p>Recherche de l’adresse…</p>}
              {!searchingAddress && suggestions.length === 0 && <p>Aucun résultat. Essayez une adresse, une ville ou un quartier.</p>}
            </div>}
          </div>
          <button className={`location-btn ${trackingGps ? "gps-active" : ""}`} onClick={locate} aria-label={trackingGps ? "Arrêter le suivi GPS" : "Activer le suivi GPS"} title={trackingGps ? "Arrêter le suivi GPS" : "Activer le suivi GPS"}><LocateFixed size={20} className={locating ? "spinning" : ""} /></button></div>
        </div>
        <div className="map-toolbar">
          <div className="view-toggle" aria-label="Mode d’affichage">
            <button className={view === "map" ? "active" : ""} onClick={() => setView("map")}><MapIcon size={16} />Carte</button>
            <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={16} />Liste</button>
          </div>
          <button className="filter-button" onClick={() => { setDraftFilters(filters); setFiltersOpen(true); }}><SlidersHorizontal size={17} />Filtres
            {(filters.type !== "tous" || filters.covered !== "tous" || filters.minHeight > 0 || filters.maxPrice < 350) && <span className="filter-dot" />}
          </button>
          <button className="report-button" onClick={() => setReportOpen(true)}><Plus size={17} />Signaler</button>
          <button className="filter-button" disabled={routeLoading} onClick={() => { if (drivingRoute) { setDrivingRoute(null); setRouteOptions([]); setRouteServices([]); } else if (destinationChosen) void calculateRoutes(target, search.trim()); else if(search.trim().length>0) toast.message("Sélectionnez une adresse dans les suggestions pour confirmer la destination."); else { const candidate=filtered.find((item) => item.currentAvailability === "available") ?? filtered[0]; if(candidate) void startRoute(candidate.id); else toast.message("Recherchez une destination pour calculer un trajet."); } }}>{routeLoading ? "Calcul…" : drivingRoute ? "Effacer trajet" : "Itinéraire"}</button>
          <button className="filter-button" onClick={enableProximityAlerts}>Alertes à 800 m</button>
          {drivingRoute && <button className={`filter-button ${voiceGuidanceEnabled ? "gps-active" : ""}`} onClick={() => {
            if (voiceGuidanceEnabled) { window.speechSynthesis?.cancel(); setVoiceGuidanceEnabled(false); toast.message("Guidage vocal arrêté"); }
            else { setVoiceGuidanceEnabled(true); spokenStepIndex.current = 0; const first = drivingRoute.steps[0]; if (first && "speechSynthesis" in window) { const speech = new SpeechSynthesisUtterance(`Guidage vocal activé. ${first.instruction}`); speech.lang = "fr-FR"; window.speechSynthesis.speak(speech); spokenStepIndex.current = 1; } }
          }}> {voiceGuidanceEnabled ? "Couper la voix" : "Guidage vocal"}</button>}
          <button className={`filter-button ${backgroundAlertsEnabled ? "gps-active" : ""}`} onClick={enableBackgroundAlerts}>Alertes arrière-plan</button>
        </div>
        <div className="public-disclaimer"><ShieldAlert size={16} /><span><strong>Voie publique :</strong> informations communautaires uniquement. Aucune réservation, location ou disponibilité garantie.</span></div>
        <details className="map-legend">
          <summary>Légende des marqueurs</summary>
          <div><span><i className="legend-dot green" />Libre récemment <small>non garanti</small></span><span><i className="legend-dot red" />Occupée</span><span><i className="legend-dot orange" />Départ annoncé</span><span><i className="legend-dot violet" />Privée à louer</span><span><i className="legend-dot blue" />Ma réservation confirmée</span></div>
        </details>
        {view === "map" && <button className="mobile-results-pill" onClick={() => setView("list")}><List size={16} />{filtered.length} places privées · voir la liste</button>}
      </section>

      <aside className={`results-panel ${view === "map" ? "desktop-only" : ""}`}>
        <section className="prediction-panel" aria-label="Prévision des départs de stationnement">
          <div className="prediction-heading"><div><span className="eyebrow">GOVAPARK INTELLIGENCE</span><h2>Places susceptibles de se libérer</h2></div><span className="prediction-live">En direct</span></div>
          <p className="prediction-explainer">Estimation basée sur les départs annoncés récemment par la communauté, leur heure prévue et leur niveau de confiance. Ce n’est pas une garantie de place libre.</p>
          {predictedDepartures.length === 0 ? <div className="prediction-empty">Aucun départ annoncé suffisamment récent dans un rayon de 5 km. Les places privées disponibles restent affichées ci-dessous.</div> : predictedDepartures.map((item) => <div className="prediction-row" key={`prediction-${item.id}`}>
            <div className="prediction-score" aria-label={`Indice ${item.potentialIndex} sur 100`}>{item.potentialIndex}<small>/100</small></div>
            <div className="prediction-copy"><strong>{item.address}</strong><span>{item.minutesUntil === 0 ? "Départ prévu maintenant" : `Départ annoncé dans ${item.minutesUntil} min`} · à ${item.distance < 1000 ? `${Math.round(item.distance)} m` : `${(item.distance/1000).toFixed(1)} km`}</span><small>Confiance communautaire : {item.confidence}% · actualisé {ago(item.updatedAt)}</small></div>
          </div>)}
          <div className="learned-zone-panel"><strong>Historique intelligent des zones</strong><small>{learnedPredictions.data?.totalObservations ?? 0} observations enregistrées dans un rayon de 5 km · 90 derniers jours</small>{(learnedPredictions.data?.predictions ?? []).slice(0,3).map((zone) => <div key={`${zone.cellKey}-${zone.weekday}-${zone.hour}`}><span>{zone.score}/100 · {zone.confidence === "élevée" ? "confiance élevée" : zone.confidence === "moyenne" ? "confiance moyenne" : "confiance faible"}</span><small>{zone.observations} observations · {zone.freeSignals} libres · {zone.occupiedSignals} occupées</small></div>)}{!learnedPredictions.data?.predictions.length && <small>Le moteur attend davantage de confirmations réelles pour établir des tendances horaires fiables.</small>}</div>
          <small className="prediction-footnote">Indice expérimental. Les prévisions reposent sur les observations communautaires des 90 derniers jours, regroupées par zone, jour et heure. Elles ne garantissent jamais une place libre.</small>
        </section>
        {drivingRoute && <section className="route-results"><div><strong>Vos 3 alternatives de trajet</strong><span>{(drivingRoute.distance/1000).toFixed(1)} km · {Math.round(drivingRoute.duration/60)} min</span></div>
          <div className="route-options">{routeOptions.map((option)=> <button key={option.id} className={`route-option ${drivingRoute.id===option.id?"selected":""}`} onClick={()=>{setDrivingRoute(option);void refreshRouteServices(option);spokenStepIndex.current=0;}}><strong>{option.label}</strong><span>{(option.distance/1000).toFixed(1)} km · {Math.round(option.duration/60)} min</span>{option.fuelPrice!=null?<small>Carburant estimé : {((option.distance/1000)*(fuelConsumption/100)*option.fuelPrice).toFixed(2)} €</small>:<small>Coût carburant indisponible</small>}</button>)}</div>
          <div className="route-cost-controls"><label>Carburant<select value={routeFuelType} onChange={e=>setRouteFuelType(e.target.value as typeof routeFuelType)}><option value="gazole">Gazole</option><option value="e10">SP95-E10</option><option value="sp95">SP95</option><option value="sp98">SP98</option><option value="e85">E85</option></select></label><label>Consommation moyenne<input type="number" min="1" max="60" step="0.1" value={fuelConsumption} onChange={e=>setFuelConsumption(Math.max(1,Math.min(60,Number(e.target.value)||7.2)))}/><small>L/100 km</small></label><button className="btn btn-secondary" onClick={()=>{if(drivingRoute?.destinationId)void startRoute(drivingRoute.destinationId);else if(destinationChosen)void calculateRoutes(target,search.trim());else toast.message("Sélectionnez d’abord une destination.");}}>Actualiser les prix</button></div>
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
          {listingsQuery.isLoading && [1,2,3].map((item) => <div className="listing-skeleton" key={item} />)}
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

      {selectedReport && <Modal title={reportTitle[selectedReport.kind]} onClose={() => setSelectedReportId(null)}>
        <div className={`report-detail-head ${selectedReport.kind}`}><span className="report-status-dot" /><div><strong>{selectedReport.address}</strong><p>Information communautaire · disponibilité non garantie</p></div></div>
        <dl className="report-facts"><div><dt>Mise à jour</dt><dd>{ago(selectedReport.updatedAt)} · {shortDate(selectedReport.updatedAt)}</dd></div><div><dt>Source</dt><dd>{selectedReport.source}</dd></div><div><dt>Confiance</dt><dd>{selectedReport.confidence}% · {selectedReport.confidence >= 75 ? "élevée" : selectedReport.confidence >= 50 ? "modérée" : "à vérifier"}</dd></div></dl>
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
