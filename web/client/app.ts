import {
  RehearsalCore,
  canStand,
  type Point2D,
  type Scene,
  type SceneObject,
  type SimConfig,
  type SimResult,
} from "./engine/rehearsalCore.ts";
import {
  drawWorldCanvas,
  generateSampleBlueprintCanvas,
  unproject,
  type IsoView,
} from "./engine/canvasRenderer.ts";
import {
  renderTenKMonteCarloChart,
  renderWorldStatsD3Charts,
  updateWorldStatsD3Playhead,
  type TenKClusterItem,
} from "./engine/d3StatsCharts.ts";
import { ThreeFloorplanStage } from "./engine/threeFloorplanStage.ts";
import {
  createTenKMatrixEngine,
  exportTenKCellsCsv,
  findBenchmarkStoreCells,
  renderCellCashflowSparkline,
  type StoreRunCell,
  type WaferFilterMode,
  type WaferViewMode,
} from "./engine/tenKMatrixEngine.ts";
import { summarizeBackendRun } from "./engine/backendSync.ts";
import { spatialMetricSummary, spatialWaitDelta } from "./engine/spatialTelemetry.ts";

declare global {
  interface Window {
    RehearsalCore: typeof RehearsalCore;
    RehearsalApp: {
      getState: () => unknown;
      packet: () => unknown;
      manualBox: () => RoiBox | null;
    };
    __errors: string[];
  }
}

interface RoiBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

window.__errors = [];
window.addEventListener("error", (e) => window.__errors.push(e.message));
window.addEventListener("unhandledrejection", (e) =>
  window.__errors.push(String(e.reason))
);
window.RehearsalCore = RehearsalCore;

// 1. REAL COMMERCIAL DISTRICT ANALYSIS DATA & LINK PARSER
interface ListingUnit {
  unitId: string;
  label: string;
  areaPyeong: number;
  depositManWon: number;
  monthlyRentManWon: number;
  trafficFactor: number;
}

interface DistrictProfile {
  id: "seongsu" | "yeonnam" | "hannam" | "sinsa";
  name: string;
  sampleUrl: string;
  fullAddress: string;
  areaPyeong: number;
  areaM2: string;
  dailyFootTraffic: number;
  peakHours: string;
  peakArrivalMultiplier: number;
  depositManWon: number;
  monthlyRentManWon: number;
  targetPersona: string;
  bestCategoryId: "coffee" | "bakery" | "matcha" | "wine";
  districtSummary: string;
  units: ListingUnit[];
}

const DISTRICTS: DistrictProfile[] = [
  {
    id: "seongsu",
    name: "Seongsu Yeonmujang-gil",
    sampleUrl: "https://naver.me/seongsu-yeonmu42-1f",
    fullAddress: "42 Yeonmujang-gil, Seongsu-dong 2-ga, Seoul (1F · 50m²)",
    areaPyeong: 15,
    areaM2: "49.5m² (12×9m)",
    dailyFootTraffic: 42800,
    peakHours: "Wknd 13:00–17:30",
    peakArrivalMultiplier: 1.0,
    depositManWon: 5000,
    monthlyRentManWon: 380,
    targetPersona: "Gen-Z Pop-up & Specialty Coffee Hoppers",
    bestCategoryId: "coffee",
    districtSummary:
      "High-velocity retail corridor where weekday office takeout meets weekend pop-up showroom crowds. Clearing the entrance bottleneck boosts hourly throughput by +68%.",
    units: [
      {
        unitId: "101",
        label: "1F Suite 101 Full-Glass (50m² · $38k Dep / $2.8k Rent)",
        areaPyeong: 15,
        depositManWon: 5000,
        monthlyRentManWon: 380,
        trafficFactor: 1.0,
      },
      {
        unitId: "102",
        label: "1F Suite 102 Corner Compact (36m² · $26k Dep / $2.0k Rent)",
        areaPyeong: 11,
        depositManWon: 3500,
        monthlyRentManWon: 270,
        trafficFactor: 0.9,
      },
      {
        unitId: "b1",
        label: "B1 Flagship Showroom (73m² · $34k Dep / $2.5k Rent)",
        areaPyeong: 22,
        depositManWon: 4500,
        monthlyRentManWon: 330,
        trafficFactor: 1.1,
      },
    ],
  },
  {
    id: "yeonnam",
    name: "Yeonnam Forest Park",
    sampleUrl: "https://kko.to/yeonnam-forest38-1f",
    fullAddress: "38 Gyeongui Line Forest Park, Yeonnam-dong, Seoul (1F · 40m²)",
    areaPyeong: 12,
    areaM2: "39.6m² (12×9m)",
    dailyFootTraffic: 38400,
    peakHours: "Wknd 12:30–18:00",
    peakArrivalMultiplier: 1.12,
    depositManWon: 4000,
    monthlyRentManWon: 310,
    targetPersona: "Park Strollers, Bakery Tray Buyers & Couples",
    bestCategoryId: "bakery",
    districtSummary:
      "64% of park visitors pick up bakery & pastry trays. Ensuring a 1.4m two-way circulation loop around the central bread island directly determines daily revenue.",
    units: [
      {
        unitId: "101",
        label: "1F Park Frontage (40m² · $30k Dep / $2.3k Rent)",
        areaPyeong: 12,
        depositManWon: 4000,
        monthlyRentManWon: 310,
        trafficFactor: 1.0,
      },
      {
        unitId: "102",
        label: "1.5F Terrace Suite (53m² · $34k Dep / $2.6k Rent)",
        areaPyeong: 16,
        depositManWon: 4500,
        monthlyRentManWon: 340,
        trafficFactor: 1.05,
      },
      {
        unitId: "b1",
        label: "Garden Level Roastery (46m² · $19k Dep / $1.6k Rent)",
        areaPyeong: 14,
        depositManWon: 2500,
        monthlyRentManWon: 210,
        trafficFactor: 0.85,
      },
    ],
  },
  {
    id: "hannam",
    name: "Hannam Cafe Street",
    sampleUrl: "https://nemoapp.kr/hannam-itaewon54-18py",
    fullAddress: "Itaewon-ro 54-gil, Hannam-dong, Yongsan-gu, Seoul (1F · 60m²)",
    areaPyeong: 18,
    areaM2: "59.4m² (12×9m)",
    dailyFootTraffic: 29500,
    peakHours: "Fri–Sat 15:00–21:00",
    peakArrivalMultiplier: 0.85,
    depositManWon: 6500,
    monthlyRentManWon: 490,
    targetPersona: "High-Ticket Curated Wine & Lounge Guests",
    bestCategoryId: "wine",
    districtSummary:
      "Lower raw foot traffic than Seongsu, but average ticket size ($18+) is 3.8× higher. Generous lounge seating and unobstructed bottle curation racks are essential.",
    units: [
      {
        unitId: "101",
        label: "1F Private Courtyard (60m² · $49k Dep / $3.7k Rent)",
        areaPyeong: 18,
        depositManWon: 6500,
        monthlyRentManWon: 490,
        trafficFactor: 1.0,
      },
      {
        unitId: "201",
        label: "2F Panoramic Lounge (66m² · $38k Dep / $2.9k Rent)",
        areaPyeong: 20,
        depositManWon: 5000,
        monthlyRentManWon: 390,
        trafficFactor: 0.92,
      },
    ],
  },
  {
    id: "sinsa",
    name: "Sinsa Garosu-gil",
    sampleUrl: "https://zigbang.com/sinsa-garosu21-14py",
    fullAddress: "21 Garosu-gil, Sinsa-dong, Gangnam-gu, Seoul (1F · 46m²)",
    areaPyeong: 14,
    areaM2: "46.2m² (12×9m)",
    dailyFootTraffic: 46200,
    peakHours: "Daily 12:00–16:30",
    peakArrivalMultiplier: 1.15,
    depositManWon: 5500,
    monthlyRentManWon: 440,
    targetPersona: "Global Tourists & Flagship Pop-up Visitors",
    bestCategoryId: "matcha",
    districtSummary:
      "Dense international tourist and social media traffic. Pairing a 360° tasting island with a dedicated photo zone delivers the fastest CAPEX payback.",
    units: [
      {
        unitId: "101",
        label: "1F Main Boulevard (46m² · $41k Dep / $3.3k Rent)",
        areaPyeong: 14,
        depositManWon: 5500,
        monthlyRentManWon: 440,
        trafficFactor: 1.0,
      },
      {
        unitId: "102",
        label: "Serosu-gil Corner 1F (40m² · $32k Dep / $2.5k Rent)",
        areaPyeong: 12,
        depositManWon: 4200,
        monthlyRentManWon: 330,
        trafficFactor: 0.94,
      },
    ],
  },
];

// 2. STARTUP CATEGORIES WITH DISTINCT FURNITURE & FINANCIALS
interface StartupCategory {
  id: "coffee" | "bakery" | "matcha" | "wine";
  icon: string;
  shortName: string;
  title: string;
  interiorCostManWon: number;
  avgTicketWon: number;
  defaultArrival: number;
  defaultServiceSec: number;
  mainDisplayLabel: string;
  orderDeskLabel: string;
  pickupDeskLabel: string;
  benchLabel: string;
  tableLabels: [string, string, string];
  scenarioTotal: number;
  survivedCount: number;
  layoutRuleNote: string;
}

const CATEGORIES: StartupCategory[] = [
  {
    id: "coffee",
    icon: "☕",
    shortName: "Specialty Cafe",
    title: "Specialty Coffee & Roastery",
    interiorCostManWon: 3800,
    avgTicketWon: 5600,
    defaultArrival: 4.0,
    defaultServiceSec: 20,
    mainDisplayLabel: "Bean & MD Display",
    orderDeskLabel: "Order & POS Bar",
    pickupDeskLabel: "Espresso Pickup Bar",
    benchLabel: "Window Waiting Bench",
    tableLabels: ["2-Top Table A", "2-Top Table B", "Communal Bar C"],
    scenarioTotal: 10000,
    survivedCount: 8420,
    layoutRuleNote:
      "Cafe Circulation Rule: Separate the Bean & MD Display from the Entrance (IN) → Order POS → Espresso Pickup vector to prevent entry bottlenecks.",
  },
  {
    id: "bakery",
    icon: "🥐",
    shortName: "Artisan Bakery",
    title: "Salt Bread & Pastry Bakery",
    interiorCostManWon: 4500,
    avgTicketWon: 9800,
    defaultArrival: 4.5,
    defaultServiceSec: 24,
    mainDisplayLabel: "Central Pastry Tray Island",
    orderDeskLabel: "Tray Checkout POS",
    pickupDeskLabel: "Deck Oven & Packaging Bar",
    benchLabel: "Tray & Tongs Station",
    tableLabels: ["Pastry Rack A", "Tasting Table B", "Pickup Bench C"],
    scenarioTotal: 10000,
    survivedCount: 8640,
    layoutRuleNote:
      "Bakery Circulation Rule: Maintain at least 1.4m of two-way aisle clearance around the central pastry island where guests browse with trays.",
  },
  {
    id: "matcha",
    icon: "🍵",
    shortName: "Flagship Pop-up",
    title: "Matcha & Goods Showroom Pop-up",
    interiorCostManWon: 2400,
    avgTicketWon: 12500,
    defaultArrival: 4.5,
    defaultServiceSec: 18,
    mainDisplayLabel: "360° Goods & Tasting Island",
    orderDeskLabel: "Self Kiosk POS",
    pickupDeskLabel: "Matcha Whisk & Gift Bar",
    benchLabel: "Mirror Photo Zone",
    tableLabels: ["Display Plinth A", "Display Plinth B", "Standing Bar C"],
    scenarioTotal: 10000,
    survivedCount: 8900,
    layoutRuleNote:
      "Pop-up Circulation Rule: Route photo-zone dwell crowds and 360° island browsers away from the Kiosk checkout queue.",
  },
  {
    id: "wine",
    icon: "🍷",
    shortName: "Natural Wine Bar",
    title: "Natural Wine & Grocery Bar",
    interiorCostManWon: 5200,
    avgTicketWon: 24000,
    defaultArrival: 3.0,
    defaultServiceSec: 26,
    mainDisplayLabel: "Oak Barrel Curation Rack",
    orderDeskLabel: "Sommelier Counter",
    pickupDeskLabel: "Glassware & Bottling Bar",
    benchLabel: "Cheese & Charcuterie Case",
    tableLabels: ["Tasting Table A", "Tasting Table B", "Wine Bar Table C"],
    scenarioTotal: 10000,
    survivedCount: 8520,
    layoutRuleNote:
      "Wine Bar Circulation Rule: Expand browsing space in front of the bottle curation rack and widen spacing between tasting tables.",
  },
];

interface DesignConcept {
  id: "express" | "island" | "lounge";
  name: string;
  desc: string;
  displayX: number;
  displayY: number;
  displayW: number;
  displayH: number;
  tablePositions: [Point2D, Point2D, Point2D];
}

const DESIGN_CONCEPTS: DesignConcept[] = [
  {
    id: "express",
    name: "Design A · Express Bar",
    desc: "Direct IN → POS → Pickup vector · Optimized for high-volume takeout",
    displayX: 7.6,
    displayY: 7.6,
    displayW: 3.8,
    displayH: 0.8,
    tablePositions: [
      { x: 0.7, y: 2.5 },
      { x: 0.7, y: 4.1 },
      { x: 9.8, y: 3.7 },
    ],
  },
  {
    id: "island",
    name: "Design B · 360° Island",
    desc: "Central rotary showcase loop · Tailored for bakeries & pop-ups",
    displayX: 4.6,
    displayY: 4.3,
    displayW: 2.8,
    displayH: 1.1,
    tablePositions: [
      { x: 0.7, y: 2.2 },
      { x: 0.7, y: 4.4 },
      { x: 9.8, y: 5.2 },
    ],
  },
  {
    id: "lounge",
    name: "Design C · Lounge Showroom",
    desc: "Maximized window seating & wide aisles · High-dwell showroom",
    displayX: 5.0,
    displayY: 6.2,
    displayW: 2.6,
    displayH: 0.85,
    tablePositions: [
      { x: 0.8, y: 2.2 },
      { x: 0.8, y: 4.2 },
      { x: 9.7, y: 4.5 },
    ],
  },
];

interface ScenarioPreset {
  id: "layout" | "staff" | "both" | "rainy" | "influencer" | "stroller";
  code: string;
  title: string;
  countLabel: string;
  ruleDesc: string;
  arrival: number;
  service: number;
  body: number;
  pickupStaff: number;
}

const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: "both",
    code: "SCN-01",
    title: "Standard Operation",
    countLabel: "3,200 runs",
    ruleDesc: "4.0 arrivals/min · 1 POS + 2 Pickup staff · 0.65m body clearance",
    arrival: 4.0,
    service: 20,
    body: 0.65,
    pickupStaff: 2,
  },
  {
    id: "rainy",
    code: "SCN-02",
    title: "🌧️ Rainy Weekend Surge",
    countLabel: "2,400 runs",
    ruleDesc: "Heavy indoor surge (6.5 arrivals/min) · Simultaneous dwell & queue spike",
    arrival: 6.5,
    service: 22,
    body: 0.65,
    pickupStaff: 2,
  },
  {
    id: "layout",
    code: "SCN-03",
    title: "⚠️ Solo Barista Shift",
    countLabel: "1,400 runs",
    ruleDesc: "Floorplan layout fix only with 1 Pickup staff (testing staff bottleneck)",
    arrival: 4.0,
    service: 20,
    body: 0.65,
    pickupStaff: 1,
  },
  {
    id: "influencer",
    code: "SCN-04",
    title: "📸 Viral Influencer Drop",
    countLabel: "1,200 runs",
    ruleDesc: "Peak 7.5 arrivals/min + 3 veteran Pickup baristas at full capacity",
    arrival: 7.5,
    service: 18,
    body: 0.65,
    pickupStaff: 3,
  },
  {
    id: "staff",
    code: "SCN-05",
    title: "👥 Baseline + Extra Staff",
    countLabel: "1,000 runs",
    ruleDesc: "Keeping unoptimized baseline floorplan while adding +1 Pickup staff",
    arrival: 4.0,
    service: 20,
    body: 0.65,
    pickupStaff: 2,
  },
  {
    id: "stroller",
    code: "SCN-06",
    title: "👶 Stroller & Group Entry",
    countLabel: "800 runs",
    ruleDesc: "Requires 1.20m corridor clearance — tests entrance choke point",
    arrival: 4.0,
    service: 20,
    body: 1.2,
    pickupStaff: 2,
  },
];

type PresetKind = ScenarioPreset["id"] | "custom";

interface StudioState {
  districtId: DistrictProfile["id"];
  selectedUnitId: string;
  customAreaPyeong: number | null;
  customDepositManWon: number | null;
  customRentManWon: number | null;
  parsedLinkSource: string;
  address: string;
  budgetManWon: number;
  categoryId: StartupCategory["id"];
  designId: DesignConcept["id"];
  base: Scene;
  plan: Scene;
  seed: number;
  arrival: number;
  service: number;
  orderStaff: number;
  pickupStaff: number;
  body: number;
  t: number;
  speed: number;
  playing: boolean;
  rev: number;
  results: { base: SimResult; plan: SimResult } | null;
  dirty: boolean;
  preset: PresetKind;
  selected: string;
  hovered: string | null;
  walkMode: boolean;
  players: [Point2D, Point2D];
  roi: RoiBox | null;
  imageRect: { x: number; y: number; w: number; h: number } | null;
  showPlanPreview: boolean;
  lightsOn: boolean;
  acOn: boolean;
  showHeatmap: boolean;
  viewMode: "3d" | "2d";
  threeMode: "proposed" | "baseline";
  isoYawRad: number;
  isoPitchRatio: number;
  isoZoomScale: number;
}

