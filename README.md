# KIZUNA · Trois bassins de pluie pour Mahdia

Prototype de hackathon inspiré des bassins historiques de Mahdia, en Tunisie. Il illustre la collecte de pluie et l’utilisation d’une réserve pour arroser des arbres pendant une coupure du réseau d’eau. Le circuit fonctionne dans Wokwi et utilise une LED pour représenter la pompe.

La maquette de Borj Ras propose une **msatha**, une surface maçonnée en pente dont les rigoles dirigent le ruissellement vers les citernes. La récupération des eaux pluviales dans des citernes est documentée à Mahdia. L’implantation des trois citernes et le parc hydraulique sont des choix de conception du prototype. [Étude archéologique de l’INP sur Mahdia](https://www.inp2020.tn/periodiques/Africa15.pdf)

## Hypothèses de démonstration

- Trois bassins circulaires d’inspiration fatimide, de 9,4 m de diamètre et 60 cm de profondeur utile, soit environ 42 m³ par bassin. Chaque bassin apparaît en coupe avec sa pompe, sa tête de puits hors sol et sa conduite d’arrosage. L’échelle verticale est amplifiée. Les dimensions servent uniquement à la démonstration.
- HC-SR04 à 10 cm de l’eau quand le bassin est plein et à 70 cm du fond quand il est vide. En mode capteur, l’ESP32 calcule `100 × (70 − distance) / 60` et borne le résultat entre 0 et 100 %. Un écho absent rend le niveau indisponible.
- Scénario accéléré à partir de 35 %. La pluie ajoute 4 points de remplissage par seconde pendant 12 s, jusqu’à 83 %. Trois secondes plus tard, le réseau d’eau est déclaré coupé. La pompe retire 3 points par seconde au goutte-à-goutte ou 4,5 en aspersion, puis s’arrête à 20 %. Ces débits servent uniquement à accélérer la démo.
- Le potentiomètre simule un indice de turbidité de 0 à 100 %. Le message « Nettoyage à vérifier » apparaît à partir de 70 %. La demande d’inspection de la maçonnerie est un signalement manuel, transmis par MQTT et conservé jusqu’à son retrait ou au redémarrage de l’ESP32.
- Chaque bassin a un HC-SR04 et une LED de pompe. Le thermistor NTC mesure la température simulée du site. La température et la turbidité sont des mesures communes. [Capteur NTC dans Wokwi](https://docs.wokwi.com/parts/wokwi-ntc-temperature-sensor)

## Lancer le prototype sous Windows

1. Dans VS Code, ouvrez le dossier **`C:\Users\haouas\kizuna-prototype`** avec **Fichier → Ouvrir le dossier**. Il contient `platformio.ini`, `wokwi.toml` et `package.json`.
2. Installez **PlatformIO IDE** et **Wokwi Simulator** depuis le panneau Extensions. Si Wokwi demande une licence, suivez la procédure indiquée par l’extension. [Démarrage de Wokwi dans VS Code](https://docs.wokwi.com/vscode/getting-started)
3. Lancez **PlatformIO: Build** dans la palette de commandes, ou `pio run` dans un terminal PlatformIO. Attendez la création de `.pio/build/esp32dev/firmware.bin` et `firmware.elf`. [Simulation d’un projet PlatformIO](https://docs.wokwi.com/vscode/platformio)
4. Appuyez sur **F1**, puis choisissez **Wokwi: Start Simulator**. Le moniteur série intégré affiche l’état JSON chaque seconde, avec notamment `distanceCm` et `levelPct`. Gardez l’onglet du simulateur visible, par exemple dans une fenêtre à côté du navigateur.
5. Dans un terminal PowerShell ouvert à la racine, exécutez les commandes ci-dessous et ouvrez l’adresse affichée par Vite dans votre navigateur.

   ```powershell
   npm.cmd ci
   npm.cmd run dev
   ```

6. Attendez **ESP32 connecté** dans la scène. Le circuit publie via MQTT TCP et le navigateur reçoit les mêmes mesures via MQTT sur WebSocket. Le dashboard peut utiliser la même adresse WebSocket.

Sélectionnez **Bassin 1**, **Bassin 2** ou **Bassin 3** avant d’envoyer une commande. Chaque bassin suit son propre scénario. Cochez **Aperçu 3D avec niveaux fictifs** pour voir les trois bassins remplis même si Wokwi est hors ligne. L’aperçu désactive les commandes MQTT.

Dans l’aperçu, **Faire pleuvoir sur les citernes** anime le ruissellement de la terrasse en pente jusqu’aux rigoles ouvertes. Les raccords maçonnés rejoignent la msatha de chaque citerne. **Zoom sur l’entrée d’eau** cadre le raccord de la citerne sélectionnée. **Voir l’arrosage** anime la zone du parc alimentée par le bassin sélectionné. Choisissez **Goutte-à-goutte** ou **Aspersion (الرش)** pour comparer les animations. En mode connecté, le firmware confirme le mode par MQTT et applique un débit accéléré de 3 ou 4,5 points de remplissage par seconde respectivement. Le seuil de 20 % s’applique aux deux modes.

### Test de pression sur 100 m

Dans **Pression · conduite de secours**, choisissez **Scénario 1 · Conduite sans fuite** ou **Scénario 2 · Fuite à 50 m**. Les cartes A et B affichent les pressions d’entrée et de sortie. Les barres comparent la perte mesurée à la référence sur la même échelle. **Zoom sur la conduite** cadre les capteurs et la zone de fuite. Le tronçon est représenté à une échelle graphique condensée.

Hypothèses de calcul : 100 m à l’horizontale, diamètre intérieur de 40 mm, pression d’entrée de 3 bar, débit utile en sortie de 1,2 L/s et facteur de Darcy de 0,025. Le défaut fictif à 50 m retire 0,9 L/s et augmente le débit dans la première moitié. Une perte supplémentaire de plus de 0,12 bar fait suspecter une fuite. La comparaison suppose les mêmes conditions de service. Les valeurs et les capteurs de ce test sont simulés dans le navigateur.

### Météo, solaire et capteurs

**Météo et solaire** fonctionne localement dans le navigateur. Choisissez **Soleil**, **Nuages**, **Pluie** ou **Nuit**, puis ajustez le soleil reçu, la température extérieure et l’intensité de pluie. Les réglages modifient l’éclairage et les précipitations visibles. Pour essayer la montée de niveau, cliquez sur **Simuler la collecte dans les trois citernes**. En aperçu, chaque citerne gagne 4 points de remplissage par seconde à 8 mm/h, proportionnellement à la pluie réglée. L’essai est accéléré, dure jusqu’à 12 secondes et s’arrête si la pluie tombe à zéro. Quand Wokwi est connecté, activez d’abord **Aperçu** pour essayer la collecte locale.

Dans **Capteur à observer**, sélectionnez **Station météo** puis cliquez sur **Zoom sur le capteur** pour repérer le pluviomètre, le thermomètre extérieur sous abri et la cellule de référence solaire. Le menu donne aussi accès aux capteurs des citernes et du jardin.

Le calcul solaire utilise 450 Wc au total, 14 % de pertes forfaitaires et une correction thermique simplifiée. L’irradiance réglée correspond à celle reçue sur le plan des panneaux. La puissance en W est comparée à la charge courante des pompes. La valeur en Wh indique l’énergie produite sur une heure à conditions constantes. Le bilan est une estimation de démonstration. Les relais des pompes restent pilotés par les commandes existantes.

La pluie dure 12 secondes sur les trois citernes à la fois et part de leur niveau courant. **Lire le capteur Wokwi** fait revenir le bassin sélectionné aux mesures du HC-SR04. Pour changer son niveau, ouvrez le capteur dans Wokwi et réglez la distance. En aperçu, **Tester le capteur** affiche un curseur de distance fictive.

Le potentiomètre **Humidité du sol** sur GPIO36 simule une sonde commune au jardin. Tournez-le pour modifier la valeur de 0 à 100 %. L’arrosage reste commandé par l’opérateur. Les trois modules solaires et leurs câbles illustrent une alimentation de 450 W nominaux, avec une charge simulée de 120 W par pompe active. Le circuit Wokwi simule les commandes et la télémétrie.

Pour arroser en **Aperçu**, sélectionnez une citerne, choisissez **Goutte-à-goutte** ou **Aspersion**, puis cliquez sur **Démarrer la pompe d’arrosage**. Seule la citerne utilisée baisse de 3 ou 4,5 points par seconde. La pompe s’arrête à 20 % ou sur commande. Le zoom permet d’observer les jets pendant le pompage. Avec Wokwi, un démarrage depuis le mode capteur prend la mesure du HC-SR04 comme niveau de départ de la vidange.

Sélectionnez une citerne puis **Démarrer la pompe des maisons**. Avec Wokwi connecté, l’ESP32 active la LED prévue à cet effet et fait passer la citerne source au modèle de vidange, à partir du niveau courant. Avec l’aperçu, le navigateur fait le même calcul sur les niveaux fictifs. Cliquez de nouveau pour arrêter. **Simuler une fuite en service** met à jour la pression affichée et accélère la baisse de 2 à 3,5 points par seconde. La pompe s’arrête à 20 %. La maquette représente un réseau de secours pour des usages non potables. Les trois modules solaires sont répartis sur deux ombrières de parking et le toit d’un bâtiment public fictif.

Si vous utilisez l’installation de PlatformIO locale créée pendant la vérification et que `.pio/tools/Scripts/pio.exe` existe, vous pouvez aussi compiler depuis PowerShell à la racine du projet.

```powershell
$env:PLATFORMIO_CORE_DIR = (Join-Path $PWD '.pio/core')
& '.pio/tools/Scripts/pio.exe' run
```

### Configuration MQTT

Le broker de démonstration est `test.mosquitto.org`. Le firmware utilise le port TCP 1883 et le navigateur `wss://test.mosquitto.org:8081/mqtt`. Ce broker est public. Choisissez un préfixe propre à votre équipe pour éviter les collisions et réservez-le aux données fictives. [Ports du broker](https://test.mosquitto.org/)

- Modifiez `BrokerHost`, `BrokerPort` et `TopicPrefix` dans [firmware/config.h](firmware/config.h), puis recompilez et relancez Wokwi.
- Dans PowerShell, exécutez `Copy-Item .env.example .env.local`. Changez `VITE_MQTT_URL` et `VITE_MQTT_PREFIX` dans le fichier copié, puis redémarrez Vite. Le broker doit proposer un point d’accès TCP pour Wokwi et un point d’accès WebSocket pour le navigateur. Partagez le même préfixe avec le dashboard, sans slash final.

## Rejouer la démonstration

1. **Capteur seul.** Au démarrage, l’ESP32 est en mode manuel. Dans Wokwi, cliquez sur le HC-SR04. Réglez environ 40 cm, puis 64 cm. Le moniteur série indique environ 50 %, puis 10 %. La scène affiche le même niveau dès que l’ESP32 est connecté. À 10 %, cliquez sur **Démarrer la pompe** pour montrer le refus et la LED éteinte.
2. **Pluie et coupure.** Cliquez sur **Retour au départ**, puis **Déclencher la pluie**. Le niveau passe de 35 à 83 %, la pluie s’arrête et la coupure simulée apparaît trois secondes plus tard. La liaison MQTT reste active pendant cette coupure du réseau d’eau.
3. **Arrosage.** Cliquez sur **Démarrer la pompe**. La LED s’allume et les particules suivent la conduite vers les arbres. À partir de 83 %, le niveau atteint 20 % après environ 21 secondes au goutte-à-goutte ou 14 secondes en aspersion, la LED s’éteint et l’écoulement s’arrête. **Retour au départ** permet de rejouer le scénario, et **Mode capteur** redonne la main au HC-SR04.
4. **Entretien.** Tournez le potentiomètre au maximum, puis baissez-le. Vérifiez l’apparition et la disparition de « Nettoyage à vérifier ». Depuis le dashboard ou un client MQTT connecté au même broker, publiez l’exemple `request_masonry_inspection` de [MQTT.md](MQTT.md). Le signalement doit apparaître dans la scène.
5. **Déconnexion.** Arrêtez Wokwi. Dans la scène, la connexion devient indisponible en quelques secondes et les commandes sont désactivées. Relancez la simulation pour voir la connexion et les mesures reprendre.
   Si la page reste hors ligne, gardez l’onglet **Wokwi Simulator** visible et consultez le moniteur série. Les lignes JSON montrent les lectures locales. Les lignes `[Wi-Fi]` et `[MQTT]` indiquent l’étape de connexion. La maquette attend une nouvelle lecture en direct et signale une mesure périmée après 10 secondes.
6. **Trois niveaux et température.** Dans Wokwi, réglez les trois HC-SR04 à 40, 52 et 64 cm. Vérifiez environ 50 %, 30 % et 10 % en mode capteur. Changez ensuite la température sur le module NTC et comparez les °C dans le moniteur série et la scène.

Le document [MQTT.md](MQTT.md) contient le contrat complet pour développer le dashboard indépendamment.
