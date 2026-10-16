# Classeur Pokémon TCG (PWA)

La version native MAUI est dans [`ClasseurTcg.Maui/`](ClasseurTcg.Maui/README.md). Elle est destinée à Android depuis Linux et conserve un fichier SQLite par compte. Cette application web reste disponible comme version PWA.

Pour travailler sur l’application native, ouvre `ClasseurTcg.slnx` ou `ClasseurTcg.Maui/ClasseurTcg.Maui.csproj` dans Visual Studio / VS Code.

Parcourez les cartes Pokémon par série, puis par extension, avec l'API [TCGdex](https://tcgdex.dev).
React + Vite + `vite-plugin-pwa`, avec un serveur Node local et une base SQLite distincte pour chaque compte.

## Démarrer

```bash
npm install
npm run dev        # démarre l'API SQLite et Vite
```

Node.js 22.13 ou plus récent est requis. En développement, Vite affiche son URL habituelle (généralement http://localhost:5173).

## Comptes et stockage local

Créez un compte depuis l'écran de connexion. Les classeurs et cartes de chaque compte sont conservés dans `data/users/<identifiant>.sqlite`; `data/accounts.sqlite` ne contient que les identifiants et les empreintes des mots de passe. Les fichiers restent sur cette machine et ne sont pas synchronisés. Les anciens classeurs du navigateur sont importés au premier compte connecté sur ce navigateur.

Pour lancer la version construite, exécutez `npm run build`, puis `npm start` et ouvrez http://localhost:4173.

## Tester la PWA (service worker, installation)

Le service worker n'est actif que sur un build de production :

```bash
npm run build
npm run preview    # ouvre aussi l'app sur votre réseau local
```

## Déployer sur un VPS

L'application utilise le serveur Node pour les comptes et le stockage SQLite. En production, lancez-le sur `127.0.0.1:4173` et Pokeum sur `127.0.0.1:8000`, puis placez Nginx devant les deux services. Le navigateur appelle Pokeum par le chemin same-origin `/pokeum/api/identify` : il n'essaie jamais de joindre `127.0.0.1` sur l'appareil du visiteur.

Exemple de routage Nginx à intégrer à votre bloc `server` HTTPS :

```nginx
client_max_body_size 20m;

location /pokeum/ {
	proxy_pass http://127.0.0.1:8000/;
	proxy_set_header Host $host;
	proxy_set_header X-Real-IP $remote_addr;
	proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
	proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
	proxy_pass http://127.0.0.1:4173;
	proxy_set_header Host $host;
	proxy_set_header X-Real-IP $remote_addr;
	proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
	proxy_set_header X-Forwarded-Proto $scheme;
}
```

Le `/` final de `proxy_pass` dans le bloc `/pokeum/` retire ce préfixe avant de transmettre la requête à Pokeum (`/pokeum/api/identify` devient `/api/identify`). Le HTTPS est nécessaire pour accéder à la caméra et installer la PWA.

En développement, Vite relaie automatiquement `/pokeum` vers le port `8000`. Pour changer la cible, définissez `POKEUM_PROXY_TARGET` (ou `POKEUM_PORT`). Pour héberger Pokeum sur un autre domaine, définissez `VITE_POKEUM_API` au moment du build, par exemple `VITE_POKEUM_API=https://scan.example.com/api/identify npm run build`; le serveur Pokeum distant doit alors autoriser l'origine de l'application.

## Installer sur mobile

- **Android (Chrome)** : bouton « Installer » dans l'app, ou menu ⋮ puis « Installer l'application ».
- **iPhone (Safari)** : Partager, puis « Sur l'écran d'accueil ».

## Publier sur les stores (optionnel)

```bash
npm i @capacitor/core @capacitor/cli
npx cap init classeur-tcg com.exemple.classeurtcg --web-dir=dist
npm run build && npx cap add android && npx cap add ios
```

## Organisation

### Interface React (`src/`)

| Fichier | Rôle |
| --- | --- |
| `src/main.jsx` | Point d'entrée React : active le routeur et le service worker. |
| `src/app/App.jsx` | Coquille de l'application : session, navigation, routes, thème et langue. |
| `src/app/language.js` | Contexte React qui rend la langue des cartes disponible aux pages. |
| `src/api/local.js` | Client HTTP commun pour le serveur de cette application. |
| `src/api/tcgdex.js` | Client TCGdex, cache mémoire et helpers de dates, images et tri. |
| `src/data/auth.js` | Connexion, inscription, déconnexion et import des anciens classeurs locaux. |
| `src/data/binders.js` | Lecture et modifications des classeurs et de leurs cartes. |
| `src/data/collection.js` | Variantes, cartes possédées et hook de chargement de la collection. |
| `src/data/wishlist.js` | Ajout/retrait des souhaits et hook de chargement de la liste. |
| `src/hooks/index.js` | Hooks transversaux : chargement asynchrone, dates, ordre et installation PWA. |
| `src/components/CardDialog.jsx` | Fenêtre détaillée d'une carte. |
| `src/components/VariantDialog.jsx` | Fenêtre de choix des variantes possédées. |
| `src/components/Crumbs.jsx` | Fil d'Ariane réutilisé par les pages. |
| `src/components/CollectionProgress.jsx` | Barre de progression d'une collection. |
| `src/components/Feedback.jsx` | États d'erreur et squelettes de chargement. |
| `src/components/Tile.jsx` | Tuile de navigation vers une série ou une extension. |
| `src/styles.css` | Styles globaux et styles des composants/pages. |

### Pages (`src/pages/`)

| Fichier | Écran |
| --- | --- |
| `AuthPage.jsx` | Connexion/inscription, affichée sans session. |
| `SeriesListPage.jsx` | Accueil : liste des séries, route `/`. |
| `SeriesDetailPage.jsx` | Extensions d'une série, route `/serie/:id`. |
| `SetDetailPage.jsx` | Cartes et filtres d'une extension, route `/set/:id`. |
| `CollectionPage.jsx` | Collection personnelle, route `/collection`. |
| `WishlistPage.jsx` | Liste de souhaits, route `/souhaits`. |
| `CardScannerPage.jsx` | Reconnaissance et ajout d'une carte, route `/scanner`. |
| `BindersPage.jsx` | Liste et contenu des classeurs, routes `/classeurs` et `/classeurs/:id`. |

### Serveur et configuration

- `server.js` : serveur HTTP local, authentification, routes JSON et stockage SQLite par compte.
- `dev.js` : lance le serveur local, Vite et le service Pokeum optionnel en développement.
- `vite.config.js` : configuration Vite et PWA, dont manifeste et règles de cache.

## Tri

Séries et extensions s'affichent de la plus récente à la plus ancienne (bouton pour inverser, choix mémorisé).
La date d'une extension vient de `releaseDate` ; celle d'une série est la date de sa dernière extension.
Les cartes d'une extension sont par défaut du n° 1 au dernier, avec un bouton pour inverser.