const state: StudioState = {
  districtId: "seongsu",
  selectedUnitId: "101",
  customAreaPyeong: null,
  customDepositManWon: null,
  customRentManWon: null,
  parsedLinkSource: "Naver Map · Seongsu Yeonmujang-gil Matched",
  address: DISTRICTS[0].sampleUrl,
  budgetManWon: 12000,
  categoryId: "coffee",
  designId: "express",
  base: RehearsalCore.makeScene("baseline"),
  plan: RehearsalCore.makeScene("proposed"),
  seed: 42,
  arrival: 4,
  service: 20,
  orderStaff: 1,
  pickupStaff: 2,
  body: 0.65,
  t: 180,
  speed: 25,
  playing: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  rev: 0,
  results: null,
  dirty: true,
  preset: "both",
  selected: "display",
  hovered: null,
  walkMode: false,
  players: [{ x: 4.5, y: 8.1 }, { x: 4.5, y: 8.1 }],
  roi: null,
  imageRect: null,
  showPlanPreview: false,
  lightsOn: true,
  acOn: true,
  showHeatmap: true,
  viewMode: "3d",
  threeMode: "proposed",
  isoYawRad: 0,
  isoPitchRatio: 0.5,
  isoZoomScale: 1.0,
};

function mountShell(): void {
  const root = document.getElementById("root")!;
  root.innerHTML = `
    <!-- TOP BAR (rea.tools style editorial header) -->
    <header class="rea-header">
      <div class="rea-header-inner">
        <div class="rea-brand">
          <a href="#sec-3d-stage" class="rea-logo">REA · Rehearsal</a>
          <span class="rea-tagline">3D Spatial Floorplan & 10,000-Store Reverse Engineering</span>
        </div>
        <nav class="rea-nav" aria-label="Primary Sections">
          <a href="#sec-3d-stage" class="rea-nav-link active">1. 3D Orbit & 10K Swarm</a>
          <a href="#sec-10k-matrix" class="rea-nav-link">2. Live 10,000-Store Wafer</a>
          <a href="#sec-setup" class="rea-nav-link">3. District Link & ROI</a>
          <a href="#sec-simulator" class="rea-nav-link">4. Pre/Post & D3 Lab</a>
        </nav>
        <div class="rea-header-actions">
          <button type="button" class="rea-btn-outline" id="toggleViewModeBtn">📐 2D CAD Blueprint</button>
          <button type="button" class="rea-btn-outline" id="headerExport3DBtn">📦 Export 3D / Snapshot</button>
          <button type="button" class="rea-btn-solid" id="exportBtn">Export Spec (.txt)</button>
        </div>
      </div>
    </header>

    <div class="rea-layout">
      <div class="rea-main-col">
        <!-- SECTION 0: PGRUN.DEV / ISO-GLOW STYLE 3D ROTATABLE FLOORPLAN STAGE (THE CORE HERO) -->
        <section class="rea-section" id="sec-3d-stage" style="padding-top:14px;padding-bottom:18px">
          <div class="pgrun-stage-shell" id="pgrunStageShell">
            <!-- WebGL 3D Canvas Mount -->
            <div class="pgrun-canvas-mount" id="threeStageMount" aria-label="360-degree Interactive 3D Store Floorplan"></div>

            <!-- TOP-LEFT HUD: Brand & Category Switcher (exact pgrun.dev layout) -->
            <div class="pgrun-hud-top-left">
              <div class="pgrun-brand-badge">
                <i class="pgrun-dot" id="pgrunDot"></i>
                <span id="pgrunStageTitle">STORE FLOORPLAN INTERNALS · 360° ORBIT</span>
              </div>
              <div class="pgrun-seg" role="tablist" aria-label="Store Category 3D Floorplan">
                <button type="button" data-three-cat="coffee" class="active">Cafe</button>
                <button type="button" data-three-cat="bakery">Bakery</button>
                <button type="button" data-three-cat="matcha">Pop-Up</button>
                <button type="button" data-three-cat="wine">Wine Bar</button>
              </div>
            </div>

            <!-- TOP-RIGHT HUD: AI Best 10K + 10K Swarm + Export 3D + Revolve + Iso View + Top 2D + POV Cam + Theme -->
            <div class="pgrun-hud-top-right">
              <button type="button" class="pgrun-pill-btn" id="threeOptimizeBtn" title="Auto-Select #1 Highest-Performing Store Layout out of 10,000 Parallel Runs">🏆 <span>AI BEST 10K</span></button>
              <button type="button" class="pgrun-pill-btn active" id="threeSwarmBtn" aria-pressed="true" title="Toggle 10,000-Scenario Parallel Trajectory Swarm">⚡ <span>10K SWARM</span></button>
              <button type="button" class="pgrun-pill-btn" id="threeExportMenuBtn" aria-expanded="false" title="Export 3D Floorplan as Hi-Res Snapshot, Dual Blueprint Sheet, glTF, GLB, OBJ, CSV, or 10K Audit Report">📦 <span>EXPORT 3D</span></button>
              <button type="button" class="pgrun-pill-btn" id="threeRevolveBtn" aria-pressed="false">⟳ <span>REVOLVE</span></button>
              <button type="button" class="pgrun-pill-btn active" id="threeIsoBtn" title="Reset Isometric View (I)">ISO VIEW</button>
              <button type="button" class="pgrun-pill-btn" id="threeTopBtn" title="Top-Down 2D Orthographic View">TOP 2D</button>
              <button type="button" class="pgrun-pill-btn" id="threePovBtn" title="Eye-Level Entrance Customer POV Camera (V)">POV CAM</button>
              <button type="button" class="pgrun-icon-btn" id="threeThemeBtn" aria-label="Toggle Light/Dark Theme" title="Toggle Light / Dark Stage Theme (T)">◐</button>
            </div>

            <!-- FLOATING 3D DESIGN DOCUMENTATION EXPORT DRAWER -->
            <div class="pgrun-export-drawer hidden" id="threeExportDrawer" role="dialog" aria-label="Export 3D Floorplan Documentation">
              <div class="pgrun-exp-head">
                <strong>📦 3D Floorplan CAD &amp; Snapshot Export</strong>
                <button type="button" class="pgrun-exp-close" id="closeExportDrawerBtn" aria-label="Close Export Drawer">✕</button>
              </div>
              <p class="pgrun-exp-desc">
                Export the current 12.0m × 9.0m 3D spatial layout, fixtures, and 10,000-scenario stress-test sheet for design documentation or 3D CAD tools (Blender, Rhino, SketchUp).
              </p>
              <div class="pgrun-exp-grid">
                <button type="button" class="pgrun-exp-btn primary" id="export3DSnapBtn">
                  <strong>📸 Hi-Res Snapshot (.png)</strong>
                  <small>1920×1200 Sheet + Telemetry</small>
                </button>
                <button type="button" class="pgrun-exp-btn primary" id="export3DBlueprintSheetBtn">
                  <strong>📐 Dual Blueprint (.png)</strong>
                  <small>Iso 3D + Ortho 2D + Schedule</small>
                </button>
                <button type="button" class="pgrun-exp-btn" id="export3DGltfBtn">
                  <strong>📦 glTF 2.0 Scene (.gltf)</strong>
                  <small>Standard 3D JSON Hierarchy</small>
                </button>
                <button type="button" class="pgrun-exp-btn" id="export3DGlbBtn">
                  <strong>🧊 Binary Model (.glb)</strong>
                  <small>Compact Single-File 3D Asset</small>
                </button>
                <button type="button" class="pgrun-exp-btn" id="export3DObjBtn">
                  <strong>📐 Wavefront Mesh (.obj)</strong>
                  <small>Metric 1:1 CAD Geometry</small>
                </button>
                <button type="button" class="pgrun-exp-btn" id="export3DCsvBtn">
                  <strong>📊 10K Dataset (.csv)</strong>
                  <small>All 10,000 Store Runs Table</small>
                </button>
                <button type="button" class="pgrun-exp-btn full-span" id="export3DReportBtn">
                  <strong>📑 10,000-Scenario Executive Audit Report (.md)</strong>
                  <small>Full Architectural &amp; 36-Month Survival Engineering Spec</small>
                </button>
              </div>
              <div class="pgrun-exp-status tabular" id="export3DStatusText" role="status">
                Ready · Scale 1.0 unit = 1.0m (12.0m × 9.0m Grid)
              </div>
              <div class="pgrun-exp-actions hidden" id="export3DActionRow">
                <a class="pgrun-exp-action-btn primary" id="export3DDirectLink" href="#" download="rehearsal-floorplan.png">⬇ Save File</a>
                <button type="button" class="pgrun-exp-action-btn" id="export3DCopyBtn">📋 Copy Data</button>
              </div>
              <div class="pgrun-exp-preview hidden" id="export3DPreviewBox">
                <img id="export3DPreviewImg" alt="Exported 3D Floorplan High-Resolution Snapshot Preview" />
              </div>
              <pre class="pgrun-exp-code tabular hidden" id="export3DCodeSnippet"></pre>
            </div>

            <!-- RIGHT FLOATING SCENARIO & LAYOUT STACK (exact pgrun.dev .ctl stack) -->
            <div class="pgrun-ctl-stack" aria-label="3D Floorplan Scenario & Layout Controls">
              <button type="button" class="pgrun-ctl-btn on" data-three-mode="proposed">
                <span>Proposed · Optimized</span><kbd>P</kbd>
              </button>
              <button type="button" class="pgrun-ctl-btn" data-three-mode="baseline">
                <span>Baseline · Entry Choke</span><kbd>B</kbd>
              </button>
              <div class="pgrun-sep"></div>
              <button type="button" class="pgrun-ctl-btn on" data-three-design="express">
                <span>Design A · Express Bar</span><kbd>A</kbd>
              </button>
              <button type="button" class="pgrun-ctl-btn" data-three-design="island">
                <span>Design B · 360° Island</span><kbd>S</kbd>
              </button>
              <button type="button" class="pgrun-ctl-btn" data-three-design="lounge">
                <span>Design C · Lounge</span><kbd>C</kbd>
              </button>
              <div class="pgrun-sep"></div>
              <button type="button" class="pgrun-ctl-btn on" data-three-scn="both">
                <span>Standard Peak (3.2k)</span><kbd>1</kbd>
              </button>
              <button type="button" class="pgrun-ctl-btn" data-three-scn="rainy">
                <span>Rainy Surge (2.4k)</span><kbd>2</kbd>
              </button>
              <button type="button" class="pgrun-ctl-btn" data-three-scn="layout">
                <span>Solo Barista (1.4k)</span><kbd>3</kbd>
              </button>
              <button type="button" class="pgrun-ctl-btn" data-three-scn="influencer">
                <span>Viral Drop (1.2k)</span><kbd>4</kbd>
              </button>
              <button type="button" class="pgrun-ctl-btn" data-three-scn="staff">
                <span>Extra Staff (1.0k)</span><kbd>5</kbd>
              </button>
              <button type="button" class="pgrun-ctl-btn" data-three-scn="stroller">
                <span>Stroller 1.2m (800)</span><kbd>6</kbd>
              </button>
              <div class="pgrun-sep"></div>
              <button type="button" class="pgrun-ctl-btn" id="threeRotateFurnitureBtn">
                <span>Rotate Fixture 90°</span><kbd>R</kbd>
              </button>
            </div>

            <!-- BOTTOM-LEFT NARRATIVE INSPECTOR CARD (exact pgrun.dev #info box) -->
            <div class="pgrun-info-card" id="threeInfoCard">
              <h2 id="threeInfoTitle">STORE FLOORPLAN INTERNALS · DRAG TO ORBIT 360°</h2>
              <div class="pgrun-info-sub" id="threeInfoSub">Left-Drag: 360° Orbit · Scroll: Zoom · Shift+Drag: Move Fixture</div>
              <p id="threeInfoBody">
                Hover over the Order POS, Pickup Bar, Main Display Island, or 24-cell Shared Walkway Matrix to inspect real-time LED queue buffers and spatial bottlenecks across 10,000 parallel store scenarios.
              </p>
            </div>

            <!-- BOTTOM TELEMETRY & SHORTCUT BAR -->
            <div class="pgrun-bottom-bar">
              <div class="pgrun-hint">
                Drag: 360° Orbit · Shift+Drag: Move · Keys 1–6 Scenarios · P/B Compare · R Rotate
              </div>
              <div class="pgrun-readout tabular" id="threeLiveReadout">
                [AFTER] Wait 18s (▼87s) · 10m Done 47 · Walk 16.5m · Survived 8,420/10K
              </div>
            </div>
          </div>
        </section>

        <!-- SECTION 0.5: LIVE 10,000-STORE PARALLEL EXECUTION WAFER MATRIX COMMAND CENTER -->
        <section class="rea-section" id="sec-10k-matrix" style="padding-top:4px;padding-bottom:18px">
          <div class="tenk-command-shell">
            <div class="tenk-top-bar">
              <div class="tenk-title-group">
                <span class="tenk-live-pill">
                  <i class="tenk-pulse-dot"></i>
                  <span id="tenKExecCounter">10,000 / 10,000 PARALLEL RUNS</span>
                </span>
                <h2>10,000-Scenario Wafer Matrix (100×100 Stores)</h2>
                <p class="tenk-engine-note">Spatial preview [assumed]: cell economics and trajectory packets are illustrative. Verified 36-month engine results are reported separately below.</p>
                <div class="tenk-engine-status" role="status" id="backendEngineStatus">Connecting to the 36-month engine…</div>
                <button type="button" class="tenk-mode-btn" id="refreshBackendEngineBtn">Run 36-month engine</button>
              </div>
              <div class="tenk-controls-group">
                <div class="tenk-mode-tabs" role="tablist" aria-label="10,000 Wafer Matrix View Mode">
                  <button type="button" class="tenk-mode-btn active" data-wafer-mode="proposed">Proposed (After)</button>
                  <button type="button" class="tenk-mode-btn" data-wafer-mode="baseline">Baseline (Before)</button>
                  <button type="button" class="tenk-mode-btn" data-wafer-mode="delta">Rescued Delta (+Saved)</button>
                  <button type="button" class="tenk-mode-btn" data-wafer-mode="families">500 Families × 20</button>
                </div>
                <button type="button" class="tenk-resweep-btn" id="resweepTenKBtn">⚡ Re-Sweep 10,000 Scenarios</button>
              </div>
            </div>

            <div class="tenk-kpi-strip">
              <div class="tenk-kpi-card">
                <span>Parallel Execution Engine</span>
                <strong class="tabular orange" id="tenKKpiExec">10,000 / 10,000</strong>
                <small id="tenKKpiExecSub">500 AI Design Families × 20 Stress Variants</small>
              </div>
              <div class="tenk-kpi-card">
                <span>Proposed Layout Survival</span>
                <strong class="tabular orange" id="tenKKpiProp">8,420 Stores (84.2%)</strong>
                <small id="tenKKpiPropSub">Passed Wait &lt; 60s &amp; Corridor Clearance</small>
              </div>
              <div class="tenk-kpi-card">
                <span>Baseline Choke Survival</span>
                <strong class="tabular" id="tenKKpiBase">3,140 Stores (31.4%)</strong>
                <small>6,860 Stores Collapsed by Entry Bottleneck</small>
              </div>
              <div class="tenk-kpi-card">
                <span>Stores Rescued by Layout</span>
                <strong class="tabular orange" id="tenKKpiRescued">+5,280 Stores Saved</strong>
                <small>Reversed from Bankruptcy / Gridlock to Profit</small>
              </div>
            </div>

            <div class="tenk-body">
              <div class="tenk-canvas-wrap">
                <canvas
                  id="tenKWaferCanvas"
                  role="img"
                  aria-label="Interactive 100 by 100 Wafer Matrix showing 10,000 parallel simulated stores. Hover to inspect any store cell or click to load into 3D stage."
                ></canvas>
              </div>
              <div class="tenk-inspector" id="tenKInspectorCard">
                <div>
                  <div class="tenk-insp-head">
                    <div>
                      <div class="tenk-insp-id tabular" id="inspRunTitle">STORE RUN #01,421 / 10,000</div>
                      <div class="tenk-insp-sub tabular" id="inspFamilySub">AI Design Family #072 · Variant #01 · Row 15, Col 21</div>
                    </div>
                    <span class="tenk-insp-badge" id="inspStatusBadge">SURVIVED · RESCUED</span>
                  </div>
                  <div class="tenk-filter-row" role="group" aria-label="Filter 10,000 Wafer Cells">
                    <button type="button" class="tenk-filter-chip active" data-wafer-filter="all">All 10K</button>
                    <button type="button" class="tenk-filter-chip" data-wafer-filter="rescued">★ Rescued</button>
                    <button type="button" class="tenk-filter-chip" data-wafer-filter="top100">🏆 Top 1%</button>
                    <button type="button" class="tenk-filter-chip" data-wafer-filter="failed">⚠ Choked</button>
                  </div>
                  <div class="tenk-insp-grid" style="margin-top:8px">
                    <div class="tenk-insp-metric">
                      <span>Stress Regime</span>
                      <strong class="tabular" id="inspRegime">SCN-01 · Standard Ops</strong>
                    </div>
                    <div class="tenk-insp-metric">
                      <span>Peak Inflow / Cap</span>
                      <strong class="tabular" id="inspArrival">4.6 / 5.1 pax/m</strong>
                    </div>
                    <div class="tenk-insp-metric">
                      <span>Wait (Before → After)</span>
                      <strong class="tabular" id="inspWaitDelta">98s → 19s (▼79s)</strong>
                    </div>
                    <div class="tenk-insp-metric">
                      <span>Aisle / Monthly Net</span>
                      <strong class="tabular" id="inspFinancial">1.18m · +$8.4k/mo</strong>
                    </div>
                  </div>
                  <div class="tenk-spark-wrap">
                    <canvas
                      id="inspCashflowCanvas"
                      width="280"
                      height="68"
                      role="img"
                      aria-label="36-Month Cumulative Cashflow and Break-Even Trajectory for Selected Store Run"
                    ></canvas>
                  </div>
                </div>
                <div class="tenk-insp-reason" id="inspReasonBox">
                  Diagnosis: Rescued by Proposed Layout &amp; 16-Slot Queue Buffer
                </div>
                <div class="tenk-jump-row">
                  <label for="inspJumpInput" class="tenk-jump-label">Run #</label>
                  <input
                    type="number"
                    id="inspJumpInput"
                    class="tenk-jump-input tabular"
                    min="1"
                    max="10000"
                    value="1421"
                    aria-label="Jump to Store Run Number (1 to 10,000)"
                  />
                  <button type="button" class="tenk-jump-btn" id="inspJumpBtn">Jump</button>
                  <button type="button" class="tenk-jump-btn tour" id="tenKTourBtn" aria-pressed="false" title="Auto-Tour Landmark Scenarios Across 10,000 Stores">▶ Tour 10K</button>
                </div>
                <div class="tenk-bench-row" role="group" aria-label="Jump to Benchmark Store Runs">
                  <button type="button" class="tenk-bench-btn" data-wafer-bench="optimal">🏆 #1 Optimal</button>
                  <button type="button" class="tenk-bench-btn" data-wafer-bench="rescued">⚡ Top Rescued</button>
                  <button type="button" class="tenk-bench-btn" data-wafer-bench="worst">🚨 Worst Choke</button>
                </div>
                <button type="button" class="tenk-load-btn" id="loadCellTo3DBtn">
                  Load Store #01,421 into 3D Floorplan Stage ↑
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- SECTION 1: HERO & COMMERCIAL DISTRICT + CATEGORY ANALYSIS (rea.tools 2-col layout) -->
        <section class="rea-section" id="sec-setup">
          <div class="rea-two-col">
            <!-- Left: Editorial Headline + Commercial District Evidence -->
            <div class="rea-col-left">
              <div class="rea-kicker">Commercial District & Floorplan Rehearsal</div>
              <h1 class="rea-h1">Before signing the lease,<br/>rehearse 10,000 store scenarios in 3D.</h1>
              <p class="rea-lead" id="districtLeadText">
                Paste any map or commercial property link to benchmark foot traffic, rent, and 10,000 parallel layout stress tests before committing capital.
              </p>

              <!-- LIVE COMMERCIAL DISTRICT ANALYSIS TABLE -->
              <div class="rea-evidence-box">
                <div class="rea-evidence-head">
                  <span class="rea-badge-dark" id="districtBadgeTitle">📍 Seongsu Yeonmujang-gil District</span>
                  <span class="tabular rea-survival-pill" id="heroScenarioTotal">8,420 / 10,000 Store Scenarios Survived</span>
                </div>
                <div class="rea-evidence-grid">
                  <div class="rea-ev-item">
                    <span class="ev-label">Daily Foot Traffic</span>
                    <strong class="ev-val tabular" id="evFootTraffic">42,800 / day</strong>
                    <span class="ev-sub" id="evPeakHours">Peak: Wknd 13:00–17:30</span>
                  </div>
                  <div class="rea-ev-item">
                    <span class="ev-label">Avg Deposit & Monthly Rent</span>
                    <strong class="ev-val tabular" id="evRentInfo">$38k Dep / $2.8k/mo</strong>
                    <span class="ev-sub" id="evAreaInfo">1F 50m² (12.0m × 9.0m)</span>
                  </div>
                  <div class="rea-ev-item">
                    <span class="ev-label">Initial CAPEX (Deposit + Fit-out)</span>
                    <strong class="ev-val tabular" id="evSetupCost">$66k Total</strong>
                    <span class="ev-sub tabular" id="budgetRemainBanner">$24k Operating Reserve Secured</span>
                  </div>
                  <div class="rea-ev-item">
                    <span class="ev-label">Est. Monthly Net Profit</span>
                    <strong class="ev-val tabular ev-profit" id="evMonthlyProfit">+$5,200 / mo</strong>
                    <span class="ev-sub" id="evTargetPersona">Core: Gen-Z Pop-up & Coffee Crowd</span>
                  </div>
                </div>
                <!-- D3 10,000-Store Parallel Simulation Matrix -->
                <div class="d3-tenk-box">
                  <div class="d3-tenk-head">
                    <strong>📊 10,000 Parallel Store Scenarios Survival Matrix (D3.js)</strong>
                    <div class="d3-tenk-legend">
                      <span><i style="background:#ea580c"></i>Survived</span>
                      <span><i style="background:#fbbf24"></i>Queue Overload</span>
                      <span><i style="background:#3f3f46"></i>Route Blocked</span>
                    </div>
                  </div>
                  <div id="tenKDistributionChart"></div>
                </div>
              </div>
            </div>

            <!-- Right: Dark Terminal Setup Card (rea.tools signature card) -->
            <div class="rea-col-right">
              <div class="rea-step-title">1. Paste Property Link & Configure Capital / Category</div>
              <div class="rea-terminal-card">
                <div class="rea-terminal-bar">
                  <div class="rea-dots"><i></i><i></i><i></i></div>
                  <span>store-rehearsal.config</span>
                  <span class="tabular" id="calcBadge" role="status">Seed #42 · Ready</span>
                </div>
                <div class="rea-terminal-body">
                  <label class="rea-term-label" for="addressInput">
                    <span>&gt; 1. Paste Map / Property Listing URL (Naver · Kakao · Nemo · Zigbang)</span>
                  </label>
                  <div class="rea-link-input-row">
                    <input
                      id="addressInput"
                      type="text"
                      class="rea-term-input"
                      value="https://naver.me/seongsu-yeonmu42-1f"
                      placeholder="Paste https://naver.me/... or commercial property link"
                      aria-label="Property Listing URL or Address"
                    />
                    <button type="button" class="rea-link-parse-btn" id="parseLinkBtn">Analyze Link</button>
                  </div>
                  <div class="rea-district-chips" role="group" aria-label="Sample Property Links" style="margin-top:6px">
                    <button type="button" class="rea-term-chip active" data-dist-id="seongsu">🔗 naver.me/seongsu-yeonmu</button>
                    <button type="button" class="rea-term-chip" data-dist-id="yeonnam">🔗 kko.to/yeonnam-forest</button>
                    <button type="button" class="rea-term-chip" data-dist-id="hannam">🔗 nemo.kr/hannam-cafe</button>
                    <button type="button" class="rea-term-chip" data-dist-id="sinsa">🔗 zigbang/sinsa-garosu</button>
                  </div>
                  <div class="rea-parsed-box" id="parsedLinkBox">
                    <div class="rea-parsed-status" id="parsedLinkStatus">
                      ✅ Link Parsed · Select Floor Suite at Seongsu Yeonmujang-gil 42:
                    </div>
                    <div class="rea-unit-chips" id="parsedUnitChips" role="group" aria-label="Available Suites"></div>
                  </div>

                  <label class="rea-term-label" for="budgetSlider" style="margin-top:12px">
                    <span>&gt; 2. Total Startup Capital (Lease Deposit + Interior Fit-out)</span>
                    <strong class="tabular" id="budgetDisplayLabel" style="color:#fb923c">$90,000 (₩120M)</strong>
                  </label>
                  <input
                    id="budgetSlider"
                    type="range"
                    min="6000"
                    max="25000"
                    step="500"
                    value="12000"
                    class="rea-term-slider"
                  />

                  <div class="rea-term-label" style="margin-top:12px">
                    <span>&gt; 3. Select Store Category (Auto-loads 3D Fixtures & Flow Rules)</span>
                  </div>
                  <div class="rea-cat-grid" id="categoryGrid" role="group" aria-label="Store Category Selection"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <hr class="rea-divider" />

        <!-- SECTION 2: INTERACTIVE FLOORPLAN & SCENARIO LAB -->
        <section class="rea-section" id="sec-simulator">
          <div class="rea-sec-header">
            <div>
              <div class="rea-kicker">Interactive Floorplan & 10,000 Store Scenario Lab</div>
              <h2 class="rea-h2" id="activeCategoryHeading">☕ Specialty Coffee & Roastery — 10,000-Scenario Comparison</h2>
            </div>
            <div class="rea-env-controls">
              <span class="rea-orbit-hint" id="isoAngleBadge">🔄 Drag Orbit: 0°</span>
              <button type="button" class="rea-btn-outline" id="resetIsoOrbitBtn">Reset Iso Angle</button>
              <button type="button" class="rea-btn-outline active" id="toggleHeatmapBtn">🔥 Heatmap ON</button>
              <button type="button" class="rea-btn-outline active" id="toggleLightsBtn">💡 Lighting ON</button>
              <button type="button" class="rea-btn-outline active" id="toggleAcBtn">❄️ HVAC Airflow ON</button>
            </div>
          </div>

          <!-- SCENARIO & DESIGN RULE EXPLANATION BAR -->
          <div class="rea-rule-strip">
            <div class="rea-rule-col">
              <div class="rea-step-title">1. Select Interior Spatial Layout</div>
              <div class="rea-design-row" id="designTabs" role="group" aria-label="Interior Layout Presets"></div>
              <p class="rea-rule-note" id="layoutRuleText"></p>
            </div>
            <div class="rea-rule-col">
              <div class="rea-step-title">2. Stress-Test 6 Key Regimes Across 10,000 Parallel Store Runs</div>
              <div class="rea-scn-row" id="scenarioDeckGrid" role="group" aria-label="Scenario Presets"></div>
              <p class="rea-rule-note tabular" id="scenarioRuleText"></p>
            </div>
          </div>

          <!-- SIDE-BY-SIDE INTERACTIVE FLOORPLAN STAGE -->
          <div class="rea-stage-card" id="studio-workspace">
            <div class="compare">
              <!-- LEFT: BASELINE -->
              <section class="world">
                <div class="world-top">
                  <div>
                    <span class="world-tag">BEFORE · Unoptimized Entry Choke (1 Pickup Staff)</span>
                    <h3>Baseline Floorplan</h3>
                  </div>
                  <span class="route-status" id="baseRoute">Route Clear</span>
                </div>
                <div class="canvasbox">
                  <canvas
                    id="baseCanvas"
                    role="img"
                    aria-label="Baseline store spatial simulation canvas"
                  ></canvas>
                </div>
                <div class="world-stats">
                  <div class="w-stat">
                    <div class="w-stat-head">
                      <div>
                        <span class="w-label">Mean Wait · Queue Curve (D3)</span>
                        <strong class="w-num tabular" id="baseWait">–</strong><span class="w-unit">s</span>
                      </div>
                      <small class="w-sub" id="baseP90"></small>
                    </div>
                    <div class="d3-chart-slot" id="baseWaitChart"></div>
                  </div>
                  <div class="w-stat">
                    <div class="w-stat-head">
                      <div>
                        <span class="w-label">10m Served · Throughput (D3)</span>
                        <strong class="w-num tabular" id="baseDone">–</strong><span class="w-unit">pax</span>
                      </div>
                      <small class="w-sub" id="baseActive"></small>
                    </div>
                    <div class="d3-chart-slot" id="baseDoneChart"></div>
                  </div>
                  <div class="w-stat">
                    <div class="w-stat-head">
                      <div>
                        <span class="w-label">Walk Distance · Segments (D3)</span>
                        <strong class="w-num tabular" id="baseWalk">–</strong><span class="w-unit">m</span>
                      </div>
                      <small class="w-sub" id="baseNote">POS 1 · Pickup 1</small>
                    </div>
                    <div class="d3-chart-slot" id="baseWalkChart"></div>
                    <span class="hidden" id="baseQueuePeak"></span>
                  </div>
                </div>
              </section>

              <!-- RIGHT: PROPOSED INTERACTIVE -->
              <section class="world proposed">
                <div class="world-top">
                  <div>
                    <span class="world-tag emerald">AFTER · Drag Fixtures or Orbit 360°</span>
                    <h3 id="proposedWorldTitle">Proposed Floorplan (Design A)</h3>
                  </div>
                  <span class="route-status" id="planRoute">Route Clear</span>
                </div>
                <div class="canvasbox">
                  <canvas
                    id="planCanvas"
                    role="img"
                    tabindex="0"
                    aria-label="Interactive proposed floorplan. Drag fixtures to reposition or drag empty floor to rotate 360 degrees."
                  ></canvas>
                  <div class="canvas-floating-tools">
                    <div class="object-chips" role="group" aria-label="Quick Fixture Select">
                      <button type="button" class="obj-chip active" data-select-obj="display">Main Display</button>
                      <button type="button" class="obj-chip" data-select-obj="table-a">Table A</button>
                      <button type="button" class="obj-chip" data-select-obj="table-b">Table B</button>
                      <button type="button" class="obj-chip" data-select-obj="table-c">Table C</button>
                    </div>
                    <div class="canvas-tool-btns">
                      <button type="button" class="rea-mini-btn" id="rotateObjBtn">↻ Rotate 90°</button>
                      <button type="button" class="rea-mini-btn" id="addBoothBtn">+ Add Fixture</button>
                      <button type="button" class="rea-mini-btn" id="removeCustomBtn">Clear</button>
                      <button type="button" class="rea-mini-btn" id="resetSceneBtn">Reset</button>
                    </div>
                  </div>
                </div>
                <div class="world-stats">
                  <div class="w-stat">
                    <div class="w-stat-head">
                      <div>
                        <span class="w-label">Mean Wait · Queue Curve (D3)</span>
                        <strong class="w-num tabular" id="planWait">–</strong><span class="w-unit">s</span>
                        <span class="delta-tag" id="waitDeltaTag"></span>
                      </div>
                      <small class="w-sub" id="planP90"></small>
                    </div>
                    <div class="d3-chart-slot" id="planWaitChart"></div>
                  </div>
                  <div class="w-stat">
                    <div class="w-stat-head">
                      <div>
                        <span class="w-label">10m Served · Throughput (D3)</span>
                        <strong class="w-num tabular" id="planDone">–</strong><span class="w-unit">pax</span>
                        <span class="delta-tag" id="doneDeltaTag"></span>
                      </div>
                      <small class="w-sub" id="planActive"></small>
                    </div>
                    <div class="d3-chart-slot" id="planDoneChart"></div>
                  </div>
                  <div class="w-stat">
                    <div class="w-stat-head">
                      <div>
                        <span class="w-label">Walk Distance · Segments (D3)</span>
                        <strong class="w-num tabular" id="planWalk">–</strong><span class="w-unit">m</span>
                        <span class="delta-tag" id="walkDeltaTag"></span>
                      </div>
                      <small class="w-sub" id="planNote"></small>
                    </div>
                    <div class="d3-chart-slot" id="planWalkChart"></div>
                    <span class="hidden" id="planQueuePeak"></span>
                  </div>
                </div>
              </section>
            </div>

            <!-- PLAYBACK & WALK CONTROLS BAR -->
            <div class="rea-play-controls">
              <div class="rea-play-left">
                <button class="rea-btn-solid" id="playBtn" type="button">Pause</button>
                <button class="rea-btn-outline" id="restartBtn" type="button">Restart</button>
                <span class="clock tabular" id="clock">03:00 / 10:00</span>
                <input
                  type="range"
                  id="timeline"
                  min="0"
                  max="600"
                  step="1"
                  value="180"
                  aria-label="Simulation Timeline"
                />
                <select class="speed" id="speed" aria-label="Playback Speed">
                  <option value="10">10x</option>
                  <option value="25" selected>25x</option>
                  <option value="50">50x</option>
                </select>
                <button class="rea-btn-outline" id="seedBtn" type="button">
                  Seed #<span id="seedNum">42</span> ↻
                </button>
              </div>

              <div class="rea-walk-right">
                <button class="rea-btn-outline" id="walkBtn" type="button">🚶 Walk Avatar</button>
                <div class="dpad" id="walkDpad" role="group" aria-label="Avatar D-Pad">
                  <button type="button" class="dpad-btn" data-move="up" aria-label="Move Up">▲</button>
                  <button type="button" class="dpad-btn" data-move="left" aria-label="Move Left">◀</button>
                  <button type="button" class="dpad-btn" data-move="down" aria-label="Move Down">▼</button>
                  <button type="button" class="dpad-btn" data-move="right" aria-label="Move Right">▶</button>
                </div>
                <span class="rea-walk-hint" id="walkHint">WASD / Arrow Keys</span>
              </div>
            </div>

            <!-- FINE PARAMETER BAR -->
            <div class="rea-fine-bar">
              <div class="fine-item">
                <label for="arrivals">Arrival Rate <strong class="tabular" id="arrivalValue">4.0/m</strong></label>
                <input type="range" id="arrivals" min="0" max="8" step="0.5" value="4" />
              </div>
              <div class="fine-item">
                <label for="service">Service Time <strong class="tabular" id="serviceValue">20s</strong></label>
                <input type="range" id="service" min="8" max="45" step="1" value="20" />
              </div>
              <div class="fine-item">
                <label for="pickupStaff">Pickup Staff <strong class="tabular" id="staffValue">2</strong></label>
                <input type="range" id="pickupStaff" min="1" max="3" step="1" value="2" />
                <span class="hidden" id="staffCost"></span>
              </div>
              <div class="fine-item">
                <label for="bodyWidth">Aisle Clearance</label>
                <select id="bodyWidth">
                  <option value="0.65">Solo Guest (0.65m)</option>
                  <option value="1.00">Shopping Bags (1.00m)</option>
                  <option value="1.20">Stroller / Group (1.20m)</option>
                </select>
              </div>
              <div class="fine-item">
                <label id="selectedObjTitle">Fixture Coord (m)</label>
                <div style="display:flex;gap:4px">
                  <input type="number" id="displayX" min="0" max="11" step="0.1" value="7.6" aria-label="Fixture X" />
                  <input type="number" id="displayY" min="0" max="8" step="0.1" value="7.6" aria-label="Fixture Y" />
                </div>
              </div>
            </div>

            <!-- INSIGHT RESULT CALLOUT -->
            <div class="rea-insight-bar" id="insight" aria-live="polite">
              <strong>Wait time reduced by 87s · +20 extra orders served per 10 mins</strong>
              <span class="muted">Combined effect of clearing entrance choke and optimizing pickup bar</span>
            </div>
          </div>
        </section>

        <hr class="rea-divider" />

        <!-- SECTION 3: FLOORPLAN UPLOAD & CALIBRATION (2-column rea.tools style) -->
        <section class="rea-section" id="floorplan-studio">
          <div class="rea-two-col">
            <div class="rea-col-left">
              <div class="rea-kicker">Blueprint Import & Field Calibration</div>
              <h2 class="rea-h2">Custom Blueprint Import & Soft-Opening Calibration</h2>
              <p class="rea-lead">
                Draw a bounding box over any uploaded CAD blueprint or site photo to inject a custom 3D fixture directly into the 12.0m × 9.0m spatial stage.
              </p>

              <div class="rea-evidence-box" style="margin-top:14px">
                <div class="rea-step-title">Soft-Opening Field Telemetry Calibration</div>
                <div class="calibration-grid">
                  <label for="obsArrivalsInput">
                    Observed Arrivals (pax / min)
                    <input type="number" id="obsArrivalsInput" min="0.5" max="15" step="0.1" value="4.4" />
                  </label>
                  <label for="obsWaitInput">
                    Observed Queue Wait (sec)
                    <input type="number" id="obsWaitInput" min="1" max="300" step="1" value="22" />
                  </label>
                </div>
                <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
                  <button type="button" class="rea-btn-solid" id="applyCalibrationBtn">
                    Calibrate Simulation Engine
                  </button>
                  <span class="tabular" id="calibrationResultBox" style="font-size:12px;color:#475569">
                    Predicted Wait: <strong id="calPredWait">18s</strong>
                  </span>
                </div>

                <div style="display:flex;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0">
                  <button class="rea-btn-outline" id="previewPlanBtn" type="button">Preview Spec Sheet</button>
                  <button class="rea-btn-outline" id="jsonBtn" type="button">Export Scenario JSON</button>
                </div>
                <div class="plan-preview hidden" id="planPreviewBox" style="margin-top:10px">
                  <pre id="planPreviewText"></pre>
                </div>
              </div>
            </div>

            <div class="rea-col-right">
              <div class="rea-step-title">Drag Bounding Box on Blueprint to Add 3D Fixture</div>
              <div class="rea-stage-card" style="padding:16px;flex:1;display:flex;flex-direction:column;justify-content:space-between">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
                  <button type="button" class="rea-btn-outline" id="loadSampleBlueprintBtn">Load Sample CAD</button>
                  <input id="imageFile" type="file" accept="image/png,image/jpeg" aria-label="Upload Blueprint Image" style="font-size:12px" />
                </div>
                <canvas
                  id="imageCanvas"
                  role="img"
                  aria-label="Drag a region on the blueprint to place a new 3D fixture"
                ></canvas>
                <label class="checkrow">
                  <input type="checkbox" id="presenceConfirm" checked />
                  <span>Map bounding box into a physical fixture inside the 12.0m × 9.0m store floorplan.</span>
                </label>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px">
                  <span class="status tabular" id="imageStatus">Drag on blueprint to define fixture footprint</span>
                  <button class="rea-btn-solid" id="applyBox" type="button" disabled>Inject into 3D Stage ↑</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- RIGHT STICKY "On this page" RAIL (exact rea.tools navigation rail) -->
      <aside class="rea-toc" aria-label="On this page">
        <div class="rea-toc-title">On this page</div>
        <a href="#sec-3d-stage" class="rea-toc-link active">1. 3D Orbit & 10K Swarm</a>
        <a href="#sec-10k-matrix" class="rea-toc-link">2. Live 10,000-Store Wafer</a>
        <a href="#sec-setup" class="rea-toc-link">3. District & Capital ROI</a>
        <a href="#sec-simulator" class="rea-toc-link">4. Pre/Post & D3 Lab</a>
        <a href="#floorplan-studio" class="rea-toc-link">5. Blueprint & Calibrate</a>
      </aside>
    </div>
  `;
}

