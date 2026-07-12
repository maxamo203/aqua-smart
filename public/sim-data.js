// sim-data.js — esquema compartido + estado por defecto. Sin dependencias.
// Cargado por index.html y simulator.html, antes de sim-engine.js.
window.AquaSim = window.AquaSim || {};

AquaSim.CHANNEL_NAME = "aquasmart-sim";
AquaSim.STORAGE_KEY = "aquasmart:sim-state:v1";

// Imagen de fondo del plano del simulador. Sus dimensiones reales se leen al
// cargarla (Image.naturalWidth/Height) — no hace falta hardcodearlas acá.
AquaSim.MAP_IMAGE = "unlam-superior-1.png";

// Sistema de coordenadas del plano: fracciones de 0 a 1 sobre el ancho/alto de
// MAP_IMAGE, para que el mapa siga funcionando sin cambios si se reemplaza la
// imagen por otra de distintas dimensiones.
// Sectores del campus (agrupación lógica para alertas/mapa de Alertas). Las
// cañerías se dibujan entre estos puntos; los sensores tienen su propia x/y (ver sensorDefs).
AquaSim.sectors = [
  {
    id: "sector-a",
    name: "Sector A · Ingreso Principal",
    x: 0.1006,
    y: 0.8232,
  },
  { id: "sector-b", name: "Sector B · Biblioteca", x: 0.3751, y: 0.4049 },
  { id: "sector-c", name: "Sector C · Laboratorios", x: 0.677, y: 0.3239 },
  { id: "sector-d", name: "Sector D · Residencias", x: 0.677, y: 0.7557 },
  { id: "sector-e", name: "Sector E · Comedor", x: 0.3569, y: 0.7557 },
  { id: "sector-f", name: "Sector F · Polideportivo", x: 0.9059, y: 0.4049 },
];

// Tramos de cañería. from/to referencian IDs de sensorDefs (no sectores): las
// coordenadas de dibujo se derivan de sensorDefs[].x/y en tiempo real, así que
// si se arrastra o redefine un sensor, las líneas conectadas lo siguen solas.
AquaSim.pipes = [
  {
    id: "pipe-01",
    from: "AQ-NODE-01",
    to: "AQ-NODE-02",
    diameter: "principal",
  },
  {
    id: "pipe-08",
    from: "AQ-NODE-01",
    to: "AQ-NODE-04",
    diameter: "principal",
  },
  {
    id: "pipe-02",
    from: "AQ-NODE-02",
    to: "AQ-NODE-03",
    diameter: "principal",
  },
  { id: "pipe-07", from: "AQ-NODE-04", to: "AQ-NODE-06", diameter: "ramal" },
  { id: "pipe-09", from: "AQ-NODE-03", to: "AQ-NODE-05", diameter: "ramal" },
  {
    id: "pipe-06",
    from: "AQ-NODE-01",
    to: "AQ-NODE-07",
    diameter: "secundaria",
  },
  {
    id: "pipe-07",
    from: "AQ-NODE-07",
    to: "AQ-NODE-08",
    diameter: "secundaria",
  },
  {
    id: "pipe-08",
    from: "AQ-NODE-07",
    to: "AQ-NODE-10",
    diameter: "secundaria",
  },
  {
    id: "pipe-09",
    from: "AQ-NODE-08",
    to: "AQ-NODE-09",
    diameter: "secundaria",
  },
  {
    id: "pipe-10",
    from: "AQ-NODE-10",
    to: "AQ-NODE-11",
    diameter: "secundaria",
  },
  {
    id: "pipe-11",
    from: "AQ-NODE-11",
    to: "AQ-NODE-12",
    diameter: "secundaria",
  },
  {
    id: "pipe-12",
    from: "AQ-NODE-12",
    to: "AQ-NODE-13",
    diameter: "secundaria",
  },
  {
    id: "pipe-13",
    from: "AQ-NODE-06",
    to: "AQ-NODE-14",
    diameter: "secundaria",
  },
  {
    id: "pipe-14",
    from: "AQ-NODE-14",
    to: "AQ-NODE-15",
    diameter: "secundaria",
  },
  {
    id: "pipe-15",
    from: "AQ-NODE-03",
    to: "AQ-NODE-16",
    diameter: "secundaria",
  },
  {
    id: "pipe-16",
    from: "AQ-NODE-03",
    to: "AQ-NODE-16",
    diameter: "secundaria",
  },
  {
    id: "pipe-17",
    from: "AQ-NODE-05",
    to: "AQ-NODE-17",
    diameter: "secundaria",
  },
  {
    id: "pipe-18",
    from: "AQ-NODE-17",
    to: "AQ-NODE-18",
    diameter: "secundaria",
  },
  {
    id: "pipe-19",
    from: "AQ-NODE-17",
    to: "AQ-NODE-19",
    diameter: "secundaria",
  },
];

