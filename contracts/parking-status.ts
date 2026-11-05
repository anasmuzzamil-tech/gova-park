// Statut d'une place de stationnement, calculé à partir de signaux datés et sourcés.
// Règles (mission GOVAPARK) :
//  - VERT   : disponible CONFIRMÉ par une source fiable (exploitant, propriétaire, capteur, open data temps réel).
//  - ROUGE  : occupé confirmé (source fiable, ou signalement communautaire confirmé par au moins 2 personnes).
//  - ORANGE : estimation ou signalement récent non confirmé.
//  - GRIS   : inconnu, ou information trop ancienne (périmée).
// Un signalement communautaire seul ne donne JAMAIS du vert ICI (places privées, parkings, ancien « Signaler »). Aucune disponibilité n'est inventée.
// EXCEPTION décidée par Anas : les places gratuites EN RUE signalées par la communauté peuvent être vertes 5 min (voir contracts/street-reports.ts).

export type StatusColor = "green" | "red" | "orange" | "gray";
export type SourceType = "operator" | "sensor" | "owner" | "open_data" | "community" | "estimate";
export type SignalState = "free" | "occupied" | "departure" | "closed";

export type StatusSignal = {
  state: SignalState;
  sourceType: SourceType;
  source: string;
  observedAt: Date | string;
  /** Durée de validité en minutes. Par défaut : voir validityMinutes(). */
  validForMinutes?: number;
  /** Fiabilité 0-100 (signalements communautaires). */
  confidence?: number;
  confirmations?: number;
  contradictions?: number;
  estimatedDeparture?: Date | string | null;
};

export type ParkingStatus = {
  color: StatusColor;
  availability: "available" | "unavailable" | "uncertain" | "unknown";
  label: string;
  detail: string;
  source: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  reliability: "high" | "medium" | "low" | "none";
  reliabilityPct: number | null;
  stale: boolean;
};

export const STATUS_COLORS: Record<StatusColor, string> = { green: "#12a150", red: "#e5483c", orange: "#f08a14", gray: "#8a8f9c" };

const AUTHORITATIVE: SourceType[] = ["operator", "sensor", "owner", "open_data"];

export function validityMinutes(signal: StatusSignal): number {
  if (signal.validForMinutes != null) return signal.validForMinutes;
  if (signal.sourceType === "operator" || signal.sourceType === "sensor") return 10;
  if (signal.sourceType === "owner" || signal.sourceType === "open_data") return 15;
  if (signal.sourceType === "community" && signal.state === "free") return 15;
  return 30;
}

function expiryOf(signal: StatusSignal): Date {
  const observed = new Date(signal.observedAt).getTime();
  let end = observed + validityMinutes(signal) * 60000;
  if (signal.state === "departure" && signal.estimatedDeparture) end = Math.max(end, new Date(signal.estimatedDeparture).getTime() + 10 * 60000);
  return new Date(end);
}

const hhmm = (d: Date | string) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(d));

