import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { stationLines, stationProfiles } from './src/valves.ts'

const bundledKizuna = new URL('./kizuna-prototype/src/', import.meta.url)
const kizunaSource = existsSync(new URL('scene.js', bundledKizuna))
  ? bundledKizuna
  : new URL('../kizuna-prototype/src/', import.meta.url)

const reserveFields = ['stock', 'usable', 'days', 'fuel', 'hours', 'kwh', 'pumpable', 'unmeasured']
const nonnegative = value => Number.isFinite(value) && value >= 0
const percent = value => nonnegative(value) && value <= 100
const stationPrompt = 'Choisis un profil pour une station hydraulique simulée. Réponds par un objet JSON contenant uniquement "profile", parmi ' + Object.keys(stationProfiles).join(', ') + '. balanced : aucun changement aux règles locales. conserve : réduire le transfert et suspendre l’arrosage. transfer : privilégier le réservoir annexe. irrigate : privilégier l’arrosage. pause : suspendre le transfert et l’arrosage. L’arrivée et la protection contre le débordement restent gérées localement. Prends en compte la météo, les niveaux, la pression, les incidents et les diagnostics, et ne demande aucune ouverture directe.'
const reservePrompt = 'Sélectionne les deux indications existantes les plus pertinentes pour les cartes FAS9IA. Réponds uniquement par un objet JSON avec water ("coverage", "consumption" ou "reserve") et power ("fuel", "load" ou "pump"). water : coverage = des citernes sans relevé, consumption = projection de consommation à expliquer, reserve = stock à conserver déduit. power : fuel = données carburant manquantes, load = kWh et charge, pump = eau pompable. Les valeurs numériques sont calculées par le projet, ne les modifie pas.'
const pilotPrompt = 'Tu pilotes le secours dans la simulation de Borj Râs. Choisis un bassin disponible parmi sources et un objectif normal (100 % de la demande) ou economy (80 % si le stock, la météo ou la puissance invitent à conserver de l’eau). Prépare la coupure SONEDE prévue à midi. Les protections locales bloquent le transfert si la météo, la fuite ou la température l’interdisent. Réponds uniquement par JSON avec basin (identifiant numérique ou 0 si aucun bassin) et profile (normal ou economy).'

function pilotSnapshot(value) {
  if (!['sun', 'clouds', 'rain', 'night'].includes(value.weather) || !nonnegative(value.solarW) || !nonnegative(value.generatorW)
    || !Number.isFinite(value.waterC) || !Number.isFinite(value.backupMotorC)
    || typeof value.leak !== 'boolean' || typeof value.outageScheduled !== 'boolean'
    || !Array.isArray(value.sources) || value.sources.length > 3
    || !value.sources.every(source => [1, 2, 3].includes(source?.id) && nonnegative(source.volume))
    || !nonnegative(value.demand)) return null
  const { weather, solarW, generatorW, waterC, backupMotorC, leak, outageScheduled, sources, demand } = value
  return { weather, solarW, generatorW, waterC, backupMotorC, leak, outageScheduled, sources: sources.map(({ id, volume }) => ({ id, volume })), demand }
}

function stationSnapshot(value) {
  if (!percent(value.centralPercent) || !percent(value.annexPercent)
    || !['sunny', 'cloudy', 'rain'].includes(value.weather) || !['Unknown', 'Normal', 'Low pressure'].includes(value.supply)
    || typeof value.verified !== 'boolean' || typeof value.wateringTest !== 'boolean'
    || !Array.isArray(value.pressures) || value.pressures.length > 10 || !value.pressures.every(p => p === null || nonnegative(p))
    || !Array.isArray(value.incidents) || value.incidents.length > 5 || !value.incidents.every(incident => ['Open', 'Under review', 'Monitoring'].includes(incident?.status) && ['Low', 'Moderate', 'Critical'].includes(incident?.severity))
    || !Array.isArray(value.tests) || value.tests.length > 3 || !value.tests.every(test => ['sensor', 'leak', 'watering'].includes(test?.test) && ['blocked', 'done', 'warning'].includes(test?.outcome))
    || !stationLines.every(line => percent(value.openings?.[line.id]))) return null

  return {
    centralPercent: value.centralPercent, annexPercent: value.annexPercent, weather: value.weather, supply: value.supply,
    verified: value.verified, pressures: value.pressures, wateringTest: value.wateringTest,
    incidents: value.incidents.map(({ status, severity }) => ({ status, severity })),
    tests: value.tests.map(({ test, outcome }) => ({ test, outcome })),
    openings: Object.fromEntries(stationLines.map(({ id }) => [id, value.openings[id]])),
  }
}

