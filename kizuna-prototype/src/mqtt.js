import mqtt from 'mqtt';

const url = import.meta.env.VITE_MQTT_URL || 'wss://test.mosquitto.org:8081/mqtt';
const prefix = (import.meta.env.VITE_MQTT_PREFIX || 'kizuna/mahdia/demo-7c42e9/bassin-1').replace(/\/+$/, '');
const phases = {
  manual: 'Mode capteur · HC-SR04',
  ready: 'Bassin prêt · déclenchez la pluie',
  rain: 'Pluie · la msatha alimente la citerne',
  after_rain: 'Pluie terminée · réserve disponible',
  outage: 'Coupure simulée · démarrez la pompe',
  watering: 'Le parc hydraulique est arrosé',
  complete: 'Seuil minimal atteint · arrosage terminé',
};
const reasons = {
  invalid_basin: 'Bassin inconnu.',
  level_too_low: 'Niveau trop bas pour pomper.',
  sensor_unavailable: 'Mesure du capteur indisponible.',
  awaiting_outage: 'Attendez la coupure du réseau.',
  scenario_not_ready: 'Revenez au départ pour relancer la pluie.',
  stop_pumps_before_rain: 'Arrêtez les pompes en marche avant de relancer la pluie.',
  rain_in_progress: 'La pluie sur les trois citernes est déjà en cours.',
  backup_already_running: 'Arrêtez la pompe des maisons avant de changer le mode du bassin.',
  source_irrigating: 'Arrêtez l’arrosage de cette citerne avant d’alimenter les maisons.',
};

export const BasinNames = ['Bassin 1', 'Bassin 2', 'Bassin 3'];

export function basinReading(state, id) {
  return state?.basins?.find(reading => reading.id === id) ?? (id === 1 ? state : undefined);
}

const irrigationActions = { set_drip: 'drip', set_sprinkler: 'sprinkler' };
const minimumLevel = 20;