// Definiciones base de sensores. type: 'flow' | 'pressure' | 'quality'
// x/y: posición sobre la foto del campus, como fracción 0..1 del ancho/alto real de la imagen.
// Arrastrables desde el "Modo edición" del simulador; una vez definitivas, se pisan acá a mano.
AquaSim.sensorDefs = [
  {
    id: "AQ-NODE-01",
    sectorId: "sector-a",
    place: "Entrada",
    type: "flow",
    x: 0.8383,
    y: 0.6437,
    baseFlow: 12.4,
    basePressure: 4.2,
    baseBattery: 85,
  },
  {
    id: "AQ-NODE-02",
    sectorId: "sector-b",
    place: "Biblioteca",
    type: "pressure",
    x: 0.6105,
    y: 0.5623,
    baseFlow: 6.1,
    basePressure: 3.6,
    baseBattery: 91,
  },
  {
    id: "AQ-NODE-03",
    sectorId: "sector-c",
    place: "Dep. Derecho",
    type: "quality",
    x: 0.5539,
    y: 0.5623,
    baseFlow: 5.4,
    basePressure: 3.4,
    baseBattery: 77,
  },
  {
    id: "AQ-NODE-04",
    sectorId: "sector-d",
    place: "Canchas de Basket",
    type: "flow",
    x: 0.7043,
    y: 0.5019,
    baseFlow: 8.9,
    basePressure: 3.9,
    baseBattery: 12,
  },
  {
    id: "AQ-NODE-05",
    sectorId: "sector-e",
    place: "Dep. Medios",
    type: "flow",
    x: 0.4774,
    y: 0.5623,
    baseFlow: 4.2,
    basePressure: 3.1,
    baseBattery: 65,
  },
  {
    id: "AQ-NODE-06",
    sectorId: "sector-f",
    place: "Pileta",
    type: "pressure",
    x: 0.6156,
    y: 0.2857,
    baseFlow: 3.8,
    basePressure: 2.9,
    baseBattery: 98,
  },
  {
    id: "AQ-NODE-07",
    sectorId: "sector-a",
    place: "Central",
    type: "flow",
    x: 0.8435,
    y: 0.8526,
    baseFlow: 5,
    basePressure: 3,
    baseBattery: 100,
  },
  {
    id: "AQ-NODE-08",
    sectorId: "sector-a",
    place: "Dep. Ingeniería 1",
    type: "flow",
    x: 0.7583,
    y: 0.9003,
    baseFlow: 5,
    basePressure: 3,
    baseBattery: 100,
  },
  {
    id: "AQ-NODE-09",
    sectorId: "sector-a",
    place: "Dep. Ingeniería 2",
    type: "flow",
    x: 0.6585,
    y: 0.9017,
    baseFlow: 5,
    basePressure: 3,
    baseBattery: 100,
  },
  {
    id: "AQ-NODE-10",
    sectorId: "sector-a",
    place: "Formación Continua",
    type: "flow",
    x: 0.7031,
    y: 0.7755,
    baseFlow: 5,
    basePressure: 3,
    baseBattery: 100,
  },
  {
    id: "AQ-NODE-11",
    sectorId: "sector-a",
    place: "Salón de las Américas",
    type: "flow",
    x: 0.6125,
    y: 0.7698,
    baseFlow: 5,
    basePressure: 3,
    baseBattery: 100,
  },
  {
    id: "AQ-NODE-12",
    sectorId: "sector-a",
    place: "Dep. Humanidades",
    type: "flow",
    x: 0.5453,
    y: 0.7726,
    baseFlow: 5,
    basePressure: 3,
    baseBattery: 100,
  },
  {
    id: "AQ-NODE-13",
    sectorId: "sector-a",
    place: "Dep. Económicas",
    type: "flow",
    x: 0.4541,
    y: 0.7769,
    baseFlow: 5,
    basePressure: 3,
    baseBattery: 100,
  },
  {
    id: "AQ-NODE-14",
    sectorId: "sector-a",
    place: "Cancha de Running",
    type: "flow",
    x: 0.5193,
    y: 0.2286,
    baseFlow: 5,
    basePressure: 3,
    baseBattery: 100,
  },
  {
    id: "AQ-NODE-15",
    sectorId: "sector-a",
    place: "Cancha de Fútbol",
    type: "flow",
    x: 0.3349,
    y: 0.0799,
    baseFlow: 5,
    basePressure: 3,
    baseBattery: 100,
  },
  {
    id: "AQ-NODE-16",
    sectorId: "sector-a",
    place: "Dep. Salud",
    type: "flow",
    x: 0.4694,
    y: 0.373,
    baseFlow: 5,
    basePressure: 3,
    baseBattery: 100,
  },
  {
    id: "AQ-NODE-17",
    sectorId: "sector-a",
    place: "Canchas de Vóley",
    type: "flow",
    x: 0.4048,
    y: 0.5735,
    baseFlow: 5,
    basePressure: 3,
    baseBattery: 100,
  },
  {
    id: "AQ-NODE-18",
    sectorId: "sector-a",
    place: "Gimnasio",
    type: "flow",
    x: 0.3948,
    y: 0.3716,
    baseFlow: 5,
    basePressure: 3,
    baseBattery: 100,
  },
  {
    id: "AQ-NODE-19",
    sectorId: "sector-a",
    place: "Comedor",
    type: "flow",
    x: 0.3881,
    y: 0.7755,
    baseFlow: 5,
    basePressure: 3,
    baseBattery: 100,
  },
];

