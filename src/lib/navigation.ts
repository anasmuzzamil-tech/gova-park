// Liens pour lancer un itinéraire vers une place dans une application de navigation (aucune clé, aucun service payant).
export function navigationLinks(lat: number, lng: number) {
  const dest = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return [
    { id: "google", label: "Google Maps", url: `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving` },
    { id: "waze", label: "Waze", url: `https://waze.com/ul?ll=${dest}&navigate=yes` },
    { id: "apple", label: "Plans (Apple)", url: `https://maps.apple.com/?daddr=${dest}&dirflg=d` },
  ];
}
