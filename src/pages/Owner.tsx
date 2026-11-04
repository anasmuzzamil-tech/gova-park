import { useMemo, useState, type FormEvent } from "react";
import { BarChart3, CalendarRange, Camera, Check, ChevronRight, CirclePlus, Clock3, FileCheck2, ImagePlus, Inbox, ListChecks, LoaderCircle, LockKeyhole, Star, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { AuthGate } from "@/components/AuthGate";
import { validateListing } from "@contracts/listing-validation";
import { bookingModeLabel, euros, fullDate, placeTypeLabel, statusLabel, toLocalInput } from "@/lib/format";

type OwnerTab = "listings" | "new" | "calendar" | "requests" | "revenue";
type Blocked = { start: string; end: string };
type Availability = { days: number[]; start: string; end: string };
type Photo = { key: string; preview: string };
const week = [{ n: 1, label: "Lun" }, { n: 2, label: "Mar" }, { n: 3, label: "Mer" }, { n: 4, label: "Jeu" }, { n: 5, label: "Ven" }, { n: 6, label: "Sam" }, { n: 0, label: "Dim" }];

export default function Owner() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const canManage = isAuthenticated && !!user && ["owner", "admin"].includes(user.role);
  const [tab, setTab] = useState<OwnerTab>("listings");
  const [legalName, setLegalName] = useState(""); const [phone, setPhone] = useState("");
  const [documentType, setDocumentType] = useState<"identity"|"property_proof"|"company_registration">("property_proof");
  const [documentBusy, setDocumentBusy] = useState(false);
  const utils = trpc.useUtils();
  const submitVerification = trpc.govapark.owner.submitVerification.useMutation({ onSuccess: async () => { toast.success("Dossier envoyé à l’équipe GOVAPARK"); await utils.auth.me.invalidate(); }, onError: e => toast.error(e.message) });
  const uploadVerification = trpc.govapark.storage.upload.useMutation();
  const attachVerificationDocument = trpc.govapark.owner.submitVerificationDocument.useMutation({ onSuccess: async () => { toast.success("Justificatif ajouté au dossier"); await utils.govapark.owner.myVerificationDocuments.invalidate(); }, onError: e => toast.error(e.message) });
  const verificationDocuments = trpc.govapark.owner.myVerificationDocuments.useQuery(undefined, { enabled: canManage });
  const listingsQuery = trpc.govapark.listings.mine.useQuery(undefined, { enabled: canManage });
  const dashboardQuery = trpc.govapark.owner.dashboard.useQuery(undefined, { enabled: canManage });
  const requestsQuery = trpc.govapark.owner.requests.useQuery(undefined, { enabled: canManage });
  const setStatus = trpc.govapark.listings.setStatus.useMutation({ onSuccess: () => { toast.success("Statut de l’annonce mis à jour"); utils.govapark.listings.mine.invalidate(); utils.govapark.owner.dashboard.invalidate(); } });
  const accept = trpc.govapark.owner.accept.useMutation({ onSuccess: () => { toast.success("Demande acceptée. Le paiement réel n’est pas encore activé."); utils.govapark.owner.requests.invalidate(); utils.govapark.owner.dashboard.invalidate(); utils.govapark.reservations.mine.invalidate(); }, onError: (e) => toast.error(e.message) });
  const refuse = trpc.govapark.owner.refuse.useMutation({ onSuccess: () => { toast.success("Demande refusée"); utils.govapark.owner.requests.invalidate(); utils.govapark.owner.dashboard.invalidate(); }, onError: (e) => toast.error(e.message) });
  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  const pendingCount = requests.filter((r) => r.reservation.status === "pending").length;
  const revenue = requests.filter((r) => ["confirmed", "in_progress", "completed", "refund_pending", "refunded"].includes(r.reservation.status)).reduce((acc, row) => ({ gross: acc.gross + row.reservation.baseCents, commission: acc.commission + row.reservation.commissionCents, net: acc.net + row.reservation.netCents }), { gross: 0, commission: 0, net: 0 });

  return <div className="standard-page owner-page">
    <div className="page-header owner-header"><div><span className="eyebrow">Espace propriétaire</span><h1>Partagez votre place.</h1><p>Une annonce n’est visible qu’après vérification par Govapark.</p></div>{isAuthenticated && <button className="btn btn-primary" disabled={user?.role !== "admin" && user?.ownerVerificationStatus !== "verified"} onClick={() => setTab("new")}><CirclePlus size={18} />Nouvelle annonce</button>}</div>
    {!isAuthenticated && !isLoading ? <AuthGate title="Connectez-vous à votre espace propriétaire" /> : user && !["owner", "admin"].includes(user.role) ? <div className="profile-section"><h2>Espace réservé aux propriétaires</h2><p>Pour publier et gérer une place, créez un compte de type propriétaire.</p></div> : <>
      {user?.role === "owner" && user.ownerVerificationStatus !== "verified" && <div className="form-notice"><LockKeyhole size={19}/><span><strong>{user.ownerVerificationStatus === "rejected" ? "Votre dossier propriétaire a été refusé." : "Votre compte propriétaire doit être vérifié."}</strong> Renseignez les coordonnées du titulaire. La publication sera disponible après examen par l’équipe GOVAPARK.</span></div>}
      {user?.role === "owner" && user.ownerVerificationStatus !== "verified" && <section className="profile-section owner-verification-form"><h2>Vérification du propriétaire</h2><form className="form-grid" onSubmit={e=>{e.preventDefault();submitVerification.mutate({legalName,phone});}}><label>Nom légal du titulaire<input required minLength={2} maxLength={180} value={legalName} onChange={e=>setLegalName(e.target.value)} placeholder="Nom et prénom ou raison sociale"/></label><label>Téléphone de contact<input required minLength={6} maxLength={40} type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+33…"/></label><div className="span-2"><button className="btn btn-primary" disabled={submitVerification.isPending}>{submitVerification.isPending?"Envoi…":"Envoyer mon dossier"}</button></div></form><div className="verification-document-upload"><h3>Ajouter les justificatifs</h3><label>Type de document<select value={documentType} onChange={e=>setDocumentType(e.target.value as typeof documentType)}><option value="identity">Pièce d’identité</option><option value="property_proof">Justificatif de propriété / droit de louer</option><option value="company_registration">Document d’immatriculation société</option></select></label><label className="upload-zone"><Upload size={20}/><strong>{documentBusy ? "Envoi du document…" : "Choisir un PDF, JPG ou PNG"}</strong><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={documentBusy} onChange={async e=>{const inputElement=e.currentTarget;const file=inputElement.files?.[0];if(!file)return;if(file.size>10_000_000){toast.error("Document limité à 10 Mo");return;}setDocumentBusy(true);try{const data=await fileToDataUrl(file);const saved=await uploadVerification.mutateAsync({name:file.name,contentBase64:data.split(",")[1],contentType:file.type});await attachVerificationDocument.mutateAsync({fileKey:saved.key,documentType,originalName:file.name});}catch(err){toast.error(err instanceof Error?err.message:"Échec de l’envoi");}finally{setDocumentBusy(false);inputElement.value="";}}}/></label>{verificationDocuments.data?.map(doc=><small key={doc.id} className="verification-note">{doc.documentType} · {doc.originalName} · transmis le {new Date(doc.createdAt).toLocaleDateString("fr-FR")}</small>)}</div><small className="verification-note">Les justificatifs sont privés et accessibles temporairement aux administrateurs habilités. GOVAPARK doit définir une durée de conservation et une procédure RGPD avant l’ouverture publique.</small></section>}
      <section className="owner-overview" aria-label="Résumé de votre activité">
        <div className="section-title-row"><h2>Vue d’ensemble</h2><span>Indicateurs de votre compte</span></div>
        <div className="revenue-grid owner-kpi-grid">
          <div><span>Annonces publiées</span><strong>{dashboardQuery.data?.listingsPublished ?? 0}</strong><small>{dashboardQuery.data?.listingsPending ?? 0} en vérification · {dashboardQuery.data?.listingsTotal ?? 0} au total</small></div>
          <div><span>Demandes en attente</span><strong>{dashboardQuery.data?.requestsPending ?? pendingCount}</strong><small>{dashboardQuery.data?.reservationsTotal ?? requests.length} réservation(s) reçue(s)</small></div>
          <div className="net"><span>Net calculé</span><strong>{euros(dashboardQuery.data?.netCents ?? revenue.net)}</strong><small>Réservations confirmées ou terminées · hors versement réel</small></div>
        </div>
        <p className="verification-note"><LockKeyhole size={15} /> Paiements et versements réels non activés : les montants affichés sont des calculs du prototype, pas de l’argent encaissé.</p>
      </section>
      <div className="tabs owner-tabs" role="tablist">{([{ id: "listings", label: "Annonces", icon: ListChecks }, { id: "new", label: "Créer", icon: CirclePlus }, { id: "calendar", label: "Calendrier", icon: CalendarRange }, { id: "requests", label: `Demandes${pendingCount ? ` · ${pendingCount}` : ""}`, icon: Inbox }, { id: "revenue", label: "Revenus", icon: BarChart3 }] as const).map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><item.icon size={17} />{item.label}</button>)}</div>
      {tab === "listings" && <section className="owner-section"><div className="section-title-row"><h2>Mes annonces</h2><span>{listingsQuery.data?.length ?? 0} annonce(s)</span></div>
        {listingsQuery.isLoading && <div className="page-loading"><span className="loader" />Chargement…</div>}
        {listingsQuery.data?.length === 0 && <div className="empty-state"><FileCheck2 size={29} /><h2>Votre première annonce commence ici</h2><p>Ajoutez des photos, les dimensions et vos disponibilités.</p><button className="btn btn-primary" onClick={() => setTab("new")}>Créer une annonce</button></div>}
        <div className="owner-listings">{listingsQuery.data?.map((listing) => <article key={listing.id}><img src={listing.photos[listing.mainPhoto] || listing.photos[0]} alt="" /><div className="owner-listing-content"><div><span className={`status-badge listing-${listing.status}`}>{statusLabel(listing.status)}</span><h3>{listing.title}</h3><p>{listing.approxAddress} · {placeTypeLabel(listing.placeType)}</p></div><div className="owner-listing-price"><strong>{euros(listing.hourlyCents)}/h</strong><span>{bookingModeLabel(listing.bookingMode)}</span></div></div><div className="owner-listing-actions">{listing.status === "published" && <button className="btn btn-secondary" onClick={() => setStatus.mutate({ id: listing.id, status: "suspended" })}>Suspendre</button>}{listing.status === "draft" && <button className="btn btn-secondary" onClick={() => setStatus.mutate({ id: listing.id, status: "pending" })}>Soumettre à vérification</button>}{!["archived", "pending"].includes(listing.status) && <button className="btn btn-ghost" onClick={() => setStatus.mutate({ id: listing.id, status: "archived" })}>Archiver</button>}{listing.status === "pending" && <span className="verification-note"><Clock3 size={15} />Vérification requise avant publication</span>}</div></article>)}</div>
      </section>}
      {tab === "new" && <ListingForm onDone={() => { setTab("listings"); utils.govapark.listings.mine.invalidate(); utils.govapark.owner.dashboard.invalidate(); }} />}
      {tab === "calendar" && <section className="owner-section"><div className="section-title-row"><h2>Disponibilités et exceptions</h2><span>Bloquez les périodes indisponibles</span></div>{listingsQuery.data?.length ? <CalendarTab listings={listingsQuery.data} /> : <div className="empty-state"><p>Créez d’abord une annonce pour régler son calendrier.</p></div>}</section>}
      {tab === "requests" && <section className="owner-section"><div className="section-title-row"><h2>Demandes de réservation</h2><span>La confirmation ne déclenche aucun paiement réel</span></div><div className="request-list">{requests.length === 0 && <div className="empty-state"><Inbox size={28} /><h2>Aucune demande</h2><p>Les nouvelles demandes apparaîtront ici.</p></div>}{requests.map(({ reservation, listing }) => <article key={reservation.id}><div><span className={`status-badge status-${reservation.status}`}>{statusLabel(reservation.status)}</span><h3>{listing.title}</h3><p>{fullDate(reservation.startAt)} → {fullDate(reservation.endAt)}</p><small>Demande n°{reservation.id} · {reservation.expiresAt && reservation.status === "pending" ? `expire ${new Date(reservation.expiresAt).toLocaleString("fr-FR")}` : bookingModeLabel(listing.bookingMode)}</small></div><div className="request-value"><strong>{euros(reservation.baseCents)}</strong><span>Net dû : {euros(reservation.netCents)}</span></div>{reservation.status === "pending" && <div className="request-actions"><button className="btn btn-primary" disabled={accept.isPending} onClick={() => accept.mutate({ id: reservation.id })}><Check size={16} />Accepter</button><button className="btn btn-secondary" onClick={() => refuse.mutate({ id: reservation.id })}><X size={16} />Refuser</button></div>}</article>)}</div></section>}
      {tab === "revenue" && <section className="owner-section"><div className="section-title-row"><h2>Revenus</h2><span>Commission Govapark : 12 % du stationnement</span></div><div className="revenue-grid"><div><span>Montant brut</span><strong>{euros(revenue.gross)}</strong><small>Hors frais de service payés par le locataire</small></div><div><span>Commission</span><strong>− {euros(revenue.commission)}</strong><small>12 % du montant brut</small></div><div className="net"><span>Net dû</span><strong>{euros(revenue.net)}</strong><small>Sur les réservations confirmées</small></div></div><div className="revenue-table">{requests.filter((r) => ["confirmed", "in_progress", "completed"].includes(r.reservation.status)).map(({ reservation, listing }) => <div key={reservation.id}><span>{listing.title}<small>{fullDate(reservation.startAt)}</small></span><span>{euros(reservation.baseCents)}</span><span>− {euros(reservation.commissionCents)}</span><strong>{euros(reservation.netCents)}</strong></div>)}</div></section>}
    </>}
  </div>;
}

function ListingForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ title: "", approxAddress: "", address: "", description: "", access: "", accessible: false, type: "garage", covered: true, length: "4,8", width: "2,4", height: "190", hourly: "2,50", daily: "18", weekly: "95", mode: "instant" });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [mainPhoto, setMainPhoto] = useState(0);
  const [availability, setAvailability] = useState<Availability>({ days: [1,2,3,4,5], start: "08:00", end: "20:00" });
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [uploading, setUploading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const upload = trpc.govapark.storage.upload.useMutation();
  const create = trpc.govapark.listings.create.useMutation({ onSuccess: (result) => { toast.success(result.status === "pending" ? "Annonce envoyée pour vérification" : "Brouillon enregistré"); onDone(); }, onError: (e) => toast.error(e.message) });
  const number = (value: string) => Number(value.replace(",", "."));
  const update = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList).slice(0, 8 - photos.length)) {
        if (file.size > 10_000_000) { toast.error(`${file.name} dépasse 10 Mo`); continue; }
        const dataUrl = await fileToDataUrl(file);
        const result = await upload.mutateAsync({ name: file.name, contentBase64: dataUrl.split(",")[1], contentType: file.type });
        setPhotos((current) => [...current, { key: result.key, preview: dataUrl }]);
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Échec de l’envoi de la photo"); }
    finally { setUploading(false); }
  };
  // Position GPS réelle : géocodage de l'adresse exacte (api-adresse.data.gouv.fr, gratuit) ; l'utilisateur voit le résultat avant d'envoyer.
  const locateAddress = async () => {
    if (form.address.trim().length < 5) { toast.error("Saisissez d'abord l'adresse exacte"); return; }
    setLocating(true);
    try {
      const response = await fetch(`https://api-adresse.data.gouv.fr/search/?limit=1&q=${encodeURIComponent(form.address)}`);
      const body = await response.json() as { features?: Array<{ geometry: { coordinates: [number, number] }; properties: { label: string; city?: string; postcode?: string } }> };
      const hit = body.features?.[0];
      if (!hit) { setCoords(null); toast.error("Adresse introuvable : précisez le numéro, la rue et le code postal"); return; }
      setCoords({ lat: hit.geometry.coordinates[1], lng: hit.geometry.coordinates[0], label: hit.properties.label });
      if (!form.approxAddress && hit.properties.city) update("approxAddress", `${hit.properties.city}${hit.properties.postcode ? ` (${hit.properties.postcode})` : ""}`);
    } catch { toast.error("Service d'adresses indisponible, réessayez"); }
    finally { setLocating(false); }
  };
  const useDemoPhotos = () => { const demo = ["/parking/parking-3.png", "/parking/parking-4.png", "/parking/parking-9.png"]; setPhotos(demo.map((key) => ({ key, preview: key }))); setMainPhoto(0); };
  const submit = (event: FormEvent, publish: boolean) => {
    event.preventDefault();
    const draft = { title: form.title, description: form.description, address: form.address, approxAddress: form.approxAddress, accessInstructions: form.access, latitude: coords?.lat ?? 0, longitude: coords?.lng ?? 0, lengthM: number(form.length), widthM: number(form.width), heightCm: Math.round(number(form.height)), hourlyCents: Math.round(number(form.hourly) * 100), dailyCents: Math.round(number(form.daily) * 100), weeklyCents: Math.round(number(form.weekly) * 100), photoCount: photos.length, availability };
    const problems = validateListing(draft);
    setErrors(problems);
    if (problems.length) { toast.error(problems[0]); return; }
    create.mutate({ title: form.title, approxAddress: form.approxAddress, address: form.address, description: form.description, accessInstructions: form.access,
      latitude: coords!.lat, longitude: coords!.lng, placeType: form.type as "garage" | "residence" | "entreprise" | "parking", covered: form.covered, accessible: form.accessible,
      lengthM: number(form.length), widthM: number(form.width), heightCm: Math.round(number(form.height)), hourlyCents: Math.round(number(form.hourly) * 100), dailyCents: Math.round(number(form.daily) * 100), weeklyCents: Math.round(number(form.weekly) * 100),
      bookingMode: form.mode as "instant" | "validation", photos: photos.map((p) => p.key), mainPhoto, availability, blocked, submit: publish });
  };

  return <form className="listing-form" onSubmit={(e) => submit(e, true)}>
    <div className="form-notice"><FileCheck2 size={20} /><span><strong>Vérification avant publication.</strong> Enregistrez un brouillon ou envoyez l’annonce complète. Elle ne sera jamais publiée automatiquement.</span></div>
    <section><h2>1. Présentation</h2><div className="form-grid"><label className="span-2">Titre de l’annonce<input required minLength={4} value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Ex. Box sécurisé près de Bastille" /></label><label className="span-2">Description<textarea required minLength={20} value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Environnement, largeur de l’accès, repères…" rows={4} /></label><label>Adresse exacte<input required value={form.address} onChange={(e) => { update("address", e.target.value); setCoords(null); }} placeholder="Numéro, rue, code postal" /><small>Jamais affichée avant confirmation</small><button type="button" className="btn btn-secondary" disabled={locating} onClick={locateAddress}>{locating ? "Recherche…" : "Localiser sur la carte"}</button>{coords && <small>Position trouvée : {coords.label} ({coords.lat.toFixed(5)}, {coords.lng.toFixed(5)})</small>}</label><label>Adresse approximative publique<input required value={form.approxAddress} onChange={(e) => update("approxAddress", e.target.value)} /></label><label>Type de place<select value={form.type} onChange={(e) => update("type", e.target.value)}><option value="garage">Garage / box</option><option value="residence">Résidence</option><option value="entreprise">Entreprise</option><option value="parking">Parking privé</option></select></label><label>Couverture<select value={form.covered ? "oui" : "non"} onChange={(e) => update("covered", e.target.value === "oui")}><option value="oui">Couvert</option><option value="non">Extérieur</option></select></label><label className="check-row"><input type="checkbox" checked={form.accessible} onChange={(e) => update("accessible", e.target.checked)} /> Place accessible PMR</label></div></section>
    <section><h2>2. Dimensions et accès</h2><div className="form-grid three"><label>Longueur (m)<input required type="text" inputMode="decimal" value={form.length} onChange={(e) => update("length", e.target.value)} /></label><label>Largeur (m)<input required type="text" inputMode="decimal" value={form.width} onChange={(e) => update("width", e.target.value)} /></label><label>Hauteur max. (cm)<input required type="number" value={form.height} onChange={(e) => update("height", e.target.value)} /></label><label className="span-3">Conditions d’accès<input required value={form.access} onChange={(e) => update("access", e.target.value)} placeholder="Portail, badge, télécommande, niveau…" /></label></div></section>
    <section><div className="section-title-row"><h2>3. Photos</h2><button type="button" className="text-button" onClick={useDemoPhotos}><Camera size={16} />Utiliser des photos démo</button></div><div className="photo-uploader"><label className="upload-zone"><ImagePlus size={26} /><strong>{uploading ? "Envoi des photos…" : "Ajouter plusieurs photos"}</strong><span>JPG ou PNG · 10 Mo maximum chacune</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading} onChange={(e) => addFiles(e.target.files)} /></label>{uploading && <LoaderCircle className="spinning" />}</div><div className="uploaded-photos">{photos.map((photo, index) => <div key={photo.key} className={mainPhoto === index ? "main" : ""}><img src={photo.preview} alt={`Photo ${index + 1}`} /><button type="button" className="main-photo-btn" onClick={() => setMainPhoto(index)}><Star size={14} fill={mainPhoto === index ? "currentColor" : "none"} />{mainPhoto === index ? "Principale" : "Définir principale"}</button><button type="button" className="remove-photo" aria-label="Supprimer la photo" onClick={() => { setPhotos(photos.filter((_, i) => i !== index)); setMainPhoto(0); }}><Trash2 size={15} /></button></div>)}</div></section>
    <section><h2>4. Tarifs et réservation</h2><div className="form-grid three"><label>Prix horaire (€)<input required type="text" inputMode="decimal" value={form.hourly} onChange={(e) => update("hourly", e.target.value)} /></label><label>Prix journée (€)<input required type="text" inputMode="decimal" value={form.daily} onChange={(e) => update("daily", e.target.value)} /></label><label>Prix semaine (€)<input required type="text" inputMode="decimal" value={form.weekly} onChange={(e) => update("weekly", e.target.value)} /></label></div><div className="mode-radio"><label className={form.mode === "instant" ? "active" : ""}><input type="radio" name="mode" checked={form.mode === "instant"} onChange={() => update("mode", "instant")} /><span><strong>Réservation instantanée</strong><small>Confirmation automatique si le créneau est libre</small></span></label><label className={form.mode === "validation" ? "active" : ""}><input type="radio" name="mode" checked={form.mode === "validation"} onChange={() => update("mode", "validation")} /><span><strong>Sur validation du propriétaire</strong><small>Demande expirant après 24 h, débit après acceptation</small></span></label></div></section>
    <section><h2>5. Calendrier</h2><CalendarEditor availability={availability} setAvailability={setAvailability} blocked={blocked} setBlocked={setBlocked} /></section>
    {errors.length > 0 && <div className="form-notice" role="alert"><X size={19} /><span><strong>À corriger avant l’envoi :</strong> {errors.join(" ")}</span></div>}
    <div className="form-submit-bar"><button type="button" className="btn btn-secondary" disabled={create.isPending} onClick={(e) => submit(e, false)}>Enregistrer comme brouillon</button><button type="submit" className="btn btn-primary" disabled={create.isPending || uploading}>{create.isPending ? "Envoi…" : "Envoyer pour vérification"}<ChevronRight size={17} /></button></div>
  </form>;
}

