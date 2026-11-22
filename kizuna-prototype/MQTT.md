# Contrat MQTT du bassin KIZUNA

Version JSON `1`. Préfixe par défaut `kizuna/mahdia/demo-7c42e9/bassin-1`, désigné par `<prefix>` ci-dessous. Pour le navigateur, utilisez `wss://test.mosquitto.org:8081/mqtt` avec MQTT 3.1.1. Le firmware utilise `test.mosquitto.org:1883` en TCP. Le tout utilise QoS 0.

- **`<prefix>/state`** · ESP32 → scène et dashboard. JSON retenu, émis chaque seconde, après une transition et après chaque commande reçue correctement. L’ESP32 fournit le niveau de référence `levelPct` et l’état confirmé `pumpOn`.
- **`<prefix>/availability`** · ESP32/broker → scène et dashboard. Texte retenu `online` ou `offline`. Le broker publie `offline` à la perte de la session ESP32 grâce au testament MQTT. La scène exige une mesure reçue en direct depuis moins de 10 s. Le rejeu d’un ancien statut sert d’indication au chargement. Un événement `offline` reçu en direct invalide la dernière mesure jusqu’au prochain envoi de l’ESP32.
- **`<prefix>/command`** · dashboard ou scène → ESP32. JSON non retenu, avec un identifiant unique par demande, de 1 à 64 caractères alphanumériques ASCII, tirets ou tirets bas.
- **`<prefix>/ack`** · ESP32 → demandeur. JSON non retenu. Abonnez-vous avant l’envoi, associez la réponse à `id` et prévoyez un délai d’attente, par exemple 5 s. Affichez l’état de la pompe depuis `state`.

### Exemple d’état

Les champs communs `soilMoisturePct`, `solarNominalW` et `pumpLoadW` représentent l’humidité simulée du sol, la puissance solaire nominale et la charge totale des pompes. Les deux puissances sont exprimées en watts.

Le message `state` contient aussi `temperatureC` (en °C, ou `null` si indisponible) et `basins`, un tableau de trois objets identifiés par `id` (1, 2, 3). Chaque objet reprend les champs individuels de l’exemple ci-dessous, de `mode` à `networkOutage`, ainsi que `masonryInspection`. Les champs individuels à la racine correspondent au bassin 1 pour les clients existants. La température, la turbidité et le nettoyage sont communs au site.

```json
{
  "v": 1,
  "mode": "auto",
  "phase": "watering",
  "levelPct": 63.5,
  "distanceCm": 48,
  "minLevelPct": 20,
  "pumpOn": true,
  "pumpReason": "started",
  "rainOn": false,
  "networkOutage": true,
  "turbidityPct": 82,
  "cleaningCheck": true,
  "masonryInspection": false
}
```

`mode` vaut `manual` ou `auto`. En manuel, `phase` vaut `manual` et le niveau suit le HC-SR04. En automatique, les phases sont `ready`, `rain`, `after_rain`, `outage`, `watering` et `complete`. Le capteur peut toujours fournir `distanceCm` pour le diagnostic. Lorsqu’il n’a pas d’écho, `distanceCm` vaut `null`, ainsi que `levelPct` en mode manuel. `pumpReason` indique la dernière cause de transition de la pompe. `networkOutage` indique la coupure d’eau du scénario.

### Exemples de commandes et de réponses

La pompe commune des maisons publie `backupBasin` (0 à l’arrêt ou numéro de la citerne), `backupLeak` (état de la fuite simulée) et `backupReason`. Envoyez `start_backup` avec le `basinId` source. `stop_backup` arrête la pompe commune. `enable_backup_leak` et `clear_backup_leak` changent la condition de la conduite pendant ou avant le pompage. Les accusés de réception incluent `backupBasin` et `backupLeak`. Le débit de démonstration passe de 2 à 3,5 points de remplissage par seconde en cas de fuite. La réserve minimale est de 20 %.

```json
{"v":1,"id":"house-01","action":"start_backup","basinId":2}
{"v":1,"id":"house-01","action":"start_backup","basinId":2,"ok":true,"reason":"accepted","pumpOn":false,"irrigationMode":"drip","backupBasin":2,"backupLeak":false}
```

La lecture de chaque bassin et les champs du bassin 1 à la racine incluent `irrigationMode`, qui vaut `drip` (par défaut) ou `sprinkler`. La réponse MQTT confirme le mode sélectionné. Le mode peut être changé pendant l’arrosage et reste sélectionné au retour au départ.

```json
{"v":1,"id":"mode-01","action":"set_drip","basinId":2}
{"v":1,"id":"mode-01","action":"set_drip","basinId":2,"ok":true,"reason":"accepted","pumpOn":false,"irrigationMode":"drip"}
```

