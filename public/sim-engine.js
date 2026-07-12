// sim-engine.js — gestor de estado, tick y mutadores. Depende de sim-data.js.
// Cargado por index.html y simulator.html, después de sim-data.js.
window.AquaSim = window.AquaSim || {};

(function () {
  var state = migrate(loadState()) || AquaSim.createDefaultState();
  var listeners = [];
  var channel =
    "BroadcastChannel" in window
      ? new BroadcastChannel(AquaSim.CHANNEL_NAME)
      : null;
  var tickTimer = null;

  function loadState() {
    try {
      var raw = localStorage.getItem(AquaSim.STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  // Rellena campos agregados en versiones posteriores (p.ej. `quality`) sobre
  // estado persistido de una sesión anterior, para no romper con localStorage viejo.
  function migrate(loaded) {
    if (!loaded) return loaded;
    if (!loaded.quality) loaded.quality = AquaSim.createDefaultState().quality;
    return loaded;
  }

  function persist() {
    state.updatedAt = Date.now();
    try {
      localStorage.setItem(AquaSim.STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function notifyLocal(reason) {
    listeners.forEach(function (fn) {
      fn(state, reason);
    });
  }

  function broadcast(message) {
    if (channel) channel.postMessage(message);
  }

  function commit(reason) {
    persist();
    notifyLocal(reason);
    broadcast({
      type: "state-changed",
      reason: reason,
      updatedAt: state.updatedAt,
    });
  }

  // ---- lectura (ambas páginas) ----
  AquaSim.getState = function () {
    return state;
  };
  AquaSim.onChange = function (fn) {
    listeners.push(fn);
  };

  // ---- mutadores (solo simulator.js) ----
  AquaSim.triggerLeak = function (pipeId, severity) {
    var pipe = state.pipes.find(function (p) {
      return p.id === pipeId;
    });
    if (!pipe || pipe.status === "broken") return;
    pipe.status = severity === "broken" ? "broken" : "leak";
    affectDownstreamSensors(pipe, severity);
    resolveAlertsFor({ pipeId: pipeId }); // reemplaza la alerta previa de esta cañería (p.ej. al escalar fuga -> rotura)
    var toSensor = sensorById(pipe.to);
    pushAlert({
      level: severity === "broken" ? "CRÍTICA" : "ADVERTENCIA",
      pipeId: pipe.id,
      sensorId: pipe.to,
      type: severity === "broken" ? "▨ Rotura de Cañería" : "▨ Fuga Detectada",
      place: toSensor ? toSensor.place : pipe.to,
    });
    commit("leak");
  };

  AquaSim.resolveLeak = function (pipeId) {
    var pipe = state.pipes.find(function (p) {
      return p.id === pipeId;
    });
    if (!pipe || pipe.status === "ok") return;
    pipe.status = "ok";
    restoreDownstreamSensors(pipe);
    resolveAlertsFor({ pipeId: pipeId });
    commit("resolve-leak");
  };

  AquaSim.setSensorOffline = function (sensorId, offline) {
    var s = state.sensors.find(function (s) {
      return s.id === sensorId;
    });
    if (!s) return;
    s.status = offline ? "offline" : "healthy";
    if (offline) {
      s.flow = 0;
      pushAlert({
        level: "ADVERTENCIA",
        sensorId: s.id,
        type: "⚠ Sensor Fuera de Línea",
        place: s.place,
      });
    } else {
      resolveAlertsFor({ sensorId: sensorId, type: "⚠ Sensor Fuera de Línea" });
    }
    commit("sensor-offline");
  };

  AquaSim.dropPressure = function (sectorId, amount) {
    state.sensors
      .filter(function (s) {
        return s.sectorId === sectorId;
      })
      .forEach(function (s) {
        s.pressure = Math.max(0.2, s.pressure - (amount || 1.5));
        s.status = "warning";
      });
    pushAlert({
      level: "ADVERTENCIA",
      type: "♟ Caída de Presión",
      place: sectorName(sectorId),
      sensorId: nearestSensorId(sectorId),
    });
    commit("pressure-drop");
  };

  AquaSim.triggerContamination = function (sectorId) {
    var s =
      state.sensors.find(function (s) {
        return s.sectorId === sectorId && s.type === "quality";
      }) ||
      state.sensors.find(function (s) {
        return s.sectorId === sectorId;
      });
    if (!s) return;
    s.status = "danger";
    if (s.quality != null) s.quality = +(62 + Math.random() * 10).toFixed(1);
    pushAlert({
      level: "CRÍTICA",
      sensorId: s.id,
      type: "☣ Posible Contaminación",
      place: s.place,
    });
    commit("contamination");
  };

  AquaSim.setDemand = function (factor) {
    state.demandFactor = factor;
    commit("demand");
  };

  // ---- edición de topología (agregar sensores/cañerías desde el editor visual) ----
  AquaSim.addSensor = function (def) {
    state.sensors.push({
      id: def.id,
      sectorId: def.sectorId,
      place: def.place,
      type: def.type,
      status: "healthy",
      flow: def.baseFlow,
      pressure: def.basePressure,
      battery: def.baseBattery,
      quality: def.type === "quality" ? 98.4 : null,
    });
    commit("topology");
  };

  AquaSim.addPipe = function (def) {
    state.pipes.push(Object.assign({ status: "ok" }, def));
    commit("topology");
  };

  // Reconcilia state.sensors/pipes con la topología definida en sim-data.js
  // (sensorDefs/pipes). Preserva los valores en vivo de los que ya existían y
  // descarta sensores/cañerías "fantasma" de estado persistido de sesiones viejas
  // que ya no están en sim-data.js. La llama el simulador al arrancar.
  AquaSim.resyncTopology = function () {
    var prevSensors = {};
    state.sensors.forEach(function (s) {
      prevSensors[s.id] = s;
    });
    state.sensors = AquaSim.sensorDefs.map(function (d) {
      var prev = prevSensors[d.id];
      if (prev) return prev;
      return {
        id: d.id,
        sectorId: d.sectorId,
        place: d.place,
        type: d.type,
        status: "healthy",
        flow: d.baseFlow,
        pressure: d.basePressure,
        battery: d.baseBattery,
        quality: d.type === "quality" ? 98.4 : null,
      };
    });
    var prevPipes = {};
    state.pipes.forEach(function (p) {
      prevPipes[p.id] = p;
    });
    state.pipes = AquaSim.pipes.map(function (def) {
      var prev = prevPipes[def.id];
      return prev
        ? Object.assign(prev, {
            from: def.from,
            to: def.to,
            diameter: def.diameter,
          })
        : Object.assign({ status: "ok" }, def);
    });
    // Descarta alertas que apunten a sensores/cañerías que ya no existen.
    var validSensorIds = {},
      validPipeIds = {};
    state.sensors.forEach(function (s) {
      validSensorIds[s.id] = true;
    });
    state.pipes.forEach(function (p) {
      validPipeIds[p.id] = true;
    });
    state.alerts = state.alerts.filter(function (a) {
      if (a.sensorId && !validSensorIds[a.sensorId]) return false;
      if (a.pipeId && !validPipeIds[a.pipeId]) return false;
      return true;
    });
    commit("resync");
  };

  // ---- calidad de agua ----
  AquaSim.setComponentLevel = function (componentId, level) {
    var c = state.quality.components.find(function (c) {
      return c.id === componentId;
    });
    var def = AquaSim.qualityComponents.find(function (d) {
      return d.id === componentId;
    });
    if (!c || !def) return;
    c.level = Math.max(0, +level.toFixed(def.decimals));
    pushTrend(c);
    var wasSafe = c.level <= def.limit;
    if (!wasSafe) {
      pushAlert({
        level: "CRÍTICA",
        type: "☣ " + def.name + " fuera de rango",
        place: "Laboratorios · Control de Calidad",
      });
    }
    commit("quality-level");
  };

  AquaSim.simulateContaminationSpike = function (componentId) {
    var def = AquaSim.qualityComponents.find(function (d) {
      return d.id === componentId;
    });
    if (!def) return;
    AquaSim.setComponentLevel(
      componentId,
      def.limit * (1.4 + Math.random() * 0.6),
    );
  };

  AquaSim.resolveComponent = function (componentId) {
    var def = AquaSim.qualityComponents.find(function (d) {
      return d.id === componentId;
    });
    if (!def) return;
    AquaSim.setComponentLevel(componentId, def.base);
    resolveAlertsFor({ type: "☣ " + def.name + " fuera de rango" });
    commit("quality-resolve");
  };

  AquaSim.setDissolvedSolids = function (ppm) {
    state.quality.dissolvedSolids = Math.max(0, Math.round(ppm));
    commit("quality-solids");
  };

  AquaSim.resolveAlert = function (alertId) {
    var a = state.alerts.find(function (a) {
      return a.id === alertId;
    });
    if (a) {
      a.resolved = true;
      commit("resolve-alert");
    }
  };

  AquaSim.resetToDefault = function () {
    state = AquaSim.createDefaultState();
    commit("reset");
  };

  // ---- tick: jitter + reloj automático (solo lo llama el simulador) ----
  AquaSim.startTick = function (intervalMs) {
    if (tickTimer) return;
    tickTimer = setInterval(function () {
      state.sensors.forEach(function (s) {
        if (s.status === "offline") return;
        var jitter = (Math.random() - 0.5) * 0.6 * state.demandFactor;
        s.flow = Math.max(0, +(s.flow + jitter).toFixed(1));
        s.pressure = Math.max(
          0.1,
          +(s.pressure + (Math.random() - 0.5) * 0.08).toFixed(2),
        );
        if (s.status === "healthy" && Math.random() < 0.01)
          s.battery = Math.max(0, s.battery - 1);
      });
      state.quality.components.forEach(function (c) {
        var def = AquaSim.qualityComponents.find(function (d) {
          return d.id === c.id;
        });
        var jitter = (Math.random() - 0.5) * def.limit * 0.03;
        c.level = Math.max(0, +(c.level + jitter).toFixed(def.decimals));
        pushTrend(c);
      });
      state.quality.dissolvedSolids = Math.max(
        0,
        Math.round(state.quality.dissolvedSolids + (Math.random() - 0.5) * 4),
      );
      state.quality.history24h.push(
        Math.max(0, Math.min(100, Math.round(70 + (Math.random() - 0.5) * 30))),
      );
      if (state.quality.history24h.length > 7) state.quality.history24h.shift();
      commit("tick");
    }, intervalMs || 4000);
  };

  // ---- internos ----
  function pushTrend(component) {
    component.trend.push(component.level);
    if (component.trend.length > 4) component.trend.shift();
  }

  function sectorName(id) {
    var s = AquaSim.sectors.find(function (s) {
      return s.id === id;
    });
    return s ? s.name : id;
  }
  function nearestSensorId(sectorId) {
    var s = state.sensors.find(function (s) {
      return s.sectorId === sectorId;
    });
    return s ? s.id : null;
  }
  function sensorById(id) {
    return state.sensors.find(function (s) {
      return s.id === id;
    });
  }

  function affectDownstreamSensors(pipe, severity) {
    [pipe.from, pipe.to].forEach(function (sensorId) {
      var s = sensorById(sensorId);
      if (!s) return;
      s.status = severity === "broken" ? "danger" : "warning";
      s.pressure = Math.max(
        0.2,
        s.pressure - (severity === "broken" ? 2.2 : 1),
      );
      if (severity === "broken") s.flow = +(s.flow * 1.8).toFixed(1);
    });
  }

  function restoreDownstreamSensors(pipe) {
    [pipe.from, pipe.to].forEach(function (sensorId) {
      var s = sensorById(sensorId);
      if (s && s.status !== "offline") s.status = "healthy";
    });
  }

  function pushAlert(partial) {
    var now = new Date();
    var time = now.toTimeString().slice(0, 8);
    state.alerts.unshift(
      Object.assign(
        {
          id: "AL-" + String(state.nextAlertSeq++).padStart(4, "0"),
          time: time,
          ts: now.getTime(),
          resolved: false,
        },
        partial,
      ),
    );
  }

  function resolveAlertsFor(match) {
    state.alerts.forEach(function (a) {
      if (a.resolved) return;
      if (match.pipeId && a.pipeId === match.pipeId) a.resolved = true;
      if (
        match.sensorId &&
        a.sensorId === match.sensorId &&
        (!match.type || a.type === match.type)
      )
        a.resolved = true;
    });
  }

  // ---- cross-tab: reacciona a notificaciones de la otra pestaña ----
  if (channel) {
    channel.onmessage = function (ev) {
      if (!ev.data) return;
      if (ev.data.type === "state-changed") {
        var fresh = loadState();
        if (fresh) {
          state = fresh;
          notifyLocal("remote");
        }
      } else if (ev.data.type === "request-state") {
        broadcast({
          type: "state-changed",
          reason: "sync-response",
          updatedAt: state.updatedAt,
        });
      }
    };
  }

  AquaSim.requestSync = function () {
    broadcast({ type: "request-state" });
  };
})();
