# MIZUNIA · FAS9IA

FAS9IA is a water operations dashboard for a simulated pilot in **Borj Râs, Mahdia, Tunisia**. It brings household water reports, shared rainwater cisterns (فاسقيات), and the Parc Hydraulique irrigation model into one workspace.

## Run locally

Requires Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. For a production preview, use `npm run build` followed by `npm run preview`. Run `npm test` to check routing-independent logic for cistern registration, sensor readings, the park simulation, and incident decisions.

## Walk through the demo

1. **Opérations** is the default screen. Open the priority alert with **Examiner**, select a cistern on the Borj Râs map, or toggle **Signalements** to see fictional household locations on the same map.
2. **Incidents** contains the household review queue, area confirmation, simulated non-drinking-water pickups, and drinking-water referrals. Use **Report a water cut** to generate a tracking reference, or **Log phone report** to record a report on someone’s behalf.
3. **Réserves** shows the same cistern inventory as the map. To register another فاسقية, use **Ajouter une citerne** on the map, place it, and assign a sensor ID. Open its record in **Réserves** and use **Envoyer le relevé** to simulate telemetry.
4. Under **Réserves**, open the **Parc Hydraulique model** to inspect the illustrative 3D irrigation site, its separate sensor history, and simulated release routes. Use **Scénarios** to trigger low pressure, restore supply, or simulate rainfall.

The full intro plays when you open or reload a dashboard link, including when your system has reduced motion enabled. Navigation within the dashboard continues without replaying it. Use **Skip intro** or **Esc** to go straight to the requested view.

## Data and implementation

- **Interface and simulation.** React, TypeScript, and Vite power the dashboard. The park model uses Three.js and React Three Fiber. The introduction uses a WebGL droplet with a CSS fallback.
- **Geographic data.** The Borj Râs map uses [OpenStreetMap data](https://www.openstreetmap.org/copyright), bundled for offline use after the app loads. Cisterns, household locations, and sensor readings are illustrative. The coastal artwork depicts a fictional site.
- **Prototype boundaries.** Household reports and the mapped cistern inventory persist in the browser. Park scenarios and operator approvals are simulated in memory. The application has no live SONEDE connection, shared backend, water-quality verification service, or physical actuation.
