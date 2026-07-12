// simulator.js — escena Konva del plano de campus + panel de control.
// Depende de sim-data.js, sim-engine.js y konva.min.js (todos cargados antes).

const STATUS_COLOR = {
  healthy: "#4b8a2a",
  warning: "#c98416",
  danger: "#c8232a",
  offline: "#8a94ab",
};
const PIPE_COLOR = { ok: "#2458f5", leak: "#d98a1b", broken: "#c8232a" };
const PIPE_WIDTH = { principal: 6, secundaria: 4, ramal: 2.5 };

let toastTimer;
function toast(message) {
  const box = document.querySelector("#toast");
  box.textContent = message;
  box.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("show"), 2600);
}

function sectorById(id) {
  return AquaSim.sectors.find((s) => s.id === id);
}
function sensorDefById(id) {
  return AquaSim.sensorDefs.find((d) => d.id === id);
}

// Manejo de clics a nivel de STAGE (no por-shape). Konva no propaga los clics de
// forma confiable a la capa de fondo entre navegadores, así que en vez de poner
// un listener en cada shape, escuchamos mousedown/up en el stage y resolvemos qué
// hay bajo el puntero con getIntersection. Tolerante al pequeño arrastre involuntario
// de un mouse físico (Konva a veces no dispara 'click' en ese caso): solo cuenta
// como clic si el puntero se movió <= CLICK_SLOP px entre down y up.
const CLICK_SLOP = 6;
function attachStageClick() {
  let downPos = null;
  let draggingId = null; // sensor que se está arrastrando (modo Mover), por distancia

  stage.on("mousedown touchstart", () => {
    const pos = stage.getPointerPosition();
    downPos = pos;
    draggingId = null;
    if (mode === "move" && pos) {
      const local = { x: pos.x / stage.scaleX(), y: pos.y / stage.scaleY() };
      draggingId = sensorNear(local.x, local.y); // agarra el sensor cercano
      if (draggingId) stage.container().style.cursor = "grabbing";
    }
  });

  stage.on("mousemove touchmove", () => {
    if (!draggingId) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const { group } = sensorShapes.get(draggingId);
    group.x(pos.x / stage.scaleX());
    group.y(pos.y / stage.scaleY());
    pipesTouching(draggingId).forEach((p) => updatePipePoints(p.id));
    layer.batchDraw();
    updateCoordOutput();
  });

  stage.on("mouseup touchend", () => {
    const upPos = stage.getPointerPosition();
    const start = downPos;
    const wasDragging = draggingId;
    downPos = null;
    draggingId = null;
    if (mode === "move") {
      stage.container().style.cursor = "grab";
      return; // en Mover no hay clics-acción; el arrastre ya se aplicó en mousemove
    }
    if (wasDragging) return;
    if (!start || !upPos) return;
    const dist = Math.hypot(upPos.x - start.x, upPos.y - start.y);
    if (dist > CLICK_SLOP) return; // fue un arrastre, no un clic
    handleStageClick(upPos);
  });
}

// Radio (en píxeles del espacio de contenido) dentro del cual un clic se considera
// "sobre" un sensor existente, en vez de crear uno nuevo. Generoso a propósito para
// que no queden dos sensores encima por un clic apenas desviado.
const SENSOR_HIT_RADIUS = 22;

// Sensor más cercano al punto (en coords de contenido), si está dentro del radio de hit.
function sensorNear(contentX, contentY) {
  let best = null;
  let bestDist = Infinity;
  sensorShapes.forEach(({ group }, id) => {
    const dist = Math.hypot(group.x() - contentX, group.y() - contentY);
    if (dist < bestDist) { bestDist = dist; best = id; }
  });
  return bestDist <= SENSOR_HIT_RADIUS ? best : null;
}