function getActiveDistrict(): DistrictProfile {
  return (
    DISTRICTS.find((d) => d.id === state.districtId) || DISTRICTS[0]
  );
}

function getActiveCategory(): StartupCategory {
  return (
    CATEGORIES.find((c) => c.id === state.categoryId) || CATEGORIES[0]
  );
}

function getActiveDesign(): DesignConcept {
  return (
    DESIGN_CONCEPTS.find((d) => d.id === state.designId) || DESIGN_CONCEPTS[0]
  );
}

function getSelectedObject(): SceneObject {
  return (
    state.plan.objects.find((o) => o.id === state.selected && o.movable) ||
    state.plan.objects.find((o) => o.id === "display") ||
    state.plan.objects.find((o) => o.movable) ||
    state.plan.objects[0]
  );
}

function formatManWon(manWon: number): string {
  const usdK = Math.round((manWon * 10000) / 1330000);
  return `$${usdK.toLocaleString("en-US")}k`;
}

function formatShortWon(manWon: number): string {
  const usdK = Math.round((manWon * 10000) / 1330000);
  return `$${usdK.toLocaleString("en-US")}k`;
}

function round(n: number | null | undefined, d = 0): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(d) : "–";
}

function observed(r: SimResult | null | undefined): number | null {
  return typeof r?.meanWaitSec === "number" && Number.isFinite(r.meanWaitSec)
    ? r.meanWaitSec
    : null;
}