export function connectBasin(onState) {
  const select = id => document.getElementById(id);
  const connection = select('connection');
  const feedback = select('feedback');
  const fill = select('fill');
  const buttons = [...document.querySelectorAll('[data-action]')];
  const basinButtons = [...document.querySelectorAll('[data-basin]')];
  const preview = select('preview');
  const previewRainButton = select('preview-rain');
  const offlineRain = select('offline-rain');
  const previewIrrigationButton = select('preview-irrigation');
  const backupToggle = select('backup-toggle');
  const backupLeakButton = select('backup-leak');
  const backupStatus = select('backup-status');
  const backupFeedback = select('backup-feedback');
  const previewDistance = select('preview-distance');
  const client = mqtt.connect(url, { connectTimeout: 6000, reconnectPeriod: 2000, queueQoSZero: false });
  let state;
  let status = 'Connexion MQTT en cours…';
  let lastLiveState = -Infinity;
  let pending;
  let commandNumber = 0;
  let selectedBasin = 1;
  const previewLevels = [62, 77, 32];
  let previewActivity = 'sensor';
  let previewRainUntil = 0;
  let previewRainLast = 0;
  let previewRainRate = 4;
  let weatherCollection = false;
  let previewMode = 'drip';
  let irrigationBasin = 0;
  let irrigationLast = 0;
  let backupBasin = 0;
  let backupLast = 0;
  let previewLeak = false;
  let previewBackupReason = 'initial';

  // Fresh telemetry proves the device is reachable even if availability was retained by an old session.
  const isOnline = () => client.connected && performance.now() - lastLiveState < 10000;

  function render() {
    const online = isOnline();
    const now = performance.now();
    const previewRain = previewActivity === 'rain' && now < previewRainUntil;
    if (preview.checked && previewActivity === 'rain') {
      const sampleTime = Math.min(now, previewRainUntil);
      const gain = (sampleTime - previewRainLast) * previewRainRate / 1000;
      previewRainLast = sampleTime;
      previewLevels.forEach((level, index) => { previewLevels[index] = Math.min(100, level + gain); });
    }
    if (preview.checked && previewActivity === 'irrigation') {
      const index = irrigationBasin - 1;
      const rate = previewMode === 'sprinkler' ? 4.5 : 3;
      previewLevels[index] = Math.max(minimumLevel, previewLevels[index] - (now - irrigationLast) * rate / 1000);
      irrigationLast = now;
      if (previewLevels[index] <= minimumLevel) {
        previewActivity = 'sensor';
        feedback.textContent = `Citerne ${irrigationBasin} · seuil de 20 % atteint, arrosage arrêté.`;
        irrigationBasin = 0;
      }
    }
    if (preview.checked && previewActivity === 'backup' && backupBasin) {
      const index = backupBasin - 1;
      const rate = previewLeak ? 3.5 : 2;
      previewLevels[index] = Math.max(minimumLevel, previewLevels[index] - (now - backupLast) * rate / 1000);
      backupLast = now;
      if (previewLevels[index] <= minimumLevel) {
        backupBasin = 0;
        previewBackupReason = 'level_too_low';
      }
    }
    const displayedState = preview.checked ? {
      soilMoisturePct: 45,
      solarNominalW: 450,
      pumpLoadW: previewActivity === 'irrigation' || (previewActivity === 'backup' && backupBasin) ? 120 : 0,
      backupBasin: previewActivity === 'backup' ? backupBasin : 0,
      backupLeak: previewLeak,
      backupReason: previewBackupReason,
      basins: previewLevels.map((levelPct, index) => ({
        id: index + 1,
        levelPct,
        distanceCm: previewActivity === 'sensor' ? Math.round(70 - levelPct * 0.6) : null,
        irrigationMode: previewMode,
        rainOn: previewRain,
        networkOutage: previewActivity === 'backup',
        pumpOn: previewActivity === 'irrigation' && index + 1 === irrigationBasin,
      })),
    } : state;
    const reading = basinReading(displayedState, selectedBasin);
    const commandEnabled = online && !preview.checked && Boolean(reading);
    connection.dataset.online = String(online || preview.checked);
    connection.textContent = preview.checked ? 'Aperçu 3D · données simulées'
      : online ? 'ESP32 connecté' : status;
    offlineRain.hidden = online || preview.checked;
    const validLevel = Number.isFinite(reading?.levelPct);
    if (validLevel) fill.value = reading.levelPct;
    else fill.removeAttribute('value');
    select('level').textContent = validLevel ? `${Math.round(reading.levelPct)} %` : '—';
    const previewPhase = previewActivity === 'rain'
      ? (previewRain ? 'Pluie · les trois citernes se remplissent' : 'Pluie terminée · eau stockée')
      : previewActivity === 'irrigation'
        ? `Citerne ${irrigationBasin} → jardin · ${previewMode === 'sprinkler' ? 'aspersion' : 'goutte-à-goutte'}`
        : 'Aperçu · niveaux fictifs';
    select('phase').textContent = preview.checked ? previewPhase : phases[reading?.phase] || 'En attente des mesures';
    select('pump-state').textContent = reading && (preview.checked || commandEnabled)
      ? (reading.pumpOn ? 'En marche' : 'Arrêtée') : '—';
    const mode = reading?.irrigationMode;
    select('irrigation').textContent = mode === 'sprinkler' ? 'Aspersion' : mode === 'drip' ? 'Goutte-à-goutte' : '—';
    select('preview-actions').hidden = !preview.checked;
    select('preview-sensor').hidden = !preview.checked || previewActivity !== 'sensor';
    previewRainButton.setAttribute('aria-pressed', String(previewRain));
    previewIrrigationButton.setAttribute('aria-pressed', String(previewActivity === 'irrigation'));
    previewIrrigationButton.textContent = previewActivity === 'irrigation'
      ? 'Arrêter la pompe d’arrosage' : 'Démarrer la pompe d’arrosage';
    const backupSource = displayedState?.backupBasin || 0;
    if (backupSource === selectedBasin && (online || preview.checked)) {
      select('phase').textContent = 'Coupure simulée · distribution vers les maisons';
    }
    const backupCondition = Boolean(displayedState?.backupLeak);
    const staleBackup = !preview.checked && !online && Boolean(state?.backupBasin);
    const usePreview = preview.checked || !online;
    preview.disabled = online && Boolean(state?.backupBasin);
    backupToggle.setAttribute('aria-pressed', String(Boolean(backupSource) && !staleBackup));
    backupToggle.textContent = backupSource ? 'Arrêter la pompe des maisons'
      : usePreview ? 'Démarrer le secours en aperçu' : 'Démarrer la pompe des maisons';
    backupToggle.disabled = staleBackup || Boolean(pending);
    backupLeakButton.setAttribute('aria-pressed', String(backupCondition));
    backupLeakButton.textContent = backupCondition ? 'Supprimer la fuite simulée' : 'Simuler une fuite en service';
    backupLeakButton.disabled = staleBackup || Boolean(pending);
    backupStatus.textContent = staleBackup ? 'État de la pompe non confirmé · reconnexion en cours.'
      : backupSource ? `Citerne ${backupSource} → maisons · ${backupCondition ? 'fuite simulée' : 'conduite normale'} · eau non potable.`
        : displayedState?.backupReason === 'level_too_low' ? 'Pompe arrêtée · réserve minimale de 20 %.'
          : `Pompe arrêtée · source sélectionnée : citerne ${selectedBasin}.`;
    if (preview.checked && previewActivity === 'sensor') {
      previewDistance.value = String(reading.distanceCm);
      select('preview-distance-value').textContent = `${reading.distanceCm} cm`;
    }
    select('sensor-help').textContent = preview.checked
      ? '« Tester le capteur » ouvre le curseur de distance fictive du bassin sélectionné.'
      : 'En mode capteur, règle la distance du HC-SR04 du bassin sélectionné dans Wokwi. La mesure se rafraîchit automatiquement.';
    select('network').textContent = typeof reading?.networkOutage === 'boolean'
      ? (reading.networkOutage ? 'Coupure simulée' : 'Disponible') : '—';
    select('distance').textContent = Number.isFinite(reading?.distanceCm) ? `${reading.distanceCm} cm` : '—';
    select('turbidity').textContent = Number.isFinite(displayedState?.turbidityPct) ? `${displayedState.turbidityPct} %` : '—';
    select('temperature').textContent = Number.isFinite(displayedState?.temperatureC) ? `${displayedState.temperatureC} °C` : '—';
    select('soil-moisture').textContent = Number.isFinite(displayedState?.soilMoisturePct) ? `${displayedState.soilMoisturePct} %` : '—';
    select('solar').textContent = Number.isFinite(displayedState?.solarNominalW)
      ? `${displayedState.solarNominalW} W / ${displayedState.pumpLoadW} W` : '—';
    select('cleaning').hidden = !displayedState?.cleaningCheck;
    select('inspection').hidden = !reading?.masonryInspection;
    for (const button of basinButtons) {
      const id = Number(button.dataset.basin);
      const level = basinReading(displayedState, id)?.levelPct;
      button.setAttribute('aria-pressed', String(id === selectedBasin));
      button.querySelector('span').textContent = Number.isFinite(level) ? `${Math.round(level)} %` : '—';
    }
    for (const button of buttons) {
      const modeAction = irrigationActions[button.dataset.action];
      button.hidden = preview.checked && !modeAction && button.dataset.action !== 'set_manual';
      if (button.dataset.action === 'set_manual') {
        button.textContent = preview.checked ? 'Tester le capteur' : 'Lire le capteur Wokwi';
      }
      if (modeAction) {
        button.setAttribute('aria-pressed', String(mode === modeAction));
      }
      if (preview.checked && (modeAction || button.dataset.action === 'set_manual')) {
        button.disabled = false;
        continue;
      }
      button.disabled = !commandEnabled || Boolean(pending)
        || (button.dataset.action === 'start_rain' && (state?.basins ?? [reading]).some(basin => basin.pumpOn || basin.rainOn));
    }
    onState(displayedState, online || preview.checked);
  }

  function finishCommand(message) {
    clearTimeout(pending?.timeout);
    const output = pending?.output ?? feedback;
    pending = undefined;
    output.textContent = message;
    render();
  }

  client.on('connect', () => {
    status = 'Broker connecté · en attente de l’ESP32';
    client.subscribe([`${prefix}/state`, `${prefix}/availability`, `${prefix}/ack`], error => {
      if (error) {
        status = 'Abonnement MQTT impossible';
        render();
      }
    });
    render();
  });
  client.on('close', () => {
    lastLiveState = -Infinity;
    status = 'Connexion MQTT perdue · reconnexion…';
    if (pending) finishCommand('Confirmation interrompue par la perte de connexion.');
    else render();
  });
  client.on('error', () => {
    status = 'Connexion MQTT indisponible';
    render();
  });
  client.on('message', (topic, payload, packet) => {
    if (topic === `${prefix}/availability`) {
      if (payload.toString() === 'offline') {
        if (!packet.retain) lastLiveState = -Infinity;
        if (!isOnline()) status = state ? 'ESP32 hors ligne · dernière mesure affichée' : 'ESP32 hors ligne · aucune mesure reçue';
      } else if (!isOnline()) {
        status = 'ESP32 signalé en ligne · en attente des mesures';
      }
      render();
      return;
    }
    let message;
    try {
      message = JSON.parse(payload.toString());
    } catch {
      return;
    }
    if (message?.v !== 1) return;
    if (topic === `${prefix}/state`) {
      if (!packet.retain) {
        state = message;
        lastLiveState = performance.now();
        status = 'ESP32 sans mesure récente · dernières données affichées';
      } else if (!state) {
        state = message;
      }
      render();
    } else if (topic === `${prefix}/ack` && !packet.retain && pending && pending.id === message.id) {
      finishCommand(message.ok ? 'Commande confirmée par l’ESP32.'
        : (reasons[message.reason] || `Commande refusée (${message.reason}).`));
    }
  });

  preview.addEventListener('change', () => {
    previewActivity = 'sensor';
    render();
  });
  previewDistance.addEventListener('input', () => {
    previewLevels[selectedBasin - 1] = (70 - Number(previewDistance.value)) / 0.6;
    render();
  });
  function startPreviewRain(rate = 4, fromWeather = false) {
    render();
    if (preview.checked && (previewActivity === 'irrigation' || (previewActivity === 'backup' && backupBasin))) {
      return reasons.stop_pumps_before_rain;
    }
    preview.checked = true;
    feedback.textContent = '';
    if (previewLevels.some(level => level >= 100)) previewLevels.splice(0, 3, 62, 77, 32);
    previewRainRate = rate;
    weatherCollection = fromWeather;
    previewRainLast = performance.now();
    previewRainUntil = previewRainLast + 12000;
    previewActivity = 'rain';
    render();
    return 'Collecte accélérée dans les trois citernes · 12 secondes maximum.';
  }
  previewRainButton.addEventListener('click', () => { feedback.textContent = startPreviewRain(); });
  offlineRain.addEventListener('click', () => startPreviewRain());
  previewIrrigationButton.addEventListener('click', () => {
    const wasRunning = previewActivity === 'irrigation';
    render();
    if (wasRunning) {
      if (previewActivity !== 'irrigation') return;
      irrigationBasin = 0;
      previewActivity = 'sensor';
      feedback.textContent = 'Pompe d’arrosage arrêtée.';
    } else {
      if (previewActivity === 'backup' && backupBasin) {
        feedback.textContent = 'Arrêtez le secours des maisons avant de lancer l’arrosage en aperçu.';
        return;
      }
      if (previewLevels[selectedBasin - 1] <= minimumLevel) {
        feedback.textContent = reasons.level_too_low;
        return;
      }
      feedback.textContent = '';
      irrigationBasin = selectedBasin;
      irrigationLast = performance.now();
      previewActivity = 'irrigation';
    }
    render();
  });
  backupToggle.addEventListener('click', () => {
    if (isOnline() && !preview.checked) {
      sendCommand(state.backupBasin ? 'stop_backup' : 'start_backup');
      return;
    }
    render();
    if (preview.checked && previewActivity === 'irrigation') {
      backupFeedback.textContent = 'Arrêtez l’arrosage avant de lancer le secours en aperçu.';
      return;
    }
    backupFeedback.textContent = '';
    preview.checked = true;
    if (previewActivity === 'backup' && backupBasin) {
      backupBasin = 0;
      previewBackupReason = 'stopped';
    } else {
      backupBasin = previewLevels[selectedBasin - 1] > minimumLevel ? selectedBasin : 0;
      previewBackupReason = backupBasin ? 'started' : 'level_too_low';
      backupLast = performance.now();
      previewActivity = 'backup';
    }
    render();
  });
  backupLeakButton.addEventListener('click', () => {
    if (isOnline() && !preview.checked) {
      sendCommand(state.backupLeak ? 'clear_backup_leak' : 'enable_backup_leak');
      return;
    }
    render();
    preview.checked = true;
    previewLeak = !previewLeak;
    render();
  });
  for (const button of basinButtons) {
    button.addEventListener('click', () => {
      selectedBasin = Number(button.dataset.basin);
      if (!pending) feedback.textContent = '';
      render();
    });
  }
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const mode = irrigationActions[button.dataset.action];
      if (preview.checked && mode) {
        render();
        previewMode = mode;
        render();
        return;
      }
      if (preview.checked && button.dataset.action === 'set_manual') {
        previewActivity = 'sensor';
        render();
        return;
      }
      if (button.disabled || !isOnline() || pending) return;
      sendCommand(button.dataset.action);
    });
  }
  function sendCommand(action) {
    if (!isOnline() || pending) return;
    const id = `${client.options.clientId}-${++commandNumber}`;
    const output = action.includes('backup') ? backupFeedback : feedback;
    pending = { id, output, timeout: setTimeout(() => finishCommand('Aucune confirmation de l’ESP32.'), 5000) };
    output.textContent = 'En attente de confirmation…';
    render();
    client.publish(`${prefix}/command`, JSON.stringify({ v: 1, id, action, basinId: selectedBasin }),
      { qos: 0, retain: false }, error => {
        if (error && pending?.id === id) finishCommand('Impossible d’envoyer la commande.');
      });
  }
  render();
  setInterval(render, 500);
  return {
    collectWeatherRain(rain) {
      if (!preview.checked && isOnline()) return 'Active le mode Aperçu pour essayer la collecte.';
      return startPreviewRain(rain / 2, true);
    },
    updateWeatherRain(rain) {
      if (!preview.checked || !weatherCollection || previewActivity !== 'rain'
          || performance.now() >= previewRainUntil) return;
      render();
      previewRainRate = rain / 2;
      if (rain === 0) {
        previewRainUntil = previewRainLast;
        render();
      }
    },
  };
}