function groqAssistance(env) {
  const busy = new Set()
  function attach(server) {
    const base = server.config.base.replace(/\/$/, '')
    server.middlewares.use(async (request, response, next) => {
      const path = request.url?.split('?')[0]
      const station = path === base + '/api/station-advice'
      const pilot = path === base + '/api/kizuna-pilot'
      if (!station && !pilot && path !== base + '/api/reserve-insight') return next()
      function send(status, payload) {
        response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        response.end(status === 204 ? undefined : JSON.stringify(payload))
      }
      if (request.method !== 'POST') return send(405)
      const host = request.headers.host
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)
        || !host || !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
        || request.headers.origin !== 'http://' + host) return send(403)
      if (!env.GROQ_API_KEY || busy.has(path)) return send(204)
      if (request.headers['content-type']?.split(';')[0] !== 'application/json') return send(415)

      busy.add(path)
      const controller = new AbortController()
      response.once('close', () => controller.abort())
      try {
        const chunks = []
        let bytes = 0
        for await (const chunk of request) {
          bytes += chunk.length
          if (bytes > 4096) return send(413)
          chunks.push(chunk)
        }
        let values
        try {
          values = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
          return send(400)
        }
        if (!values || typeof values !== 'object') return send(400)
        const summary = pilot ? pilotSnapshot(values) : station ? stationSnapshot(values) : reserveFields.every(key => values[key] === null || nonnegative(values[key]))
          ? Object.fromEntries(reserveFields.map(key => [key, values[key]])) : null
        if (summary === null) return send(400)
        const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
          headers: { Authorization: 'Bearer ' + env.GROQ_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: env.GROQ_MODEL || 'openai/gpt-oss-20b',
            max_completion_tokens: 400,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: pilot ? pilotPrompt : station ? stationPrompt : reservePrompt },
              { role: 'user', content: JSON.stringify(summary) },
            ],
          }),
        })
        if (!upstream.ok) return send(204)
        const result = await upstream.json()
        const message = result.choices?.[0]?.message?.content
        const hints = JSON.parse(message)
        if (pilot) {
          if (!['normal', 'economy'].includes(hints?.profile)
            || !(summary.sources.length === 0 ? hints.basin === 0 : summary.sources.some(source => source.id === hints.basin))) return send(204)
          return send(200, { basin: hints.basin, profile: hints.profile })
        }
        if (station) {
          if (typeof hints?.profile !== 'string' || !Object.hasOwn(stationProfiles, hints.profile)) return send(204)
          return send(200, { profile: hints.profile })
        }
        if (!['coverage', 'consumption', 'reserve'].includes(hints?.water) || !['fuel', 'load', 'pump'].includes(hints?.power)) return send(204)
        return send(200, { water: hints.water, power: hints.power })
      } catch {
        if (!response.destroyed) return send(204)
      } finally {
        busy.delete(path)
      }
    })
  }
  return { name: 'groq-assistance', configureServer: attach, configurePreviewServer: attach }
}

export default defineConfig(({ mode }) => ({
  plugins: [groqAssistance(loadEnv(mode, process.cwd(), 'GROQ_'))],
  resolve: { dedupe: ['three'], alias: { '@kizuna-scene': fileURLToPath(new URL('scene.js', kizunaSource)) } },
  server: { fs: { allow: [
    fileURLToPath(new URL('.', import.meta.url)),
    fileURLToPath(kizunaSource),
  ] } },
  build: { rollupOptions: { input: {
    dashboard: fileURLToPath(new URL('./index.html', import.meta.url)),
    kizuna: fileURLToPath(new URL('./kizuna/index.html', import.meta.url)),
  } } },
}))
