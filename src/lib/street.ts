// Aides de la couche « Places en rue » : position de l'appareil (obligatoire pour SIGNALER seulement) et messages courts.
// Chercher des places près d'une adresse n'a besoin d'aucune position ; la règle des 50 m est vérifiée par le serveur.

export { geolocMessage, GeolocError, getDevicePosition, type DevicePosition, type GeolocReason } from "./geoloc";
