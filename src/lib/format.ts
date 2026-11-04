import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

export const euros = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
export const shortDate = (date: Date | string) => format(new Date(date), "d MMM · HH:mm", { locale: fr });
export const fullDate = (date: Date | string) => {
  const text = format(new Date(date), "EEEE d MMMM à HH:mm", { locale: fr });
  return text.charAt(0).toUpperCase() + text.slice(1);
};
export const ago = (date: Date | string) => formatDistanceToNow(new Date(date), { addSuffix: true, locale: fr });
export const placeTypeLabel = (type: string) => ({ garage: "Garage / box", residence: "Place en résidence", entreprise: "Parking d’entreprise", parking: "Parking privé" }[type] ?? type);
export const bookingModeLabel = (mode: string) => mode === "instant" ? "Réservation instantanée" : "Sur validation du propriétaire";
export const statusLabel = (status: string) => ({
  pending: "En attente", payment_pending: "Paiement requis", confirmed: "Confirmée", in_progress: "En cours",
  completed: "Terminée", cancelled: "Annulée", refund_pending: "Remboursement en cours", refunded: "Remboursée", dispute: "Litige",
  draft: "Brouillon", published: "Publiée", suspended: "Suspendue", rejected: "Refusée", archived: "Archivée",
}[status] ?? status);

export function toLocalInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