function CalendarEditor({ availability, setAvailability, blocked, setBlocked }: { availability: Availability; setAvailability: (v: Availability) => void; blocked: Blocked[]; setBlocked: (v: Blocked[]) => void }) {
  const [newBlock, setNewBlock] = useState({ start: toLocalInput(new Date(Date.now() + 7 * 86400000)), end: toLocalInput(new Date(Date.now() + 8 * 86400000)) });
  return <div className="calendar-editor"><div><span className="field-label">Jours disponibles</span><div className="weekday-picker">{week.map((day) => <button type="button" key={day.n} className={availability.days.includes(day.n) ? "active" : ""} onClick={() => setAvailability({ ...availability, days: availability.days.includes(day.n) ? availability.days.filter((n) => n !== day.n) : [...availability.days, day.n] })}>{day.label}</button>)}</div></div><div className="field-row"><label>Ouverture<input type="time" value={availability.start} onChange={(e) => setAvailability({ ...availability, start: e.target.value })} /></label><label>Fermeture<input type="time" value={availability.end} onChange={(e) => setAvailability({ ...availability, end: e.target.value })} /></label></div><div className="blocked-editor"><span className="field-label">Exceptions et périodes bloquées</span>{blocked.map((period, index) => <div className="blocked-row" key={index}><span>{new Date(period.start).toLocaleString("fr-FR")} → {new Date(period.end).toLocaleString("fr-FR")}</span><button type="button" className="icon-btn" onClick={() => setBlocked(blocked.filter((_, i) => i !== index))} aria-label="Supprimer cette exception"><X size={16} /></button></div>)}<div className="blocked-add"><label>Début<input type="datetime-local" value={newBlock.start} onChange={(e) => setNewBlock({ ...newBlock, start: e.target.value })} /></label><label>Fin<input type="datetime-local" value={newBlock.end} onChange={(e) => setNewBlock({ ...newBlock, end: e.target.value })} /></label><button type="button" className="btn btn-secondary" onClick={() => { if (new Date(newBlock.start) < new Date(newBlock.end)) setBlocked([...blocked, newBlock]); else toast.error("La fin doit être après le début"); }}>Ajouter</button></div></div></div>;
}