// Resuelve el clic en el plano: qué hay bajo el puntero (sensor / cañería / zona vacía).
// Priorizamos una búsqueda por distancia real a los sensores (robusta y predecible)
// sobre getIntersection, que puede fallar con el stage escalado o el hit-canvas desactualizado.
function handleStageClick(pointerPos) {
  const local = { x: pointerPos.x / stage.scaleX(), y: pointerPos.y / stage.scaleY() };

  const nearId = sensorNear(local.x, local.y);
  if (nearId) {
    if (mode === "view") toggleSensor(nearId);
    else if (mode === "add") handleConnectClick(nearId);
    return;
  }

  // No hay sensor cerca: ver si el clic cayó sobre una cañería (solo importa en modo Ver).
  const hit = layer.getIntersection(pointerPos);
  if (hit && hit.getAttr("aquaKind") === "pipe") {
    if (mode === "view") cyclePipe(hit.getAttr("aquaId"));
    return;
  }

  // Zona vacía del plano
  if (mode === "add") {
    createSensorAt(local.x, local.y);
  }
}

// ---- Escena Konva ----
// El sistema de coordenadas del stage se toma de las dimensiones REALES de la imagen
// de fondo (naturalWidth/Height), leídas recién al cargarla — así cualquier imagen sirve
// sin tocar código. Sectores y sensores se definen en sim-data.js como fracciones 0..1
// del ancho/alto de la imagen, y acá se convierten a píxeles absolutos.
const stageEl = document.querySelector("#sim-stage");
const pipeShapes = new Map();
const sensorShapes = new Map();
let mode = "view"; // 'view' | 'move' | 'add'
let stage, layer, MAP_W, MAP_H;
let connectFromId = null; // sensor elegido como origen de una conexión nueva, en modo 'add'
let newSensorSeq = AquaSim.sensorDefs.length + 1;
let newPipeSeq = AquaSim.pipes.length + 1;
const newSensorIds = new Set(); // ids creados en esta sesión (para el panel "objetos nuevos")
const newPipeIds = new Set();

const bgImage = new Image();
bgImage.onload = () => {
  MAP_W = bgImage.naturalWidth;
  MAP_H = bgImage.naturalHeight;
  const scale = stageEl.clientWidth / MAP_W;
  stage = new Konva.Stage({
    container: "sim-stage",
    width: MAP_W * scale,
    height: MAP_H * scale,
    scaleX: scale,
    scaleY: scale,
  });
  const bgLayer = new Konva.Layer({ listening: false }); // el fondo no captura eventos; el clic se maneja a nivel de stage
  layer = new Konva.Layer();
  stage.add(bgLayer, layer);

  bgLayer.add(
    new Konva.Image({ image: bgImage, x: 0, y: 0, width: MAP_W, height: MAP_H }),
  );
  bgLayer.draw();

  // Clic a nivel de stage: la fuente de verdad de TODA interacción con el plano.
  // Konva a veces no propaga bien los clics a la capa de fondo entre navegadores,
  // así que decidimos acá según qué shape hay bajo el puntero (o ninguno = zona vacía).
  attachStageClick();

  buildScene();
  renderStage();
  renderControls();
};
bgImage.src = AquaSim.MAP_IMAGE;

function toPx(fractionalX, fractionalY) {
  return { x: fractionalX * MAP_W, y: fractionalY * MAP_H };
}

// Cañerías que tienen a `sensorId` como uno de sus dos extremos (from o to).
function pipesTouching(sensorId) {
  return AquaSim.pipes.filter((p) => p.from === sensorId || p.to === sensorId);
}

function buildScene() {
  // Sensores primero (necesitamos sus posiciones para trazar las cañerías).
  // addSensorShape/addPipeShape ya agregan el nodo al layer; addPipeShape lo
  // manda al fondo (moveToBottom) para que las líneas queden debajo de los sensores.
  AquaSim.sensorDefs.forEach((d) => addSensorShape(d));
  AquaSim.pipes.forEach((p) => addPipeShape(p));
  layer.draw();
}

function addSensorShape(d) {
  const pos = toPx(d.x, d.y);
  // No usamos el drag nativo de Konva (su hit-testing es inconsistente con mouse
  // real); el arrastre se maneja manualmente por distancia en attachStageClick.
  const group = new Konva.Group({ x: pos.x, y: pos.y });
  const circle = new Konva.Circle({
    radius: 9,
    fill: STATUS_COLOR.healthy,
    stroke: "#fff",
    strokeWidth: 2,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowBlur: 4,
    listening: false,
  });
  const label = new Konva.Text({
    text: d.id.replace("AQ-NODE-", "#"),
    x: -20,
    y: 14,
    width: 40,
    align: "center",
    fontSize: 10,
    fontFamily: "Arial, sans-serif",
    fontStyle: "bold",
    fill: "#fff",
    listening: false,
    shadowColor: "#000",
    shadowOpacity: 0.9,
    shadowBlur: 2,
  });
  group.add(circle, label);
  sensorShapes.set(d.id, { group, circle });
  layer.add(group);
  return { group, circle };
}