export function resolveStatus(signals: StatusSignal[], now: Date = new Date()): ParkingStatus {
  const t = now.getTime();
  const valid: StatusSignal[] = [];
  let latestExpired: StatusSignal | null = null;
  for (const s of signals) {
    const observed = new Date(s.observedAt).getTime();
    if (!Number.isFinite(observed) || observed > t + 2 * 60000) continue; // date future : ignorée
    if (expiryOf(s).getTime() <= t) {
      if (!latestExpired || observed > new Date(latestExpired.observedAt).getTime()) latestExpired = s;
      continue;
    }
    // Un signalement contredit plus souvent qu'il n'est confirmé n'est pas retenu.
    if (s.sourceType === "community" && (s.contradictions ?? 0) > (s.confirmations ?? 0)) continue;
    valid.push(s);
  }
  const newest = (list: StatusSignal[]) => list.reduce<StatusSignal | null>((best, s) => !best || new Date(s.observedAt) > new Date(best.observedAt) ? s : best, null);

  const authoritative = newest(valid.filter((s) => AUTHORITATIVE.includes(s.sourceType)));
  if (authoritative) {
    const base = { source: authoritative.source, updatedAt: new Date(authoritative.observedAt).toISOString(), expiresAt: expiryOf(authoritative).toISOString(), reliability: "high" as const, reliabilityPct: authoritative.confidence ?? 90, stale: false };
    if (authoritative.state === "free") return { ...base, color: "green", availability: "available", label: "Disponible", detail: "Disponibilité confirmée par la source indiquée." };
    if (authoritative.state === "occupied") return { ...base, color: "red", availability: "unavailable", label: "Occupée", detail: "Occupation confirmée par la source indiquée." };
    if (authoritative.state === "closed") return { ...base, color: "gray", availability: "unavailable", label: "Indisponible", detail: "Hors horaires ou période bloquée par le propriétaire." };
  }

  const community = newest(valid.filter((s) => s.sourceType === "community" || s.sourceType === "estimate"));
  if (community) {
    const pct = Math.max(0, Math.min(100, community.confidence ?? 50));
    const base = { source: community.source, updatedAt: new Date(community.observedAt).toISOString(), expiresAt: expiryOf(community).toISOString(), reliabilityPct: pct, reliability: (pct >= 75 ? "medium" : "low") as "medium" | "low", stale: false };
    if (community.state === "occupied" && (community.confirmations ?? 0) >= 2 && pct >= 70) return { ...base, color: "red", availability: "unavailable", label: "Occupée", detail: "Occupation signalée et confirmée par plusieurs utilisateurs." };
    if (community.state === "occupied") return { ...base, color: "orange", availability: "uncertain", label: "Signalée occupée", detail: "Signalement récent non confirmé : à vérifier sur place." };
    if (community.state === "departure") return { ...base, color: "orange", availability: "uncertain", label: community.estimatedDeparture ? `Départ annoncé vers ${hhmm(community.estimatedDeparture)}` : "Départ annoncé", detail: "Estimation communautaire : la place n'est pas encore libre." };
    return { ...base, color: "orange", availability: "uncertain", label: "Signalée libre, non confirmée", detail: "Signalement récent d'un utilisateur : la disponibilité n'est pas garantie." };
  }

  if (latestExpired) return { color: "gray", availability: "unknown", label: "Information trop ancienne", detail: "Le dernier signalement ou la dernière donnée a expiré : la disponibilité réelle n'est pas connue.", source: latestExpired.source, updatedAt: new Date(latestExpired.observedAt).toISOString(), expiresAt: expiryOf(latestExpired).toISOString(), reliability: "none", reliabilityPct: null, stale: true };
  return { color: "gray", availability: "unknown", label: "Aucun signalement récent", detail: "Aucune donnée temps réel pour cette place : seules les informations statiques sont affichées.", source: null, updatedAt: null, expiresAt: null, reliability: "none", reliabilityPct: null, stale: false };
}

export const reliabilityLabel = (r: ParkingStatus["reliability"]) => ({ high: "élevée", medium: "moyenne", low: "faible", none: "aucune" }[r]);

/** Statut d'une place privée : calendrier du propriétaire + réservations GOVAPARK (sources fiables, calculées à l'instant). */
export function listingStatus(input: { openNow: boolean; blockedNow: boolean; booked: boolean; demo?: boolean }, now: Date = new Date()): ParkingStatus {
  const source = input.demo ? "Simulation (mode démo, données d'exemple)" : input.booked ? "Réservations GOVAPARK" : "Calendrier du propriétaire";
  const state: SignalState = input.booked ? "occupied" : input.openNow && !input.blockedNow ? "free" : "closed";
  return resolveStatus([{ state, sourceType: "owner", source, observedAt: now, validForMinutes: 15 }], now);
}

/** Statut d'un signalement communautaire (jamais vert). */
export function reportStatus(report: { kind: "free" | "occupied" | "departure"; updatedAt: Date | string; confidence?: number | null; confirmations?: number; contradictions?: number; estimatedDeparture?: Date | string | null; source?: string }, now: Date = new Date()): ParkingStatus {
  return resolveStatus([{ state: report.kind, sourceType: "community", source: report.source ?? "Communauté", observedAt: report.updatedAt, confidence: report.confidence ?? 50, confirmations: report.confirmations ?? 0, contradictions: report.contradictions ?? 0, estimatedDeparture: report.estimatedDeparture ?? null }], now);
}

/**
 * Pastille d'une carte de place : seulement quand une source ou un signalement le justifie (vert, rouge, orange, fermée).
 * Une place grise n'a AUCUNE pastille : elle ne promet pas qu'elle est libre et ne parle pas de « statut ».
 */
export function statePillLabel(status: { color: string; availability: string } | null | undefined): string | null {
  if (!status) return null;
  if (status.color === "green") return "Dispo";
  if (status.color === "red") return "Occupée";
  if (status.color === "orange") return "À vérifier";
  if (status.availability === "unavailable") return "Fermée";
  return null;
}
