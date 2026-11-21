const nominalWatts = 450;
const performanceFactor = 0.86;
const presets = {
  sun: { label: 'Soleil', temperature: 28, irradiance: 950, rain: 0 },
  clouds: { label: 'Nuages', temperature: 22, irradiance: 360, rain: 0 },
  rain: { label: 'Pluie', temperature: 18, irradiance: 120, rain: 8 },
  night: { label: 'Nuit', temperature: 15, irradiance: 0, rain: 0 },
};

export function solarWatts(irradiance, airTemperature) {
  const cellTemperature = airTemperature + 25 * irradiance / 800;
  return Math.max(0, nominalWatts * irradiance / 1000 * performanceFactor * (1 - 0.004 * (cellTemperature - 25)));
}

export function bindWeather(onWeather, onCollect) {
  const details = document.querySelector('#weather-details');
  const status = document.querySelector('#weather-status');
  const collect = document.querySelector('#weather-collect');
  const buttons = [...details.querySelectorAll('[data-weather-preset]')];
  const inputs = [...details.querySelectorAll('[data-weather-input]')];
  const values = Object.fromEntries([...details.querySelectorAll('[data-weather]')].map(
    element => [element.dataset.weather, element],
  ));
  const format = new Intl.NumberFormat('fr', { maximumFractionDigits: 2 });
  let reading;
  let pumpWatts;

  function renderEnergy() {
    const production = Math.round(reading.watts);
    const hasLoad = Number.isFinite(pumpWatts);
    const balance = production - pumpWatts;
    values.watts.textContent = `${production} W`;
    values.energy.textContent = `${Math.round(reading.watts)} Wh`;
    values.load.textContent = hasLoad ? `${pumpWatts} W` : 'Indisponible';
    values.balance.textContent = hasLoad ? `${balance > 0 ? '+' : ''}${balance} W` : '—';
    const verdict = document.querySelector('#solar-verdict');
    verdict.textContent = !hasLoad ? 'Charge en attente · active l’aperçu pour essayer une pompe'
      : pumpWatts === 0 ? 'Pompes à l’arrêt'
      : balance < 0 ? 'Apport supplémentaire nécessaire' : 'Production suffisante dans la simulation';
    verdict.dataset.alert = String(hasLoad && balance < 0);
  }

  function update(preset) {
    const { temperature, irradiance, rain } = Object.fromEntries(inputs.map(
      input => [input.dataset.weatherInput, input.valueAsNumber],
    ));
    reading = { temperature, irradiance, rain, watts: solarWatts(irradiance, temperature) };
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.weatherPreset === preset));
    status.textContent = preset ? `Conditions simulées · ${presets[preset].label}` : 'Conditions simulées · Réglage personnalisé';
    values.temperature.textContent = `${format.format(temperature)} °C`;
    values.irradiance.textContent = `${irradiance} W/m²`;
    values.rain.textContent = `${format.format(rain)} mm/h`;
    collect.disabled = rain === 0;
    document.querySelector('#weather-feedback').textContent = '';
    renderEnergy();
    onWeather(reading);
  }

  function applyPreset(preset) {
    for (const input of inputs) input.value = presets[preset][input.dataset.weatherInput];
    update(preset);
  }

  for (const button of buttons) button.addEventListener('click', () => applyPreset(button.dataset.weatherPreset));
  for (const input of inputs) input.addEventListener('input', () => update());
  collect.addEventListener('click', () => {
    document.querySelector('#weather-feedback').textContent = onCollect(reading.rain);
  });
  applyPreset('sun');
  return watts => {
    if (watts === pumpWatts) return;
    pumpWatts = watts;
    renderEnergy();
  };
}