function addPipeShape(p) {
  const line = new Konva.Line({
    points: pipePoints(p),
    stroke: PIPE_COLOR.ok,
    strokeWidth: PIPE_WIDTH[p.diameter] || 4,
    hitStrokeWidth: 22,
    lineCap: "round",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowBlur: 3,
  });
  line.setAttr("aquaKind", "pipe");
  line.setAttr("aquaId", p.id);
  layer.add(line);
  line.moveToBottom();
  pipeShapes.set(p.id, line);
  return line;
}

function pipePoints(p) {
  const from = sensorShapes.get(p.from);
  const to = sensorShapes.get(p.to);
  if (!from || !to) return [0, 0, 0, 0]; // extremo inexistente: cañería degenerada (no debería pasar tras resync)
  return [from.group.x(), from.group.y(), to.group.x(), to.group.y()];
}

function updatePipePoints(pipeId) {
  const p = AquaSim.pipes.find((p) => p.id === pipeId);
  const shape = pipeShapes.get(pipeId);
  if (p && shape) shape.points(pipePoints(p));
  layer.batchDraw();
}

// ---- Selector de modo: Ver / Mover / Agregar ----
const coordPanel = document.querySelector("#coord-panel");
const stageHint = document.querySelector("#stage-hint");
const modeInstructions = document.querySelector("#mode-instructions");
const MODE_HINT = {
  view: "CLIC EN UNA CAÑERÍA O SENSOR PARA INTERACTUAR",
  move: "ARRASTRÁ LOS SENSORES PARA UBICARLOS SOBRE EL PLANO",
  add: "CLIC EN EL PLANO PARA CREAR UN SENSOR · CLIC EN DOS SENSORES PARA CONECTARLOS",
};
const MODE_INSTRUCTIONS = {
  add: "Modo Agregar: clic en un punto vacío del plano crea un sensor nuevo ahí. Clic en un sensor lo marca como origen de una cañería nueva (queda resaltado en amarillo); clic en un segundo sensor la crea. Clic de nuevo en el mismo sensor origen cancela la selección.",
};

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

function setMode(next) {
  mode = next;
  connectFromId = null;
  updateConnectHighlight();
  document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("selected", b.dataset.mode === mode));
  if (stage) stage.container().classList.toggle("mode-move", mode === "move");
  if (stage) stage.container().classList.toggle("mode-add", mode === "add");
  coordPanel.hidden = mode === "view";
  stageHint.textContent = MODE_HINT[mode];
  modeInstructions.hidden = !MODE_INSTRUCTIONS[mode];
  modeInstructions.textContent = MODE_INSTRUCTIONS[mode] || "";
  if (mode !== "view") updateCoordOutput();
}

function nextSensorId() {
  let id;
  do { id = "AQ-NODE-" + String(newSensorSeq++).padStart(2, "0"); } while (sensorDefById(id));
  return id;
}

function createSensorAt(px, py) {
  const d = {
    id: nextSensorId(),
    sectorId: "sector-a",
    place: "Sensor nuevo",
    type: "flow",
    x: +(px / MAP_W).toFixed(4),
    y: +(py / MAP_H).toFixed(4),
    baseFlow: 5.0,
    basePressure: 3.0,
    baseBattery: 100,
  };
  AquaSim.sensorDefs.push(d);
  newSensorIds.add(d.id);
  AquaSim.addSensor(d);
  addSensorShape(d);
  layer.draw();
  toast(`${d.id} creado — completá sus datos en el panel antes de copiar`);
  updateCoordOutput();
}

