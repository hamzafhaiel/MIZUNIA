const lengthM = 100;
const diameterM = 0.04;
const frictionFactor = 0.025;
const waterDensity = 1000;
const inletBar = 3;
const outletLitresPerSecond = 1.2;
const alertThresholdBar = 0.12;

function frictionLossBar(distanceM, litresPerSecond) {
  const area = Math.PI * diameterM ** 2 / 4;
  const velocity = litresPerSecond / 1000 / area;
  return frictionFactor * distanceM / diameterM * waterDensity * velocity ** 2 / 2 / 100000;
}

export function calculatePressure(withLeak) {
  const leakLitresPerSecond = withLeak ? 0.9 : 0;
  const expectedDropBar = frictionLossBar(lengthM, outletLitresPerSecond);
  const measuredDropBar = frictionLossBar(lengthM / 2, outletLitresPerSecond + leakLitresPerSecond)
    + frictionLossBar(lengthM / 2, outletLitresPerSecond);
  const excessDropBar = measuredDropBar - expectedDropBar;
  return {
    inletBar,
    outletBar: inletBar - measuredDropBar,
    measuredDropBar,
    expectedDropBar,
    excessDropBar,
    alertThresholdBar,
    suspectedLeak: excessDropBar > alertThresholdBar,
  };
}

export function bindPressureTest(onChange) {
  const buttons = [...document.querySelectorAll('[data-pressure-scenario]')];
  const stop = document.querySelector('#pressure-stop');
  const readings = document.querySelector('#pressure-readings');
  const format = new Intl.NumberFormat('fr', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let scenario = null;
  let supplyBasin = 0;
  let supplyLeak = false;

  function render() {
    const running = Boolean(supplyBasin) || scenario !== null;
    const leaking = supplyBasin ? supplyLeak : scenario === 'leak';
    const result = calculatePressure(leaking);
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.pressureScenario === scenario));
      button.disabled = Boolean(supplyBasin);
    }
    stop.hidden = Boolean(supplyBasin);
    readings.hidden = !running;
    if (running) {
      readings.querySelector('#pressure-context').textContent = supplyBasin
        ? `Pompage depuis la citerne ${supplyBasin} · pression simulée`
        : 'Test indépendant · pression simulée';
      for (const output of readings.querySelectorAll('[data-pressure]')) {
        output.textContent = `${format.format(result[output.dataset.pressure])} bar`;
      }
      readings.querySelector('#expected-loss').value = result.expectedDropBar;
      readings.querySelector('#measured-loss').value = result.measuredDropBar;
      readings.dataset.alert = String(result.suspectedLeak);
      const verdict = readings.querySelector('#pressure-verdict');
      verdict.dataset.alert = String(result.suspectedLeak);
      verdict.querySelector('strong').textContent = result.suspectedLeak ? 'Fuite suspectée' : 'Pression normale';
      verdict.querySelector('span').textContent = result.suspectedLeak
        ? `${format.format(result.excessDropBar)} bar de perte supplémentaire sur 100 m.`
        : 'Aucune perte supplémentaire détectée sur 100 m.';
    }
    onChange({ running, leaking, duringSupply: Boolean(supplyBasin) });
  }

  for (const button of buttons) {
    button.addEventListener('click', () => { scenario = button.dataset.pressureScenario; render(); });
  }
  stop.addEventListener('click', () => { scenario = null; render(); });
  render();
  return (basin, leak) => {
    if (basin === supplyBasin && leak === supplyLeak) return;
    supplyBasin = basin;
    supplyLeak = leak;
    if (supplyBasin) scenario = null;
    render();
  };
}
