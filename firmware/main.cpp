#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include "config.h"

namespace {
constexpr int TurbidityPin = 34;
constexpr int TemperaturePin = 35;
constexpr int SoilMoisturePin = 36;
constexpr int BackupPumpPin = 14;
constexpr float BackupRate = 2.0f;
constexpr float BackupLeakRate = 3.5f;
constexpr int SolarNominalWatts = 450;
constexpr int PumpNominalWatts = 120;
constexpr float FullDistance = 10.0f;
constexpr float EmptyDistance = 70.0f;
constexpr float MinimumLevel = 20.0f;
constexpr float InitialLevel = 35.0f;
constexpr float RainRate = 4.0f;
constexpr float PumpRate = 3.0f;
constexpr float SprinklerRate = 4.5f;
constexpr int CleaningThreshold = 70;
constexpr unsigned long RainDuration = 12000;
constexpr unsigned long WaitBeforeOutage = 3000;
constexpr unsigned long SampleInterval = 250;

enum class Phase { Ready, Rain, AfterRain, Outage, Watering, Complete };
struct Basin {
  Basin(int triggerPin, int echoPin, int pumpPin)
    : triggerPin(triggerPin), echoPin(echoPin), pumpPin(pumpPin) {}

  int triggerPin, echoPin, pumpPin;
  Phase phase = Phase::Ready;
  bool automatic = false;
  bool pumpOn = false;
  bool sprinkler = false;
  bool inspection = false;
  bool sensorValid = false;
  float distanceCm = 0;
  float levelPct = 0;
  const char *pumpReason = "initial";
  unsigned long phaseSince = 0;
  unsigned long lastSample = 0;
};
Basin basins[] = {{18, 19, 23}, {25, 26, 27}, {32, 33, 13}};
constexpr int BasinCount = sizeof(basins) / sizeof(basins[0]);
WiFiClient wifi;
PubSubClient mqtt(wifi);
String stateTopic, commandTopic, ackTopic, availabilityTopic, clientId;
int turbidityPct = 0;
int soilMoisturePct = 0;
float temperatureC = NAN;
unsigned long lastPublish = 0;
unsigned long lastConnect = 0;
unsigned long lastWifiRetry = 0;
bool wifiReady = false;
bool stateChanged = true;
int backupBasin = 0;
bool backupLeak = false;
const char *backupReason = "initial";
unsigned long backupSample = 0;

float rounded(float value) {
  return roundf(value * 10.0f) / 10.0f;
}

const char *phaseName(const Basin &basin) {
  if (!basin.automatic) return "manual";
  switch (basin.phase) {
    case Phase::Ready: return "ready";
    case Phase::Rain: return "rain";
    case Phase::AfterRain: return "after_rain";
    case Phase::Outage: return "outage";
    case Phase::Watering: return "watering";
    case Phase::Complete: return "complete";
  }
  return "ready";
}

void setPhase(Basin &basin, Phase next, unsigned long now) {
  basin.phase = next;
  basin.phaseSince = now;
  stateChanged = true;
}

void setPump(Basin &basin, bool on, const char *reason) {
  basin.pumpOn = on;
  basin.pumpReason = reason;
  digitalWrite(basin.pumpPin, on ? HIGH : LOW);
  stateChanged = true;
}

void readSensors(Basin &basin) {
  digitalWrite(basin.triggerPin, LOW);
  delayMicroseconds(2);
  digitalWrite(basin.triggerPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(basin.triggerPin, LOW);
  const auto pulse = pulseIn(basin.echoPin, HIGH, 30000);
  basin.sensorValid = pulse != 0;
  basin.distanceCm = rounded(static_cast<float>(pulse) / 58.0f);

  if (!basin.automatic && basin.sensorValid) {
    basin.levelPct = rounded(constrain(100.0f * (EmptyDistance - basin.distanceCm) /
                                 (EmptyDistance - FullDistance), 0.0f, 100.0f));
  }
}

bool levelValid(const Basin &basin) {
  return basin.automatic || basin.sensorValid;
}

const char *pumpBlock(const Basin &basin) {
  if (!levelValid(basin)) return "sensor_unavailable";
  if (basin.levelPct <= MinimumLevel) return "level_too_low";
  return nullptr;
}

void drain(Basin &basin, float seconds) {
  const float flowRate = basin.sprinkler ? SprinklerRate : PumpRate;
  basin.levelPct = max(MinimumLevel, basin.levelPct - flowRate * seconds);
}

void stopBackup(const char *reason) {
  backupBasin = 0;
  backupReason = reason;
  digitalWrite(BackupPumpPin, LOW);
  stateChanged = true;
}

void updateBackup(unsigned long now) {
  if (!backupBasin) return;
  auto &source = basins[backupBasin - 1];
  const float rate = backupLeak ? BackupLeakRate : BackupRate;
  source.levelPct = max(MinimumLevel, source.levelPct - rate * (now - backupSample) / 1000.0f);
  backupSample = now;
  if (source.levelPct <= MinimumLevel) stopBackup("level_too_low");
}

void sample(Basin &basin, unsigned long now) {
  const float seconds = (now - basin.lastSample) / 1000.0f;
  readSensors(basin);
  if (basin.automatic) {
    if (basin.phase == Phase::Rain) {
      const float rainSeconds = min(seconds, (RainDuration - (basin.lastSample - basin.phaseSince)) / 1000.0f);
      basin.levelPct = min(100.0f, basin.levelPct + RainRate * rainSeconds);
      if (now - basin.phaseSince >= RainDuration) setPhase(basin, Phase::AfterRain, now);
    } else if (basin.phase == Phase::AfterRain && now - basin.phaseSince >= WaitBeforeOutage) {
      setPhase(basin, Phase::Outage, now);
    } else if (basin.phase == Phase::Watering && basin.pumpOn) {
      drain(basin, seconds);
    }
  }
  if (basin.pumpOn) {
    if (const char *reason = pumpBlock(basin)) {
      setPump(basin, false, reason);
      if (basin.automatic) setPhase(basin, Phase::Complete, now);
    }
  }
  basin.lastSample = now;
}

void writeBasin(JsonObject state, const Basin &basin) {
  state["mode"] = basin.automatic ? "auto" : "manual";
  state["phase"] = phaseName(basin);
  if (levelValid(basin)) state["levelPct"] = rounded(basin.levelPct);
  else state["levelPct"] = nullptr;
  if (basin.sensorValid) state["distanceCm"] = rounded(basin.distanceCm);
  else state["distanceCm"] = nullptr;
  state["minLevelPct"] = MinimumLevel;
  state["pumpOn"] = basin.pumpOn;
  state["irrigationMode"] = basin.sprinkler ? "sprinkler" : "drip";
  state["pumpReason"] = basin.pumpReason;
  state["rainOn"] = basin.automatic && basin.phase == Phase::Rain;
  state["networkOutage"] = basin.automatic &&
    (basin.phase == Phase::Outage || basin.phase == Phase::Watering || basin.phase == Phase::Complete);
  state["masonryInspection"] = basin.inspection;
}

void readCommonSensors() {
  turbidityPct = (analogRead(TurbidityPin) * 100 + 2047) / 4095;
  soilMoisturePct = (analogRead(SoilMoisturePin) * 100 + 2047) / 4095;
  const int reading = analogRead(TemperaturePin);
  temperatureC = NAN;
  if (reading > 0 && reading < 4095) {
    constexpr float Beta = 3950.0f;
    temperatureC = rounded(1.0f / (logf(1.0f / (4095.0f / reading - 1.0f)) / Beta
                                      + 1.0f / 298.15f) - 273.15f);
  }
}

void publishState() {
  JsonDocument state;
  JsonObject root = state.to<JsonObject>();
  root["v"] = 1;
  writeBasin(root, basins[0]);
  state["turbidityPct"] = turbidityPct;
  state["cleaningCheck"] = turbidityPct >= CleaningThreshold;
  state["soilMoisturePct"] = soilMoisturePct;
  root["solarNominalW"] = SolarNominalWatts;
  root["backupBasin"] = backupBasin;
  root["backupLeak"] = backupLeak;
  root["backupReason"] = backupReason;
  int pumpLoad = backupBasin ? PumpNominalWatts : 0;
  for (const auto &basin : basins) {
    if (basin.pumpOn) pumpLoad += PumpNominalWatts;
  }
  root["pumpLoadW"] = pumpLoad;
  if (isfinite(temperatureC)) state["temperatureC"] = temperatureC;
  else state["temperatureC"] = nullptr;
  JsonArray readings = state["basins"].to<JsonArray>();
  for (int index = 0; index < BasinCount; ++index) {
    JsonObject reading = readings.add<JsonObject>();
    reading["id"] = index + 1;
    writeBasin(reading, basins[index]);
  }
  char payload[1536];
  const size_t expected = measureJson(state);
  if (expected >= sizeof(payload) || serializeJson(state, payload, sizeof(payload)) != expected) {
    Serial.println("[Capteurs] Le message de mesures dépasse le tampon.");
    stateChanged = false;
    lastPublish = millis();
    return;
  }
  Serial.println(payload);
  if (mqtt.connected() && !mqtt.publish(stateTopic.c_str(), payload, true)) {
    Serial.println("[MQTT] Envoi des mesures échoué. Reconnexion au prochain essai.");
    wifi.stop();
  }
  stateChanged = false;
  lastPublish = millis();
}

const char *applyCommand(Basin &basin, const char *action, unsigned long now) {
  const int basinId = &basin - basins + 1;
  if (strcmp(action, "start_backup") == 0) {
    if (backupBasin) return backupBasin == basinId ? nullptr : "backup_already_running";
    if (basin.pumpOn) return "source_irrigating";
    if (basin.automatic && (basin.phase == Phase::Rain || basin.phase == Phase::AfterRain)) return "rain_in_progress";
    if (!basin.automatic) readSensors(basin);
    if (const char *reason = pumpBlock(basin)) return reason;
    basin.automatic = true;
    setPhase(basin, Phase::Outage, now);
    basin.lastSample = now;
    backupSample = now;
    backupBasin = basinId;
    backupReason = "started";
    digitalWrite(BackupPumpPin, HIGH);
    return nullptr;
  }
  if (strcmp(action, "stop_backup") == 0) {
    updateBackup(now);
    if (backupBasin) stopBackup("stopped");
    return nullptr;
  }
  if (strcmp(action, "enable_backup_leak") == 0 || strcmp(action, "clear_backup_leak") == 0) {
    updateBackup(now);
    backupLeak = strcmp(action, "enable_backup_leak") == 0;
    return nullptr;
  }
  // Account for elapsed time in the previous mode before changing its flow rate.
  if (strcmp(action, "set_drip") == 0 || strcmp(action, "set_sprinkler") == 0) {
    if (basin.phase == Phase::Watering && basin.pumpOn) {
      drain(basin, (now - basin.lastSample) / 1000.0f);
      basin.lastSample = now;
      if (const char *reason = pumpBlock(basin)) {
        setPump(basin, false, reason);
        setPhase(basin, Phase::Complete, now);
      }
    }
    basin.sprinkler = strcmp(action, "set_sprinkler") == 0;
    return nullptr;
  }
  if (strcmp(action, "reset") == 0 || strcmp(action, "set_manual") == 0) {
    if (backupBasin == basinId) return "backup_already_running";
    if (basin.phase == Phase::Rain && basin.automatic) return "rain_in_progress";
    basin.automatic = strcmp(action, "reset") == 0;
    setPump(basin, false, "reset");
    setPhase(basin, Phase::Ready, now);
    basin.levelPct = InitialLevel;
    readSensors(basin);
    basin.lastSample = now;
  } else if (strcmp(action, "start_rain") == 0) {
    if (backupBasin) return "stop_pumps_before_rain";
    for (const auto &target : basins) {
      if (target.pumpOn) return "stop_pumps_before_rain";
      if (target.automatic && target.phase == Phase::Rain) return "rain_in_progress";
    }
    for (auto &target : basins) {
      if (!levelValid(target)) target.levelPct = InitialLevel;
      target.automatic = true;
      setPhase(target, Phase::Rain, now);
      target.lastSample = now;
    }
  } else if (strcmp(action, "start_pump") == 0) {
    if (backupBasin == basinId) return "backup_already_running";
    if (basin.pumpOn) return nullptr;
    if (!basin.automatic) readSensors(basin);
    if (const char *reason = pumpBlock(basin)) return reason;
    if (basin.automatic && basin.phase != Phase::Outage) return "awaiting_outage";
    basin.automatic = true;
    setPhase(basin, Phase::Watering, now);
    basin.lastSample = now;
    setPump(basin, true, "started");
  } else if (strcmp(action, "stop_pump") == 0) {
    if (basin.pumpOn && basin.phase == Phase::Watering) {
      sample(basin, now);
      if (!basin.pumpOn) return nullptr;
    }
    if (basin.automatic && basin.phase == Phase::Watering) setPhase(basin, Phase::Outage, now);
    setPump(basin, false, "stopped");
  } else if (strcmp(action, "request_masonry_inspection") == 0) {
    basin.inspection = true;
  } else if (strcmp(action, "clear_masonry_inspection") == 0) {
    basin.inspection = false;
  } else {
    return "unknown_action";
  }
  return nullptr;
}

void onCommand(char *topic, byte *payload, unsigned int length) {
  if (commandTopic != topic) return;
  JsonDocument command;
  if (deserializeJson(command, payload, length) || !command.is<JsonObject>()) return;
  const char *id = command["id"] | "";
  if (!id[0] || strlen(id) > 64 ||
      strspn(id, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-") != strlen(id)) return;
  const char *action = command["action"] | "";
  const JsonVariantConst target = command["basinId"];
  const int basinId = command["basinId"].isUnbound() ? 1 : (target.is<int>() ? target.as<int>() : 0);
  const bool validBasin = basinId >= 1 && basinId <= BasinCount;
  const char *reason = "unsupported_version";
  if (command["v"] == 1) {
    reason = validBasin ? applyCommand(basins[basinId - 1], action, millis()) : "invalid_basin";
  }
  publishState();

  JsonDocument ack;
  ack["v"] = 1;
  ack["id"] = id;
  ack["action"] = strlen(action) <= 40 ? action : "";
  ack["ok"] = reason == nullptr;
  ack["reason"] = reason ? reason : "accepted";
  ack["basinId"] = basinId;
  ack["backupBasin"] = backupBasin;
  ack["backupLeak"] = backupLeak;
  if (validBasin) ack["pumpOn"] = basins[basinId - 1].pumpOn;
  else ack["pumpOn"] = nullptr;
  if (validBasin) ack["irrigationMode"] = basins[basinId - 1].sprinkler ? "sprinkler" : "drip";
  char response[384];
  serializeJson(ack, response, sizeof(response));
  mqtt.publish(ackTopic.c_str(), response);
}

void serviceMqtt(unsigned long now) {
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiReady) {
      Serial.println("[Wi-Fi] Connexion perdue.");
      wifi.stop();
      wifiReady = false;
    }
    if (now - lastWifiRetry >= 12000) {
      lastWifiRetry = now;
      Serial.println("[Wi-Fi] Nouvelle tentative sur Wokwi-GUEST.");
      WiFi.reconnect();
    }
    return;
  }
  if (!wifiReady) {
    wifiReady = true;
    Serial.printf("[Wi-Fi] Connecté. MQTT : %s:%u\n", BrokerHost, static_cast<unsigned>(BrokerPort));
  }
  if (mqtt.connected()) {
    mqtt.loop();
    return;
  }
  if (now - lastConnect < 5000) return;
  lastConnect = now;
  if (!mqtt.connect(clientId.c_str(), availabilityTopic.c_str(), 0, true, "offline")) {
    Serial.printf("Connexion MQTT échouée (%d)\n", mqtt.state());
    return;
  }
  if (!mqtt.subscribe(commandTopic.c_str())) {
    Serial.println("[MQTT] Abonnement aux commandes échoué.");
    mqtt.disconnect();
    return;
  }
  publishState();
  if (mqtt.connected()) {
    mqtt.publish(availabilityTopic.c_str(), "online", true);
    Serial.printf("[MQTT] Mesures actives sur %s\n", stateTopic.c_str());
  }
}
}

void setup() {
  Serial.begin(115200);
  Serial.println("[KIZUNA] Démarrage des trois capteurs HC-SR04 et des entrées analogiques.");
  analogReadResolution(12);
  pinMode(BackupPumpPin, OUTPUT);
  digitalWrite(BackupPumpPin, LOW);
  for (auto &basin : basins) {
    pinMode(basin.triggerPin, OUTPUT);
    pinMode(basin.echoPin, INPUT);
    pinMode(basin.pumpPin, OUTPUT);
    digitalWrite(basin.pumpPin, LOW);
    readSensors(basin);
  }
  readCommonSensors();

  stateTopic = String(TopicPrefix) + "/state";
  commandTopic = String(TopicPrefix) + "/command";
  ackTopic = String(TopicPrefix) + "/ack";
  availabilityTopic = String(TopicPrefix) + "/availability";
  clientId = String("kizuna-") + String(static_cast<uint32_t>(ESP.getEfuseMac()), HEX)
    + "-" + String(esp_random(), HEX);
  mqtt.setServer(BrokerHost, BrokerPort);
  mqtt.setBufferSize(1792);
  mqtt.setSocketTimeout(2);
  mqtt.setKeepAlive(10);
  mqtt.setCallback(onCommand);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin("Wokwi-GUEST", "", 6);
  publishState();
  for (auto &basin : basins) basin.lastSample = millis();
}

void loop() {
  const auto now = millis();
  if (backupBasin && now - backupSample >= 100) updateBackup(now);
  // Trigger only one sonar at a time. The three measurements are staggered.
  static int nextBasin = 0;
  static unsigned long lastSonar = 0;
  if (now - lastSonar >= SampleInterval / BasinCount) {
    sample(basins[nextBasin], now);
    lastSonar = now;
    nextBasin = (nextBasin + 1) % BasinCount;
  }
  if (stateChanged || now - lastPublish >= 1000) readCommonSensors();
  if (stateChanged || now - lastPublish >= 1000) publishState();
  serviceMqtt(now);
  delay(5);
}