function handleConnectClick(sensorId) {
  if (!connectFromId) {
    connectFromId = sensorId;
    updateConnectHighlight();
    toast(`${sensorId} elegido como origen — clic en otro sensor para conectar`);
    return;
  }
  if (connectFromId === sensorId) {
    connectFromId = null;
    updateConnectHighlight();
    toast("Selección cancelada");
    return;
  }
  const id = "pipe-" + String(newPipeSeq++).padStart(2, "0");
  const p = { id, from: connectFromId, to: sensorId, diameter: "secundaria" };
  AquaSim.pipes.push(p);
  newPipeIds.add(id);
  AquaSim.addPipe(p);
  addPipeShape(p);
  layer.draw();
  toast(`${id} creada: ${connectFromId} → ${sensorId}`);
  connectFromId = null;
  updateConnectHighlight();
  updateCoordOutput();
}

function updateConnectHighlight() {
  sensorShapes.forEach(({ circle }, id) => {
    circle.stroke(id === connectFromId ? "#f6e05e" : "#fff");
    circle.strokeWidth(id === connectFromId ? 4 : 2);
  });
  if (layer) layer.batchDraw();
}

function sensorDefLine(d) {
  return `  { id: '${d.id}', sectorId: '${d.sectorId}', place: '${d.place}', type: '${d.type}', x: ${d.x.toFixed(4)}, y: ${d.y.toFixed(4)}, baseFlow: ${d.baseFlow}, basePressure: ${d.basePressure}, baseBattery: ${d.baseBattery} },`;
}

function pipeLine(p) {
  return `  { id: '${p.id}', from: '${p.from}', to: '${p.to}', diameter: '${p.diameter}' },`;
}

// Devuelve el texto del array COMPLETO de sensorDefs (todos, con las posiciones
// actuales del canvas), listo para reemplazar el bloque entero en sim-data.js.
function sensorsArrayText() {
  const lines = AquaSim.sensorDefs.map((d) => {
    const { group } = sensorShapes.get(d.id) || {};
    const fx = group ? +(group.x() / MAP_W).toFixed(4) : d.x;
    const fy = group ? +(group.y() / MAP_H).toFixed(4) : d.y;
    return sensorDefLine(Object.assign({}, d, { x: fx, y: fy }));
  });
  return `AquaSim.sensorDefs = [\n${lines.join("\n")}\n];`;
}

// Array COMPLETO de pipes, listo para reemplazar el bloque entero en sim-data.js.
function pipesArrayText() {
  const lines = AquaSim.pipes.map(pipeLine);
  return `AquaSim.pipes = [\n${lines.join("\n")}\n];`;
}

function updateCoordOutput() {
  document.querySelector("#coord-output-sensors").textContent = sensorsArrayText();
  document.querySelector("#coord-output-pipes").textContent = pipesArrayText();
  // x/y son fracciones 0..1 del ancho/alto de la imagen (no píxeles), para que
  // sigan funcionando si se cambia MAP_IMAGE por una foto de otras dimensiones.
}

document.querySelector("#btn-copy-coords").addEventListener("click", () => {
  const text = `${sensorsArrayText()}\n\n${pipesArrayText()}`;
  navigator.clipboard.writeText(text).then(
    () => toast("Arrays completos copiados — pegalos en sim-data.js"),
    () =>
      toast(
        "No se pudo copiar automáticamente, seleccioná el texto manualmente",
      ),
  );
});

// ---- Interacción sobre el canvas ----
function cyclePipe(pipeId) {
  const pipe = AquaSim.getState().pipes.find((p) => p.id === pipeId);
  if (!pipe) return;
  if (pipe.status === "ok") {
    AquaSim.triggerLeak(pipeId, "leak");
    toast(`Fuga simulada en ${pipeId}`);
  } else if (pipe.status === "leak") {
    AquaSim.triggerLeak(pipeId, "broken");
    toast(`Rotura simulada en ${pipeId}`);
  } else {
    AquaSim.resolveLeak(pipeId);
    toast(`${pipeId} reparada`);
  }
}

function toggleSensor(sensorId) {
  const sensor = AquaSim.getState().sensors.find((s) => s.id === sensorId);
  if (!sensor) return;
  const goingOffline = sensor.status !== "offline";
  AquaSim.setSensorOffline(sensorId, goingOffline);
  toast(goingOffline ? `${sensorId} desconectado` : `${sensorId} reconectado`);
}

