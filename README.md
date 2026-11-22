# MIZUNIA · FAS9IA

MIZUNIA · FAS9IA est un tableau de bord de gestion de l’eau pour un site pilote simulé à **Borj Râs, Mahdia, Tunisie**. Il permet de suivre les citernes partagées (فاسقيات), de piloter une maquette hydraulique et de tester la réponse à une coupure d’eau, à une fuite ou à une panne de capteur.

## Fonctionnalités

- **Opérations et Réserves** affichent la carte des citernes, leurs relevés, le stock utilisable et des estimations d’autonomie. Les citernes sans relevé sont exclues du calcul du stock mesuré.
- **Simulation KIZUNA** représente trois bassins d’environ 42 m³ chacun. La maquette 3D s’ouvre dans un nouvel onglet et synchronise les niveaux et les commandes avec le tableau de bord.
- **Vannes et Énergie** permettent de suivre les débits, la production solaire, la charge des pompes et l’apport du groupe électrogène.
- **Incidents** conserve le journal technique. Les rapports de fuite peuvent être copiés, téléchargés ou préparés pour un envoi par e-mail.
- **Entretien** simule la protection thermique des moteurs, la tandifa annuelle et sept jours de décantation après un dépôt dans un bassin.

## Installation et lancement

Il faut **Node.js 22.12 ou une version ultérieure**, npm et un navigateur compatible WebGL pour la maquette 3D.

Depuis un clone GitHub, lancez MIZUNIA à la racine du dépôt. Le dossier `kizuna-prototype/` contient la scène 3D partagée et le firmware de la démo Wokwi.

```sh
npm ci
npm run dev
```

Avec la copie distribuée sous forme de deux dossiers, gardez le tableau de bord et `kizuna-prototype` côte à côte.

```text
dossier-parent/
├── MIZUNIA-feat-fas9ia-dashboard/
└── kizuna-prototype/
```

Dans ce cas, depuis le dossier parent, entrez dans le dossier du tableau de bord puis lancez MIZUNIA.

```sh
cd MIZUNIA-feat-fas9ia-dashboard
npm ci
npm run dev
```

Ouvrez l’adresse locale affichée par Vite. Le mode **KIZUNA · Simulation locale** fonctionne avec le seul serveur MIZUNIA. Après l’introduction, connectez-vous avec le compte de démonstration.

- **Adresse e-mail** — `demo@fas9ia.test`
- **Mot de passe** — `Fas9ia-Demo2026!`

Le bouton **Skip intro** ou la touche **Échap** permet d’accéder directement à la connexion. Le compte de démonstration est validé côté navigateur.

## Parcours de démonstration

1. **Suivre une citerne.** Dans **Opérations**, sélectionnez un point sur la carte. Pour tester l’ajout d’une citerne, cliquez sur **Ajouter une citerne**, placez-la et attribuez-lui un identifiant de capteur. Dans sa fiche sous **Réserves**, utilisez **Envoyer le relevé**.
2. **Ouvrir la maquette.** Dans **Simulation**, cliquez sur **Ouvrir la simulation 3D** et gardez le tableau de bord ouvert. Sélectionnez **Pluie** dans le tableau de bord pour observer les niveaux monter dans la maquette. Après la pluie, sélectionnez **Ensoleillé** pour tester le pompage sur le solaire.
3. **Tester une coupure SONEDE.** Cliquez sur **Simuler la coupure de 12 h**. L’agent prépare l’alimentation de secours en eau non potable pour les secteurs Nord, Abords du parc et Est. La demande simulée est de **2,4 m³/h**, soit **800 L/h par secteur** si elle est couverte. L’interface affiche le stock mobilisable, le débit livré et l’autonomie estimée. Une seconde réelle représente 15 minutes simulées.
4. **Tester le groupe électrogène.** Dans **Réserves → Groupe électrogène**, réglez le niveau de carburant, la consommation et la puissance de secours. Dans **Simulation**, sélectionnez **Nuit**, puis démarrez le groupe depuis le tableau de bord ou la maquette. Le groupe fournit la puissance complémentaire aux pompes. Le widget suit le carburant restant et l’autonomie. Le groupe s’arrête lorsque le réservoir est vide.
5. **Tester un incident.** Dans **Simulation → Circuits et tests de conduite**, cliquez sur **Simuler une fuite sur le secours**. En mode Agent, la conduite est isolée. Ouvrez **Incidents** pour consulter le rapport. Pour simuler la perte d’un relevé, ouvrez **Pompage → Capteur et inspection** sous le bassin concerné.
6. **Tester l’entretien.** Dans **Protection thermique des moteurs**, modifiez la température de l’eau pour observer la mise à l’arrêt au seuil de 45 °C pour l’eau ou de 75 °C pour le moteur. Dans **Tandifa annuelle et décantation**, simulez un dépôt pour rendre un bassin indisponible pendant sept jours, ou avancez jusqu’à la prochaine tandifa.