function getConfig(pickupStaff: number): SimConfig {
  return {
    arrivalsPerMin: state.arrival,
    orderStaff: state.orderStaff,
    pickupStaff,
    serviceSec: state.service,
    seed: state.seed,
    duration: 600,
    bodyWidth: state.body,
  };
}

function applyCategoryAndDesignToScene(): void {
  const cat = getActiveCategory();
  const des = getActiveDesign();

  for (const sc of [state.base, state.plan]) {
    const disp = sc.objects.find((o) => o.id === "display");
    if (disp) disp.koLabel = cat.mainDisplayLabel;
    const ord = sc.objects.find((o) => o.id === "order-desk");
    if (ord) ord.koLabel = cat.orderDeskLabel;
    const pick = sc.objects.find((o) => o.id === "pickup-desk");
    if (pick) pick.koLabel = cat.pickupDeskLabel;
    const ben = sc.objects.find((o) => o.id === "bench");
    if (ben) ben.koLabel = cat.benchLabel;
    ["table-a", "table-b", "table-c"].forEach((tid, idx) => {
      const tObj = sc.objects.find((o) => o.id === tid);
      if (tObj) tObj.koLabel = cat.tableLabels[idx];
    });
  }

  const planDisp = state.plan.objects.find((o) => o.id === "display");
  if (planDisp) {
    planDisp.w = des.displayW;
    planDisp.h = des.displayH;
    planDisp.x = des.displayX;
    planDisp.y = des.displayY;
  }
  const tableIds = ["table-a", "table-b", "table-c"];
  tableIds.forEach((tid, idx) => {
    const tObj = state.plan.objects.find((o) => o.id === tid);
    if (tObj && des.tablePositions[idx]) {
      tObj.x = des.tablePositions[idx].x;
      tObj.y = des.tablePositions[idx].y;
    }
  });
}

function buildCrewPlanText(): string {
  if (!state.results) return "";
  const r = state.results.plan;
  const b = state.results.base;
  const dist = getActiveDistrict();
  const cat = getActiveCategory();
  const des = getActiveDesign();
  const o = getSelectedObject();
  const totalSetup = dist.depositManWon + cat.interiorCostManWon;
  return [
    `[Rehearsal Commercial District & Spatial Simulation Action Plan]`,
    `• District / Address: ${state.address} (Daily Foot Traffic: ${dist.dailyFootTraffic.toLocaleString("en-US")} pax/day)`,
    `• Capital Allocation: Budget ${formatManWon(state.budgetManWon)} → Initial CAPEX ${formatManWon(totalSetup)} (Deposit ₩${dist.depositManWon}M + Fit-out ₩${cat.interiorCostManWon}M)`,
    `• Selected Category / Layout: ${cat.title} / ${des.name}`,
    `• Key Fixture (${o.koLabel || o.label}): X=${o.x.toFixed(1)}m, Y=${o.y.toFixed(1)}m (${o.w.toFixed(1)}×${o.h.toFixed(1)}m)`,
    `• 10-Min Peak Rehearsal Comparison (Seed #${state.seed}):`,
    `  - Mean Wait Time: Baseline ${round(observed(b), 1)}s → Proposed ${round(observed(r), 1)}s`,
    `  - 10-Min Orders Served: Baseline ${b.completed} pax → Proposed ${r.completed} pax`,
    `  - Walk Path Distance: Baseline ${round(b.walkDistance, 1)}m → Proposed ${round(r.walkDistance, 1)}m`,
  ].join("\n");
}