// ---- Re-render de la escena a partir del estado ----
function renderStage() {
  if (!layer) return; // la imagen de fondo todavía no cargó; buildScene() la va a llamar cuando esté lista
  const state = AquaSim.getState();
  state.pipes.forEach((p) => {
    const shape = pipeShapes.get(p.id);
    if (shape) shape.stroke(PIPE_COLOR[p.status] || PIPE_COLOR.ok);
  });
  state.sensors.forEach((s) => {
    const shape = sensorShapes.get(s.id);
    if (shape)
      shape.circle.fill(STATUS_COLOR[s.status] || STATUS_COLOR.healthy);
  });
  layer.batchDraw();
}

// ---- Panel lateral: chips redundantes al clic en canvas ----
function pipeLabel(p) {
  // Resuelve los nombres desde el estado (fuente de verdad completa) con fallback al id,
  // por si la cañería referencia un sensor que ya no está en sensorDefs (p.ej. estado
  // persistido de una sesión anterior con sensores creados a mano).
  const state = AquaSim.getState();
  const nameOf = (id) => {
    const s = state.sensors.find((s) => s.id === id);
    return s ? s.place : id;
  };
  return `${p.id.replace("pipe-", "C")} · ${nameOf(p.from)} → ${nameOf(p.to)}`;
}

function renderControls() {
  const state = AquaSim.getState();
  document.querySelector("#pipe-controls").innerHTML = state.pipes
    .map(
      (p) =>
        `<button class="chip ${p.status}" data-pipe="${p.id}">${pipeLabel(p)} — ${p.status.toUpperCase()}</button>`,
    )
    .join("");
  document.querySelector("#sensor-controls").innerHTML = state.sensors
    .map(
      (s) =>
        `<button class="chip ${s.status}" data-sensor="${s.id}">${s.id} — ${s.status.toUpperCase()}</button>`,
    )
    .join("");
}

document.querySelector("#pipe-controls").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-pipe]");
  if (btn) cyclePipe(btn.dataset.pipe);
});
document.querySelector("#sensor-controls").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-sensor]");
  if (btn) toggleSensor(btn.dataset.sensor);
});

// ---- Demanda global ----
const demandSlider = document.querySelector("#demand-slider");
const demandValue = document.querySelector("#demand-value");
demandSlider.addEventListener("input", () => {
  const factor = demandSlider.value / 100;
  demandValue.textContent = `${factor.toFixed(1)}×`;
  AquaSim.setDemand(factor);
});

// ---- Calidad de agua ----
const solidsSlider = document.querySelector("#solids-slider");
const solidsValue = document.querySelector("#solids-value");
solidsSlider.addEventListener("input", () => {
  solidsValue.textContent = `${solidsSlider.value} ppm`;
  AquaSim.setDissolvedSolids(+solidsSlider.value);
});

function qualitySliderMax(def) {
  // Rango del slider hasta 2x el límite seguro, para poder llevarlo a "fuera de rango" arrastrando.
  return +(def.limit * 2).toFixed(def.decimals);
}

function buildQualityControls() {
  const container = document.querySelector("#quality-controls");
  container.innerHTML = AquaSim.qualityComponents
    .map(
      (def) => `
    <div class="quality-row" data-component="${def.id}">
      <label>${def.name} <strong id="q-value-${def.id}">${def.base} ${def.unit}</strong></label>
      <input type="range" id="q-slider-${def.id}" min="0" max="${qualitySliderMax(def)}" step="${1 / Math.pow(10, def.decimals)}" value="${def.base}" />
      <div class="quality-row-actions">
        <button class="chip" data-spike="${def.id}">☣ Simular pico</button>
        <button class="chip" data-normalize="${def.id}">↺ Normalizar</button>
      </div>
    </div>
  `,
    )
    .join("");
}
buildQualityControls();

document.querySelector("#quality-controls").addEventListener("input", (e) => {
  const slider = e.target.closest("input[type=range]");
  if (!slider) return;
  const componentId = slider.closest(".quality-row").dataset.component;
  AquaSim.setComponentLevel(componentId, +slider.value);
});

