# Prise de service, feuille de service, pointage, gares et roulements

Le relevé de mouvement reste strictement inchangé (tables, champs, écran, PDF, envoi).

## Ce qui existe déjà et sera réutilisé
- **Dépôts** : référentiel existant (Douala, Yaoundé, Belabo, Ngaoundéré). Conservé.
- **Agents** : fiches agents existantes (nom, matricule, grade/fonction, dépôt, chef).
- **Feuille de service** : en-tête par dépôt/journée + une ligne par agent avec heures et graphique horaire. Conservée, enrichie.
- **Prise de service** : poste, date, heures début/fin, passation, observations. Conservée, enrichie.
- **Feuille de pointage** : n'existe pas encore, elle sera créée (calculée, pas de saisie).

## Nouveaux éléments
1. **Référentiel des gares** (code, nom), recherche par code ou nom.
   - Il me faut l'image du référentiel des gares : elle n'est pas jointe. Je n'invente aucun code ; la liste sera vide jusqu'à réception.
2. **Fonctions avec ou sans prise de service** : une table réglable par l'administrateur (ex. surveillant = oui, autre fonction = non).
3. **Feuille de pointage** : nouvelle page, calculée automatiquement par agent et par période.

## Champs ajoutés
**Prise de service** (sans lien obligatoire avec une feuille de service) :
- fonction, gare de départ, gare d'arrivée, dépôt de départ, dépôt d'arrivée
- test d'alcoolémie : numéro, heure, résultat (liste fermée : NÉGATIF / POSITIF), tous obligatoires
- lien facultatif vers la ligne de feuille de service correspondante, utilisateur ayant enregistré

**Ligne de feuille de service** (le prévu ne s'efface jamais) :
- statut SERVICE / REPOS, fonction, roulement, service
- PRÉVU : heure de prise, heure de fin, gares départ/arrivée, dépôts départ/arrivée
- RÉEL : heure de prise, heure de fin, gares et dépôts constatés, remplis automatiquement par la prise de service

## Fonctionnement
- À l'enregistrement d'une prise de service, en une seule opération côté serveur (tout ou rien) : enregistrement + test d'alcoolémie, recherche d'une ligne de feuille de service du même agent et du même jour, remplissage des seules données RÉELLES si elle existe. Aucune feuille n'est créée sinon.
- Modifier une feuille de service ne touche jamais aux données réelles déjà enregistrées.

## Pointage (calcul automatique)
Pour chaque jour de l'agent :
- prise de service valide ce jour → heures réelles (scénarios 1 et 3)
- sinon → heures prévues de la feuille de service (scénario 2)
- REPOS → jour de repos

Roulements : suite de jours de service séparée par les repos. Pour chacun : jours travaillés, heures, heures normales (jusqu'à 40 h), heures sup. potentielles (au-delà de 40 h).

Période : total des heures travaillées comparé à 173 h. Heures sup. retenues = heures sup. potentielles des roulements, uniquement dans la limite du dépassement des 173 h (exemple : 180 h travaillées et 10 h potentielles → 7 h retenues). Si ce n'est pas votre règle, dites-le-moi avant validation.

Affichage séparé : heures travaillées, normales, sup. potentielles, sup. retenues ; colonne « source » (Prise de service / Feuille de service). Service de nuit passant minuit géré.

## Écrans
- Prise de service : nouvelle rubrique Test alcoolémie, sélecteurs gares (recherche code/nom) et dépôts.
- Feuille de service : colonnes Prévu / Réel, statut Service/Repos, roulement, gares et dépôts.
- Nouvelle page « Feuille de pointage » : choix agent + période, tableau jour par jour, totaux par roulement et pour la période, impression.
- Administration : gestion des gares et des fonctions avec/sans prise de service.

## Détails techniques
- Migrations uniquement additives (colonnes nullables / avec valeur par défaut, nouvelles tables `stations`, `function_duty_rules`), droits d'accès hiérarchiques identiques à l'existant.
- Résultat d'alcoolémie : type énuméré ; validation par trigger que numéro/heure/résultat sont présents à l'enregistrement.
- Enregistrement de la prise de service + mise à jour du réel : fonction SQL transactionnelle appelée depuis l'application.
- Pointage : calcul à la volée côté application à partir des données (aucune donnée stockée en double, donc toujours à jour après chaque modification).
- Aucune donnée fictive insérée.
