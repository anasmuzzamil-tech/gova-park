import { Capacitor, registerPlugin } from "@capacitor/core";

type BackgroundLocation = { latitude:number; longitude:number; accuracy:number; speed:number|null; time:number|null };
type BackgroundLocationPlugin = {
  addWatcher(options:{backgroundTitle:string;backgroundMessage:string;requestPermissions:boolean;stale:boolean;distanceFilter:number}, callback:(location?:BackgroundLocation,error?:Error)=>void):Promise<string>;
  removeWatcher(options:{id:string}):Promise<void>;
};
const BackgroundGeolocation = registerPlugin<BackgroundLocationPlugin>("BackgroundGeolocation");
let activeWatcher: string | null = null;

/** Le suivi ne démarre qu'après une action explicite du conducteur. Les coordonnées ne sont pas envoyées au serveur par ce module. */
export async function startConsentedBackgroundLocation(onPosition:(position:BackgroundLocation)=>void) {
  if (!Capacitor.isNativePlatform()) throw new Error("Le GPS en arrière-plan exige l’application iOS/Android installée.");
  if (activeWatcher) return activeWatcher;
  activeWatcher = await BackgroundGeolocation.addWatcher({
    backgroundTitle:"GOVAPARK utilise votre position",
    backgroundMessage:"Le guidage est actif. Touchez pour revenir à GOVAPARK ou arrêtez le suivi dans l’application.",
    requestPermissions:true, stale:false, distanceFilter:25,
  }, (position,error) => {
    if (error) return;
    if (position && Number.isFinite(position.latitude) && Number.isFinite(position.longitude)) onPosition(position);
  });
  return activeWatcher;
}
export async function stopConsentedBackgroundLocation() {
  if (!activeWatcher) return;
  const id=activeWatcher; activeWatcher=null;
  await BackgroundGeolocation.removeWatcher({id});
}
