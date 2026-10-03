# Envoi par email (Gmail de chaque utilisateur) + Word du rapport d'incident

## Analyse de l'existant (rien ne sera supprimé)

1. **Comptes** : connexion par matricule (Lovable Cloud). Chaque utilisateur a un identifiant unique, réutilisé pour lier SON Gmail.
2. **Base de données** : Lovable Cloud, avec règles de sécurité par utilisateur et hiérarchie.
3. **Relevé** : page « Relevé de mouvement » — feuille papier fidèle déjà dessinée (en-tête, 12 colonnes, 24 lignes, visas, légende 1-7).
4. **Rapport d'incident** : page « Rapports d'incident ».
5. **Champs existants du rapport** : titre, date/heure, gravité, description ; conducteur, aide-conducteur, autre agent (nom, matricule, dépôt) ; train, date, locomotives, tonnage, wagons ; cantons, PK, précisions, opérations, pages du guide, heures de secours (demande, annulation, arrivée, départ PK) ; analyse CTRA (résultat d'enquête, conséquences, examen, conclusion, propositions) ; observations CDPC / chef de dépôt ; autres observations ; historique de transmission (qui, quand, commentaire).
6. **PDF actuel** : uniquement l'impression du navigateur — aucun fichier PDF n'est fabriqué. Il faut en ajouter la fabrication pour pouvoir le joindre.
7. **Word** : n'existe pas — à créer (vous l'avez demandé).
8. **Envoi** : le serveur de l'application peut appeler Gmail.
9. **Gmail par utilisateur** : Lovable propose une connexion Gmail « par utilisateur » (Google OAuth officiel). Chaque utilisateur autorise son propre compte dans une fenêtre Google ; l'accès est chiffré côté serveur, rattaché à son compte, jamais visible dans le navigateur.

## Ce qui sera ajouté

**Section Gmail** (en haut des pages Relevé et Rapport) : « Gmail connecté : x@gmail.com » / « Gmail non connecté », boutons « Connecter mon Gmail », « Déconnecter Gmail », « Changer de compte ». Autorisation limitée à l'envoi d'emails + lecture de l'adresse.

**Relevé** : bouton « Envoyer le relevé par email » → fenêtre Destinataire / Objet « Relevé [mois année – matricule] » / Message / ☑ Releve_xxx.pdf (fabriqué à partir de la feuille affichée) → confirmation « Voulez-vous envoyer ce document à … ? » → Annuler / Confirmer l'envoi.

**Rapport d'incident** : barre de boutons sur chaque rapport : Prévisualiser, Générer/Télécharger PDF, Générer/Télécharger Word, Envoyer par email (☑ PDF, ☐ Word). Les fichiers sont toujours fabriqués à partir de la dernière version enregistrée.

**Word (.docx) modifiable** — sections : A Identification de l'incident · B Conducteur · C CTRA · D Chef de dépôt · E Description · F Mesures prises · G Autres observations · H Validation / signatures.
- Uniquement les champs existants ; vides ou « Non renseigné » sinon. Aucune valeur inventée.
- CTRA : reprend les 5 rubriques existantes, chacune avec ☐ Oui ☐ Non ☐ Sans objet + zone d'observations. Aucun code ni procédure inventés.
- Les rubriques demandées qui n'existent pas dans l'application (chronologie, témoins, responsable d'action, échéance…) apparaissent comme zones vides à remplir dans le Word.
- Signatures : cases vides Conducteur / CTRA / Chef de dépôt / Autres, non obligatoires.
- Le PDF reprend exactement le même contenu.

**Résultat** : « Email envoyé avec succès à … » seulement si Gmail confirme l'envoi ; sinon « Échec de l'envoi » avec la raison.

**Historique des envois** : nouvelle page « Historique des envois » (chacun voit ses envois, l'admin voit tout) : utilisateur, Gmail expéditeur, date/heure, type, référence, destinataire, objet, pièces jointes, statut.

## Configuration Google (à faire par vous, une seule fois, ~15 min)

1. Aller sur https://console.cloud.google.com → créer un projet (ex. « RailFormation »).
2. « API et services » → « Bibliothèque » → activer **Gmail API**.
3. « Écran de consentement OAuth » → type **Externe**, nom de l'app, votre email ; scopes : `gmail.send`, `userinfo.email`. Ajouter les comptes Gmail testeurs (ou publier l'app pour tous).
4. « Identifiants » → « Créer » → **ID client OAuth** → type **Application Web**.
5. URL de redirection autorisée : `https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback`
6. Copier l'ID client et le secret → les saisir dans la fenêtre Lovable qui s'ouvrira (aucun secret à mettre dans le code). Activer « accès hors ligne ».

Aucun domaine à acheter, aucun DNS à toucher.

## Détails techniques

- Connecteur « Gmail par utilisateur » (`google_mail`), flux popup + code à usage unique, clé de connexion chiffrée AES-GCM dans une table serveur `app_user_connections` (accès service uniquement).
- Table `email_sends` (RLS : propriétaire + admin) pour l'historique.
- PDF généré côté navigateur (jsPDF + html2canvas à partir de la feuille imprimable existante), Word généré avec la librairie `docx` ; fichiers envoyés en base64 à une fonction serveur authentifiée qui construit le MIME multipart et appelle `gmail/v1/users/me/messages/send` avec la clé de l'utilisateur courant (jamais celle d'un autre).
- Validation de l'adresse côté navigateur et serveur ; taille max des pièces jointes contrôlée.

## Tests prévus

Je testerai : adresse invalide, utilisateur sans Gmail, génération PDF/Word après modification, isolation des comptes (côté serveur). Les tests d'envoi réel avec deux Gmail (A/B, vers @camrail.net) nécessitent que vous connectiez vos comptes Google : je vous guiderai pour les faire.
