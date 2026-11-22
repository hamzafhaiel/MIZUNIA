import { basinReading, refreshSelectedBasin, selectedBasinIndex, setSceneGenerator, setScenePressure, setSceneTelemetry, setSceneWeather } from '@kizuna-scene';
import { applyKizunaCommand, kizunaOpenings, kizunaWeather } from '../kizuna-model.ts';
import { advanceKizunaPilot, createKizunaPilot, pilotPower, pilotPumpBlock } from '../kizuna-pilot.ts';

const scenePump = document.querySelector('#scene-pump');
const sceneStatus = document.querySelector('#scene-status');
const waiting = document.querySelector('#scene-waiting');
const localLink = document.querySelector('#scene-local');
const basinButtons = [...document.querySelectorAll('[data-basin]')];
const generatorControls = document.querySelector('#scene-generator');
const generatorReading = document.querySelector('#scene-generator-status');
const generatorToggle = document.querySelector('#scene-generator-toggle');
const number = new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 2 });
let canOperate = false;
let source = '';
let activeTelemetry;
let activeWeather;
let activeGenerator;

function renderGenerator(generator) {
  activeGenerator = generator;
  generatorControls.hidden = !generator;
  setSceneGenerator(generator);
  if (!generator) return;
  const { running, fuelInTank, runtime, suppliedW, canStart } = generator;
  generatorReading.textContent = [
    running ? 'En marche' : fuelInTank === 0 ? 'Réservoir vide' : 'À l’arrêt',
    fuelInTank === null ? null : number.format(fuelInTank) + ' L',
    runtime === null ? null : number.format(runtime) + ' h d’autonomie',
    running ? number.format(suppliedW) + ' W fournis aux pompes' : null,
  ].filter(Boolean).join(' · ');
  generatorToggle.textContent = running ? 'Arrêter le groupe électrogène' : 'Démarrer le groupe électrogène';
  generatorToggle.disabled = !canOperate || !(running || canStart);
}

function renderSharedControls() {
  for (const button of basinButtons) {
    const reading = basinReading(activeTelemetry, Number(button.dataset.basin));
    button.querySelector('span').textContent = Number.isFinite(reading?.levelPct) ? Math.round(reading.levelPct) + ' %' : '—';
  }
  const reading = basinReading(activeTelemetry, selectedBasinIndex() + 1);
  scenePump.dataset.running = String(Boolean(reading?.pumpOn));
  scenePump.textContent = reading?.pumpOn ? 'Arrêter la pompe' : 'Démarrer la pompe';
  const canStart = Number.isFinite(reading?.levelPct) && reading.levelPct > reading.minLevelPct
    && !activeTelemetry.basins.some(basin => basin.rainOn) && activeTelemetry.backupBasin !== reading.id
    && (source === 'kizuna' || reading.mode === 'manual' || reading.phase === 'outage');
  scenePump.disabled = !canOperate || !(reading?.pumpOn || canStart);
}

function renderState({ source: mode, state, weather, pressureTest, openings, controllable, generator }) {
  source = mode;
  canOperate = controllable;
  activeTelemetry = state;
  activeWeather = weather;
  waiting.hidden = Boolean(state);
  setSceneWeather(weather);
  const backupBasin = setSceneTelemetry(state, {
    online: Boolean(state),
    label: source === 'wokwi' ? 'Wokwi' : 'Simulation KIZUNA',
    openings,
  });
  setScenePressure({
    running: Boolean(backupBasin || pressureTest),
    leaking: backupBasin ? Boolean(state.backupLeak) : pressureTest === 'leak',
    duringSupply: Boolean(backupBasin),
  });
  renderSharedControls();
  renderGenerator(generator);
}

for (const button of basinButtons) {
  button.addEventListener('click', () => {
    for (const target of basinButtons) target.setAttribute('aria-pressed', String(target === button));
    renderSharedControls();
    refreshSelectedBasin();
  });
}

function bindPump(command) {
  scenePump.addEventListener('click', () => {
    const action = scenePump.dataset.running === 'true' ? 'stop_pump' : 'start_pump';
    command(action, selectedBasinIndex() + 1);
  });
}

function bindGenerator(command) {
  generatorToggle.addEventListener('click', () => {
    if (canOperate && activeGenerator) command(!activeGenerator.running);
  });
}

function showStatus(text) {
  if (sceneStatus.textContent !== text) sceneStatus.textContent = text;
}

function connectDashboard(id) {
  const connection = new BroadcastChannel('mizuna-kizuna-' + id);
  let received = Date.now();
  let linked = false;
  let disconnected = false;
  showStatus('Connexion à Mizuna…');
  waiting.hidden = false;
  connection.onmessage = ({ data }) => {
    if (data?.type !== 'state') return;
    linked = true;
    disconnected = false;
    received = Date.now();
    localLink.hidden = true;
    renderState(data);
    showStatus(source === 'wokwi' && !activeTelemetry ? 'Wokwi · En attente de mesures' : 'Synchronisée avec Mizuna');
  };

  bindPump((action, basinId) => connection.postMessage({ type: 'pump', action, basinId, source }));
  bindGenerator(running => connection.postMessage({ type: 'generator', running }));
  const read = () => connection.postMessage({ type: 'read' });
  read();
  window.setInterval(() => {
    if (!disconnected && Date.now() - received > 6000) {
      disconnected = true;
      showStatus(linked ? 'Connexion à Mizuna interrompue' : 'Mizuna indisponible');
      localLink.hidden = false;
      canOperate = false;
      if (activeWeather) setSceneWeather({ ...activeWeather, rain: 0 });
      setSceneTelemetry(activeTelemetry, { online: false, label: 'Dernier relevé Mizuna' });
      setScenePressure({ running: false, leaking: false, duringSupply: false });
      renderGenerator(activeGenerator && { ...activeGenerator, running: false, suppliedW: 0 });
      renderSharedControls();
    }
    read();
  }, 2000);
}

function startLocalSimulation() {
  let local = createKizunaPilot();
  const render = () => renderState({
    source: 'kizuna', state: local.state, weather: kizunaWeather(local.weather, local.state),
    openings: kizunaOpenings(local), pressureTest: null, controllable: true, generator: pilotPower(local).generator,
  });
  showStatus('Simulation locale');
  bindPump((action, basinId) => {
    if (action === 'start_pump' && pilotPumpBlock(local, basinId, basinId)) return;
    local = { ...local, ...applyKizunaCommand(local, action, basinId, Date.now()) };
    render();
  });
  bindGenerator(running => {
    local = { ...local, generator: { ...local.generator, running } };
    render();
  });
  render();

  let last = performance.now();
  window.setInterval(() => {
    const now = performance.now();
    const next = advanceKizunaPilot(local, Math.min(3, (now - last) / 1000), Date.now());
    last = now;
    local = next;
    render();
  }, 1000);
}

const dashboardId = new URLSearchParams(location.hash.slice(1)).get('mizuna');
if (dashboardId && typeof BroadcastChannel !== 'undefined') connectDashboard(dashboardId);
else startLocalSimulation();
