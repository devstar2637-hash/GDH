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

// 1. REAL COMMERCIAL DISTRICT ANALYSIS DATA & LINK PARSER (상권 분석 & 링크 매칭 엔진)
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
    name: "성수 연무장길",
    sampleUrl: "https://naver.me/seongsu-yeonmu42-1f",
    fullAddress: "서울 성동구 성수동2가 연무장길 42 (1층 · 15평)",
    areaPyeong: 15,
    areaM2: "49.5㎡ (12×9m)",
    dailyFootTraffic: 42800,
    peakHours: "주말 13:00–17:30",
    peakArrivalMultiplier: 1.0,
    depositManWon: 5000,
    monthlyRentManWon: 380,
    targetPersona: "2030 팝업·카페 투어족 & 직장인",
    bestCategoryId: "coffee",
    districtSummary:
      "평일 점심 테이크아웃과 주말 팝업·쇼룸 유입이 겹치는 고회전 상권입니다. 입구 병목만 제거하면 시간당 회전율이 68% 상승합니다.",
    units: [
      {
        unitId: "101",
        label: "1층 101호 전면통창 (15평 · 5,000/380)",
        areaPyeong: 15,
        depositManWon: 5000,
        monthlyRentManWon: 380,
        trafficFactor: 1.0,
      },
      {
        unitId: "102",
        label: "1층 102호 코너소형 (11평 · 3,500/270)",
        areaPyeong: 11,
        depositManWon: 3500,
        monthlyRentManWon: 270,
        trafficFactor: 0.9,
      },
      {
        unitId: "b1",
        label: "B1층 대형쇼룸 (22평 · 4,500/330)",
        areaPyeong: 22,
        depositManWon: 4500,
        monthlyRentManWon: 330,
        trafficFactor: 1.1,
      },
    ],
  },
  {
    id: "yeonnam",
    name: "연남동 경의선숲길",
    sampleUrl: "https://kko.to/yeonnam-forest38-1f",
    fullAddress: "서울 마포구 연남동 경의선숲길 38 (1층 · 12평)",
    areaPyeong: 12,
    areaM2: "39.6㎡ (12×9m)",
    dailyFootTraffic: 38400,
    peakHours: "주말 12:30–18:00",
    peakArrivalMultiplier: 1.12,
    depositManWon: 4000,
    monthlyRentManWon: 310,
    targetPersona: "산책·베이커리 포장 & 데이트 고객",
    bestCategoryId: "bakery",
    districtSummary:
      "숲길 산책객의 베이커리·디저트 트레이 구매 비중이 64%로 높습니다. 중앙 빵 쇼케이스 순환 동선이 매출을 좌우합니다.",
    units: [
      {
        unitId: "101",
        label: "1층 숲길전면 (12평 · 4,000/310)",
        areaPyeong: 12,
        depositManWon: 4000,
        monthlyRentManWon: 310,
        trafficFactor: 1.0,
      },
      {
        unitId: "102",
        label: "1.5층 테라스호실 (16평 · 4,500/340)",
        areaPyeong: 16,
        depositManWon: 4500,
        monthlyRentManWon: 340,
        trafficFactor: 1.05,
      },
      {
        unitId: "b1",
        label: "반지하 공방형 (14평 · 2,500/210)",
        areaPyeong: 14,
        depositManWon: 2500,
        monthlyRentManWon: 210,
        trafficFactor: 0.85,
      },
    ],
  },
  {
    id: "hannam",
    name: "한남동 카페거리",
    sampleUrl: "https://nemoapp.kr/hannam-itaewon54-18py",
    fullAddress: "서울 용산구 한남동 이태원로54길 (1층 · 18평)",
    areaPyeong: 18,
    areaM2: "59.4㎡ (12×9m)",
    dailyFootTraffic: 29500,
    peakHours: "금·토 15:00–21:00",
    peakArrivalMultiplier: 0.85,
    depositManWon: 6500,
    monthlyRentManWon: 490,
    targetPersona: "고관여 큐레이션·와인 & 라운지 체류층",
    bestCategoryId: "wine",
    districtSummary:
      "방문객 수는 성수보다 적지만 1인당 객단가(2.4만 원)가 3.8배 높습니다. 여유로운 라운지 좌석과 큐레이션 랙 배치가 핵심입니다.",
    units: [
      {
        unitId: "101",
        label: "1층 단독정원형 (18평 · 6,500/490)",
        areaPyeong: 18,
        depositManWon: 6500,
        monthlyRentManWon: 490,
        trafficFactor: 1.0,
      },
      {
        unitId: "201",
        label: "2층 통창라운지 (20평 · 5,000/390)",
        areaPyeong: 20,
        depositManWon: 5000,
        monthlyRentManWon: 390,
        trafficFactor: 0.92,
      },
    ],
  },
  {
    id: "sinsa",
    name: "신사 가로수길",
    sampleUrl: "https://zigbang.com/sinsa-garosu21-14py",
    fullAddress: "서울 강남구 신사동 가로수길 21 (1층 · 14평)",
    areaPyeong: 14,
    areaM2: "46.2㎡ (12×9m)",
    dailyFootTraffic: 46200,
    peakHours: "매일 12:00–16:30",
    peakArrivalMultiplier: 1.15,
    depositManWon: 5500,
    monthlyRentManWon: 440,
    targetPersona: "글로벌 관광객 & 트렌드 팝업 방문층",
    bestCategoryId: "matcha",
    districtSummary:
      "외국인 관광객과 SNS 인증 수요가 집중되어 포토존 + 아일랜드 시음 동선 구성 시 초기 투자비 회수가 가장 빠릅니다.",
    units: [
      {
        unitId: "101",
        label: "1층 메인스트리트 (14평 · 5,500/440)",
        areaPyeong: 14,
        depositManWon: 5500,
        monthlyRentManWon: 440,
        trafficFactor: 1.0,
      },
      {
        unitId: "102",
        label: "세로수길 코너1층 (12평 · 4,200/330)",
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
    shortName: "스페셜티 카페",
    title: "스페셜티 커피 & 로스터리",
    interiorCostManWon: 3800,
    avgTicketWon: 5600,
    defaultArrival: 4.0,
    defaultServiceSec: 20,
    mainDisplayLabel: "원두·MD 진열대",
    orderDeskLabel: "주문·포스 바",
    pickupDeskLabel: "에스프레소·픽업 바",
    benchLabel: "창가 웨이팅 벤치",
    tableLabels: ["2인 카페석 A", "2인 카페석 B", "바 테이블 C"],
    scenarioTotal: 10000,
    survivedCount: 8420,
    layoutRuleNote:
      "카페 동선 규칙: 입구(IN) → 주문 바 → 에스프레소 픽업 바 동선에서 원두 진열대가 입구를 막지 않도록 분리합니다.",
  },
  {
    id: "bakery",
    icon: "🥐",
    shortName: "소금빵 베이커리",
    title: "소금빵·구움과자 베이커리",
    interiorCostManWon: 4500,
    avgTicketWon: 9800,
    defaultArrival: 4.5,
    defaultServiceSec: 24,
    mainDisplayLabel: "소금빵·크루아상 트레이 매대",
    orderDeskLabel: "트레이 결제 카운터",
    pickupDeskLabel: "데크오븐·포장 픽업대",
    benchLabel: "트레이·집게 스테이션",
    tableLabels: ["구움과자 매대 A", "시식 테이블 B", "포장 대기석 C"],
    scenarioTotal: 10000,
    survivedCount: 8640,
    layoutRuleNote:
      "베이커리 동선 규칙: 손님이 집게로 빵을 담는 중앙 트레이 매대 주변에 최소 1.4m 양방향 회유 통로를 확보합니다.",
  },
  {
    id: "matcha",
    icon: "🍵",
    shortName: "성수 팝업 스토어",
    title: "말차·굿즈 쇼룸 팝업",
    interiorCostManWon: 2400,
    avgTicketWon: 12500,
    defaultArrival: 4.5,
    defaultServiceSec: 18,
    mainDisplayLabel: "360° 굿즈·시음 아일랜드",
    orderDeskLabel: "셀프 키오스크 바",
    pickupDeskLabel: "말차 차선·기프트 픽업",
    benchLabel: "전신 거울 포토존",
    tableLabels: ["전시 플린스 A", "전시 플린스 B", "스탠딩 시음바 C"],
    scenarioTotal: 10000,
    survivedCount: 8900,
    layoutRuleNote:
      "팝업 동선 규칙: 포토존 체류 인원과 360° 아일랜드 관람객이 키오스크 결제 줄과 겹치지 않도록 순환형으로 배치합니다.",
  },
  {
    id: "wine",
    icon: "🍷",
    shortName: "네추럴 와인바",
    title: "네추럴 와인 & 그로서리",
    interiorCostManWon: 5200,
    avgTicketWon: 24000,
    defaultArrival: 3.0,
    defaultServiceSec: 26,
    mainDisplayLabel: "오크통 바틀 큐레이션 랙",
    orderDeskLabel: "소믈리에 카운터",
    pickupDeskLabel: "글라스·패키징 바",
    benchLabel: "치즈·샤퀴테리 쇼케이스",
    tableLabels: ["테이스팅석 A", "테이스팅석 B", "와인 바 테이블 C"],
    scenarioTotal: 10000,
    survivedCount: 8520,
    layoutRuleNote:
      "와인바 동선 규칙: 바틀 큐레이션 랙 앞 시음 공간과 테이스팅 테이블 좌석 간격을 넓혀 체류 만족도를 높입니다.",
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
    name: "Design A · 익스프레스 바",
    desc: "입구→주문→픽업 직선 동선 · 테이크아웃 최적화",
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
    name: "Design B · 360° 아일랜드",
    desc: "중앙 쇼케이스 순환 동선 · 베이커리·팝업 특화",
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
    name: "Design C · 라운지 쇼룸",
    desc: "창가 좌석·여유 통로 극대화 · 체류형 매장",
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
    title: "평일·주말 표준 운영",
    countLabel: "3,200개",
    ruleDesc: "분당 4.0명 유입 · 주문 1명 + 픽업 2명 · 보행폭 0.65m",
    arrival: 4.0,
    service: 20,
    body: 0.65,
    pickupStaff: 2,
  },
  {
    id: "rainy",
    code: "SCN-02",
    title: "🌧️ 비 오는 토요일 피크",
    countLabel: "2,400개",
    ruleDesc: "우천 실내 유입 폭증(분당 6.5명) · 체류·대기 동시 증가",
    arrival: 6.5,
    service: 22,
    body: 0.65,
    pickupStaff: 2,
  },
  {
    id: "layout",
    code: "SCN-03",
    title: "⚠️ 직원 1명 결근·독박",
    countLabel: "1,400개",
    ruleDesc: "인력 충원 없이(픽업 1명) 도면 배치 변경만으로 버티기",
    arrival: 4.0,
    service: 20,
    body: 0.65,
    pickupStaff: 1,
  },
  {
    id: "influencer",
    code: "SCN-04",
    title: "📸 오픈런 인플루언서 웨이팅",
    countLabel: "1,200개",
    ruleDesc: "분당 7.5명 최대 유입 + 픽업 숙련 인력 3명 풀가동",
    arrival: 7.5,
    service: 18,
    body: 0.65,
    pickupStaff: 3,
  },
  {
    id: "staff",
    code: "SCN-05",
    title: "👥 도면 유지 + 인력만 +1",
    countLabel: "1,000개",
    ruleDesc: "가구 이동 없이 픽업 직원만 1명→2명 증원했을 때의 효과",
    arrival: 4.0,
    service: 20,
    body: 0.65,
    pickupStaff: 2,
  },
  {
    id: "stroller",
    code: "SCN-06",
    title: "👶 유모차·단체손님 진입",
    countLabel: "800개",
    ruleDesc: "통과 요구폭 1.20m 적용 — 좁은 입구 통로 차단 여부 검증",
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
}

const state: StudioState = {
  districtId: "seongsu",
  selectedUnitId: "101",
  customAreaPyeong: null,
  customDepositManWon: null,
  customRentManWon: null,
  parsedLinkSource: "네이버 지도 · 성수 연무장길 상가 매칭됨",
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
};

function mountShell(): void {
  const root = document.getElementById("root")!;
  root.innerHTML = `
    <!-- TOP BAR (rea.tools style editorial header) -->
    <header class="rea-header">
      <div class="rea-header-inner">
        <div class="rea-brand">
          <a href="#sec-setup" class="rea-logo">Rehearsal</a>
          <span class="rea-tagline">Store Spatial & Commercial District Simulator</span>
        </div>
        <nav class="rea-nav" aria-label="주요 섹션">
          <a href="#sec-setup" class="rea-nav-link active">1. 상권·예산 설정</a>
          <a href="#sec-simulator" class="rea-nav-link">2. 도면·시나리오 실험</a>
          <a href="#floorplan-studio" class="rea-nav-link">3. 내 도면 업로드</a>
        </nav>
        <div class="rea-header-actions">
          <button type="button" class="rea-btn-outline" id="toggleViewModeBtn">📐 2D CAD 치수 도면</button>
          <button type="button" class="rea-btn-solid" id="exportBtn">계획서 저장 (.txt)</button>
        </div>
      </div>
    </header>

    <div class="rea-layout">
      <div class="rea-main-col">
        <!-- SECTION 1: HERO & COMMERCIAL DISTRICT + CATEGORY ANALYSIS (rea.tools 2-col layout) -->
        <section class="rea-section" id="sec-setup">
          <div class="rea-two-col">
            <!-- Left: Editorial Headline + Commercial District Evidence -->
            <div class="rea-col-left">
              <div class="rea-kicker">Commercial District & Floorplan Rehearsal</div>
              <h1 class="rea-h1">가게를 계약하기 전에,<br/>상권과 도면을 미리 살아보세요.</h1>
              <p class="rea-lead" id="districtLeadText">
                주소와 내 자본금을 선택하면 상권 유동인구·임대 시세를 분석해 최적 업종을 추천하고, 1,000개의 운영 시나리오로 도면 병목을 검증합니다.
              </p>

              <!-- LIVE COMMERCIAL DISTRICT ANALYSIS TABLE (상권 분석 리포트) -->
              <div class="rea-evidence-box">
                <div class="rea-evidence-head">
                  <span class="rea-badge-dark" id="districtBadgeTitle">📍 성수 연무장길 상권 분석</span>
                  <span class="tabular rea-survival-pill" id="heroScenarioTotal">10,000개 가게 시나리오 중 8,420개 생존</span>
                </div>
                <div class="rea-evidence-grid">
                  <div class="rea-ev-item">
                    <span class="ev-label">일 평균 유동인구</span>
                    <strong class="ev-val tabular" id="evFootTraffic">42,800명/일</strong>
                    <span class="ev-sub" id="evPeakHours">피크: 주말 13:00–17:30</span>
                  </div>
                  <div class="rea-ev-item">
                    <span class="ev-label">상권 평균 보증금·월세</span>
                    <strong class="ev-val tabular" id="evRentInfo">5,000만 / 월 380만</strong>
                    <span class="ev-sub" id="evAreaInfo">1층 15평 (12.0m × 9.0m)</span>
                  </div>
                  <div class="rea-ev-item">
                    <span class="ev-label">초기 투자비 (보증금+시공)</span>
                    <strong class="ev-val tabular" id="evSetupCost">8,800만 원</strong>
                    <span class="ev-sub tabular" id="budgetRemainBanner">안전 예비자금 3,200만 원 확보</span>
                  </div>
                  <div class="rea-ev-item">
                    <span class="ev-label">예상 월 순수익 (시뮬레이션)</span>
                    <strong class="ev-val tabular ev-profit" id="evMonthlyProfit">+690만 원/월</strong>
                    <span class="ev-sub" id="evTargetPersona">핵심층: 2030 팝업·카페 투어족</span>
                  </div>
                </div>
                <!-- D3 10,000-Store Parallel Simulation Matrix -->
                <div class="d3-tenk-box">
                  <div class="d3-tenk-head">
                    <strong>📊 10,000개 평행 가게 시나리오 생존 분포 (D3.js Live Matrix)</strong>
                    <div class="d3-tenk-legend">
                      <span><i style="background:#10b981"></i>생존 가동</span>
                      <span><i style="background:#f59e0b"></i>대기열 과부하</span>
                      <span><i style="background:#ef4444"></i>동선 차단</span>
                    </div>
                  </div>
                  <div id="tenKDistributionChart"></div>
                </div>
              </div>
            </div>

            <!-- Right: Dark Terminal Setup Card (rea.tools signature card) -->
            <div class="rea-col-right">
              <div class="rea-step-title">1. 상가 링크 붙여넣기 & 자본금·업종 설정</div>
              <div class="rea-terminal-card">
                <div class="rea-terminal-bar">
                  <div class="rea-dots"><i></i><i></i><i></i></div>
                  <span>store-rehearsal.config</span>
                  <span class="tabular" id="calcBadge" role="status">Seed #42 · 계산 완료</span>
                </div>
                <div class="rea-terminal-body">
                  <label class="rea-term-label" for="addressInput">
                    <span>&gt; 1. 지도·부동산 링크 붙여넣기 (네이버·카카오·네모·직방 링크 즉시 인식)</span>
                  </label>
                  <div class="rea-link-input-row">
                    <input
                      id="addressInput"
                      type="text"
                      class="rea-term-input"
                      value="https://naver.me/seongsu-yeonmu42-1f"
                      placeholder="https://naver.me/... 또는 상가 링크·주소를 붙여넣으세요"
                      aria-label="상가 링크 또는 주소 입력"
                    />
                    <button type="button" class="rea-link-parse-btn" id="parseLinkBtn">링크 분석</button>
                  </div>
                  <div class="rea-district-chips" role="group" aria-label="샘플 상가 링크 원클릭 선택" style="margin-top:6px">
                    <button type="button" class="rea-term-chip active" data-dist-id="seongsu">🔗 naver.me/성수연무장길</button>
                    <button type="button" class="rea-term-chip" data-dist-id="yeonnam">🔗 kko.to/연남경의선숲길</button>
                    <button type="button" class="rea-term-chip" data-dist-id="hannam">🔗 nemo.kr/한남카페거리</button>
                    <button type="button" class="rea-term-chip" data-dist-id="sinsa">🔗 zigbang/신사가로수길</button>
                  </div>
                  <div class="rea-parsed-box" id="parsedLinkBox">
                    <div class="rea-parsed-status" id="parsedLinkStatus">
                      ✅ 네이버 지도 링크 인식됨 · 성수 연무장길 42 상가 호실 선택:
                    </div>
                    <div class="rea-unit-chips" id="parsedUnitChips" role="group" aria-label="매물 호실 선택"></div>
                  </div>

                  <label class="rea-term-label" for="budgetSlider" style="margin-top:12px">
                    <span>&gt; 2. 내 창업 자본금 (보증금 + 인테리어·설비 포함)</span>
                    <strong class="tabular" id="budgetDisplayLabel" style="color:#34d399">1억 2,000만 원</strong>
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
                    <span>&gt; 3. 업종 선택 (선택 즉시 맞춤 인테리어·설비 도면 전환)</span>
                  </div>
                  <div class="rea-cat-grid" id="categoryGrid" role="group" aria-label="창업 카테고리 선택"></div>
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
              <h2 class="rea-h2" id="activeCategoryHeading">☕ 스페셜티 커피 & 로스터리 — 10,000개 가게 시나리오 비교</h2>
            </div>
            <div class="rea-env-controls">
              <button type="button" class="rea-btn-outline active" id="toggleHeatmapBtn">🔥 병목 히트맵 ON</button>
              <button type="button" class="rea-btn-outline active" id="toggleLightsBtn">💡 조명 ON</button>
              <button type="button" class="rea-btn-outline active" id="toggleAcBtn">❄️ 에어컨 기류 ON</button>
            </div>
          </div>

          <!-- SCENARIO & DESIGN RULE EXPLANATION BAR -->
          <div class="rea-rule-strip">
            <div class="rea-rule-col">
              <div class="rea-step-title">1. 인테리어 레이아웃 선택</div>
              <div class="rea-design-row" id="designTabs" role="group" aria-label="인테리어 디자인 프리셋"></div>
              <p class="rea-rule-note" id="layoutRuleText"></p>
            </div>
            <div class="rea-rule-col">
              <div class="rea-step-title">2. 10,000개 평행 가게 시나리오 중 6대 스트레스 상황 클릭</div>
              <div class="rea-scn-row" id="scenarioDeckGrid" role="group" aria-label="시나리오 프리셋"></div>
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
                    <span class="world-tag">개선 전 · 입구 병목 도면 (픽업 1명)</span>
                    <h3>일반 기본 배치 (Baseline)</h3>
                  </div>
                  <span class="route-status" id="baseRoute">동선 연결됨</span>
                </div>
                <div class="canvasbox">
                  <canvas
                    id="baseCanvas"
                    role="img"
                    aria-label="현재 운영의 공간 및 고객 이동 시뮬레이션"
                  ></canvas>
                </div>
                <div class="world-stats">
                  <div class="w-stat">
                    <div class="w-stat-head">
                      <div>
                        <span class="w-label">평균 대기시간 · 실시간 대기줄 (D3)</span>
                        <strong class="w-num tabular" id="baseWait">–</strong><span class="w-unit">초</span>
                      </div>
                      <small class="w-sub" id="baseP90"></small>
                    </div>
                    <div class="d3-chart-slot" id="baseWaitChart"></div>
                  </div>
                  <div class="w-stat">
                    <div class="w-stat-head">
                      <div>
                        <span class="w-label">10분 구매 완료 · 누적 처리 곡선 (D3)</span>
                        <strong class="w-num tabular" id="baseDone">–</strong><span class="w-unit">명</span>
                      </div>
                      <small class="w-sub" id="baseActive"></small>
                    </div>
                    <div class="d3-chart-slot" id="baseDoneChart"></div>
                  </div>
                  <div class="w-stat">
                    <div class="w-stat-head">
                      <div>
                        <span class="w-label">손님 이동 거리 · 구간별 분해 (D3)</span>
                        <strong class="w-num tabular" id="baseWalk">–</strong><span class="w-unit">m</span>
                      </div>
                      <small class="w-sub" id="baseNote">주문 1 · 픽업 1</small>
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
                    <span class="world-tag emerald">개선 후 · 마우스로 가구 드래그 편집 가능</span>
                    <h3 id="proposedWorldTitle">내 창업 도면 (Design A)</h3>
                  </div>
                  <span class="route-status" id="planRoute">동선 연결됨</span>
                </div>
                <div class="canvasbox">
                  <canvas
                    id="planCanvas"
                    role="img"
                    tabindex="0"
                    aria-label="변경안 공간. 진열대나 테이블을 드래그하거나 방향키로 이동할 수 있습니다"
                  ></canvas>
                  <div class="canvas-floating-tools">
                    <div class="object-chips" role="group" aria-label="가구 빠른 선택">
                      <button type="button" class="obj-chip active" data-select-obj="display">주 진열대</button>
                      <button type="button" class="obj-chip" data-select-obj="table-a">가구 A</button>
                      <button type="button" class="obj-chip" data-select-obj="table-b">가구 B</button>
                      <button type="button" class="obj-chip" data-select-obj="table-c">가구 C</button>
                    </div>
                    <div class="canvas-tool-btns">
                      <button type="button" class="rea-mini-btn" id="rotateObjBtn">↻ 90° 회전</button>
                      <button type="button" class="rea-mini-btn" id="addBoothBtn">+ 매대 추가</button>
                      <button type="button" class="rea-mini-btn" id="removeCustomBtn">삭제</button>
                      <button type="button" class="rea-mini-btn" id="resetSceneBtn">초기화</button>
                    </div>
                  </div>
                </div>
                <div class="world-stats">
                  <div class="w-stat">
                    <div class="w-stat-head">
                      <div>
                        <span class="w-label">평균 대기시간 · 실시간 대기줄 (D3)</span>
                        <strong class="w-num tabular" id="planWait">–</strong><span class="w-unit">초</span>
                        <span class="delta-tag" id="waitDeltaTag"></span>
                      </div>
                      <small class="w-sub" id="planP90"></small>
                    </div>
                    <div class="d3-chart-slot" id="planWaitChart"></div>
                  </div>
                  <div class="w-stat">
                    <div class="w-stat-head">
                      <div>
                        <span class="w-label">10분 구매 완료 · 누적 처리 곡선 (D3)</span>
                        <strong class="w-num tabular" id="planDone">–</strong><span class="w-unit">명</span>
                        <span class="delta-tag" id="doneDeltaTag"></span>
                      </div>
                      <small class="w-sub" id="planActive"></small>
                    </div>
                    <div class="d3-chart-slot" id="planDoneChart"></div>
                  </div>
                  <div class="w-stat">
                    <div class="w-stat-head">
                      <div>
                        <span class="w-label">손님 이동 거리 · 구간별 분해 (D3)</span>
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

            <!-- PLAYBACK & WALK CONTROLS BAR (rea.tools clean button bar) -->
            <div class="rea-play-controls">
              <div class="rea-play-left">
                <button class="rea-btn-solid" id="playBtn" type="button">일시정지</button>
                <button class="rea-btn-outline" id="restartBtn" type="button">처음부터</button>
                <span class="clock tabular" id="clock">03:00 / 10:00</span>
                <input
                  type="range"
                  id="timeline"
                  min="0"
                  max="600"
                  step="1"
                  value="180"
                  aria-label="시뮬레이션 시간"
                />
                <select class="speed" id="speed" aria-label="재생 속도">
                  <option value="10">10x</option>
                  <option value="25" selected>25x</option>
                  <option value="50">50x</option>
                </select>
                <button class="rea-btn-outline" id="seedBtn" type="button">
                  Seed #<span id="seedNum">42</span> ↻
                </button>
              </div>

              <div class="rea-walk-right">
                <button class="rea-btn-outline" id="walkBtn" type="button">🚶 직접 걸어보기</button>
                <div class="dpad" id="walkDpad" role="group" aria-label="보행 방향키">
                  <button type="button" class="dpad-btn" data-move="up" aria-label="위">▲</button>
                  <button type="button" class="dpad-btn" data-move="left" aria-label="왼쪽">◀</button>
                  <button type="button" class="dpad-btn" data-move="down" aria-label="아래">▼</button>
                  <button type="button" class="dpad-btn" data-move="right" aria-label="오른쪽">▶</button>
                </div>
                <span class="rea-walk-hint" id="walkHint">WASD / 방향키</span>
              </div>
            </div>

            <!-- FINE PARAMETER BAR -->
            <div class="rea-fine-bar">
              <div class="fine-item">
                <label for="arrivals">분당 손님 유입 <strong class="tabular" id="arrivalValue">4.0명</strong></label>
                <input type="range" id="arrivals" min="0" max="8" step="0.5" value="4" />
              </div>
              <div class="fine-item">
                <label for="service">메뉴 제조 시간 <strong class="tabular" id="serviceValue">20초</strong></label>
                <input type="range" id="service" min="8" max="45" step="1" value="20" />
              </div>
              <div class="fine-item">
                <label for="pickupStaff">픽업 직원 수 <strong class="tabular" id="staffValue">2명</strong></label>
                <input type="range" id="pickupStaff" min="1" max="3" step="1" value="2" />
                <span class="hidden" id="staffCost"></span>
              </div>
              <div class="fine-item">
                <label for="bodyWidth">손님 통과 폭</label>
                <select id="bodyWidth">
                  <option value="0.65">일반 보행 (0.65m)</option>
                  <option value="1.00">쇼핑백 동반 (1.00m)</option>
                  <option value="1.20">유모차·단체 (1.20m)</option>
                </select>
              </div>
              <div class="fine-item">
                <label id="selectedObjTitle">선택 가구 좌표 (m)</label>
                <div style="display:flex;gap:4px">
                  <input type="number" id="displayX" min="0" max="11" step="0.1" value="7.6" aria-label="가구 가로 X" />
                  <input type="number" id="displayY" min="0" max="8" step="0.1" value="7.6" aria-label="가구 세로 Y" />
                </div>
              </div>
            </div>

            <!-- INSIGHT RESULT CALLOUT -->
            <div class="rea-insight-bar" id="insight" aria-live="polite">
              <strong>대기시간 87초 단축 · 10분간 +20명 추가 판매</strong>
              <span class="muted">입구 병목 제거 및 픽업 인력 배치 효과</span>
            </div>
          </div>
        </section>

        <hr class="rea-divider" />

        <!-- SECTION 3: FLOORPLAN UPLOAD & CALIBRATION (2-column rea.tools style) -->
        <section class="rea-section" id="floorplan-studio">
          <div class="rea-two-col">
            <div class="rea-col-left">
              <div class="rea-kicker">Blueprint Import & Field Calibration</div>
              <h2 class="rea-h2">내 상가 도면·사진 업로드 및 가오픈 실측 보정</h2>
              <p class="rea-lead">
                가지고 계신 도면이나 현장 사진 위에서 매대 영역을 드래그하면 위 3D 매장 도면에 즉시 추가됩니다.
              </p>

              <div class="rea-evidence-box" style="margin-top:14px">
                <div class="rea-step-title">가오픈 첫날 실측 보정 (Reality Calibration)</div>
                <div class="calibration-grid">
                  <label for="obsArrivalsInput">
                    실제 분당 방문 손님 (명/분)
                    <input type="number" id="obsArrivalsInput" min="0.5" max="15" step="0.1" value="4.4" />
                  </label>
                  <label for="obsWaitInput">
                    실제 체감 대기시간 (초)
                    <input type="number" id="obsWaitInput" min="1" max="300" step="1" value="22" />
                  </label>
                </div>
                <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
                  <button type="button" class="rea-btn-solid" id="applyCalibrationBtn">
                    실측 데이터로 시뮬레이터 보정
                  </button>
                  <span class="tabular" id="calibrationResultBox" style="font-size:12px;color:#475569">
                    현재 도면 예측 대기: <strong id="calPredWait">18초</strong>
                  </span>
                </div>

                <div style="display:flex;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0">
                  <button class="rea-btn-outline" id="previewPlanBtn" type="button">실행 계획서 텍스트 보기</button>
                  <button class="rea-btn-outline" id="jsonBtn" type="button">시나리오 JSON 저장</button>
                </div>
                <div class="plan-preview hidden" id="planPreviewBox" style="margin-top:10px">
                  <pre id="planPreviewText"></pre>
                </div>
              </div>
            </div>

            <div class="rea-col-right">
              <div class="rea-step-title">도면·사진 위에서 신규 매대 위치 드래그</div>
              <div class="rea-stage-card" style="padding:16px">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
                  <button type="button" class="rea-btn-outline" id="loadSampleBlueprintBtn">샘플 CAD 도면 로드</button>
                  <input id="imageFile" type="file" accept="image/png,image/jpeg" aria-label="도면 이미지 업로드" style="font-size:12px" />
                </div>
                <canvas
                  id="imageCanvas"
                  role="img"
                  aria-label="도면 이미지에서 추가 장애물 영역을 드래그해 지정"
                ></canvas>
                <label class="checkrow">
                  <input type="checkbox" id="presenceConfirm" checked />
                  <span>드래그한 영역을 12m × 9m 매장 도면의 실제 매대로 변환합니다.</span>
                </label>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px">
                  <span class="status tabular" id="imageStatus">영역을 드래그해 매대를 추가하세요</span>
                  <button class="rea-btn-solid" id="applyBox" type="button" disabled>위 도면에 매대 추가 ↑</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- RIGHT STICKY "On this page" RAIL (exact rea.tools navigation rail) -->
      <aside class="rea-toc" aria-label="On this page">
        <div class="rea-toc-title">On this page</div>
        <a href="#sec-setup" class="rea-toc-link active">1. 상권 분석 & 예산</a>
        <a href="#sec-simulator" class="rea-toc-link">2. 도면 & 시나리오 실험</a>
        <a href="#floorplan-studio" class="rea-toc-link">3. 도면 업로드 & 보정</a>
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
  if (manWon >= 10000) {
    const eok = Math.floor(manWon / 10000);
    const rem = manWon % 10000;
    return rem > 0
      ? `${eok}억 ${rem.toLocaleString("ko-KR")}만 원`
      : `${eok}억 원`;
  }
  return `${manWon.toLocaleString("ko-KR")}만 원`;
}

function formatShortWon(manWon: number): string {
  if (manWon >= 10000) {
    const eok = (manWon / 10000).toFixed(1).replace(/\.0$/, "");
    return `${eok}억`;
  }
  return `${manWon.toLocaleString("ko-KR")}만`;
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
    `[Rehearsal 상권 분석 & 도면 시뮬레이션 실행 계획서]`,
    `• 상권/주소: ${state.address} (유동인구 일 ${dist.dailyFootTraffic.toLocaleString("ko-KR")}명)`,
    `• 자본금 배분: 보유 ${formatManWon(state.budgetManWon)} → 초기투자 ${formatManWon(totalSetup)} (보증금 ${dist.depositManWon}만 + 시공 ${cat.interiorCostManWon}만)`,
    `• 선택 업종/디자인: ${cat.title} / ${des.name}`,
    `• 핵심 가구(${o.koLabel || o.label}): X=${o.x.toFixed(1)}m, Y=${o.y.toFixed(1)}m (${o.w.toFixed(1)}×${o.h.toFixed(1)}m)`,
    `• 10분 피크타임 비교 (Seed #${state.seed}):`,
    `  - 평균 대기시간: 기본 ${round(observed(b), 1)}초 → 변경안 ${round(observed(r), 1)}초`,
    `  - 10분 구매 완료: 기본 ${b.completed}명 → 변경안 ${r.completed}명`,
    `  - 이동 동선 길이: 기본 ${round(b.walkDistance, 1)}m → 변경안 ${round(r.walkDistance, 1)}m`,
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
  let imageDrag: Point2D | null = null;
  let blueprintSource: HTMLImageElement | HTMLCanvasElement | null = null;

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
    $("parsedLinkStatus").textContent = `✅ ${state.parsedLinkSource} · 매물 호실 선택:`;
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
    let platform = "상가 주소";
    if (lower.includes("naver.me") || lower.includes("map.naver")) {
      platform = "네이버 지도 링크";
    } else if (lower.includes("kko.to") || lower.includes("kakao")) {
      platform = "카카오맵 링크";
    } else if (lower.includes("nemo")) {
      platform = "네모 부동산 링크";
    } else if (lower.includes("zigbang")) {
      platform = "직방 상가 링크";
    } else if (lower.includes("goo.gl") || lower.includes("google")) {
      platform = "구글 지도 링크";
    } else if (lower.startsWith("http://") || lower.startsWith("https://")) {
      platform = "외부 상가 링크";
    }

    // 2. Match commercial district from URL / keywords
    let matchedDist: DistrictProfile["id"] = state.districtId;
    if (
      lower.includes("yeonnam") ||
      lower.includes("kko.to") ||
      text.includes("연남") ||
      text.includes("홍대") ||
      text.includes("마포") ||
      text.includes("망원")
    ) {
      matchedDist = "yeonnam";
    } else if (
      lower.includes("hannam") ||
      lower.includes("itaewon") ||
      lower.includes("nemo") ||
      text.includes("한남") ||
      text.includes("이태원") ||
      text.includes("용산")
    ) {
      matchedDist = "hannam";
    } else if (
      lower.includes("sinsa") ||
      lower.includes("garosu") ||
      lower.includes("zigbang") ||
      text.includes("신사") ||
      text.includes("가로수") ||
      text.includes("강남") ||
      text.includes("압구정")
    ) {
      matchedDist = "sinsa";
    } else if (
      lower.includes("seongsu") ||
      lower.includes("naver") ||
      text.includes("성수") ||
      text.includes("성동") ||
      text.includes("연무장")
    ) {
      matchedDist = "seongsu";
    }

    state.districtId = matchedDist;
    const dist = getActiveDistrict();
    state.selectedUnitId = dist.units[0].unitId;

    // 3. Check if URL/text specifies explicit pyeong (e.g., 18py, 20평)
    const pyMatch = text.match(/(\d{1,2})\s*(?:평|py)/i);
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

    state.parsedLinkSource = `${platform} 인식 (${dist.name})`;
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
            ${isBest ? `<span class="rea-best-tag">상권 1위</span>` : ""}
          </div>
          <div class="rea-cat-meta tabular">
            초기 ${formatShortWon(totalSetup)} · 생존 ${c.survivedCount.toLocaleString("ko-KR")}/10,000
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
    $("districtBadgeTitle").textContent = `📍 ${dist.name} 상권 분석 (${activeAreaPy}평)`;
    $("districtLeadText").textContent = dist.districtSummary;
    $("evFootTraffic").textContent = `일 ${Math.round(
      dist.dailyFootTraffic * unit.trafficFactor
    ).toLocaleString("ko-KR")}명`;
    $("evPeakHours").textContent = `피크: ${dist.peakHours}`;
    $("evRentInfo").textContent = `보증 ${formatShortWon(activeDeposit)} / 월 ${activeRent}만`;
    $("evAreaInfo").textContent = `선택 호실: ${activeAreaPy}평 (${activeM2}㎡ · 12×9m 표준화)`;

    const totalSetup = activeDeposit + cat.interiorCostManWon;
    const reserve = state.budgetManWon - totalSetup;
    $("evSetupCost").textContent = `${formatManWon(totalSetup)} (시공 ${cat.interiorCostManWon}만)`;
    $("budgetRemainBanner").textContent =
      reserve >= 0
        ? `예비 운영자금 ${formatManWon(reserve)} 확보`
        : `자본금 대비 ${formatManWon(Math.abs(reserve))} 초과`;

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
    }${netProfitManWon.toLocaleString("ko-KR")}만 원/월`;
    $("evTargetPersona").textContent = `월매출 약 ${monthlyRevManWon.toLocaleString("ko-KR")}만 · 객단가 ${cat.avgTicketWon.toLocaleString("ko-KR")}원`;

    $("heroScenarioTotal").textContent = `10,000개 가게 중 ${cat.survivedCount.toLocaleString("ko-KR")}개 생존`;
    $("activeCategoryHeading").textContent = `${cat.icon} ${cat.title} — 10,000개 가게 시나리오 & 도면 실험`;
    $("proposedWorldTitle").textContent = `내 창업 도면 (${des.name})`;
    $("layoutRuleText").textContent = cat.layoutRuleNote;

    const activeScn = SCENARIO_PRESETS.find((s) => s.id === state.preset);
    $("scenarioRuleText").textContent = activeScn
      ? `${activeScn.code} (${activeScn.countLabel} 가게 시나리오): ${activeScn.ruleDesc}`
      : `커스텀 조건: 분당 ${state.arrival.toFixed(1)}명 유입 · 제조 ${state.service}초 · 픽업 ${state.pickupStaff}명 · 통과폭 ${state.body.toFixed(2)}m`;

    $("arrivalValue").textContent = `${state.arrival.toFixed(1)}명`;
    $("serviceValue").textContent = `${state.service}초`;
    $("staffValue").textContent = `${state.pickupStaff}명`;
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
      ? "🔥 병목 히트맵 ON"
      : "🔥 병목 히트맵 OFF";

    $("toggleLightsBtn").classList.toggle("active", state.lightsOn);
    $("toggleLightsBtn").textContent = state.lightsOn ? "💡 조명 ON" : "💡 조명 OFF";

    $("toggleAcBtn").classList.toggle("active", state.acOn);
    $("toggleAcBtn").textContent = state.acOn ? "❄️ 에어컨 기류 ON" : "❄️ 에어컨 OFF";

    $("toggleViewModeBtn").textContent =
      state.viewMode === "3d" ? "📐 2D CAD 치수 도면" : "🏠 3D 인테리어 뷰";
    $("toggleViewModeBtn").classList.toggle("active", state.viewMode === "2d");

    $("playBtn").textContent = state.playing ? "일시정지" : "재생";
    $("walkBtn").textContent = state.walkMode ? "🚶 보행 종료" : "🚶 직접 걸어보기";
    $("walkBtn").classList.toggle("active", state.walkMode);
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
    });

    $<HTMLInputElement>("timeline").value = String(Math.round(state.t));
    $("clock").textContent = `${clock(state.t)} / 10:00`;
    updateWorldStatsD3Playhead(state.results, state.t);
  }

  function recompute(): void {
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
        $(`${key}Route`).textContent = blocked ? "동선 막힘" : "동선 쾌적";
        $(`${key}Route`).classList.toggle("bad", blocked);
        $(`${key}Wait`).textContent = blocked ? "–" : round(observed(r));
        $(`${key}P90`).textContent = blocked
          ? "통로 확보 필요"
          : `90분위 ${round(r.p90WaitSec)}초`;
        $(`${key}Done`).textContent = String(r.completed);
        $(`${key}Active`).textContent = `방문 ${r.arrivalCount} · 대기 ${r.active}명`;
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
            ? `▼${Math.abs(Math.round(dw))}초`
            : `+${Math.round(dw)}초`;
        waitDeltaEl.className = `delta-tag ${dw <= 0.5 ? "good" : "bad"}`;

        const dc = b.completed - a.completed;
        doneDeltaEl.textContent = dc > 0 ? `+${dc}명` : dc < 0 ? `${dc}명` : "";
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
          label: "표준운영",
          total: 3200,
          survived: Math.round(3200 * (survRatio + 0.06)),
          congested: Math.round(3200 * (1 - survRatio - 0.06)),
          blocked: 0,
        },
        {
          id: "rainy",
          code: "SCN-02",
          label: "우천피크",
          total: 2400,
          survived: Math.round(2400 * (survRatio - 0.04)),
          congested: Math.round(2400 * (1 - survRatio + 0.02)),
          blocked: Math.round(2400 * 0.02),
        },
        {
          id: "layout",
          code: "SCN-03",
          label: "1인독박",
          total: 1400,
          survived: Math.round(1400 * (survRatio - 0.14)),
          congested: Math.round(1400 * (1 - survRatio + 0.14)),
          blocked: 0,
        },
        {
          id: "influencer",
          code: "SCN-04",
          label: "오픈런",
          total: 1200,
          survived: Math.round(1200 * (survRatio - 0.02)),
          congested: Math.round(1200 * (1 - survRatio - 0.02)),
          blocked: Math.round(1200 * 0.04),
        },
        {
          id: "staff",
          code: "SCN-05",
          label: "인력충원",
          total: 1000,
          survived: Math.round(1000 * survRatio),
          congested: Math.round(1000 * (1 - survRatio - 0.04)),
          blocked: Math.round(1000 * 0.04),
        },
        {
          id: "stroller",
          code: "SCN-06",
          label: "유모차진입",
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

      const insightEl = $("insight");
      const d = (observed(b) ?? 0) - (observed(a) ?? 0);
      let summaryTitle = "";
      let summarySub = "";
      if (b.routeBlocked) {
        summaryTitle = "내 창업 도면에서 통로가 막혔습니다!";
        summarySub = `현재 통과폭(${state.body.toFixed(2)}m) 기준으로 진열대나 가구를 마우스로 끌어 통로를 넓혀주세요.`;
      } else if (a.routeBlocked) {
        summaryTitle = `유모차·단체 통과폭(${state.body.toFixed(2)}m)에서 기본 도면은 막히지만, 내 창업 도면은 정상 통과합니다!`;
        summarySub = `입구 병목 진열대를 이동해 넓은 통로를 확보한 효과입니다.`;
      } else if (state.preset === "layout") {
        summaryTitle = `도면 배치만 바꿨을 때(픽업 1명 독박): 이동 거리는 ${(
          (b.walkDistance ?? 0) - (a.walkDistance ?? 0)
        ).toFixed(1)}m 줄었지만 대기시간은 ${round(observed(b))}초입니다.`;
        summarySub = `직원이 1명뿐이면 동선이 빨라져도 픽업 바 앞에서 대기줄이 쌓입니다. 픽업 인력을 2명으로 늘려보세요.`;
      } else {
        summaryTitle =
          d < -2
            ? `선택한 도면·운영안으로 평균 대기시간이 ${round(-d)}초 줄고, 10분간 +${
                b.completed - a.completed
              }명을 더 판매했습니다.`
            : "두 도면의 실시간 고객 흐름과 D3 성과 지표를 비교 중입니다.";
        summarySub = `기본 도면 대기 ${round(observed(a))}초 → 내 창업 도면 ${round(
          observed(b)
        )}초 (피크 대기줄 ${a.maxQueue}명 → ${b.maxQueue}명)`;
      }
      insightEl.innerHTML = `<strong>${summaryTitle}</strong><span class="muted">${summarySub}</span>`;

      $("calcBadge").textContent = `Seed #${state.seed} · 계산 완료`;
      $("calcBadge").dataset.revision = String(state.rev);
      $("calPredWait").textContent = b.routeBlocked
        ? "막힘"
        : `${round(observed(b), 1)}초`;

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
      koLabel: "신규 매대",
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

  // Canvas Dragging (works seamlessly in both 3D and 2D CAD modes!)
  canvases[1].style.cursor = "grab";

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
      canvases[1].style.cursor = nextHover ? "grab" : "default";
      drawAll();
    }
  });

  canvases[1].addEventListener("pointerup", () => {
    if (drag) {
      drag = null;
      canvases[1].style.cursor = "grab";
      recompute();
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
    $("walkHint").textContent = `기본:${accepted[0] ? "통과" : "막힘!"} · 내도면:${
      accepted[1] ? "통과" : "막힘!"
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
      $("imageStatus").textContent = `지정 매대: X=${mx}m, Y=${my}m (${mw}×${mh}m)`;
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
      koLabel: "도면 추가 매대",
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
    $("calibrationResultBox").textContent = `실측 ${obsArr.toFixed(1)}명/분 · ${obsWait}초 보정 반영됨`;
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
