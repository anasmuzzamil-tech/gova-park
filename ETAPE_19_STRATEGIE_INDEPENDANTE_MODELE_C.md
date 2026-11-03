# GOVAPARK — Étape 19 : stratégie indépendante, modèle C

## Décision validée

GOVAPARK adopte le **modèle C : les deux**. La société développe simultanément :

1. une marketplace de places appartenant à des tiers, louées ou exploitées par leurs propriétaires ;
2. une activité d'opérateur de parkings détenus, loués ou exploités directement par GOVAPARK.

GOVAPARK est une plateforme et un opérateur indépendants. Aucun parcours client ne doit reposer sur une redirection commerciale vers PayByPhone, EasyPark, Indigo Neo, Zenpark, Yespark, Onepark, Ector ou une application concurrente. Les prestataires techniques nécessaires (paiement, cartographie, hébergement, contrôle d'accès) peuvent être retenus comme fournisseurs, sans devenir le produit commercial ni détourner le client de GOVAPARK.

## 1. Deux branches commerciales

### 1.1 GOVAPARK Marketplace

Objectif : développer rapidement une offre de stationnement sans acheter chaque emplacement.

Fournisseurs ciblés :
- particuliers propriétaires de garages, boxes et places ;
- copropriétés et syndics disposant des autorisations nécessaires ;
- hôtels, résidences et entreprises ;
- propriétaires de parkings privés ;
- exploitants indépendants autorisés à commercialiser leurs capacités.

Parcours propriétaire : création de compte, vérification de l'identité et du droit de louer/exploiter, dépôt des justificatifs, validation manuelle, création de l'annonce, calendrier, prix horaires/journaliers/mensuels, publication après approbation.

Parcours conducteur : recherche, comparaison, disponibilité réelle, réservation, paiement dans GOVAPARK, confirmation, consignes d'accès, preuve de réservation, assistance, annulation et remboursement selon les conditions affichées.

Revenus : commission de réservation, frais de service transparents et éventuels services optionnels clairement tarifés.

### 1.2 GOVAPARK Parking

Objectif : devenir progressivement propriétaire ou exploitant de sites physiques.

Trois modes d'entrée :
- **Achat** : acquisition d'un parking après audit immobilier, juridique, technique et financier.
- **Location-exploitation** : prise à bail d'un site, commercialisation des places et gestion des opérations.
- **Mandat de gestion** : exploitation pour le compte d'un propriétaire, avec rémunération contractuelle.

Recommandation de déploiement : commencer par les mandats et locations lorsque l'économie du site est démontrée ; acheter ensuite les emplacements stratégiques dont l'occupation et la rentabilité sont vérifiées.

Chaque site doit disposer d'une fiche d'actif : propriétaire, titre ou mandat, adresse, capacité exploitable, places PMR, hauteur et contraintes d'accès, horaires, équipements, sécurité incendie, accessibilité, assurances, charges, contrat, contrôle d'accès, disponibilité, prix, chiffre d'affaires, taux d'occupation et marge nette.

## 2. Services indépendants complémentaires

### GOVAPARK Street — voirie

Construire un parcours de paiement propriétaire, mais activer chaque commune seulement après convention/autorisation, validation des tarifs et règles, accès technique aux systèmes et tests. Aucun paiement de voirie ni ticket ne doit être simulé avant cette étape. Les règles de stationnement et la redevance restent fixées par la collectivité.

### GOVAPARK Valet — voiturier

Créer un réseau propre : recrutement, identité, permis, expérience, assurances adaptées, formation, état des lieux photo, remise des clés, traçabilité, procédure incident et service client. Démarrer sur un site uniquement après validation des autorisations d'accès et de prise en charge, contrats et assurances.

### GOVAPARK Access — accessibilité

Afficher les places accessibles et expliquer les règles CMI. Distinguer voirie publique et parkings privés/souterrains. Ne jamais affirmer qu'une préférence enregistrée dans l'application prouve l'éligibilité. Ne pas rendre automatiquement gratuits les parkings privés.

### GOVAPARK Mobility — mobilité

Intégrer progressivement les bornes de recharge, services de trajet, carburants et services poids lourds. Les données et capacités doivent être sourcées ; le routage poids lourds nécessite un moteur tenant compte des dimensions, poids et restrictions.

## 3. Paiement et flux financiers

GOVAPARK garde l'interface client, les commandes, les reçus, le service après-vente et le tableau de bord. Un prestataire de paiement agréé peut fournir l'infrastructure technique. Pour les fonds dus aux propriétaires tiers, utiliser un dispositif conforme au cadre des services de paiement, avec vérification/KYC des bénéficiaires, règles de cantonnement ou de reversement selon le prestataire, rapprochement, remboursements et traçabilité. Ne pas collecter et reverser des fonds de tiers en dehors d'un cadre autorisé.

Séparer comptablement :
- chiffre d'affaires de commissions marketplace ;
- chiffre d'affaires des parkings exploités ;
- loyers et charges des sites ;
- revenus de gestion sous mandat ;
- prestations de voiturier ;
- éventuels contrats avec collectivités.

## 4. Architecture fonctionnelle à intégrer

### Espace conducteur
- recherche et comparaison des places GOVAPARK ;
- filtres horaires, journée, mois, couvert, hauteur, accessibilité et recharge ;
- réservation, paiement, annulation et remboursement ;
- justificatif et consignes d'accès ;
- signalement d'incident et assistance.

### Espace propriétaire partenaire
- identité et justificatifs ;
- preuve du droit de louer/exploiter ;
- annonces et calendrier ;
- tarifs horaires, journaliers et mensuels ;
- demandes, réservations, revenus et reversements ;
- maintenance, indisponibilités et réclamations.

### Espace exploitation GOVAPARK
- portefeuille des parkings achetés, loués ou sous mandat ;
- contrats, échéances et documents ;
- capacité, occupation et prix par site ;
- contrôle d'accès et incidents ;
- personnel, prestataires et maintenance ;
- recettes, loyers, charges, marge et rentabilité ;
- comparaison entre sites et décisions d'investissement.

### Espace société / administrateur
- validation des propriétaires et exploitants ;
- validation des annonces et sites ;
- commissions et frais ;
- réservations, litiges, remboursements et rapprochements ;
- suivi KYC et documents à renouveler ;
- journal d'audit des décisions ;
- KPI par activité, ville, région et site.

## 5. Indicateurs économiques

Marketplace : places actives, disponibilité réelle, réservations, panier moyen, commission moyenne, taux d'annulation, litiges, coût d'acquisition client, marge contributive.

Parkings exploités : capacité, taux d'occupation par plage horaire, prix moyen, chiffre d'affaires/place, coût du site, personnel, énergie, maintenance, assurance, loyer ou dette, marge opérationnelle, seuil de rentabilité et retour sur capital.

Ne pas acheter un site sur la seule base de sa capacité. Exiger une étude de demande locale, concurrence, accès, travaux, conformité, coût complet, scénarios d'occupation et stress test.

## 6. Déploiement recommandé

### Phase 1 — Île-de-France : réseau marketplace
- recruter des propriétaires et exploitants indépendants ;
- commencer dans une zone géographique maîtrisable ;
- sécuriser la vérification des annonces et les parcours de réservation ;
- mesurer les réservations réelles, annulations, incidents et marges.

### Phase 2 — premiers parkings exploités
- prospecter des parkings indépendants sous-utilisés ;
- négocier des mandats ou baux pilotes ;
- installer les outils de gestion et de contrôle d'accès adaptés ;
- comparer la performance réelle au prévisionnel.

### Phase 3 — acquisition sélective
- sélectionner les sites dont la demande et la rentabilité sont démontrées ;
- réaliser les audits et financer chaque opération séparément ;
- développer des abonnements mensuels et contrats professionnels.

### Phase 4 — services propres et expansion
- réseau de voituriers ;
- paiement voirie ville par ville sous convention ;
- intégration recharge et mobilité ;
- extension régionale puis nationale.

## 7. Garde-fous obligatoires

- Pas de place annoncée disponible sans source de disponibilité ou confirmation de l'exploitant.
- Pas de parking présenté comme propriété GOVAPARK sans preuve de propriété ou mandat.
- Pas de paiement de voirie avant autorisation et intégration validée.
- Pas de reversement de fonds de tiers sans prestataire et cadre réglementaire adaptés.
- Pas de voiturier commercialisé sans assurance, contrat et autorisation du site.
- Pas de promesse d'accès automatisé si le contrôle d'accès n'est pas techniquement connecté.
- Respect RGPD, sécurité des données, règles ERP, accessibilité, incendie, urbanisme et droit immobilier selon le site.

## 8. Décision de produit

Le hub mobilité de l'étape 18 est remplacé par un parcours GOVAPARK indépendant. Les redirections vers les applications concurrentes sont retirées de l'expérience client. Les services non contractualisés ou non intégrés sont affichés comme « en préparation », sans simuler leur disponibilité.

**Positionnement :** GOVAPARK est une plateforme de réservation et un opérateur indépendant de stationnement, qui développe à la fois un réseau de propriétaires partenaires et un portefeuille de parkings détenus, loués ou exploités directement.
