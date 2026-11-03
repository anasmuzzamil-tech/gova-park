import { useMemo, useState } from "react";
import { Accessibility, Building2, CarFront, CheckCircle2, Clock3, CreditCard, MapPin, ParkingCircle, ShieldCheck, Store, Users } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

export default function Mobility() {
  const [hasCmi, setHasCmi] = useState(() => localStorage.getItem("govapark.cmi.stationnement") === "true");
  const [cmiHelp, setCmiHelp] = useState(false);
  const [city, setCity] = useState("Pierrefitte-sur-Seine");
  const cmiStatus = useMemo(() => hasCmi ? "Préférence CMI enregistrée sur cet appareil" : "Aucune préférence CMI enregistrée", [hasCmi]);
  const updateCmi = (checked: boolean) => {
    setHasCmi(checked);
    localStorage.setItem("govapark.cmi.stationnement", String(checked));
    toast.success(checked ? "Préférence CMI enregistrée sur cet appareil" : "Préférence CMI désactivée");
  };
  const mapsQuery = encodeURIComponent(`parking ${city}`);
  return <main className="mobility-page">
    <header className="mobility-hero">
      <span className="eyebrow">GOVAPARK · RÉSEAU INDÉPENDANT</span>
      <h1>Le stationnement, directement avec GOVAPARK.</h1>
      <p>Une plateforme indépendante qui développe son propre réseau de propriétaires et ses propres parkings exploités. Pas de redirection vers les applications concurrentes.</p>
      <label className="mobility-city">Ville ou destination<input value={city} onChange={e => setCity(e.target.value)} placeholder="Ville, gare, aéroport…" /></label>
      <a className="btn btn-primary" href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`} target="_blank" rel="noreferrer"><MapPin size={17}/> Repérer la zone sur la carte</a>
    </header>

    <section className="mobility-section">
      <div className="mobility-section-heading"><div><span className="eyebrow">01 · GOVAPARK MARKETPLACE</span><h2>Réserver une place privée</h2></div><Store size={25}/></div>
      <p className="mobility-intro">GOVAPARK met directement en relation conducteurs et propriétaires : particuliers, copropriétés autorisées, hôtels, entreprises et exploitants indépendants. Les annonces validées sont réservables dans le parcours GOVAPARK.</p>
      <div className="mobility-feature-strip"><Users size={20}/><div><strong>Vous avez une place à proposer ?</strong><p>Publiez votre garage, box ou place de parking. Le dossier et le droit de mise en location sont vérifiés avant publication.</p><Link className="btn btn-primary" to="/proposer">Devenir propriétaire partenaire</Link></div></div>
      <div className="mobility-feature-strip"><ParkingCircle size={20}/><div><strong>Vous cherchez une place ?</strong><p>Consultez les annonces GOVAPARK et effectuez votre réservation dans notre propre plateforme.</p><Link className="btn btn-secondary" to="/">Rechercher sur GOVAPARK</Link></div></div>
    </section>

    <section className="mobility-section">
      <div className="mobility-section-heading"><div><span className="eyebrow">02 · GOVAPARK PARKING</span><h2>Nos parkings exploités en propre</h2></div><Building2 size={25}/></div>
      <p className="mobility-intro">Deuxième pilier du modèle : GOVAPARK pourra acheter, louer ou exploiter sous mandat des parkings. Chaque site aura ses tarifs, son calendrier, ses capacités et ses indicateurs de rentabilité.</p>
      <div className="mobility-provider-grid">
        <article className="mobility-provider-card"><div className="mobility-provider-top"><span>Acquisition</span><Building2 size={16}/></div><h3>Achat de parkings</h3><p>Constituer progressivement un patrimoine de sites stratégiques, après étude juridique, technique et financière.</p></article>
        <article className="mobility-provider-card"><div className="mobility-provider-top"><span>Exploitation</span><ShieldCheck size={16}/></div><h3>Location ou mandat</h3><p>Lancer l'activité avec des parkings loués ou confiés en gestion, sans immobiliser immédiatement le capital d'un achat.</p></article>
      </div>
      <div className="mobility-note"><CheckCircle2 size={18}/><p><strong>Transparence :</strong> aucun parking détenu ou exploité par GOVAPARK n'est annoncé comme disponible tant qu'un contrat, une capacité réelle et un contrôle d'accès opérationnel ne sont pas confirmés.</p></div>
    </section>

    <section className="mobility-section">
      <div className="mobility-section-heading"><div><span className="eyebrow">03 · GOVAPARK STREET</span><h2>Paiement en voirie</h2></div><CreditCard size={25}/></div>
      <p className="mobility-intro">GOVAPARK développera son propre parcours de paiement et démarchera directement les collectivités. L'activation se fera commune par commune, après convention, autorisation et accès technique aux systèmes nécessaires.</p>
      <div className="mobility-note"><Clock3 size={18}/><p><strong>Service en préparation — pas encore activé.</strong> Tant que la commune n'a pas autorisé le dispositif et que l'intégration n'est pas validée, GOVAPARK ne délivre aucun ticket de stationnement et n'encaisse aucun paiement de voirie.</p></div>
    </section>

    <section className="mobility-section">
      <div className="mobility-section-heading"><div><span className="eyebrow">04 · GOVAPARK VALET</span><h2>Notre propre réseau de voituriers</h2></div><CarFront size={25}/></div>
      <p className="mobility-intro">GOVAPARK prévoit de recruter et contrôler ses voituriers, avec vérification du permis, de l'identité, des assurances et des conditions d'accès aux gares et aéroports. La réservation sera ouverte uniquement sur les sites où les autorisations et l'exploitation sont effectives.</p>
      <div className="mobility-note"><ShieldCheck size={18}/><p><strong>Déploiement progressif :</strong> aucune prestation de voiturier n'est présentée comme réservable avant constitution du réseau et validation des assurances et autorisations du site.</p></div>
    </section>

    <section className="mobility-section mobility-accessibility">
      <div className="mobility-section-heading"><div><span className="eyebrow">05 · ACCESSIBILITÉ</span><h2>Stationnement avec CMI</h2></div><Accessibility size={26}/></div>
      <div className="cmi-card">
        <div className="cmi-card-heading"><div><strong>Carte mobilité inclusion — mention « stationnement »</strong><span>{cmiStatus}</span></div><span className="cmi-free-label">Voirie publique gratuite*</span></div>
        <p>En France, la CMI Stationnement donne droit à la gratuité sur les places de stationnement ouvertes au public, y compris les places payantes et non réservées. La commune peut fixer une durée maximale, qui ne peut pas être inférieure à 12 heures. La carte est attachée à la personne, conducteur ou passager, et non à une plaque en particulier.</p>
        <label className="cmi-toggle"><input type="checkbox" checked={hasCmi} onChange={e => updateCmi(e.target.checked)}/> J'ai une CMI avec la mention « stationnement » (préférence enregistrée sur cet appareil)</label>
        <button className="text-button" onClick={() => setCmiHelp(!cmiHelp)}>{cmiHelp ? "Masquer les précisions" : "Voir les conditions et les limites"}</button>
        {cmiHelp && <div className="cmi-details"><ul><li>Le droit de gratuité concerne le stationnement sur voirie publique ouverte au public, pas automatiquement les parkings privés ou souterrains avec barrières.</li><li>Selon la commune, un ticket virtuel gratuit ou un enregistrement de début de stationnement peut rester obligatoire : vérifiez la règle locale.</li><li>Le simple fait d'activer cette préférence dans GOVAPARK ne prouve pas que vous détenez la carte.</li><li>Cette préférence est stockée localement sur cet appareil.</li></ul><a href="https://www.service-public.gouv.fr/particuliers/vosdroits/F34049" target="_blank" rel="noreferrer">Consulter les règles officielles</a></div>}
        <small>*Sous réserve des règles locales de durée et de déclaration. L'accès aux parkings privés équipés de barrières peut rester payant.</small>
      </div>
    </section>

    <footer className="mobility-footer"><ShieldCheck size={17}/><p><strong>Notre engagement :</strong> le parcours client, la réservation et la relation commerciale restent chez GOVAPARK. Les services non encore autorisés, contractualisés ou techniquement intégrés sont clairement signalés comme étant en préparation ; aucun paiement ni accès n'est simulé.</p></footer>
  </main>;
}