En mode Agent, les pompes s’arrêtent sous la pluie ou par temps nuageux. Le pilotage tient aussi compte de la puissance disponible, du seuil de réserve du bassin, de l’état des capteurs et de la température.

## Intégrations facultatives

### Groq pour l’agent

Créez un fichier `.env.local` à côté du `package.json` de MIZUNIA, puis redémarrez Vite.

```dotenv
GROQ_API_KEY=votre_cle_groq
```

Vous pouvez définir `GROQ_MODEL` pour choisir un modèle différent. Avec Groq, l’agent utilise la météo simulée, la puissance disponible, le stock et les incidents pour choisir un bassin admissible et un objectif de débit. Les protections et les calculs hydrauliques s’exécutent dans la simulation. Les règles locales prennent le relais si Groq est indisponible. L’intégration est servie par Vite sur l’interface locale avec `npm run dev` ou `npm run preview`. Le fichier `.env.local` est ignoré par Git.

### Télémétrie ESP32 avec Wokwi

1. Lancez la simulation ESP32 depuis le dossier `kizuna-prototype`. Les instructions d’installation du firmware figurent dans son README.
2. Consultez `kizuna-prototype/firmware/config.h` pour identifier le broker MQTT et le préfixe utilisés par le firmware.
3. Dans `.env.local` côté MIZUNIA, renseignez l’URL WebSocket du même broker et le même préfixe.

```dotenv
VITE_KIZUNA_MQTT_URL=wss://test.mosquitto.org:8081/mqtt
VITE_KIZUNA_MQTT_PREFIX=votre-prefixe-mqtt
```

4. Redémarrez Vite, puis sélectionnez **KIZUNA · ESP32 Wokwi** dans **Simulation**. Les commandes deviennent disponibles après réception d’un relevé récent. Les vannes proportionnelles, le groupe électrogène et le pilotage de la coupure à midi se testent en **Simulation locale**.

## Développement

Le tableau de bord utilise **React**, **TypeScript** et **Vite**. La scène utilise **Three.js** et l’intégration ESP32 communique via **MQTT sur WebSocket**.

- [`src/kizuna-pilot.ts`](src/kizuna-pilot.ts) gère le scénario de coupure, les protections et l’entretien.
- [`src/generator.ts`](src/generator.ts) calcule le carburant restant, l’autonomie et la puissance fournie.
- [`src/ReserveOverview.tsx`](src/ReserveOverview.tsx) contient les widgets de réserves et leurs réglages.
- [`src/NetworkIncidents.tsx`](src/NetworkIncidents.tsx) gère le journal technique et le partage des rapports.
- [`kizuna/index.html`](kizuna/index.html) ouvre la maquette 3D, dont la scène est partagée avec `kizuna-prototype`.

```sh
npm test
npm run build
npm run preview
```

Le registre des citernes, le journal des incidents et le calendrier d’entretien sont conservés dans le navigateur. La météo, les coupures SONEDE et la distribution d’eau sont des scénarios de démonstration. Le fond de carte repose sur les données [OpenStreetMap](https://www.openstreetmap.org/copyright).