```json
{"v":1,"id":"mode-02","action":"set_sprinkler","basinId":2}
{"v":1,"id":"mode-02","action":"set_sprinkler","basinId":2,"ok":true,"reason":"accepted","pumpOn":false,"irrigationMode":"sprinkler"}
```

Ajoutez `basinId` pour cibler un bassin. Sans ce champ, la commande cible le bassin 1. La réponse reprend `basinId` et l’état de sa pompe. Un identifiant incorrect renvoie `invalid_basin` et `pumpOn: null`.

```json
{"v":1,"id":"demo-b3","action":"start_pump","basinId":3}
{"v":1,"id":"demo-b3","action":"start_pump","basinId":3,"ok":true,"reason":"accepted","pumpOn":true}
```

Chaque bloc présente la commande sur la première ligne et la réponse de l’ESP32 sur la seconde. Publiez la première ligne sur `<prefix>/command`.

**Revenir au départ** · passe en automatique à 35 %, pompe arrêtée, en attente de pluie. Le signalement de maçonnerie est conservé.

```json
{"v":1,"id":"demo-01","action":"reset"}
{"v":1,"id":"demo-01","action":"reset","ok":true,"reason":"accepted","pumpOn":false}
```

**Déclencher la pluie** · déclenche `rain` sur les trois citernes à partir de leurs niveaux courants, puis `after_rain` et `outage`. Le `basinId` identifie le bassin de la réponse. La demande est refusée si une pompe fonctionne (`stop_pumps_before_rain`) ou si la pluie est déjà en cours (`rain_in_progress`). Pendant la pluie, les commandes de retour au départ et de passage en mode capteur renvoient aussi `rain_in_progress`.

```json
{"v":1,"id":"demo-02","action":"start_rain"}
{"v":1,"id":"demo-02","action":"start_rain","ok":true,"reason":"accepted","pumpOn":false}
```

**Démarrer la pompe** · autorisé au-dessus du seuil si le niveau est valide. Depuis le mode capteur, l’ESP32 utilise le niveau lu au démarrage comme point de départ de la vidange simulée. Si le bassin suit déjà le scénario automatique, la coupure d’eau doit avoir commencé. La commande `set_manual` reprend la lecture directe du HC-SR04.

```json
{"v":1,"id":"demo-03","action":"start_pump"}
{"v":1,"id":"demo-03","action":"start_pump","ok":true,"reason":"accepted","pumpOn":true}
```

Si le niveau est bas, la réponse correspondante est par exemple `{"v":1,"id":"demo-03","action":"start_pump","ok":false,"reason":"level_too_low","pumpOn":false}`. Si la pompe tourne et que le niveau atteint le seuil, l’ESP32 l’arrête et publie `pumpOn:false` et `pumpReason:"level_too_low"` dans `state`.

**Arrêter la pompe** · en automatique, l’arrosage peut reprendre pendant la coupure tant que le seuil n’est pas atteint.

```json
{"v":1,"id":"demo-04","action":"stop_pump"}
{"v":1,"id":"demo-04","action":"stop_pump","ok":true,"reason":"accepted","pumpOn":false}
```

**Passer en mode capteur** · arrête la pompe, rétablit le réseau d’eau simulé et reprend la mesure HC-SR04.

```json
{"v":1,"id":"demo-05","action":"set_manual"}
{"v":1,"id":"demo-05","action":"set_manual","ok":true,"reason":"accepted","pumpOn":false}
```

**Demander une inspection** · active `masonryInspection` et affiche « Inspection de la maçonnerie demandée ».

```json
{"v":1,"id":"demo-06","action":"request_masonry_inspection"}
{"v":1,"id":"demo-06","action":"request_masonry_inspection","ok":true,"reason":"accepted","pumpOn":false}
```

**Retirer le signalement** · désactive `masonryInspection`.

```json
{"v":1,"id":"demo-07","action":"clear_masonry_inspection"}
{"v":1,"id":"demo-07","action":"clear_masonry_inspection","ok":true,"reason":"accepted","pumpOn":false}
```

Autres refus possibles dans `ack.reason` :

- `sensor_unavailable` · aucune mesure de niveau valide.
- `awaiting_outage` · le scénario automatique attend la coupure.
- `scenario_not_ready` · `start_rain` exige la phase `ready`.
- `unknown_action` · commande inconnue.
- `unsupported_version` · version absente ou différente de 1.

Un JSON illisible ou un identifiant invalide est ignoré. Sans réponse, vérifiez l’état reçu avant d’envoyer une nouvelle demande.
