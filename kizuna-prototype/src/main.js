import { connectBasin } from './mqtt.js';
import { bindPressureTest } from './pressure.js';
import { bindWeather } from './weather.js';
import { closePressureView, refreshSelectedBasin, setScenePressure, setSceneTelemetry, setSceneWeather } from './scene.js';
import './style.css';

const setPressureSupply = bindPressureTest(setScenePressure);
const preview = document.querySelector('#preview');
let previewControls;

const setPumpWatts = bindWeather(reading => {
  setSceneWeather(reading);
  previewControls?.updateWeatherRain(reading.rain);
}, rain => previewControls.collectWeatherRain(rain));

previewControls = connectBasin((state, online) => {
  const label = preview.checked ? 'Aperçu' : online ? 'Wokwi' : 'Dernière mesure';
  const backupBasin = setSceneTelemetry(state, { online, label });
  setPumpWatts(online ? state?.pumpLoadW : undefined);
  setPressureSupply(backupBasin, Boolean(backupBasin && state.backupLeak));
});

document.querySelector('#pressure-stop').addEventListener('click', closePressureView);
for (const button of document.querySelectorAll('[data-basin]')) {
  button.addEventListener('click', refreshSelectedBasin);
}