function initStudio(): void {
  mountShell();

  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;

  const canvases = [
    $<HTMLCanvasElement>("baseCanvas"),
    $<HTMLCanvasElement>("planCanvas"),
  ];
  const views: [IsoView | null, IsoView | null] = [null, null];
  let last = 0;
  let frameCounter = 0;
  let debounce = 0;
  let drag: { id: string; dx: number; dy: number } | null = null;
  let orbitDrag: {
    startX: number;
    startY: number;
    startYaw: number;
    startPitch: number;
  } | null = null;
  let imageDrag: Point2D | null = null;
  let blueprintSource: HTMLImageElement | HTMLCanvasElement | null = null;

  const threeStage = new ThreeFloorplanStage({
    container: $("threeStageMount"),
    onSelectObject: (id) => {
      if (id) {
        state.selected = id;
        syncControls();
        drawAll();
      }
    },
    onMoveObstacle: (id, x, y) => {
      state.selected = id;
      state.threeMode = "proposed";
      setPosition(x, y, false);
    },
    onHoverPart: (info) => {
      if (info) {
        $("threeInfoTitle").textContent = info.title;
        $("threeInfoSub").textContent = info.subtitle;
        $("threeInfoBody").textContent = info.body;
      } else {
        const dist = getActiveDistrict();
        const cat = getActiveCategory();
        $("threeInfoTitle").textContent = `STORE FLOORPLAN INTERNALS · ${dist.name} (${cat.title})`;
        $("threeInfoSub").textContent =
          "Left-drag: 360° Orbit · Scroll: Zoom · Drag Furniture: Live Floorplan Edit";
        $("threeInfoBody").textContent =
          "Hover over the POS Order Bar, Pickup Bar, Main Display, or Tables on the 3D floorplan to inspect the live 16-slot LED queue buffer and bottleneck telemetry. Press keys (1–6) on the right to trigger 10,000-store scenarios immediately.";
      }
    },
  });

  let inspectedCell: StoreRunCell | null = null;
  let matrixSceneSnapshot = {
    base: structuredClone(state.base), plan: structuredClone(state.plan),
    seed: state.seed, pickupStaff: state.pickupStaff, body: state.body,
  };

  function applyStoreCellToStage(cell: StoreRunCell): void {
    state.preset = cell.regimeId;
    state.arrival = cell.arrivalRatePerMin;
    state.base = structuredClone(matrixSceneSnapshot.base);
    state.plan = structuredClone(matrixSceneSnapshot.plan);
    state.seed = matrixSceneSnapshot.seed;
    state.body = cell.regimeId === "stroller" ? 1.2 : matrixSceneSnapshot.body;
    state.pickupStaff = matrixSceneSnapshot.pickupStaff;
    state.threeMode = "proposed";

    $<HTMLInputElement>("arrivals").value = String(state.arrival);
    $<HTMLSelectElement>("bodyWidth").value = state.body.toFixed(2);
    $<HTMLInputElement>("pickupStaff").value = String(state.pickupStaff);
    // Compare against the captured layout without regenerating the selected wafer.
    recompute(false);

    const padRun = String(cell.runIndex).padStart(5, "0");
    const padFam = String(cell.familyId).padStart(3, "0");
    $("threeInfoTitle").textContent = `PREVIEW STORE RUN #${padRun} · FAMILY #${padFam} [assumed]`;
    $("threeInfoSub").textContent = `${cell.regimeCode} (${cell.regimeLabel}) · Wafer wait ${cell.baselineWaitSec}s → ${cell.proposedWaitSec}s [assumed]`;
    $("threeInfoBody").textContent = `Captured layout comparison: ${spatialMetricSummary(state.results?.plan)}. Wafer economics are separate assumptions, not a verified per-cell 3D trajectory. ${cell.failureReason}.`;
  }

  const tenKMatrix = createTenKMatrixEngine(
    $<HTMLCanvasElement>("tenKWaferCanvas"),
    {
      onHoverCell: (cell, stats) => {
        inspectedCell = cell;
        const padRun = String(cell.runIndex).padStart(5, "0");
        const padFam = String(cell.familyId).padStart(3, "0");
        const padVar = String(cell.variantId).padStart(2, "0");
        $("tenKExecCounter").textContent =
          stats.sweepProgress < 1
            ? `SWEEPING ${stats.executedCount.toLocaleString("en-US")} / 10,000`
            : `10,000 / 10,000 PARALLEL RUNS`;
        $("tenKKpiExec").textContent = `${stats.executedCount.toLocaleString("en-US")} / 10,000`;
        $("tenKKpiProp").textContent = `${stats.propSurvived.toLocaleString("en-US")} Stores (${(stats.propSurvived / 100).toFixed(1)}%)`;
        $("tenKKpiBase").textContent = `${stats.baseSurvived.toLocaleString("en-US")} Stores (${(stats.baseSurvived / 100).toFixed(1)}%)`;
        $("tenKKpiRescued").textContent = `+${stats.rescuedCount.toLocaleString("en-US")} Stores Saved`;

        $("inspRunTitle").textContent = `STORE RUN #${padRun} / 10,000`;
        $("inspFamilySub").textContent = `AI Design Family #${padFam} · Variant #${padVar} · R${cell.row + 1}:C${cell.col + 1}`;
        const badge = $("inspStatusBadge");
        if (cell.proposedSurvived) {
          badge.textContent = cell.rescuedByDesign
            ? "SURVIVED · RESCUED"
            : cell.marginalRisk
            ? "SURVIVED · MARGINAL"
            : "SURVIVED · OPTIMAL";
          badge.classList.remove("failed");
        } else {
          badge.textContent = "COLLAPSED · CHOKED";
          badge.classList.add("failed");
        }
        $("inspRegime").textContent = `${cell.regimeCode} · ${cell.regimeLabel}`;
        $("inspArrival").textContent = `${cell.arrivalRatePerMin} / ${cell.serviceCapacityPerMin} pax/m`;
        const wDiff = cell.proposedWaitSec - cell.baselineWaitSec;
        $("inspWaitDelta").textContent = `${cell.baselineWaitSec}s → ${cell.proposedWaitSec}s (${wDiff <= 0 ? `▼${Math.abs(wDiff)}s` : `+${wDiff}s`})`;
        const usdNet = (cell.monthlyNetKrwM * 0.75).toFixed(1);
        $("inspFinancial").textContent = `${cell.aisleClearanceM}m · ${Number(usdNet) >= 0 ? "+" : ""}$${usdNet}k/mo`;
        $("inspReasonBox").textContent = `Diagnosis: ${cell.failureReason} (Payback: ${cell.breakEvenMonth === null ? "not reached within 36 months" : "Mo " + cell.breakEvenMonth}) [assumed]`;
        $("loadCellTo3DBtn").textContent = `Compare Preview #${padRun} in Captured 3D Layout ↑`;
        const jumpInput = document.getElementById("inspJumpInput") as HTMLInputElement | null;
        if (jumpInput && document.activeElement !== jumpInput) {
          jumpInput.value = String(cell.runIndex);
        }
        renderCellCashflowSparkline(
          document.getElementById("inspCashflowCanvas") as HTMLCanvasElement | null,
          cell
        );
      },
      onSelectCell: (cell) => {
        applyStoreCellToStage(cell);
      },
    }
  );

  function getActiveUnit(): ListingUnit {
    const dist = getActiveDistrict();
    return (
      dist.units.find((u) => u.unitId === state.selectedUnitId) ||
      dist.units[0]
    );
  }

  function renderParsedUnitChips(): void {
    const dist = getActiveDistrict();
    const wrap = $("parsedUnitChips");
    if (!wrap) return;
    $("parsedLinkStatus").textContent = `✅ ${state.parsedLinkSource} · Select Unit:`;
    wrap.innerHTML = dist.units
      .map((u) => {
        const active = u.unitId === state.selectedUnitId;
        return `
          <button type="button" class="rea-unit-chip ${
            active ? "active" : ""
          }" data-unit-id="${u.unitId}">
            ${u.label}
          </button>
        `;
      })
      .join("");

    wrap.querySelectorAll<HTMLButtonElement>(".rea-unit-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const uid = btn.getAttribute("data-unit-id");
        if (!uid) return;
        state.selectedUnitId = uid;
        state.customAreaPyeong = null;
        state.customDepositManWon = null;
        state.customRentManWon = null;
        const unit = getActiveUnit();
        const cat = getActiveCategory();
        state.arrival =
          Math.round(
            cat.defaultArrival *
              dist.peakArrivalMultiplier *
              unit.trafficFactor *
              2
          ) / 2;
        $<HTMLInputElement>("arrivals").value = String(state.arrival);
        renderParsedUnitChips();
        renderCategoryCards();
        recompute();
      });
    });
  }

  function parseAndApplyLink(rawInput: string): void {
    const text = rawInput.trim();
    const lower = text.toLowerCase();

    // 1. Detect platform
    let platform = "Street Address";
    if (lower.includes("naver.me") || lower.includes("map.naver")) {
      platform = "Naver Map Link";
    } else if (lower.includes("kko.to") || lower.includes("kakao")) {
      platform = "KakaoMap Link";
    } else if (lower.includes("nemo")) {
      platform = "Nemo Property Link";
    } else if (lower.includes("zigbang")) {
      platform = "Zigbang Retail Link";
    } else if (lower.includes("goo.gl") || lower.includes("google")) {
      platform = "Google Maps Link";
    } else if (lower.startsWith("http://") || lower.startsWith("https://")) {
      platform = "External Listing Link";
    }

    // 2. Match commercial district from URL / keywords
    let matchedDist: DistrictProfile["id"] = state.districtId;
    if (
      lower.includes("yeonnam") ||
      lower.includes("kko.to") ||
      lower.includes("hongdae") ||
      lower.includes("mapo")
    ) {
      matchedDist = "yeonnam";
    } else if (
      lower.includes("hannam") ||
      lower.includes("itaewon") ||
      lower.includes("nemo") ||
      lower.includes("yongsan")
    ) {
      matchedDist = "hannam";
    } else if (
      lower.includes("sinsa") ||
      lower.includes("garosu") ||
      lower.includes("zigbang") ||
      lower.includes("gangnam") ||
      lower.includes("apgujeong")
    ) {
      matchedDist = "sinsa";
    } else if (
      lower.includes("seongsu") ||
      lower.includes("naver") ||
      lower.includes("yeonmu")
    ) {
      matchedDist = "seongsu";
    }

    state.districtId = matchedDist;
    const dist = getActiveDistrict();
    state.selectedUnitId = dist.units[0].unitId;

    // 3. Check if URL/text specifies explicit pyeong (e.g., 18py)
    const pyMatch = text.match(/(\d{1,2})\s*(?:py)/i);
    if (pyMatch) {
      const parsedPy = Math.max(8, Math.min(60, Number(pyMatch[1])));
      const matchUnit = dist.units.find((u) => u.areaPyeong === parsedPy);
      if (matchUnit) {
        state.selectedUnitId = matchUnit.unitId;
        state.customAreaPyeong = null;
      } else {
        state.customAreaPyeong = parsedPy;
      }
    } else {
      state.customAreaPyeong = null;
    }

    state.parsedLinkSource = `${platform} Matched (${dist.name})`;
    state.categoryId = dist.bestCategoryId;

    const cat = getActiveCategory();
    if (cat.id === "bakery" || cat.id === "matcha") {
      state.designId = "island";
    } else if (cat.id === "wine") {
      state.designId = "lounge";
    } else {
      state.designId = "express";
    }

    const unit = getActiveUnit();
    state.arrival =
      Math.round(
        cat.defaultArrival *
          dist.peakArrivalMultiplier *
          unit.trafficFactor *
          2
      ) / 2;
    state.service = cat.defaultServiceSec;
    $<HTMLInputElement>("arrivals").value = String(state.arrival);
    $<HTMLInputElement>("service").value = String(state.service);

    document
      .querySelectorAll<HTMLButtonElement>(".rea-term-chip[data-dist-id]")
      .forEach((b) =>
        b.classList.toggle(
          "active",
          b.getAttribute("data-dist-id") === state.districtId
        )
      );

    state.plan = RehearsalCore.makeScene("proposed");
    applyCategoryAndDesignToScene();
    renderParsedUnitChips();
    renderCategoryCards();
    renderDesignTabs();
    recompute();
  }

  function renderCategoryCards(): void {
    const grid = $("categoryGrid");
    const dist = getActiveDistrict();
    const unit = getActiveUnit();
    const dep = state.customDepositManWon ?? unit.depositManWon;
    grid.innerHTML = CATEGORIES.map((c) => {
      const isActive = c.id === state.categoryId;
      const totalSetup = dep + c.interiorCostManWon;
      const isBest = dist.bestCategoryId === c.id;
      return `
        <button type="button" class="rea-cat-btn ${
          isActive ? "active" : ""
        }" data-cat-id="${c.id}">
          <div class="rea-cat-top">
            <strong>${c.icon} ${c.shortName}</strong>
            ${isBest ? `<span class="rea-best-tag">TOP PICK</span>` : ""}
          </div>
          <div class="rea-cat-meta tabular">
            CAPEX ${formatShortWon(totalSetup)} · Survived ${c.survivedCount.toLocaleString("en-US")}/10,000
          </div>
        </button>
      `;
    }).join("");

    grid.querySelectorAll<HTMLButtonElement>(".rea-cat-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cid = btn.getAttribute("data-cat-id") as StartupCategory["id"];
        if (!cid) return;
        state.categoryId = cid;
        const cat = getActiveCategory();
        const distNow = getActiveDistrict();
        const unitNow = getActiveUnit();
        state.arrival =
          Math.round(
            cat.defaultArrival *
              distNow.peakArrivalMultiplier *
              unitNow.trafficFactor *
              2
          ) / 2;
        state.service = cat.defaultServiceSec;
        $<HTMLInputElement>("arrivals").value = String(state.arrival);
        $<HTMLInputElement>("service").value = String(state.service);

        if (cid === "bakery" || cid === "matcha") {
          state.designId = "island";
        } else if (cid === "wine") {
          state.designId = "lounge";
        } else {
          state.designId = "express";
        }
        applyCategoryAndDesignToScene();
        renderCategoryCards();
        renderDesignTabs();
        recompute();
      });
    });
  }

  function renderDesignTabs(): void {
    const wrap = $("designTabs");
    wrap.innerHTML = DESIGN_CONCEPTS.map((d) => {
      const active = d.id === state.designId;
      return `
        <button type="button" class="rea-choice-btn ${
          active ? "active" : ""
        }" data-design-id="${d.id}">
          <strong>${d.name}</strong>
          <span>${d.desc}</span>
        </button>
      `;
    }).join("");

    wrap.querySelectorAll<HTMLButtonElement>(".rea-choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const did = btn.getAttribute("data-design-id") as DesignConcept["id"];
        if (!did) return;
        state.designId = did;
        if (state.preset === "staff") {
          state.preset = "both";
        }
        state.plan = RehearsalCore.makeScene("proposed");
        applyCategoryAndDesignToScene();
        renderDesignTabs();
        recompute();
      });
    });
  }

  function renderScenarioDeck(): void {
    const wrap = $("scenarioDeckGrid");
    wrap.innerHTML = SCENARIO_PRESETS.map((s) => {
      const active = state.preset === s.id;
      const btnId =
        s.id === "layout"
          ? "layoutBtn"
          : s.id === "staff"
          ? "staffBtn"
          : s.id === "both"
          ? "bothBtn"
          : `${s.id}Btn`;
      return `
        <button type="button" id="${btnId}" class="rea-scn-btn ${
        active ? "active" : ""
      }" data-scn-id="${s.id}">
          <span>${s.title}</span>
          <small class="tabular">${s.countLabel}</small>
        </button>
      `;
    }).join("");

    wrap.querySelectorAll<HTMLButtonElement>(".rea-scn-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sid = btn.getAttribute("data-scn-id") as ScenarioPreset["id"];
        if (sid) setPreset(sid);
      });
    });
  }

  function syncControls(): void {
    const dist = getActiveDistrict();
    const unit = getActiveUnit();
    const cat = getActiveCategory();
    const des = getActiveDesign();

    const activeAreaPy = state.customAreaPyeong ?? unit.areaPyeong;
    const activeDeposit = state.customDepositManWon ?? unit.depositManWon;
    const activeRent = state.customRentManWon ?? unit.monthlyRentManWon;
    const activeM2 = (activeAreaPy * 3.3).toFixed(1);

    $("budgetDisplayLabel").textContent = formatManWon(state.budgetManWon);
    $("districtBadgeTitle").textContent = `📍 ${dist.name} District Analysis (${activeAreaPy}py)`;
    $("districtLeadText").textContent = dist.districtSummary;
    $("evFootTraffic").textContent = `${Math.round(
      dist.dailyFootTraffic * unit.trafficFactor
    ).toLocaleString("en-US")} / day`;
    $("evPeakHours").textContent = `Peak: ${dist.peakHours}`;
    $("evRentInfo").textContent = `Dep ${formatShortWon(activeDeposit)} / Rent ₩${activeRent}M`;
    $("evAreaInfo").textContent = `Selected Unit: ${activeAreaPy}py (${activeM2}m² · 12×9m Grid)`;

    const totalSetup = activeDeposit + cat.interiorCostManWon;
    const reserve = state.budgetManWon - totalSetup;
    $("evSetupCost").textContent = `${formatManWon(totalSetup)} (Fit-out ₩${cat.interiorCostManWon}M)`;
    $("budgetRemainBanner").textContent =
      reserve >= 0
        ? `Operating Reserve ${formatManWon(reserve)} Secured`
        : `Over Budget by ${formatManWon(Math.abs(reserve))}`;

    const completed10m = state.results?.plan.completed ?? 42;
    const estDailyOrders = Math.round(completed10m * 4.2);
    const monthlyRevManWon = Math.round(
      (estDailyOrders * cat.avgTicketWon * 30) / 10000
    );
    const laborManWon = (state.orderStaff + state.pickupStaff) * 260;
    const cogsManWon = Math.round(monthlyRevManWon * 0.34);
    const netProfitManWon =
      monthlyRevManWon - activeRent - laborManWon - cogsManWon;

    $("evMonthlyProfit").textContent = `${
      netProfitManWon >= 0 ? "+" : ""
    }₩${netProfitManWon.toLocaleString("en-US")}M / mo`;
    $("evTargetPersona").textContent = `Est. Rev ₩${monthlyRevManWon.toLocaleString("en-US")}M · Avg Ticket ₩${cat.avgTicketWon.toLocaleString("en-US")}`;

    $("heroScenarioTotal").textContent = `${cat.survivedCount.toLocaleString("en-US")} / 10,000 Stores Survived`;
    $("activeCategoryHeading").textContent = `${cat.icon} ${cat.title} — 10,000-Store Scenarios & Spatial Rehearsal`;
    $("proposedWorldTitle").textContent = `Proposed Floorplan (${des.name})`;
    $("layoutRuleText").textContent = cat.layoutRuleNote;

    const activeScn = SCENARIO_PRESETS.find((s) => s.id === state.preset);
    $("scenarioRuleText").textContent = activeScn
      ? `${activeScn.code} (${activeScn.countLabel} Store Scenarios): ${activeScn.ruleDesc}`
      : `Custom Parameters: ${state.arrival.toFixed(1)} pax/min Inflow · ${state.service}s Prep · ${state.pickupStaff} Pickup Staff · ${state.body.toFixed(2)}m Width`;

    $("arrivalValue").textContent = `${state.arrival.toFixed(1)}/min`;
    $("serviceValue").textContent = `${state.service}s`;
    $("staffValue").textContent = `${state.pickupStaff} staff`;
    $("seedNum").textContent = String(state.seed);

    const o = getSelectedObject();
    if (o) {
      $("selectedObjTitle").textContent = `${o.koLabel || o.label} (${o.w.toFixed(1)}×${o.h.toFixed(1)}m)`;
      $<HTMLInputElement>("displayX").value = round(o.x, 1);
      $<HTMLInputElement>("displayY").value = round(o.y, 1);
    }

    document
      .querySelectorAll<HTMLButtonElement>(".obj-chip[data-select-obj]")
      .forEach((btn) => {
        btn.classList.toggle(
          "active",
          btn.getAttribute("data-select-obj") === state.selected
        );
      });

    document.querySelectorAll<HTMLButtonElement>(".rea-scn-btn").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.getAttribute("data-scn-id") === state.preset
      );
    });

    $("toggleHeatmapBtn").classList.toggle("active", state.showHeatmap);
    $("toggleHeatmapBtn").textContent = state.showHeatmap
      ? "🔥 Congestion Heatmap ON"
      : "🔥 Congestion Heatmap OFF";

    $("toggleLightsBtn").classList.toggle("active", state.lightsOn);
    $("toggleLightsBtn").textContent = state.lightsOn ? "💡 Lighting ON" : "💡 Lighting OFF";

    $("toggleAcBtn").classList.toggle("active", state.acOn);
    $("toggleAcBtn").textContent = state.acOn ? "❄️ HVAC Airflow ON" : "❄️ HVAC Airflow OFF";

    $("toggleViewModeBtn").textContent =
      state.viewMode === "3d" ? "📐 2D CAD Blueprint" : "🏠 3D Isometric View";
    $("toggleViewModeBtn").classList.toggle("active", state.viewMode === "2d");

    $("playBtn").textContent = state.playing ? "Pause" : "Play";
    $("walkBtn").textContent = state.walkMode ? "🚶 Exit Walk" : "🚶 Walk Mode";
    $("walkBtn").classList.toggle("active", state.walkMode);

    const deg = Math.round(((state.isoYawRad * 180) / Math.PI) % 360);
    $("isoAngleBadge").textContent = `🔄 Drag to Orbit: ${deg}°`;

    // Sync 3D stage HUD buttons
    document
      .querySelectorAll<HTMLButtonElement>("[data-three-cat]")
      .forEach((btn) => {
        btn.classList.toggle(
          "active",
          btn.getAttribute("data-three-cat") === state.categoryId
        );
      });
    document
      .querySelectorAll<HTMLButtonElement>("[data-three-mode]")
      .forEach((btn) => {
        btn.classList.toggle(
          "on",
          btn.getAttribute("data-three-mode") === state.threeMode
        );
      });
    document
      .querySelectorAll<HTMLButtonElement>("[data-three-design]")
      .forEach((btn) => {
        btn.classList.toggle(
          "on",
          btn.getAttribute("data-three-design") === state.designId &&
            state.threeMode === "proposed"
        );
      });
    document
      .querySelectorAll<HTMLButtonElement>("[data-three-scn]")
      .forEach((btn) => {
        btn.classList.toggle(
          "on",
          btn.getAttribute("data-three-scn") === state.preset
        );
      });

    $("pgrunStageTitle").textContent = `${dist.name.toUpperCase()} · ${cat.shortName.toUpperCase()} (${activeAreaPy}PY)`;
  }

  function clock(t: number): string {
    const mins = Math.floor(t / 60)
      .toString()
      .padStart(2, "0");
    const secs = Math.floor(t % 60)
      .toString()
      .padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function drawAll(): void {
    views[0] = drawWorldCanvas({
      canvas: canvases[0],
      scene: state.base,
      result: state.results?.base,
      worldIndex: 0,
      currentTimeSec: state.t,
      walkMode: state.walkMode,
      playerPos: state.players[0],
      bodyWidth: state.body,
      selectedObjectId: null,
      hoveredObjectId: null,
      themeKey: "express",
      categoryId: state.categoryId,
      lightsOn: state.lightsOn,
      acOn: false,
      showHeatmap: state.showHeatmap,
      pickupStaffCount: 1,
      presetId: state.preset,
      viewMode: state.viewMode,
      yawRad: state.isoYawRad,
      pitchRatio: state.isoPitchRatio,
      zoomScale: state.isoZoomScale,
    });

    views[1] = drawWorldCanvas({
      canvas: canvases[1],
      scene: state.plan,
      result: state.results?.plan,
      worldIndex: 1,
      currentTimeSec: state.t,
      walkMode: state.walkMode,
      playerPos: state.players[1],
      bodyWidth: state.body,
      selectedObjectId: state.selected,
      hoveredObjectId: state.hovered,
      themeKey: state.designId,
      categoryId: state.categoryId,
      lightsOn: state.lightsOn,
      acOn: state.acOn,
      showHeatmap: state.showHeatmap,
      pickupStaffCount: state.pickupStaff,
      presetId: state.preset,
      viewMode: state.viewMode,
      yawRad: state.isoYawRad,
      pitchRatio: state.isoPitchRatio,
      zoomScale: state.isoZoomScale,
    });

    $<HTMLInputElement>("timeline").value = String(Math.round(state.t));
    $("clock").textContent = `${clock(state.t)} / 10:00`;
    updateWorldStatsD3Playhead(state.results, state.t);

    if (state.results) {
      const dist = getActiveDistrict();
      const unit = getActiveUnit();
      const cat = getActiveCategory();
      const activeScn =
        SCENARIO_PRESETS.find((s) => s.id === state.preset) ||
        SCENARIO_PRESETS[0];
      const activeScene =
        state.threeMode === "baseline" ? state.base : state.plan;
      const activeRes =
        state.threeMode === "baseline"
          ? state.results.base
          : state.results.plan;

      threeStage.update({
        scene: activeScene,
        result: activeRes,
        baseResult: state.results.base,
        mode: state.threeMode,
        categoryId: state.categoryId,
        categoryName: cat.shortName,
        districtName: dist.name,
        pyeong: state.customAreaPyeong ?? unit.areaPyeong,
        scenarioCode: activeScn.code,
        scenarioName: activeScn.title,
        scenarioClusterCount:
          Number(activeScn.countLabel.replace(/[^0-9]/g, "")) || 1000,
        survivedCount: cat.survivedCount,
        scenarioTotal: cat.scenarioTotal,
        selectedObjectId: state.selected,
        orderStaff: state.orderStaff,
        pickupStaff: state.threeMode === "baseline" ? 1 : state.pickupStaff,
        bodyWidth: state.body,
        arrivalRatePerMin: state.arrival,
        showHeatmap: state.showHeatmap,
        showLighting: state.lightsOn,
        showAirflow: state.acOn,
        currentTimeSec: state.t,
      });

      tenKMatrix.setSimTime(state.t);

      const diffStr =
        state.threeMode === "baseline"
          ? "Baseline Bottleneck"
          : spatialWaitDelta(state.results.base, activeRes);
      $("threeLiveReadout").textContent = `${
        state.threeMode === "baseline" ? "[BEFORE]" : "[AFTER]"
      } ${spatialMetricSummary(activeRes)} (${diffStr})`;
    }
  }

  function recompute(updateMatrix = true): void {
    window.clearTimeout(debounce);
    state.dirty = true;
    state.rev++;
    state.players = [
      { ...state.base.entrance },
      { ...state.plan.entrance },
    ];

    try {
      const a = RehearsalCore.run(state.base, getConfig(1));
      const b = RehearsalCore.run(state.plan, getConfig(state.pickupStaff));
      state.results = { base: a, plan: b };

      for (const [key, r] of [
        ["base", a],
        ["plan", b],
      ] as const) {
        const blocked = Boolean(r.routeBlocked);
        $(`${key}Route`).textContent = blocked ? "Route Blocked" : "Flow Clear";
        $(`${key}Route`).classList.toggle("bad", blocked);
        $(`${key}Wait`).textContent = blocked ? "–" : round(observed(r));
        $(`${key}P90`).textContent = blocked
          ? "Clearance Needed"
          : `P90 ${round(r.p90WaitSec)}s`;
        $(`${key}Done`).textContent = String(r.completed);
        $(`${key}Active`).textContent = `Inflow ${r.arrivalCount} · Queue ${r.active} pax`;
        $(`${key}Walk`).textContent = blocked ? "–" : round(r.walkDistance, 1);
      }

      const waitDeltaEl = $("waitDeltaTag");
      const doneDeltaEl = $("doneDeltaTag");
      const walkDeltaEl = $("walkDeltaTag");

      if (!a.routeBlocked && !b.routeBlocked && a.arrivalCount > 0) {
        const dw = (observed(b) ?? 0) - (observed(a) ?? 0);
        waitDeltaEl.textContent =
          Math.abs(dw) < 0.5
            ? ""
            : dw < 0
            ? `▼${Math.abs(Math.round(dw))}s`
            : `+${Math.round(dw)}s`;
        waitDeltaEl.className = `delta-tag ${dw <= 0.5 ? "good" : "bad"}`;

        const dc = b.completed - a.completed;
        doneDeltaEl.textContent = dc > 0 ? `+${dc} pax` : dc < 0 ? `${dc} pax` : "";
        doneDeltaEl.className = `delta-tag ${dc >= 0 ? "good" : "bad"}`;

        const dWalk = (b.walkDistance ?? 0) - (a.walkDistance ?? 0);
        walkDeltaEl.textContent =
          Math.abs(dWalk) < 0.05
            ? ""
            : dWalk < 0
            ? `${dWalk.toFixed(1)}m`
            : `+${dWalk.toFixed(1)}m`;
        walkDeltaEl.className = `delta-tag ${dWalk <= 0 ? "good" : "bad"}`;
      } else {
        waitDeltaEl.textContent = "";
        doneDeltaEl.textContent = "";
        walkDeltaEl.textContent = "";
      }

      const selObj = getSelectedObject();
      $("planNote").textContent = `${selObj.koLabel || selObj.label} (${selObj.x.toFixed(
        1
      )}m, ${selObj.y.toFixed(1)}m)`;

      // Render D3.js real-time performance charts in .world-stats
      renderWorldStatsD3Charts(state.results, state.t);

      // Render D3.js 10,000-Store Monte Carlo Distribution Matrix in Hero
      const cat = getActiveCategory();
      const survRatio = cat.survivedCount / 10000;
      const tenKClusters: TenKClusterItem[] = [
        {
          id: "both",
          code: "SCN-01",
          label: "Standard Ops",
          total: 3200,
          survived: Math.round(3200 * (survRatio + 0.06)),
          congested: Math.round(3200 * (1 - survRatio - 0.06)),
          blocked: 0,
        },
        {
          id: "rainy",
          code: "SCN-02",
          label: "Rainy Surge",
          total: 2400,
          survived: Math.round(2400 * (survRatio - 0.04)),
          congested: Math.round(2400 * (1 - survRatio + 0.02)),
          blocked: Math.round(2400 * 0.02),
        },
        {
          id: "layout",
          code: "SCN-03",
          label: "Solo Staff",
          total: 1400,
          survived: Math.round(1400 * (survRatio - 0.14)),
          congested: Math.round(1400 * (1 - survRatio + 0.14)),
          blocked: 0,
        },
        {
          id: "influencer",
          code: "SCN-04",
          label: "Viral Rush",
          total: 1200,
          survived: Math.round(1200 * (survRatio - 0.02)),
          congested: Math.round(1200 * (1 - survRatio - 0.02)),
          blocked: Math.round(1200 * 0.04),
        },
        {
          id: "staff",
          code: "SCN-05",
          label: "Staff Only",
          total: 1000,
          survived: Math.round(1000 * survRatio),
          congested: Math.round(1000 * (1 - survRatio - 0.04)),
          blocked: Math.round(1000 * 0.04),
        },
        {
          id: "stroller",
          code: "SCN-06",
          label: "Stroller Entry",
          total: 800,
          survived: b.routeBlocked ? 120 : Math.round(800 * (survRatio - 0.08)),
          congested: 160,
          blocked: b.routeBlocked
            ? 520
            : Math.max(40, 800 - Math.round(800 * (survRatio - 0.08)) - 160),
        },
      ];
      renderTenKMonteCarloChart(
        "#tenKDistributionChart",
        tenKClusters,
        state.preset,
        (clusterId) => {
          setPreset(clusterId as PresetKind);
        }
      );

      // Update Live 10,000-Store Parallel Wafer Matrix Engine
      const baseWaitVal = Math.max(25, Math.round(observed(a) ?? 96));
      const propWaitVal = Math.max(12, Math.round(observed(b) ?? 19));
      if (updateMatrix) {
        matrixSceneSnapshot = {
          base: structuredClone(state.base), plan: structuredClone(state.plan),
          seed: state.seed, pickupStaff: state.pickupStaff, body: state.body,
        };
        tenKMatrix.updateConfig(
          {
            categoryKey: state.categoryId,
            designKey: state.designId,
            activeScenario: state.preset,
            baseWaitSec: baseWaitVal,
            propWaitSec: propWaitVal,
            baseSurvivedTotal: Math.round(cat.survivedCount * 0.37),
            propSurvivedTotal: cat.survivedCount,
            scenarios: tenKClusters.map((c) => ({
              id: c.id as Exclude<PresetKind, "custom">,
              code: c.code,
              label: c.label,
              runs: c.total,
              baseSurvived: Math.round(c.survived * 0.37),
              propSurvived: c.survived,
              baseWaitSec: baseWaitVal,
              propWaitSec: propWaitVal,
            })),
          },
          true
        );
      }

      const insightEl = $("insight");
      const d = (observed(b) ?? 0) - (observed(a) ?? 0);
      let summaryTitle = "";
      let summarySub = "";
      if (b.routeBlocked) {
        summaryTitle = "Aisle Blocked in Proposed Floorplan!";
        summarySub = `For body clearance (${state.body.toFixed(2)}m), drag the display stand or tables to widen the main corridor.`;
      } else if (a.routeBlocked) {
        summaryTitle = `At ${state.body.toFixed(2)}m Stroller/Group Width, Baseline Fails while Proposed Passes!`;
        summarySub = `Relocating the entrance bottleneck display stand secured sufficient corridor clearance.`;
      } else if (state.preset === "layout") {
        summaryTitle = `Layout Only (1 Pickup Staff): Walk distance changed by ${(
          (b.walkDistance ?? 0) - (a.walkDistance ?? 0)
        ).toFixed(1)}m, but mean wait remains ${round(observed(b))}s.`;
        summarySub = `With only 1 staff at pickup, faster walking still queues at the bar. Increase pickup staff to 2.`;
      } else {
        summaryTitle =
          d < -2
            ? `Proposed layout & ops reduced mean wait by ${round(-d)}s and served +${
                b.completed - a.completed
              } more orders in 10 min.`
            : "Comparing real-time customer flow and D3 performance telemetry across both floorplans.";
        summarySub = `Baseline Wait ${round(observed(a))}s → Proposed ${round(
          observed(b)
        )}s (Peak Queue ${a.maxQueue} pax → ${b.maxQueue} pax)`;
      }
      insightEl.innerHTML = `<strong>${summaryTitle}</strong><span class="muted">${summarySub}</span>`;

      $("calcBadge").textContent = `Seed #${state.seed} · Computed`;
      $("calcBadge").dataset.revision = String(state.rev);
      $("calPredWait").textContent = b.routeBlocked
        ? "Blocked"
        : `${round(observed(b), 1)}s`;

      state.dirty = false;
      syncControls();
      drawAll();
    } catch (err) {
      state.dirty = false;
      const msg = err instanceof Error ? err.message : String(err);
      window.__errors.push(msg);
      state.results = null;
      drawAll();
    }
  }

  function queueRecompute(): void {
    state.dirty = true;
    window.clearTimeout(debounce);
    debounce = window.setTimeout(recompute, 50);
    drawAll();
  }

  function setPreset(kind: PresetKind): void {
    state.preset = kind;
    const found = SCENARIO_PRESETS.find((s) => s.id === kind);
    if (found) {
      if (kind === "staff") {
        state.plan = RehearsalCore.makeScene("baseline");
        const cat = getActiveCategory();
        for (const sc of [state.base, state.plan]) {
          const disp = sc.objects.find((o) => o.id === "display");
          if (disp) disp.koLabel = cat.mainDisplayLabel;
        }
      } else {
        state.plan = RehearsalCore.makeScene("proposed");
        applyCategoryAndDesignToScene();
      }
      state.arrival = found.arrival;
      state.service = found.service;
      state.body = found.body;
      state.pickupStaff = found.pickupStaff;
    }
    state.selected = "display";
    $<HTMLInputElement>("arrivals").value = String(state.arrival);
    $<HTMLInputElement>("service").value = String(state.service);
    $<HTMLSelectElement>("bodyWidth").value = state.body.toFixed(2);
    $<HTMLInputElement>("pickupStaff").value = String(state.pickupStaff);
    recompute();
  }

  function setPosition(x: number, y: number, immediate = true): void {
    const o = getSelectedObject();
    if (!o) return;
    o.x = Math.max(
      0,
      Math.min(state.plan.width - o.w, Math.round(x * 10) / 10)
    );
    o.y = Math.max(
      0,
      Math.min(state.plan.height - o.h, Math.round(y * 10) / 10)
    );
    state.preset = "custom";
    syncControls();
    if (immediate) recompute();
    else queueRecompute();
  }

  // Commercial District / Sample Link Selector
  document
    .querySelectorAll<HTMLButtonElement>(".rea-term-chip[data-dist-id]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const did = btn.getAttribute("data-dist-id") as DistrictProfile["id"];
        if (!did) return;
        const dist = DISTRICTS.find((d) => d.id === did) || DISTRICTS[0];
        state.address = dist.sampleUrl;
        $<HTMLInputElement>("addressInput").value = dist.sampleUrl;
        parseAndApplyLink(dist.sampleUrl);
      });
    });

  $("parseLinkBtn").addEventListener("click", () => {
    const val = $<HTMLInputElement>("addressInput").value;
    parseAndApplyLink(val);
  });

  $<HTMLInputElement>("addressInput").addEventListener("paste", (e) => {
    window.setTimeout(() => {
      const val = (e.target as HTMLInputElement).value;
      state.address = val;
      parseAndApplyLink(val);
    }, 20);
  });

  $<HTMLInputElement>("addressInput").addEventListener("change", (e) => {
    const val = (e.target as HTMLInputElement).value;
    state.address = val;
    parseAndApplyLink(val);
  });

  $<HTMLInputElement>("addressInput").addEventListener("input", (e) => {
    state.address = (e.target as HTMLInputElement).value;
  });

  $<HTMLInputElement>("budgetSlider").addEventListener("input", (e) => {
    state.budgetManWon = Number((e.target as HTMLInputElement).value);
    renderCategoryCards();
    syncControls();
  });

  // View Mode & Environment Toggles
  $("toggleViewModeBtn").addEventListener("click", () => {
    state.viewMode = state.viewMode === "3d" ? "2d" : "3d";
    syncControls();
    drawAll();
  });

  $("toggleHeatmapBtn").addEventListener("click", () => {
    state.showHeatmap = !state.showHeatmap;
    syncControls();
    drawAll();
  });

  $("toggleLightsBtn").addEventListener("click", () => {
    state.lightsOn = !state.lightsOn;
    syncControls();
    drawAll();
  });

  $("toggleAcBtn").addEventListener("click", () => {
    state.acOn = !state.acOn;
    syncControls();
    drawAll();
  });

  // Fine Sliders
  $<HTMLInputElement>("arrivals").addEventListener("input", (e) => {
    state.arrival = Number((e.target as HTMLInputElement).value);
    state.preset = "custom";
    syncControls();
    queueRecompute();
  });

  $<HTMLInputElement>("service").addEventListener("input", (e) => {
    state.service = Number((e.target as HTMLInputElement).value);
    state.preset = "custom";
    syncControls();
    queueRecompute();
  });

  $<HTMLSelectElement>("bodyWidth").addEventListener("change", (e) => {
    state.body = Number((e.target as HTMLSelectElement).value);
    state.preset = "custom";
    recompute();
  });

  $<HTMLInputElement>("pickupStaff").addEventListener("input", (e) => {
    state.pickupStaff = Number((e.target as HTMLInputElement).value);
    state.preset = "custom";
    syncControls();
    queueRecompute();
  });

  $<HTMLInputElement>("displayX").addEventListener("change", (e) => {
    setPosition(
      Number((e.target as HTMLInputElement).value),
      getSelectedObject().y
    );
  });

  $<HTMLInputElement>("displayY").addEventListener("change", (e) => {
    setPosition(
      getSelectedObject().x,
      Number((e.target as HTMLInputElement).value)
    );
  });

  document
    .querySelectorAll<HTMLButtonElement>(".obj-chip[data-select-obj]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-select-obj");
        if (id) {
          state.selected = id;
          syncControls();
          drawAll();
        }
      });
    });

  $("rotateObjBtn").addEventListener("click", () => {
    const o = getSelectedObject();
    if (!o || !o.movable) return;
    const nextW = o.h;
    const nextH = o.w;
    o.w = nextW;
    o.h = nextH;
    o.x = Math.max(0, Math.min(state.plan.width - o.w, o.x));
    o.y = Math.max(0, Math.min(state.plan.height - o.h, o.y));
    state.preset = "custom";
    recompute();
  });

  $("resetSceneBtn").addEventListener("click", () => {
    state.plan = RehearsalCore.makeScene("proposed");
    applyCategoryAndDesignToScene();
    recompute();
  });

  $("addBoothBtn").addEventListener("click", () => {
    const id = `custom-${state.rev + 1}`;
    state.plan.objects.push({
      id,
      label: "Pop-up booth",
      koLabel: "Pop-Up Booth",
      x: 5.2,
      y: 4.2,
      w: 1.6,
      h: 1.0,
      kind: "display",
      movable: true,
    });
    state.selected = id;
    state.preset = "custom";
    recompute();
  });

  $("removeCustomBtn").addEventListener("click", () => {
    state.plan.objects = state.plan.objects.filter(
      (o) => !o.id.startsWith("custom-") && !o.id.startsWith("manual-")
    );
    state.selected = "display";
    recompute();
  });

  // Playback
  $("playBtn").addEventListener("click", () => {
    if (state.t >= 600) state.t = 0;
    state.playing = !state.playing;
    syncControls();
  });

  $("restartBtn").addEventListener("click", () => {
    state.t = 0;
    state.playing = true;
    syncControls();
    drawAll();
  });

  $<HTMLInputElement>("timeline").addEventListener("input", (e) => {
    state.playing = false;
    state.t = Number((e.target as HTMLInputElement).value);
    syncControls();
    drawAll();
  });

  $<HTMLSelectElement>("speed").addEventListener("change", (e) => {
    state.speed = Number((e.target as HTMLSelectElement).value);
  });

  $("seedBtn").addEventListener("click", () => {
    state.seed += 73;
    recompute();
  });

  // 3D Stage HUD Controls (pgrun.dev / ISO-GLOW style)
  document
    .querySelectorAll<HTMLButtonElement>("[data-three-cat]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const cid = btn.getAttribute(
          "data-three-cat"
        ) as StartupCategory["id"];
        if (!cid) return;
        state.categoryId = cid;
        if (cid === "bakery" || cid === "matcha") {
          state.designId = "island";
        } else if (cid === "wine") {
          state.designId = "lounge";
        } else {
          state.designId = "express";
        }
        state.plan = RehearsalCore.makeScene("proposed");
        applyCategoryAndDesignToScene();
        renderCategoryCards();
        renderDesignTabs();
        recompute();
      });
    });

  document
    .querySelectorAll<HTMLButtonElement>("[data-three-mode]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const m = btn.getAttribute("data-three-mode") as
          | "proposed"
          | "baseline";
        if (!m) return;
        state.threeMode = m;
        syncControls();
        drawAll();
      });
    });

  document
    .querySelectorAll<HTMLButtonElement>("[data-three-design]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const did = btn.getAttribute(
          "data-three-design"
        ) as DesignConcept["id"];
        if (!did) return;
        state.threeMode = "proposed";
        state.designId = did;
        state.plan = RehearsalCore.makeScene("proposed");
        applyCategoryAndDesignToScene();
        renderDesignTabs();
        recompute();
      });
    });

  document
    .querySelectorAll<HTMLButtonElement>("[data-three-scn]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const sid = btn.getAttribute(
          "data-three-scn"
        ) as ScenarioPreset["id"];
        if (sid) setPreset(sid);
      });
    });

  document
    .querySelectorAll<HTMLButtonElement>("#threeSwatches .swatch")
    .forEach((sw) => {
      sw.addEventListener("click", () => {
        const hex = sw.getAttribute("data-accent") || "#ea580c";
        document
          .querySelectorAll("#threeSwatches .swatch")
          .forEach((el) => el.classList.remove("active"));
        sw.classList.add("active");
        $("pgrunDot").style.background = hex;
        threeStage.setAccentColor(hex);
      });
    });

  let isRevolving = false;
  $("threeRevolveBtn").addEventListener("click", () => {
    isRevolving = !isRevolving;
    $("threeRevolveBtn").classList.toggle("active", isRevolving);
    $("threeRevolveBtn").setAttribute("aria-pressed", String(isRevolving));
    threeStage.setAutoRevolve(isRevolving);
  });

  $("threeSwarmBtn").addEventListener("click", () => {
    const next = !threeStage.isSwarmEnabled();
    threeStage.setSwarmEnabled(next);
    $("threeSwarmBtn").classList.toggle("active", next);
    $("threeSwarmBtn").setAttribute("aria-pressed", String(next));
  });

  document
    .querySelectorAll<HTMLButtonElement>("[data-wafer-mode]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-wafer-mode") as WaferViewMode;
        if (!mode) return;
        document
          .querySelectorAll("[data-wafer-mode]")
          .forEach((el) => el.classList.remove("active"));
        btn.classList.add("active");
        tenKMatrix.setViewMode(mode);
      });
    });

  document
    .querySelectorAll<HTMLButtonElement>("[data-wafer-filter]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const filter = btn.getAttribute("data-wafer-filter") as WaferFilterMode;
        if (!filter) return;
        document
          .querySelectorAll("[data-wafer-filter]")
          .forEach((el) => el.classList.remove("active"));
        btn.classList.add("active");
        tenKMatrix.setFilterMode(filter);
      });
    });

  document
    .querySelectorAll<HTMLButtonElement>("[data-wafer-bench]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const kind = btn.getAttribute("data-wafer-bench") as
          | "optimal"
          | "rescued"
          | "worst";
        if (!kind) return;
        document
          .querySelectorAll("[data-wafer-bench]")
          .forEach((el) => el.classList.remove("active"));
        btn.classList.add("active");
        tenKMatrix.selectBenchmark(kind);
      });
    });

  $("threeOptimizeBtn").addEventListener("click", () => {
    const best = tenKMatrix.selectBenchmark("optimal");
    $("threeOptimizeBtn").classList.add("active");
    if (best) {
      applyStoreCellToStage(best);
      threeStage.snapToIsoView();
    }
  });

  $("resweepTenKBtn").addEventListener("click", () => {
    tenKMatrix.triggerSweep();
  });

  $("loadCellTo3DBtn").addEventListener("click", () => {
    if (inspectedCell) {
      applyStoreCellToStage(inspectedCell);
      $("sec-3d-stage").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  function setActiveCamBadge(which: "iso" | "top" | "pov"): void {
    $("threeIsoBtn").classList.toggle("active", which === "iso");
    $("threeTopBtn").classList.toggle("active", which === "top");
    $("threePovBtn").classList.toggle("active", which === "pov");
  }

  $("threeIsoBtn").addEventListener("click", () => {
    setActiveCamBadge("iso");
    threeStage.snapToIsoView();
  });

  $("threeTopBtn").addEventListener("click", () => {
    setActiveCamBadge("top");
    threeStage.snapToTopView();
  });

  $("threePovBtn").addEventListener("click", () => {
    setActiveCamBadge("pov");
    threeStage.snapToPovView();
  });

  $("inspJumpBtn").addEventListener("click", () => {
    const val = Number($<HTMLInputElement>("inspJumpInput").value);
    if (Number.isFinite(val)) {
      const cell = tenKMatrix.selectRunByIndex(val);
      if (cell) applyStoreCellToStage(cell);
    }
  });

  $<HTMLInputElement>("inspJumpInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("inspJumpBtn").click();
    }
  });

  let tourTimerId = 0;
  let tourStep = 0;
  const tourIndices = [1, 1421, 3205, 5610, 7012, 8204, 9215];
  $("tenKTourBtn").addEventListener("click", () => {
    const btn = $("tenKTourBtn");
    if (tourTimerId) {
      window.clearInterval(tourTimerId);
      tourTimerId = 0;
      btn.classList.remove("active");
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = "▶ Tour 10K";
      return;
    }
    btn.classList.add("active");
    btn.setAttribute("aria-pressed", "true");
    btn.textContent = "⏹ Stop Tour";
    const stepFn = () => {
      const runIdx = tourIndices[tourStep % tourIndices.length];
      tourStep++;
      const cell = tenKMatrix.selectRunByIndex(runIdx);
      if (cell) applyStoreCellToStage(cell);
    };
    stepFn();
    tourTimerId = window.setInterval(stepFn, 2200);
  });

  function toggleExportDrawer(forceOpen?: boolean): void {
    const drawer = $("threeExportDrawer");
    const btn = $("threeExportMenuBtn");
    const isHidden = drawer.classList.contains("hidden");
    const shouldOpen = forceOpen !== undefined ? forceOpen : isHidden;
    drawer.classList.toggle("hidden", !shouldOpen);
    btn.classList.toggle("active", shouldOpen);
    btn.setAttribute("aria-expanded", String(shouldOpen));
  }

  $("threeExportMenuBtn").addEventListener("click", () => {
    toggleExportDrawer();
  });

  $("headerExport3DBtn").addEventListener("click", () => {
    $("sec-3d-stage").scrollIntoView({ behavior: "smooth", block: "start" });
    toggleExportDrawer(true);
  });

  $("closeExportDrawerBtn").addEventListener("click", () => {
    toggleExportDrawer(false);
  });

  let currentExportUrl: string | null = null;
  let lastExportCopyText = "";

  function setDirectExportReady(opts: {
    url: string;
    filename: string;
    copyText: string;
    imagePreviewUrl?: string;
    codeSnippet?: string;
  }): void {
    const directLink = $<HTMLAnchorElement>("export3DDirectLink");
    directLink.href = opts.url;
    directLink.download = opts.filename;
    directLink.textContent = `⬇ Save ${opts.filename}`;
    lastExportCopyText = opts.copyText;
    $("export3DActionRow").classList.remove("hidden");

    // Also trigger automatic browser download
    const autoLink = document.createElement("a");
    autoLink.href = opts.url;
    autoLink.download = opts.filename;
    document.body.appendChild(autoLink);
    autoLink.click();
    document.body.removeChild(autoLink);

    if (opts.imagePreviewUrl) {
      const previewImg = $<HTMLImageElement>("export3DPreviewImg");
      previewImg.src = opts.imagePreviewUrl;
      $("export3DPreviewBox").classList.remove("hidden");
    } else {
      $("export3DPreviewBox").classList.add("hidden");
    }

    const codeBox = $("export3DCodeSnippet");
    if (opts.codeSnippet) {
      codeBox.textContent = opts.codeSnippet;
      codeBox.classList.remove("hidden");
    } else {
      codeBox.classList.add("hidden");
    }
  }

  function createManagedObjectUrl(blob: Blob): string {
    if (currentExportUrl && currentExportUrl.startsWith("blob:")) {
      URL.revokeObjectURL(currentExportUrl);
    }
    currentExportUrl = URL.createObjectURL(blob);
    return currentExportUrl;
  }

  $("export3DCopyBtn").addEventListener("click", async () => {
    if (!lastExportCopyText) return;
    try {
      await navigator.clipboard.writeText(lastExportCopyText);
      $("export3DCopyBtn").textContent = "✓ Copied!";
      window.setTimeout(() => {
        $("export3DCopyBtn").textContent = "📋 Copy Data";
      }, 1500);
    } catch {
      $("export3DCopyBtn").textContent = "✓ Selected";
    }
  });

  $("export3DSnapBtn").addEventListener("click", () => {
    const dist = getActiveDistrict();
    const cat = getActiveCategory();
    const des = getActiveDesign();
    const unit = getActiveUnit();
    const areaPy = state.customAreaPyeong ?? unit.areaPyeong;
    const activeRes =
      state.threeMode === "baseline"
        ? state.results?.base
        : state.results?.plan;

    const snap = threeStage.exportHighResSnapshot({
      title: `${dist.name} · ${cat.title} (${des.name})`,
      subtitle: `Address: ${dist.fullAddress} · Footprint: ${areaPy}py (${(areaPy * 3.3).toFixed(1)}m²) · Mode: ${state.threeMode.toUpperCase()}`,
      metrics: spatialMetricSummary(activeRes),
    });

    const filename = `rehearsal-3d-${state.districtId}-${state.categoryId}-${state.designId}.png`;
    setDirectExportReady({
      url: snap.dataUrl,
      filename,
      copyText: snap.dataUrl,
      imagePreviewUrl: snap.dataUrl,
    });
    $("export3DStatusText").textContent = `✅ Exported Hi-Res Snapshot (${snap.width}×${snap.height}px PNG with Telemetry Title Block)`;
  });

  $("export3DBlueprintSheetBtn").addEventListener("click", () => {
    const dist = getActiveDistrict();
    const cat = getActiveCategory();
    const des = getActiveDesign();
    const unit = getActiveUnit();
    const areaPy = state.customAreaPyeong ?? unit.areaPyeong;
    const activeRes =
      state.threeMode === "baseline"
        ? state.results?.base
        : state.results?.plan;
    const activeScene =
      state.threeMode === "baseline" ? state.base : state.plan;

    const sheet = threeStage.exportMultiViewBlueprintSheet({
      title: `${dist.name} · ${cat.title} (${des.name})`,
      subtitle: `Address: ${dist.fullAddress} · Footprint: ${areaPy}py (${(areaPy * 3.3).toFixed(1)}m²) · Mode: ${state.threeMode.toUpperCase()}`,
      metrics: spatialMetricSummary(activeRes),
      fixtures: activeScene.objects.map((o) => ({
        id: o.id,
        label: o.label || o.koLabel || o.id,
        x: o.x,
        y: o.y,
        w: o.w,
        h: o.h,
      })),
    });

    const filename = `rehearsal-blueprint-sheet-${state.districtId}-${state.categoryId}-${state.designId}.png`;
    setDirectExportReady({
      url: sheet.dataUrl,
      filename,
      copyText: sheet.dataUrl,
      imagePreviewUrl: sheet.dataUrl,
    });
    $("export3DStatusText").textContent = `✅ Exported Dual Blueprint Sheet (${sheet.width}×${sheet.height}px Iso 3D + Ortho 2D + Fixture Schedule)`;
  });

  $("export3DGltfBtn").addEventListener("click", async () => {
    try {
      $("export3DStatusText").textContent = "⏳ Building glTF 2.0 scene hierarchy...";
      const res = await threeStage.exportGLTF(false);
      const filename = `rehearsal-floorplan-${state.categoryId}-${state.designId}.gltf`;
      const url = createManagedObjectUrl(res.blob);
      const fullJson = await res.blob.text();
      setDirectExportReady({
        url,
        filename,
        copyText: fullJson,
        codeSnippet: res.textPreview,
      });
      const kb = (res.sizeBytes / 1024).toFixed(1);
      $("export3DStatusText").textContent = `✅ Exported ${filename} (${kb} KB · glTF 2.0 Scene)`;
    } catch (err) {
      $("export3DStatusText").textContent = `⚠️ glTF export failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  });

  $("export3DGlbBtn").addEventListener("click", async () => {
    try {
      $("export3DStatusText").textContent = "⏳ Packing binary GLB 3D asset...";
      const res = await threeStage.exportGLTF(true);
      const filename = `rehearsal-floorplan-${state.categoryId}-${state.designId}.glb`;
      const url = createManagedObjectUrl(res.blob);
      setDirectExportReady({
        url,
        filename,
        copyText: res.textPreview || filename,
        codeSnippet: res.textPreview,
      });
      const kb = (res.sizeBytes / 1024).toFixed(1);
      $("export3DStatusText").textContent = `✅ Exported ${filename} (${kb} KB · Binary GLB)`;
    } catch (err) {
      $("export3DStatusText").textContent = `⚠️ GLB export failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  });

  $("export3DObjBtn").addEventListener("click", () => {
    try {
      const res = threeStage.exportOBJ();
      const filename = `rehearsal-floorplan-${state.categoryId}-${state.designId}.obj`;
      const url = createManagedObjectUrl(res.blob);
      setDirectExportReady({
        url,
        filename,
        copyText: res.fullText,
        codeSnippet: res.textPreview,
      });
      const kb = (res.sizeBytes / 1024).toFixed(1);
      $("export3DStatusText").textContent = `✅ Exported ${filename} (${kb} KB · ${res.vertexCount.toLocaleString("en-US")} vertices)`;
    } catch (err) {
      $("export3DStatusText").textContent = `⚠️ OBJ export failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  });

  $("export3DCsvBtn").addEventListener("click", () => {
    const cells = tenKMatrix.getCells();
    const csvText = exportTenKCellsCsv(cells);
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const filename = `rehearsal-10000-scenarios-${state.districtId}-${state.categoryId}-${state.designId}.csv`;
    const url = createManagedObjectUrl(blob);
    const previewLines = csvText.split("\n").slice(0, 8).join("\n") + "\n...";
    setDirectExportReady({
      url,
      filename,
      copyText: csvText,
      codeSnippet: previewLines,
    });
    const kb = (blob.size / 1024).toFixed(1);
    $("export3DStatusText").textContent = `✅ Exported ${filename} (${kb} KB · 10,000 Store Runs CSV Dataset)`;
  });

  $("export3DReportBtn").addEventListener("click", () => {
    const dist = getActiveDistrict();
    const cat = getActiveCategory();
    const des = getActiveDesign();
    const unit = getActiveUnit();
    const areaPy = state.customAreaPyeong ?? unit.areaPyeong;
    const cells = tenKMatrix.getCells();
    const benches = findBenchmarkStoreCells(cells);
    const engineStatus = $("backendEngineStatus")?.textContent || "Not verified";

    const mdLines = [
      `# REA · A Thousand Stores — Spatial Preview & Separate Financial Engine Report`,
      ``,
      `- **Generated UTC**: ${new Date().toISOString()}`,
      `- **Commercial District**: ${dist.name} (${dist.fullAddress})`,
      `- **Store Category & Concept**: ${cat.title} — ${des.name} (${areaPy}py / ${(areaPy * 3.3).toFixed(1)}m²)`,
      `- **36-Month Engine Verification**: ${engineStatus}`,
      `- **Scope**: Spatial wafer economics and representative trajectory packets are [assumed], not 10,000 independently verified 3D runs. Financial engine results do not certify these layouts.`,
      ``,
      `## 1. Spatial Flow & Queue Bottleneck Summary`,
      `- **Baseline Layout**: ${spatialMetricSummary(state.results?.base)}`,
      `- **Proposed Layout**: ${spatialMetricSummary(state.results?.plan)} (${spatialWaitDelta(state.results?.base, state.results?.plan)})`,
      `- **Wafer Preview [assumed]**: ${cells.filter((cell) => cell.proposedSurvived).length.toLocaleString("en-US")} / ${cells.length.toLocaleString("en-US")} cells pass the illustrative model`,
      ``,
      `## 2. Assumed Benchmark Cells from 100×100 Wafer Matrix`,
      `- **#1 Optimal Store Run**: Run \`#${String(benches.optimal.runIndex).padStart(5, "0")}\` (Family #${benches.optimal.familyId}, Variant #${benches.optimal.variantId}) — Wait \`${benches.optimal.proposedWaitSec}s\`, Clearance \`${benches.optimal.aisleClearanceM}m\`, Payback \`Mo ${benches.optimal.breakEvenMonth}\``,
      `- **Top Rescued Store Run**: Run \`#${String(benches.rescued.runIndex).padStart(5, "0")}\` (Family #${benches.rescued.familyId}, Variant #${benches.rescued.variantId}) — Wait Reduced \`${benches.rescued.baselineWaitSec}s → ${benches.rescued.proposedWaitSec}s\`, Diagnosis: ${benches.rescued.failureReason}`,
      `- **Worst Bottleneck Run**: Run \`#${String(benches.worst.runIndex).padStart(5, "0")}\` (Family #${benches.worst.familyId}, Variant #${benches.worst.variantId}) — Wait \`${benches.worst.proposedWaitSec}s\`, Clearance \`${benches.worst.aisleClearanceM}m\`, Failure: ${benches.worst.failureReason}`,
      ``,
      `## 3. 3D CAD Fixture Coordinates (12.0m × 9.0m Metric Grid)`,
      ...state.plan.objects.map(
        (o) =>
          `- **${o.label || o.koLabel || o.id}** (\`${o.id}\`): Position \`X=${o.x.toFixed(1)}m, Y=${o.y.toFixed(1)}m\` · Footprint \`${o.w.toFixed(1)}m × ${o.h.toFixed(1)}m\``
      ),
      ``,
    ];
    const reportText = mdLines.join("\n");
    const blob = new Blob([reportText], { type: "text/markdown;charset=utf-8" });
    const filename = `rehearsal-10k-audit-${state.districtId}-${state.categoryId}.md`;
    const url = createManagedObjectUrl(blob);
    setDirectExportReady({
      url,
      filename,
      copyText: reportText,
      codeSnippet: mdLines.slice(0, 14).join("\n") + "\n...",
    });
    $("export3DStatusText").textContent = `✅ Exported ${filename} (10,000-Scenario Executive Audit Report)`;
  });

  $("threeThemeBtn").addEventListener("click", () => {
    const nextTheme = threeStage.toggleTheme();
    $("pgrunStageShell").setAttribute("data-stage-theme", nextTheme);
  });

  $("threeRotateFurnitureBtn").addEventListener("click", () => {
    $("rotateObjBtn").click();
  });

  $("resetIsoOrbitBtn").addEventListener("click", () => {
    state.isoYawRad = 0;
    state.isoPitchRatio = 0.5;
    state.isoZoomScale = 1.0;
    syncControls();
    drawAll();
  });

  // Global keyboard shortcuts for 3D Stage (P, B, A, S, C, 1-6, R, I, T)
  window.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (
      state.walkMode ||
      ["INPUT", "SELECT", "TEXTAREA"].includes(tag || "") ||
      e.metaKey ||
      e.ctrlKey ||
      e.altKey
    ) {
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "p") {
      state.threeMode = "proposed";
      syncControls();
      drawAll();
    } else if (k === "b") {
      state.threeMode = "baseline";
      syncControls();
      drawAll();
    } else if (k === "i") {
      setActiveCamBadge("iso");
      threeStage.snapToIsoView();
    } else if (k === "v") {
      setActiveCamBadge("pov");
      threeStage.snapToPovView();
    } else if (k === "t") {
      const nextTheme = threeStage.toggleTheme();
      $("pgrunStageShell").setAttribute("data-stage-theme", nextTheme);
    } else if (k === "r") {
      $("rotateObjBtn").click();
    } else if (["1", "2", "3", "4", "5", "6"].includes(k)) {
      const idx = Number(k) - 1;
      const preset = SCENARIO_PRESETS[idx];
      if (preset) setPreset(preset.id);
    }
  });

  // Canvas Dragging + 360° Mouse Orbit Rotation on #baseCanvas & #planCanvas
  canvases[0].style.cursor = "grab";
  canvases[1].style.cursor = "grab";

  canvases[0].addEventListener("pointerdown", (e) => {
    orbitDrag = {
      startX: e.clientX,
      startY: e.clientY,
      startYaw: state.isoYawRad,
      startPitch: state.isoPitchRatio,
    };
    canvases[0].setPointerCapture(e.pointerId);
    canvases[0].style.cursor = "grabbing";
  });

  canvases[0].addEventListener("pointermove", (e) => {
    if (!orbitDrag) return;
    const dx = e.clientX - orbitDrag.startX;
    const dy = e.clientY - orbitDrag.startY;
    state.isoYawRad = orbitDrag.startYaw + dx * 0.012;
    state.isoPitchRatio = Math.max(
      0.28,
      Math.min(0.78, orbitDrag.startPitch + dy * 0.0025)
    );
    syncControls();
    drawAll();
  });

  canvases[0].addEventListener("pointerup", () => {
    if (orbitDrag) {
      orbitDrag = null;
      canvases[0].style.cursor = "grab";
    }
  });

  canvases[1].addEventListener("keydown", (e) => {
    if (state.walkMode) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-0.2, 0],
      ArrowRight: [0.2, 0],
      ArrowUp: [0, -0.2],
      ArrowDown: [0, 0.2],
    };
    const d = moves[e.key];
    if (d) {
      e.preventDefault();
      const o = getSelectedObject();
      setPosition(o.x + d[0], o.y + d[1]);
    }
  });

  canvases[1].addEventListener("pointerdown", (e) => {
    if (!views[1]) return;
    const b = canvases[1].getBoundingClientRect();
    const pt = unproject(views[1], e.clientX - b.left, e.clientY - b.top);
    const hit = [...state.plan.objects]
      .reverse()
      .find(
        (a) =>
          a.movable &&
          pt.x >= a.x - 0.3 &&
          pt.x <= a.x + a.w + 0.3 &&
          pt.y >= a.y - 0.3 &&
          pt.y <= a.y + a.h + 0.3
      );
    if (hit) {
      state.selected = hit.id;
      drag = { id: hit.id, dx: pt.x - hit.x, dy: pt.y - hit.y };
      canvases[1].setPointerCapture(e.pointerId);
      canvases[1].style.cursor = "grabbing";
      syncControls();
      drawAll();
    } else {
      // Dragging on empty floor rotates the 3D isometric floorplan 360°!
      orbitDrag = {
        startX: e.clientX,
        startY: e.clientY,
        startYaw: state.isoYawRad,
        startPitch: state.isoPitchRatio,
      };
      canvases[1].setPointerCapture(e.pointerId);
      canvases[1].style.cursor = "grabbing";
    }
  });

  canvases[1].addEventListener("pointermove", (e) => {
    if (!views[1]) return;
    const b = canvases[1].getBoundingClientRect();
    const pt = unproject(views[1], e.clientX - b.left, e.clientY - b.top);
    if (drag) {
      setPosition(pt.x - drag.dx, pt.y - drag.dy, false);
      return;
    }
    if (orbitDrag) {
      const dx = e.clientX - orbitDrag.startX;
      const dy = e.clientY - orbitDrag.startY;
      state.isoYawRad = orbitDrag.startYaw + dx * 0.012;
      state.isoPitchRatio = Math.max(
        0.28,
        Math.min(0.78, orbitDrag.startPitch + dy * 0.0025)
      );
      syncControls();
      drawAll();
      return;
    }
    const hoverHit = [...state.plan.objects]
      .reverse()
      .find(
        (a) =>
          a.movable &&
          pt.x >= a.x - 0.25 &&
          pt.x <= a.x + a.w + 0.25 &&
          pt.y >= a.y - 0.25 &&
          pt.y <= a.y + a.h + 0.25
      );
    const nextHover = hoverHit ? hoverHit.id : null;
    if (nextHover !== state.hovered) {
      state.hovered = nextHover;
      canvases[1].style.cursor = nextHover ? "grab" : "grab";
      drawAll();
    }
  });

  canvases[1].addEventListener("pointerup", () => {
    if (drag) {
      drag = null;
      canvases[1].style.cursor = "grab";
      recompute();
    }
    if (orbitDrag) {
      orbitDrag = null;
      canvases[1].style.cursor = "grab";
    }
  });

  // Walk Mode
  function stepWalkPlayer(dx: number, dy: number): void {
    if (!state.walkMode) {
      state.walkMode = true;
      state.playing = false;
      syncControls();
    }
    const accepted = ([state.base, state.plan] as const).map((scene, i) => {
      const target = {
        x: Math.round((state.players[i].x + dx) * 100) / 100,
        y: Math.round((state.players[i].y + dy) * 100) / 100,
      };
      if (canStand(scene, target, state.body)) {
        state.players[i] = target;
        return true;
      }
      return false;
    });
    $("walkHint").textContent = `Baseline: ${accepted[0] ? "Pass" : "Blocked!"} · Proposed: ${
      accepted[1] ? "Pass" : "Blocked!"
    }`;
    drawAll();
  }

  $("walkBtn").addEventListener("click", () => {
    state.walkMode = !state.walkMode;
    state.playing = false;
    state.players = [
      { ...state.base.entrance },
      { ...state.plan.entrance },
    ];
    syncControls();
    drawAll();
    if (state.walkMode) canvases[1].focus();
  });

  document
    .querySelectorAll<HTMLButtonElement>(".dpad-btn[data-move]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const dir = btn.getAttribute("data-move");
        if (dir === "up") stepWalkPlayer(0, -0.25);
        if (dir === "down") stepWalkPlayer(0, 0.25);
        if (dir === "left") stepWalkPlayer(-0.25, 0);
        if (dir === "right") stepWalkPlayer(0.25, 0);
      });
    });

  window.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (
      !state.walkMode ||
      ["INPUT", "SELECT", "TEXTAREA"].includes(tag || "")
    ) {
      return;
    }
    const map: Record<string, [number, number]> = {
      ArrowUp: [0, -0.2],
      ArrowDown: [0, 0.2],
      ArrowLeft: [-0.2, 0],
      ArrowRight: [0.2, 0],
      w: [0, -0.2],
      s: [0, 0.2],
      a: [-0.2, 0],
      d: [0.2, 0],
    };
    const d = map[e.key];
    if (!d) return;
    e.preventDefault();
    stepWalkPlayer(d[0], d[1]);
  });

  // Export & Preview
  function summary(r: SimResult | undefined) {
    if (!r) return null;
    const { frames: _frames, ...s } = r;
    return s;
  }

  function packet() {
    return {
      product: "Rehearsal spatial studio",
      version: 3,
      district: state.districtId,
      address: state.address,
      budgetManWon: state.budgetManWon,
      category: state.categoryId,
      design: state.designId,
      calculationStatus: state.dirty
        ? "pending"
        : state.results
        ? "complete"
        : "error",
      revision: state.rev,
      baseline: {
        scene: state.base,
        config: getConfig(1),
        result: summary(state.results?.base),
      },
      proposal: {
        scene: state.plan,
        config: getConfig(state.pickupStaff),
        result: summary(state.results?.plan),
      },
    };
  }

  function downloadFile(name: string, text: string, type: string): void {
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob([text], { type }));
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $("jsonBtn").addEventListener("click", () => {
    if (state.results) {
      downloadFile(
        "rehearsal-scenario.json",
        JSON.stringify(packet(), null, 2),
        "application/json"
      );
    }
  });

  $("exportBtn").addEventListener("click", () => {
    if (!state.results) return;
    downloadFile(
      "rehearsal-crew-plan.txt",
      buildCrewPlanText(),
      "text/plain;charset=utf-8"
    );
  });

  $("previewPlanBtn").addEventListener("click", () => {
    state.showPlanPreview = !state.showPlanPreview;
    $("planPreviewBox").classList.toggle("hidden", !state.showPlanPreview);
    if (state.showPlanPreview) {
      $("planPreviewText").textContent = buildCrewPlanText();
    }
  });

  // Blueprint Upload
  const ic = $<HTMLCanvasElement>("imageCanvas");

  function drawBlueprintCanvas(): void {
    const b = ic.getBoundingClientRect();
    const w = Math.max(b.width, 260);
    const h = Math.max(b.height, 160);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ic.width = Math.round(w * dpr);
    ic.height = Math.round(h * dpr);
    const ctx = ic.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, w, h);

    if (!blueprintSource) return;

    const srcW = blueprintSource.width;
    const srcH = blueprintSource.height;
    const scale = Math.min(w / srcW, h / srcH);
    const dw = srcW * scale;
    const dh = srcH * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    state.imageRect = { x: dx, y: dy, w: dw, h: dh };
    ctx.drawImage(blueprintSource, dx, dy, dw, dh);

    if (state.roi) {
      const a = state.roi;
      ctx.fillStyle = "rgba(16, 185, 129, 0.22)";
      ctx.fillRect(
        dx + a.left * dw,
        dy + a.top * dh,
        (a.right - a.left) * dw,
        (a.bottom - a.top) * dh
      );
      ctx.strokeStyle = "#059669";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        dx + a.left * dw,
        dy + a.top * dh,
        (a.right - a.left) * dw,
        (a.bottom - a.top) * dh
      );
    }
  }

  function getNormalizedImagePoint(e: PointerEvent): Point2D {
    const b = ic.getBoundingClientRect();
    const r = state.imageRect || { x: 0, y: 0, w: b.width, h: b.height };
    return {
      x: Math.max(0, Math.min(1, (e.clientX - b.left - r.x) / r.w)),
      y: Math.max(0, Math.min(1, (e.clientY - b.top - r.y) / r.h)),
    };
  }

  function syncBoxState(): void {
    const r = state.roi;
    const valid =
      Boolean(r) &&
      r!.right - r!.left > 0.025 &&
      r!.bottom - r!.top > 0.025;
    $<HTMLButtonElement>("applyBox").disabled =
      !valid || !$<HTMLInputElement>("presenceConfirm").checked;
    if (r) {
      const mx = (r.left * 12).toFixed(1);
      const my = (r.top * 9).toFixed(1);
      const mw = ((r.right - r.left) * 12).toFixed(1);
      const mh = ((r.bottom - r.top) * 9).toFixed(1);
      $("imageStatus").textContent = `Selected ROI: X=${mx}m, Y=${my}m (${mw}×${mh}m)`;
    }
  }

  $("loadSampleBlueprintBtn").addEventListener("click", () => {
    blueprintSource = generateSampleBlueprintCanvas();
    state.roi = { left: 0.36, top: 0.4, right: 0.61, bottom: 0.56 };
    drawBlueprintCanvas();
    syncBoxState();
  });

  $<HTMLInputElement>("imageFile").addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const next = new Image();
    next.onload = () => {
      URL.revokeObjectURL(url);
      blueprintSource = next;
      state.roi = null;
      drawBlueprintCanvas();
      syncBoxState();
    };
    next.src = url;
  });

  ic.addEventListener("pointerdown", (e) => {
    if (!blueprintSource) {
      blueprintSource = generateSampleBlueprintCanvas();
    }
    imageDrag = getNormalizedImagePoint(e);
    ic.setPointerCapture(e.pointerId);
  });

  ic.addEventListener("pointermove", (e) => {
    if (!imageDrag) return;
    const b = getNormalizedImagePoint(e);
    state.roi = {
      left: Math.min(imageDrag.x, b.x),
      right: Math.max(imageDrag.x, b.x),
      top: Math.min(imageDrag.y, b.y),
      bottom: Math.max(imageDrag.y, b.y),
    };
    drawBlueprintCanvas();
    syncBoxState();
  });

  ic.addEventListener("pointerup", () => {
    imageDrag = null;
    syncBoxState();
  });

  $<HTMLInputElement>("presenceConfirm").addEventListener(
    "change",
    syncBoxState
  );

  $("applyBox").addEventListener("click", () => {
    if ($<HTMLButtonElement>("applyBox").disabled || !state.roi) return;
    const r = state.roi;
    const id = `manual-${state.rev + 1}`;
    state.plan.objects.push({
      id,
      label: "Manual obstacle",
      koLabel: "Blueprint Fixture",
      x: Math.round(r.left * 120) / 10,
      y: Math.round(r.top * 90) / 10,
      w: Math.max(0.4, Math.round((r.right - r.left) * 120) / 10),
      h: Math.max(0.4, Math.round((r.bottom - r.top) * 90) / 10),
      kind: "display",
      movable: true,
    });
    state.selected = id;
    state.preset = "custom";
    recompute();
    $("sec-simulator").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("applyCalibrationBtn").addEventListener("click", () => {
    const obsArr = Number($<HTMLInputElement>("obsArrivalsInput").value);
    const obsWait = Number($<HTMLInputElement>("obsWaitInput").value);
    if (!Number.isFinite(obsArr) || !Number.isFinite(obsWait)) return;

    const predWait = observed(state.results?.plan) ?? 0;
    const diffSec = obsWait - predWait;
    state.arrival = Math.max(0, Math.min(8, Math.round(obsArr * 2) / 2));
    $<HTMLInputElement>("arrivals").value = String(state.arrival);
    if (Math.abs(diffSec) > 3) {
      const ratio = Math.max(
        0.7,
        Math.min(1.35, obsWait / Math.max(5, predWait))
      );
      state.service = Math.max(
        8,
        Math.min(45, Math.round(state.service * ratio))
      );
      $<HTMLInputElement>("service").value = String(state.service);
    }
    state.preset = "custom";
    recompute();
    $("calibrationResultBox").textContent = `Calibrated: ${obsArr.toFixed(1)} pax/min · ${obsWait}s wait applied`;
  });

  function animate(now: number): void {
    const dt = last ? Math.min((now - last) / 1000, 0.2) : 0;
    last = now;
    if (state.playing) {
      state.t = Math.min(600, state.t + dt * state.speed);
      if (state.t >= 600) {
        state.playing = false;
        syncControls();
      }
    }
    if (++frameCounter % 2 === 0) {
      drawAll();
    }
    window.requestAnimationFrame(animate);
  }

  window.RehearsalApp = {
    getState: () => ({
      seed: state.seed,
      dirty: state.dirty,
      walkMode: state.walkMode,
      playerPositions: state.players.map((p) => ({ ...p })),
      revision: state.rev,
      config: getConfig(state.pickupStaff),
      scene: JSON.parse(JSON.stringify(state.plan)),
      results: state.results
        ? {
            base: summary(state.results.base),
            plan: summary(state.results.plan),
          }
        : null,
    }),
    packet,
    manualBox: () => state.roi,
  };

  blueprintSource = generateSampleBlueprintCanvas();
  state.roi = { left: 0.36, top: 0.4, right: 0.61, bottom: 0.56 };

  renderParsedUnitChips();
  renderCategoryCards();
  renderDesignTabs();
  renderScenarioDeck();
  applyCategoryAndDesignToScene();

  new ResizeObserver(() => {
    drawAll();
    drawBlueprintCanvas();
  }).observe(document.querySelector(".rea-main-col")!);

  recompute();
  syncControls();
  drawBlueprintCanvas();
  syncBoxState();
  window.requestAnimationFrame(animate);
}

initStudio();

async function syncWithBackendEngine(rerun = false): Promise<void> {
  const status = document.getElementById("backendEngineStatus");
  const button = document.getElementById(
    "refreshBackendEngineBtn"
  ) as HTMLButtonElement | null;
  if (button) button.disabled = true;
  if (status) {
    status.textContent = rerun
      ? "Running the 36-month engine…"
      : "Loading engine results…";
  }
  try {
    const res = await fetch(rerun ? "/api/rehearse" : "/api/summary", {
      method: rerun ? "POST" : "GET",
      headers: rerun ? { "Content-Type": "application/json" } : undefined,
      body: rerun ? JSON.stringify({ mode: 10000 }) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error("Engine returned HTTP " + res.status);
    const summary = summarizeBackendRun(await res.json());
    if (status) {
      status.textContent = `36-month engine [computed · ${
        summary.replay ? "cached replay" : "fresh run"
      }]: ${summary.survived.toLocaleString(
        "en-US"
      )} / ${summary.total.toLocaleString("en-US")} completed scenarios · ${
        summary.runId
      }`;
    }
  } catch {
    if (status) {
      status.textContent =
        "36-month backend unavailable. Spatial preview remains illustrative; no live engine result is claimed.";
    }
  } finally {
    if (button) button.disabled = false;
  }
}

document
  .getElementById("refreshBackendEngineBtn")
  ?.addEventListener("click", () => {
    void syncWithBackendEngine(true);
  });

void syncWithBackendEngine();