// Componentes químicos/microbiológicos monitoreados en la página de Calidad.
// limit: umbral máximo seguro (referencia OMS) usado para derivar el estado.
AquaSim.qualityComponents = [
  {
    id: "chlorine",
    name: "Cloro Libre",
    unit: "mg/L",
    base: 0.45,
    limit: 5.0,
    decimals: 2,
  },
  {
    id: "fluoride",
    name: "Fluoruro",
    unit: "mg/L",
    base: 0.72,
    limit: 1.5,
    decimals: 2,
  },
  {
    id: "lead",
    name: "Plomo",
    unit: "mg/L",
    base: 0.001,
    limit: 0.01,
    decimals: 3,
  },
  {
    id: "arsenic",
    name: "Arsénico",
    unit: "mg/L",
    base: 0.005,
    limit: 0.01,
    decimals: 3,
  },
  {
    id: "nitrates",
    name: "Nitratos",
    unit: "mg/L",
    base: 2.1,
    limit: 50,
    decimals: 1,
  },
];

// Arma un estado inicial fresco. Usado como fallback del dashboard standalone
// y como semilla del simulador.
AquaSim.createDefaultState = function () {
  return {
    version: 1,
    updatedAt: Date.now(),
    demandFactor: 1.0,
    sensors: AquaSim.sensorDefs.map(function (d) {
      return {
        id: d.id,
        sectorId: d.sectorId,
        place: d.place,
        type: d.type,
        status: "healthy", // 'healthy' | 'warning' | 'danger' | 'offline'
        flow: d.baseFlow,
        pressure: d.basePressure,
        battery: d.baseBattery,
        quality: d.type === "quality" ? 98.4 : null,
      };
    }),
    pipes: AquaSim.pipes.map(function (p) {
      return Object.assign({ status: "ok" }, p); // 'ok' | 'leak' | 'broken'
    }),
    quality: {
      dissolvedSolids: 12, // ppm
      history24h: [55, 70, 62, 80, 70, 85, 65], // % para el mini-gráfico, más reciente al final
      components: AquaSim.qualityComponents.map(function (c) {
        return {
          id: c.id,
          level: c.base,
          trend: [c.base, c.base, c.base, c.base], // últimas 4 lecturas, para el sparkline
        };
      }),
    },
    alerts: [],
    nextAlertSeq: 1,
  };
};