document.querySelector("#quality-controls").addEventListener("click", (e) => {
  const spikeBtn = e.target.closest("[data-spike]");
  const normalizeBtn = e.target.closest("[data-normalize]");
  if (spikeBtn) {
    AquaSim.simulateContaminationSpike(spikeBtn.dataset.spike);
    const def = AquaSim.qualityComponents.find(
      (d) => d.id === spikeBtn.dataset.spike,
    );
    toast(`Pico de ${def.name} simulado`);
  } else if (normalizeBtn) {
    AquaSim.resolveComponent(normalizeBtn.dataset.normalize);
    const def = AquaSim.qualityComponents.find(
      (d) => d.id === normalizeBtn.dataset.normalize,
    );
    toast(`${def.name} normalizado`);
  }
});

function renderQualityControls() {
  const state = AquaSim.getState();
  state.quality.components.forEach((c) => {
    const def = AquaSim.qualityComponents.find((d) => d.id === c.id);
    const slider = document.querySelector(`#q-slider-${c.id}`);
    const valueLabel = document.querySelector(`#q-value-${c.id}`);
    if (!slider) return;
    const over = c.level > def.limit;
    if (document.activeElement !== slider) slider.value = c.level; // no pisar la posición mientras el usuario arrastra
    valueLabel.textContent = `${c.level.toFixed(def.decimals)} ${def.unit}`;
    valueLabel.classList.toggle("over", over);
    slider.classList.toggle("over", over);
  });
  if (document.activeElement !== solidsSlider)
    solidsSlider.value = state.quality.dissolvedSolids;
  solidsValue.textContent = `${state.quality.dissolvedSolids} ppm`;
}

// ---- Botones de escenario ----
document.querySelector("#btn-contamination").addEventListener("click", () => {
  AquaSim.triggerContamination("sector-c");
  toast("Evento de contaminación simulado en Laboratorios");
});
document.querySelector("#btn-reset").addEventListener("click", () => {
  AquaSim.resetToDefault();
  demandSlider.value = 100;
  demandValue.textContent = "1.0×";
  solidsSlider.value = 12;
  solidsValue.textContent = "12 ppm";
  toast("Escenario reiniciado");
});

// ---- Registro de eventos ----
const EVENT_LABEL = {
  leak: "Fuga / rotura de cañería",
  "resolve-leak": "Cañería reparada",
  "sensor-offline": "Cambio de estado de sensor",
  "pressure-drop": "Caída de presión",
  contamination: "Evento de contaminación",
  demand: "Ajuste de demanda global",
  "resolve-alert": "Alerta resuelta",
  reset: "Escenario reiniciado",
  "quality-level": "Ajuste de componente químico",
  "quality-resolve": "Componente normalizado",
  "quality-solids": "Ajuste de sólidos disueltos",
  topology: "Sensor o cañería agregado al plano",
};

function appendLogEntry(reason) {
  const log = document.querySelector("#sim-event-log");
  const empty = log.querySelector(".empty");
  if (empty) empty.remove();
  const time = new Date().toTimeString().slice(0, 8);
  const li = document.createElement("li");
  li.innerHTML = `<b>${time}</b>${EVENT_LABEL[reason] || reason}`;
  log.prepend(li);
  [...log.children].slice(30).forEach((el) => el.remove());
}

// ---- Reloj visible ----
function updateClock() {
  document.querySelector("#sim-clock").textContent = new Date()
    .toTimeString()
    .slice(0, 8);
}
updateClock();
setInterval(updateClock, 1000);

// ---- Suscripción central: cualquier cambio de estado repinta canvas + panel ----
AquaSim.onChange((state, reason) => {
  renderStage();
  renderControls();
  renderQualityControls();
  if (reason && reason !== "tick" && reason !== "remote")
    appendLogEntry(reason);
});

// Al arrancar el simulador, alineamos el estado (que puede venir de localStorage
// de una sesión anterior) con la topología actual de sim-data.js, para que el canvas
// y el estado no se desincronicen (sensores/cañerías fantasma).
AquaSim.resyncTopology();
renderControls();
renderQualityControls();
AquaSim.startTick(4000);
