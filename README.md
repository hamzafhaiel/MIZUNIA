# MIZUNIA · FAS9IA

**A water resilience prototype for Borj Râs, Mahdia, Tunisia.** MIZUNIA explores how shared rainwater cisterns (فاسقيات) could support non-drinking water needs during supply interruptions. The project pairs a sensor and hydraulic simulation with an operator dashboard for handling household reports, monitoring reserves, and recording decisions.

## Architecture

| Component | Role |
| --- | --- |
| **Sensor prototype** | ESP32 firmware in Wokwi simulates three rainwater basins. Ultrasonic sensors supply level readings, and LEDs represent pump activity. |
| **Telemetry and commands** | The firmware publishes basin state and availability over MQTT. The browser simulator connects over WebSocket and receives acknowledgements for simulated commands. |
| **Hydraulic simulation** | A Three.js scene demonstrates rainfall collection, storage, irrigation, and a backup supply route for households. It can run in a browser-only preview or receive readings from Wokwi. |
| **Operations dashboard** | A React and TypeScript workspace maps cisterns and household reports, supports outage triage, and records simulated non-drinking pickups or drinking-water referrals. It also includes a 3D view of the Parc Hydraulique. |

The Wokwi prototype already exchanges MQTT messages with its own 3D scene. The FAS9IA dashboard runs with its own simulated readings and browser storage. The [MQTT contract](https://github.com/hamzafhaiel/MIZUNIA/blob/prototype1/MQTT.md) defines the interface for connecting the dashboard to the prototype.

## Choose a branch

| Branch | Contents | Start here |
| --- | --- | --- |
| `main` | Project overview and links to the implementations | This README |
| [`prototype1`](https://github.com/hamzafhaiel/MIZUNIA/tree/prototype1) | Wokwi circuit, ESP32 firmware, MQTT contract, and Three.js simulator | [Prototype setup](https://github.com/hamzafhaiel/MIZUNIA/blob/prototype1/README.md) |
| [`feat/fas9ia-dashboard`](https://github.com/hamzafhaiel/MIZUNIA/tree/feat/fas9ia-dashboard) | FAS9IA operator dashboard, Borj Râs map, and Parc Hydraulique view | [Dashboard setup](https://github.com/hamzafhaiel/MIZUNIA/blob/feat/fas9ia-dashboard/README.md) |

## Run a demo locally

Use Node.js 22.12 or newer. Clone the branch you want to try, then open the URL printed by Vite.

```sh
# Operations dashboard
git clone --branch feat/fas9ia-dashboard https://github.com/hamzafhaiel/MIZUNIA.git mizunia-dashboard
cd mizunia-dashboard
npm ci
npm run dev
```

```sh
# Sensor and hydraulic prototype, from a separate directory
git clone --branch prototype1 https://github.com/hamzafhaiel/MIZUNIA.git mizunia-prototype
cd mizunia-prototype
npm ci
npm run dev
```

Use the prototype’s **Aperçu 3D avec niveaux fictifs** option to explore it in the browser. For live simulated sensor readings, build the firmware with PlatformIO and start Wokwi using the [prototype setup guide](https://github.com/hamzafhaiel/MIZUNIA/blob/prototype1/README.md).

## Pilot scope

The dashboard uses fictional household locations and readings. The prototype demonstrates non-drinking use, with simulated pump commands and operator decisions. Neither implementation is connected to SONEDE or controls field equipment. The Borj Râs map uses [OpenStreetMap data](https://www.openstreetmap.org/copyright).