function CalendarTab({ listings }: { listings: NonNullable<ReturnType<typeof useOwnerListings>> }) {
  const [id, setId] = useState(listings[0].id);
  const listing = listings.find((item) => item.id === id) ?? listings[0];
  const initial = JSON.parse(listing.availability) as Availability;
  const [availability, setAvailability] = useState<Availability>(initial);
  const [blocked, setBlocked] = useState<Blocked[]>(JSON.parse(listing.blocked));
  const save = trpc.govapark.listings.setCalendar.useMutation({ onSuccess: () => toast.success("Calendrier enregistré") });
  return <div className="calendar-tab"><label>Annonce<select value={id} onChange={(e) => { const next = listings.find((l) => l.id === Number(e.target.value))!; setId(next.id); setAvailability(JSON.parse(next.availability)); setBlocked(JSON.parse(next.blocked)); }}>{listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title}</option>)}</select></label><CalendarEditor key={id} availability={availability} setAvailability={setAvailability} blocked={blocked} setBlocked={setBlocked} /><button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate({ id, availability, blocked })}><Upload size={16} />Enregistrer le calendrier</button></div>;
}

function useOwnerListings() { return null as unknown as { id: number; title: string; availability: string; blocked: string }[] | null; }
function fileToDataUrl(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }); }
