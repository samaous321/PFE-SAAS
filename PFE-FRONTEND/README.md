# PFE Frontend

Front Angular 17 pour le module utilisateur du backend `PFE-BACKEND`.

## Lancer le projet

Dans ce dossier :

```bash
npm install
npm start
```

Le front démarre en général sur `http://localhost:4200`.

## Commandes utiles

- `npm start` lance `ng serve`, c'est le serveur de développement Angular.
- `npm run build` produit une version compilée dans `dist/`.
- `npm run watch` recompulse le projet à chaque changement.
- `npm test` lance les tests Angular si tu ajoutes les dépendances de test.

## Adaptation au backend

Le front appelle directement l'API Express du backend via `src/environments/environment.ts`.

Routes utilisées :

- `POST /users/register` pour créer un utilisateur.
- `POST /users/signin` pour récupérer le JWT.
- `POST /users/verify-code` pour valider le code de vérification avec l'email.
- `GET /users/verify/:userId/:verificationCode` reste disponible si tu veux un lien direct par id.
- `POST /users/send-verification-code` pour renvoyer un code.
- `GET /users` pour lister les utilisateurs du tenant connecté.
- `GET /users/:id` pour charger un utilisateur.
- `PUT /users/:id` pour modifier un utilisateur.
- `DELETE /users/:id` pour supprimer un utilisateur.
- `POST /users/logout` pour fermer la session côté backend.

## Notions importantes

- `tenantId` est obligatoire à l'inscription parce que ton schéma Mongoose l'exige.
- Le token JWT est stocké dans le navigateur, puis envoyé automatiquement dans le header `Authorization: Bearer ...` grâce à l'interceptor Angular.
- Les routes protégées utilisent un guard Angular pour empêcher l'accès sans token.
- Le backend refuse la connexion si `verified` vaut `false`, donc l'utilisateur doit valider le code reçu par email.
- Si l'utilisateur tente de se connecter sans avoir vérifié son compte, le front affiche un popup avec le lien vers la page de vérification.

## Point à vérifier

Si ton backend n'écoute pas sur `http://localhost:3000`, ajuste `apiBaseUrl` dans `src/environments/environment.ts`.