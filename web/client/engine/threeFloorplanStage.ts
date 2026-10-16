// src/engine/threeFloorplanStage.ts
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  sample,
  type Scene,
  type SceneObject,
  type SimResult,
} from "./rehearsalCore.ts";

export interface ThreeStageConfig {
  container: HTMLElement;
  onSelectObject?: (id: string | null) => void;
  onMoveObstacle?: (id: string, x: number, y: number) => void;
  onRotateObstacle?: (id: string) => void;
  onHoverPart?: (
    info: { title: string; subtitle: string; body: string } | null
  ) => void;
}

export interface ThreeStageUpdatePayload {
  scene: Scene;
  result: SimResult;
  baseResult: SimResult;
  mode: "proposed" | "baseline";
  categoryId: string;
  categoryName: string;
  districtName: string;
  pyeong: number;
  scenarioCode: string;
  scenarioName: string;
  scenarioClusterCount: number;
  survivedCount: number;
  scenarioTotal: number;
  selectedObjectId: string | null;
  orderStaff: number;
  pickupStaff: number;
  bodyWidth: number;
  arrivalRatePerMin: number;
  showHeatmap: boolean;
  showLighting: boolean;
  showAirflow: boolean;
  currentTimeSec: number;
}

interface ThemeColors {
  bg: number;
  board: number;
  boardRim: number;
  wall: number;
  blockBody: number;
  blockTop: number;
  edgeMajor: number;
  edgeMinor: number;
  gridLine: number;
  textPrimary: string;
  textMuted: string;
  panelBg: string;
  borderStroke: string;
}

const THEMES: Record<"light" | "dark", ThemeColors> = {
  light: {
    bg: 0xe9eaea,
    board: 0xf6f6f5,
    boardRim: 0xdfe1e4,
    wall: 0xeeeeec,
    blockBody: 0xf1f1f0,
    blockTop: 0xf8f8f7,
    edgeMajor: 0x52575c,
    edgeMinor: 0x9aa0a6,
    gridLine: 0xdadce0,
    textPrimary: "#181c20",
    textMuted: "#5d6266",
    panelBg: "#f5f5f4",
    borderStroke: "#8a8f93",
  },
  dark: {
    bg: 0x121314,
    board: 0x18191b,
    boardRim: 0x222428,
    wall: 0x1b1c1f,
    blockBody: 0x1d1e21,
    blockTop: 0x232529,
    edgeMajor: 0x5c6269,
    edgeMinor: 0x36393f,
    gridLine: 0x24262a,
    textPrimary: "#f1f5f9",
    textMuted: "#94a3b8",
    panelBg: "#212328",
    borderStroke: "#4f5357",
  },
};

export class ThreeFloorplanStage {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene3d: THREE.Scene;
  private perspCam: THREE.PerspectiveCamera;
  private orthoCam: THREE.OrthographicCamera;
  private activeCam: THREE.Camera;
  private controls: OrbitControls;

  private theme: "light" | "dark" = "light";
  private accentHex = "#ea580c";
  private accentColor = new THREE.Color("#ea580c");
  private autoRevolve = false;
  private editDragMode = false;
  private swarmEnabled = true;

  private rootGroup = new THREE.Group();
  private boardGroup = new THREE.Group();
  private stationsGroup = new THREE.Group();
  private obstaclesGroup = new THREE.Group();
  private bufferTilesGroup = new THREE.Group();
  private arcsGroup = new THREE.Group();
  private agentsGroup = new THREE.Group();

  private obstacleMeshes = new Map<
    string,
    {
      group: THREE.Group;
      targetPos: THREE.Vector3;
      builtW: number;
      builtD: number;
      topTex: THREE.CanvasTexture;
      topCanvas: HTMLCanvasElement;
      frontTex: THREE.CanvasTexture;
      frontCanvas: HTMLCanvasElement;
      bodyMat: THREE.MeshStandardMaterial;
      edgeMat: THREE.LineBasicMaterial;
      obstacleRef: SceneObject;
    }
  >();

  private orderCounterGroup = new THREE.Group();
  private pickupCounterGroup = new THREE.Group();
  private entranceGroup = new THREE.Group();
  private exitGroup = new THREE.Group();

  private orderTopCanvas = document.createElement("canvas");
  private orderTopTex!: THREE.CanvasTexture;
  private orderFrontCanvas = document.createElement("canvas");
  private orderFrontTex!: THREE.CanvasTexture;

  private pickupTopCanvas = document.createElement("canvas");
  private pickupTopTex!: THREE.CanvasTexture;
  private pickupFrontCanvas = document.createElement("canvas");
  private pickupFrontTex!: THREE.CanvasTexture;

  private floorHudCanvas = document.createElement("canvas");
  private floorHudTex!: THREE.CanvasTexture;

  private bufferTiles: {
    mesh: THREE.Mesh;
    mat: THREE.MeshStandardMaterial;
    gx: number;
    gz: number;
  }[] = [];

  private agentPool: {
    group: THREE.Group;
    bodyMat: THREE.MeshStandardMaterial;
    ringMat: THREE.MeshBasicMaterial;
  }[] = [];

  private arcPackets: {
    mesh: THREE.Mesh;
    curve: THREE.QuadraticBezierCurve3;
    speed: number;
    offset: number;
  }[] = [];

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerDownPx = new THREE.Vector2();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private dragObjectId: string | null = null;
  private dragOffset = new THREE.Vector3();
  private hoveredKey: string | null = null;

  private camAnim: {
    targetPos: THREE.Vector3;
    targetLook: THREE.Vector3;
  } | null = null;

  private lastPayload: ThreeStageUpdatePayload | null = null;
  private lastSignature = "";
  private lastHudTick = -1;
  private animFrameId = 0;
  private clock = new THREE.Clock();

  private _vecA = new THREE.Vector3();

  private onSelectObject?: (id: string | null) => void;
  private onMoveObstacle?: (id: string, x: number, y: number) => void;
  private onRotateObstacle?: (id: string) => void;
  private onHoverPart?: (
    info: { title: string; subtitle: string; body: string } | null
  ) => void;

  constructor(cfg: ThreeStageConfig) {
    this.container = cfg.container;
    this.onSelectObject = cfg.onSelectObject;
    this.onMoveObstacle = cfg.onMoveObstacle;
    this.onRotateObstacle = cfg.onRotateObstacle;
    this.onHoverPart = cfg.onHoverPart;

    const width = Math.max(320, this.container.clientWidth || 1040);
    const height = Math.max(340, this.container.clientHeight || 560);

    const isHeadless =
      navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.setPixelRatio(
      isHeadless ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !isHeadless;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.innerHTML = "";
    this.container.appendChild(this.renderer.domElement);

    this.scene3d = new THREE.Scene();
    this.scene3d.background = new THREE.Color(THEMES[this.theme].bg);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene3d.environment = pmrem.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmrem.dispose();

    const aspect = width / height;
    this.perspCam = new THREE.PerspectiveCamera(26, aspect, 0.5, 160);
    const frustumH = 11.2;
    this.orthoCam = new THREE.OrthographicCamera(
      (-frustumH * aspect) / 2,
      (frustumH * aspect) / 2,
      frustumH / 2,
      -frustumH / 2,
      0.1,
      160
    );

    this.activeCam = this.perspCam;
    this.perspCam.position.set(-9.8, 11.0, 11.4);
    this.perspCam.lookAt(0, 0.3, 0);

    this.controls = new OrbitControls(this.activeCam, this.renderer.domElement);
    this.controls.target.set(0, 0.25, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.37;
    this.controls.minPolarAngle = 0.18;
    this.controls.minDistance = 6.2;
    this.controls.maxDistance = 28;

    this.setupLighting();

    this.scene3d.add(this.rootGroup);
    this.rootGroup.add(this.boardGroup);
    this.rootGroup.add(this.bufferTilesGroup);
    this.rootGroup.add(this.stationsGroup);
    this.rootGroup.add(this.obstaclesGroup);
    this.rootGroup.add(this.arcsGroup);
    this.rootGroup.add(this.agentsGroup);

    this.buildArchitecturalBoard();
    this.buildBufferSensorMatrix();
    this.buildCoreStations();
    this.buildAgentPool(28);

    this.bindInteractionEvents();
    this.startLoop();
  }

  private toWorldX(sceneX: number): number {
    return sceneX - 6.0;
  }
  private toWorldZ(sceneY: number): number {
    return sceneY - 4.5;
  }
  private toSceneX(worldX: number, w = 1): number {
    return Math.max(0.2, Math.min(11.8 - w, worldX + 6.0 - w * 0.5));
  }
  private toSceneY(worldZ: number, h = 1): number {
    return Math.max(0.2, Math.min(8.8 - h, worldZ + 4.5 - h * 0.5));
  }

  public setEditDragMode(enabled: boolean): void {
    this.editDragMode = enabled;
  }

  private setupLighting(): void {
    const hemi = new THREE.HemisphereLight(0xffffff, 0xd8dee9, 1.0);
    hemi.position.set(0, 20, 0);
    this.scene3d.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfffaf2, 1.05);
    keyLight.position.set(-9, 16, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -8.5;
    keyLight.shadow.camera.right = 8.5;
    keyLight.shadow.camera.top = 7.5;
    keyLight.shadow.camera.bottom = -7.5;
    keyLight.shadow.bias = -0.0005;
    this.scene3d.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.42);
    rimLight.position.set(10, 9, -9);
    this.scene3d.add(rimLight);
  }

  private createBoxWithEdges(
    w: number,
    h: number,
    d: number,
    bodyColor: number,
    edgeColor: number,
    roughness = 0.78,
    metalness = 0.05
  ): {
    group: THREE.Group;
    mesh: THREE.Mesh;
    bodyMat: THREE.MeshStandardMaterial;
    edgeMat: THREE.LineBasicMaterial;
  } {
    const group = new THREE.Group();
    const geo = new THREE.BoxGeometry(w, h, d);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness,
      metalness,
    });
    const mesh = new THREE.Mesh(geo, bodyMat);
    mesh.position.y = h / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const edgesGeo = new THREE.EdgesGeometry(geo, 15);
    const edgeMat = new THREE.LineBasicMaterial({
      color: edgeColor,
      transparent: true,
      opacity: 0.88,
    });
    const lines = new THREE.LineSegments(edgesGeo, edgeMat);
    lines.position.y = h / 2;
    group.add(lines);

    return { group, mesh, bodyMat, edgeMat };
  }

  private buildArchitecturalBoard(): void {
    this.boardGroup.clear();
    const t = THEMES[this.theme];

    // Outer technical slab (like pgrun.dev/postgres-internals)
    const outerSlab = this.createBoxWithEdges(
      12.9,
      0.24,
      9.9,
      t.boardRim,
      t.edgeMajor,
      0.82,
      0.04
    );
    outerSlab.group.position.y = -0.26;
    this.boardGroup.add(outerSlab.group);

    // Inner store deck (12.0m x 9.0m)
    const innerDeck = this.createBoxWithEdges(
      12.0,
      0.06,
      9.0,
      t.board,
      t.edgeMajor,
      0.86,
      0.04
    );
    innerDeck.group.position.y = -0.06;
    this.boardGroup.add(innerDeck.group);

    // 4 Corner mounting bolts
    const boltGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.04, 16);
    const boltMat = new THREE.MeshStandardMaterial({
      color: t.edgeMinor,
      roughness: 0.4,
      metalness: 0.5,
    });
    for (const [bx, bz] of [
      [-6.18, -4.68],
      [6.18, -4.68],
      [-6.18, 4.68],
      [6.18, 4.68],
    ]) {
      const bolt = new THREE.Mesh(boltGeo, boltMat);
      bolt.position.set(bx, -0.01, bz);
      this.boardGroup.add(bolt);
    }

    // 1m x 1m CAD grid lines on the floor deck
    const gridPts: THREE.Vector3[] = [];
    for (let x = -6; x <= 6; x += 1) {
      gridPts.push(new THREE.Vector3(x, 0.004, -4.5));
      gridPts.push(new THREE.Vector3(x, 0.004, 4.5));
    }
    for (let z = -4.5; z <= 4.5; z += 1) {
      gridPts.push(new THREE.Vector3(-6, 0.004, z));
      gridPts.push(new THREE.Vector3(6, 0.004, z));
    }
    const gridGeo = new THREE.BufferGeometry().setFromPoints(gridPts);
    const gridMat = new THREE.LineBasicMaterial({
      color: t.gridLine,
      transparent: true,
      opacity: 0.75,
    });
    this.boardGroup.add(new THREE.LineSegments(gridGeo, gridMat));

    // Cut-away low architectural perimeter walls (North/Back and East/Right)
    const backWall = this.createBoxWithEdges(
      12.0,
      1.15,
      0.14,
      t.wall,
      t.edgeMajor,
      0.8,
      0.04
    );
    backWall.group.position.set(0, 0, -4.57);
    this.boardGroup.add(backWall.group);

    const rightWall = this.createBoxWithEdges(
      0.14,
      1.15,
      9.0,
      t.wall,
      t.edgeMajor,
      0.8,
      0.04
    );
    rightWall.group.position.set(6.07, 0, 0);
    this.boardGroup.add(rightWall.group);

    // Floor technical annotation + A* route + heatmap decal plane
    this.floorHudCanvas.width = 1024;
    this.floorHudCanvas.height = 768;
    this.floorHudTex = new THREE.CanvasTexture(this.floorHudCanvas);
    this.floorHudTex.colorSpace = THREE.SRGBColorSpace;
    this.floorHudTex.anisotropy =
      this.renderer.capabilities.getMaxAnisotropy();

    const floorDecalGeo = new THREE.PlaneGeometry(12.0, 9.0);
    const floorDecalMat = new THREE.MeshBasicMaterial({
      map: this.floorHudTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const floorDecal = new THREE.Mesh(floorDecalGeo, floorDecalMat);
    floorDecal.rotation.x = -Math.PI / 2;
    floorDecal.position.y = 0.008;
    this.boardGroup.add(floorDecal);
  }

  // Central corridor 4x6 floor sensor matrix (modeled after SHARED MEMORY tile grid in pgrun.dev)
  private buildBufferSensorMatrix(): void {
    this.bufferTilesGroup.clear();
    this.bufferTiles = [];
    const t = THEMES[this.theme];

    // Framed pad under the 4x6 matrix in the central queue & circulation plaza (x: 4.1..8.0, y: 2.15..4.45)
    const padFrame = this.createBoxWithEdges(
      3.95,
      0.02,
      2.45,
      t.board,
      t.edgeMajor,
      0.85,
      0.04
    );
    padFrame.group.position.set(this.toWorldX(6.05), 0, this.toWorldZ(3.3));
    this.bufferTilesGroup.add(padFrame.group);

    const tileW = 0.48;
    const tileD = 0.44;
    const tileH = 0.055;
    const geo = new THREE.BoxGeometry(tileW, tileH, tileD);
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: t.edgeMajor,
      transparent: true,
      opacity: 0.72,
    });

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        const mat = new THREE.MeshStandardMaterial({
          color: t.blockTop,
          roughness: 0.7,
          metalness: 0.06,
        });
        const mesh = new THREE.Mesh(geo, mat);
        const sx = 4.55 + c * 0.6;
        const sy = 2.46 + r * 0.56;
        mesh.position.set(this.toWorldX(sx), 0.02 + tileH / 2, this.toWorldZ(sy));
        mesh.receiveShadow = true;

        const lines = new THREE.LineSegments(edgeGeo, edgeMat);
        mesh.add(lines);

        mesh.userData = {
          partKey: "corridor-matrix",
          title: "SHARED WALKWAY BUFFER · 24-CELL CIRCULATION MATRIX",
          subtitle: `Cell [${r + 1}, ${c + 1}] · Coord (${sx.toFixed(1)}m, ${sy.toFixed(1)}m)`,
          body: "Primary pedestrian circulation grid connecting the Entrance (IN) to the Order POS and Pickup Bar. Cells light up in Signal Orange when display fixtures encroach or queues build up.",
        };

        this.bufferTilesGroup.add(mesh);
        this.bufferTiles.push({ mesh, mat, gx: sx, gz: sy });
      }
    }
  }

  private buildCoreStations(): void {
    this.stationsGroup.clear();
    const t = THEMES[this.theme];

    // 1. Order / POS Counter (Exact footprint 2.6m x 1.1m matching order-desk in rehearsalCore)
    this.orderCounterGroup = new THREE.Group();
    const orderBase = this.createBoxWithEdges(
      2.6,
      1.05,
      1.1,
      t.blockBody,
      t.edgeMajor
    );
    this.orderCounterGroup.add(orderBase.group);

    const posTower = this.createBoxWithEdges(
      0.68,
      0.42,
      0.42,
      t.blockTop,
      t.edgeMajor
    );
    posTower.group.position.set(-0.62, 1.05, -0.14);
    this.orderCounterGroup.add(posTower.group);

    this.orderTopCanvas.width = 512;
    this.orderTopCanvas.height = 256;
    this.orderTopTex = new THREE.CanvasTexture(this.orderTopCanvas);
    this.orderTopTex.colorSpace = THREE.SRGBColorSpace;
    this.orderTopTex.anisotropy =
      this.renderer.capabilities.getMaxAnisotropy();

    const orderTopPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.48, 0.98),
      new THREE.MeshBasicMaterial({
        map: this.orderTopTex,
        transparent: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      })
    );
    orderTopPlane.rotation.x = -Math.PI / 2;
    orderTopPlane.position.set(0, 1.055, 0);
    this.orderCounterGroup.add(orderTopPlane);

    // Front face telemetry display (like users.heap / POSTMASTER front face in pgrun-1.png)
    this.orderFrontCanvas.width = 512;
    this.orderFrontCanvas.height = 220;
    this.orderFrontTex = new THREE.CanvasTexture(this.orderFrontCanvas);
    this.orderFrontTex.colorSpace = THREE.SRGBColorSpace;
    this.orderFrontTex.anisotropy =
      this.renderer.capabilities.getMaxAnisotropy();

    const orderFrontPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.48, 0.96),
      new THREE.MeshBasicMaterial({
        map: this.orderFrontTex,
        transparent: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      })
    );
    orderFrontPlane.position.set(0, 0.52, 0.555);
    this.orderCounterGroup.add(orderFrontPlane);
    this.stationsGroup.add(this.orderCounterGroup);

    // 2. Pickup & Production Flagship Station (like users.heap block in pgrun-1.png)
    this.pickupCounterGroup = new THREE.Group();
    const pickupBase = this.createBoxWithEdges(
      2.6,
      1.18,
      1.08,
      t.blockBody,
      t.edgeMajor
    );
    this.pickupCounterGroup.add(pickupBase.group);

    const machineBody = this.createBoxWithEdges(
      0.92,
      0.44,
      0.46,
      t.blockTop,
      t.edgeMajor
    );
    machineBody.group.position.set(-0.68, 1.18, -0.2);
    const grinderA = this.createBoxWithEdges(
      0.24,
      0.52,
      0.24,
      t.blockTop,
      t.edgeMajor
    );
    grinderA.group.position.set(0.05, 1.18, -0.22);
    this.pickupCounterGroup.add(machineBody.group, grinderA.group);

    this.pickupTopCanvas.width = 512;
    this.pickupTopCanvas.height = 256;
    this.pickupTopTex = new THREE.CanvasTexture(this.pickupTopCanvas);
    this.pickupTopTex.colorSpace = THREE.SRGBColorSpace;
    this.pickupTopTex.anisotropy =
      this.renderer.capabilities.getMaxAnisotropy();

    const pickupTopPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 0.98),
      new THREE.MeshBasicMaterial({
        map: this.pickupTopTex,
        transparent: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      })
    );
    pickupTopPlane.rotation.x = -Math.PI / 2;
    pickupTopPlane.position.set(0, 1.185, 0);
    this.pickupCounterGroup.add(pickupTopPlane);

    this.pickupFrontCanvas.width = 512;
    this.pickupFrontCanvas.height = 240;
    this.pickupFrontTex = new THREE.CanvasTexture(this.pickupFrontCanvas);
    this.pickupFrontTex.colorSpace = THREE.SRGBColorSpace;
    this.pickupFrontTex.anisotropy =
      this.renderer.capabilities.getMaxAnisotropy();

    const pickupFrontPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 1.06),
      new THREE.MeshBasicMaterial({
        map: this.pickupFrontTex,
        transparent: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      })
    );
    pickupFrontPlane.position.set(0, 0.59, 0.545);
    this.pickupCounterGroup.add(pickupFrontPlane);
    this.stationsGroup.add(this.pickupCounterGroup);

    // 3. Entrance Gate Pad
    this.entranceGroup = new THREE.Group();
    const entPad = this.createBoxWithEdges(
      1.3,
      0.08,
      0.85,
      t.blockTop,
      t.edgeMajor
    );
    this.entranceGroup.add(entPad.group);
    const pillarL = this.createBoxWithEdges(
      0.14,
      0.88,
      0.14,
      t.blockBody,
      t.edgeMajor
    );
    pillarL.group.position.set(-0.55, 0.08, 0);
    const pillarR = this.createBoxWithEdges(
      0.14,
      0.88,
      0.14,
      t.blockBody,
      t.edgeMajor
    );
    pillarR.group.position.set(0.55, 0.08, 0);
    this.entranceGroup.add(pillarL.group, pillarR.group);
    this.stationsGroup.add(this.entranceGroup);

    // 4. Exit Gate Pad
    this.exitGroup = new THREE.Group();
    const extPad = this.createBoxWithEdges(
      1.2,
      0.06,
      0.75,
      t.blockTop,
      t.edgeMinor
    );
    this.exitGroup.add(extPad.group);
    this.stationsGroup.add(this.exitGroup);
  }

  private buildAgentPool(count: number): void {
    this.agentsGroup.clear();
    this.agentPool = [];
    const t = THEMES[this.theme];

    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const bodyGeo = new THREE.CylinderGeometry(0.13, 0.17, 0.54, 14);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: t.blockTop,
        roughness: 0.4,
        metalness: 0.15,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.27;
      body.castShadow = true;
      g.add(body);

      const headGeo = new THREE.SphereGeometry(0.12, 12, 10);
      const head = new THREE.Mesh(headGeo, bodyMat);
      head.position.y = 0.65;
      head.castShadow = true;
      g.add(head);

      const edgeGeo = new THREE.EdgesGeometry(bodyGeo, 25);
      const edgeMat = new THREE.LineBasicMaterial({
        color: t.edgeMajor,
        transparent: true,
        opacity: 0.65,
      });
      const edge = new THREE.LineSegments(edgeGeo, edgeMat);
      edge.position.y = 0.27;
      g.add(edge);

      const ringGeo = new THREE.RingGeometry(0.18, 0.24, 18);
      const ringMat = new THREE.MeshBasicMaterial({
        color: this.accentColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.015;
      g.add(ring);

      g.visible = false;
      this.agentsGroup.add(g);
      this.agentPool.push({ group: g, bodyMat, ringMat });
    }
  }

  private drawStationHudCanvas(
    canvas: HTMLCanvasElement,
    title: string,
    sub: string,
    queueCount: number,
    staffCount: number,
    isBottleneck: boolean
  ): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const t = THEMES[this.theme];

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = t.panelBg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = isBottleneck ? this.accentHex : t.borderStroke;
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, w - 6, h - 6);

    ctx.fillStyle = isBottleneck ? this.accentHex : t.textPrimary;
    ctx.font = "700 26px 'JetBrains Mono', 'Plus Jakarta Sans', monospace";
    ctx.fillText(title, 22, 42);

    ctx.fillStyle = t.textMuted;
    ctx.font = "600 18px 'JetBrains Mono', 'Noto Sans KR', monospace";
    ctx.fillText(sub, 22, 72);

    // 16-slot LED Queue Buffer Matrix (like CLOG PG_xact / users.heap in pgrun.dev)
    const cols = 8;
    const rows = 2;
    const dotR = 12;
    const startX = 36;
    const startY = 114;
    const gapX = 44;
    const gapY = 36;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const cx = startX + c * gapX;
        const cy = startY + r * gapY;

        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        if (idx < queueCount) {
          ctx.fillStyle = queueCount >= 4 ? "#ea580c" : "#f97316";
          ctx.fill();
        } else {
          ctx.fillStyle =
            this.theme === "dark"
              ? "rgba(255,255,255,0.08)"
              : "rgba(15,23,42,0.08)";
          ctx.fill();
          ctx.strokeStyle =
            this.theme === "dark"
              ? "rgba(255,255,255,0.22)"
              : "rgba(15,23,42,0.24)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    ctx.fillStyle = t.textPrimary;
    ctx.font = "700 21px 'JetBrains Mono', monospace";
    ctx.fillText(
      `QUEUE: ${queueCount} PAX  ·  STAFF: ${staffCount}`,
      22,
      h - 22
    );
  }

  // Front face block matrix (like `users · heap` 32-slot matrix on the vertical face in pgrun-1.png!)
  private drawStationFrontCanvas(
    canvas: HTMLCanvasElement,
    headerLeft: string,
    headerRight: string,
    activeCells: number,
    totalCells: number,
    footerText: string,
    isBottleneck: boolean
  ): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const t = THEMES[this.theme];

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = t.panelBg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = isBottleneck ? this.accentHex : t.borderStroke;
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, w - 6, h - 6);

    ctx.fillStyle = t.textPrimary;
    ctx.font = "700 22px 'JetBrains Mono', 'Noto Sans KR', monospace";
    ctx.fillText(headerLeft, 20, 34);

    ctx.fillStyle = t.textMuted;
    ctx.font = "600 17px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText(headerRight, w - 20, 34);
    ctx.textAlign = "left";

    // Draw 8x4 slot grid (exact visual homage to `users · heap` in pgrun.dev/postgres-internals)
    const cols = 8;
    const rows = 3;
    const cellW = Math.floor((w - 40 - (cols - 1) * 6) / cols);
    const cellH = 26;
    const startX = 20;
    const startY = 52;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const x = startX + c * (cellW + 6);
        const y = startY + r * (cellH + 6);
        if (idx < activeCells) {
          ctx.fillStyle = isBottleneck
            ? this.accentHex
            : this.theme === "dark"
            ? "#94a3b8"
            : "#475569";
        } else {
          ctx.fillStyle =
            this.theme === "dark"
              ? "rgba(255,255,255,0.07)"
              : "rgba(15,23,42,0.09)";
        }
        ctx.fillRect(x, y, cellW, cellH);
      }
    }

    ctx.fillStyle = isBottleneck ? this.accentHex : t.textMuted;
    ctx.font = "600 18px 'JetBrains Mono', 'Noto Sans KR', monospace";
    ctx.fillText(footerText, 20, h - 18);
  }

  private drawObstacleTopCanvas(
    canvas: HTMLCanvasElement,
    obs: SceneObject,
    isPrimary: boolean,
    isSelected: boolean,
    isBlocked: boolean
  ): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const t = THEMES[this.theme];

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = t.panelBg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = isSelected
      ? this.accentHex
      : isBlocked && isPrimary
      ? this.accentHex
      : t.borderStroke;
    ctx.lineWidth = isSelected || isPrimary ? 6 : 4;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    ctx.fillStyle = isSelected || (isPrimary && isBlocked)
      ? this.accentHex
      : t.textPrimary;
    ctx.font = "700 30px 'Plus Jakarta Sans', 'JetBrains Mono', sans-serif";
    const label = obs.label || obs.koLabel || obs.id;
    ctx.fillText(label, 22, 54);

    ctx.fillStyle = t.textMuted;
    ctx.font = "600 22px 'JetBrains Mono', monospace";
    ctx.fillText(
      `${obs.w.toFixed(1)}m × ${obs.h.toFixed(1)}m  [${obs.x.toFixed(1)}, ${obs.y.toFixed(1)}]`,
      22,
      94
    );

    if (isPrimary) {
      ctx.fillStyle = isBlocked ? "#ea580c" : "#d97706";
      ctx.font = "700 21px 'JetBrains Mono', monospace";
      ctx.fillText(
        isBlocked
          ? "⚠ BOTTLENECK · ENTRY CHOKE"
          : "✓ FLOW CLEAR · CORRIDOR OPEN",
        22,
        h - 24
      );
    } else {
      ctx.fillStyle = t.textMuted;
      ctx.font = "600 18px 'JetBrains Mono', monospace";
      ctx.fillText("CLICK TO INSPECT · R TO ROTATE", 22, h - 24);
    }
  }

  private drawObstacleFrontCanvas(
    canvas: HTMLCanvasElement,
    obs: SceneObject,
    isPrimary: boolean,
    isBlocked: boolean
  ): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const t = THEMES[this.theme];

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = isPrimary && isBlocked ? this.accentHex : t.panelBg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = t.borderStroke;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    ctx.fillStyle =
      isPrimary && isBlocked ? "#ffffff" : t.textPrimary;
    ctx.font = "700 25px 'Plus Jakarta Sans', 'JetBrains Mono', sans-serif";
    ctx.fillText(obs.label || obs.koLabel || obs.id, 18, 46);

    ctx.fillStyle =
      isPrimary && isBlocked ? "rgba(255,255,255,0.9)" : t.textMuted;
    ctx.font = "600 19px 'JetBrains Mono', monospace";
    ctx.fillText(
      `DIM ${obs.w.toFixed(1)}m × ${obs.h.toFixed(1)}m · POS (${obs.x.toFixed(1)}, ${obs.y.toFixed(1)})`,
      18,
      82
    );
  }

  private drawFloorHudCanvas(payload: ThreeStageUpdatePayload): void {
    const ctx = this.floorHudCanvas.getContext("2d");
    if (!ctx) return;
    const w = this.floorHudCanvas.width;
    const h = this.floorHudCanvas.height;
    const t = THEMES[this.theme];

    ctx.clearRect(0, 0, w, h);

    if (payload.showHeatmap) {
      const ord = payload.scene.order;
      const pck = payload.scene.pickup;
      const ent = payload.scene.entrance;
      const drawHeatSpot = (
        sx: number,
        sy: number,
        radiusPx: number,
        intensity: number
      ) => {
        const gx = (sx / 12) * w;
        const gy = (sy / 9) * h;
        const grad = ctx.createRadialGradient(gx, gy, 8, gx, gy, radiusPx);
        grad.addColorStop(
          0,
          `rgba(234, 88, 12, ${Math.min(0.48, intensity * 0.4)})`
        );
        grad.addColorStop(
          0.5,
          `rgba(245, 158, 11, ${Math.min(0.24, intensity * 0.2)})`
        );
        grad.addColorStop(1, "rgba(245, 158, 11, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gx, gy, radiusPx, 0, Math.PI * 2);
        ctx.fill();
      };

      const avgW = payload.result.meanWaitSec ?? 90;
      drawHeatSpot(ord.x, ord.y + 0.8, 125, Math.max(0.35, avgW / 60));
      drawHeatSpot(pck.x, pck.y + 0.8, 140, Math.max(0.45, avgW / 50));
      if (payload.result.routeBlocked || payload.mode === "baseline") {
        drawHeatSpot(ent.x + 1.2, ent.y - 1.0, 155, 1.1);
      }
    }

    if (payload.result.route && payload.result.route.length > 1) {
      ctx.save();
      ctx.beginPath();
      payload.result.route.forEach((pt, i) => {
        const px = (pt.x / 12) * w;
        const py = (pt.y / 9) * h;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = payload.result.routeBlocked
        ? "#c2410c"
        : payload.mode === "baseline"
        ? "#ea580c"
        : "#f97316";
      ctx.lineWidth = 4.5;
      ctx.setLineDash([12, 8]);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle =
      this.theme === "dark"
        ? "rgba(255,255,255,0.42)"
        : "rgba(15,23,42,0.48)";
    ctx.font = "700 18px 'JetBrains Mono', monospace";
    ctx.fillText(
      `FLOORPLATE · 12.0m × 9.0m (${payload.pyeong}PY) · ${payload.districtName.toUpperCase()}`,
      34,
      38
    );

    ctx.fillText(
      `SHARED WALKWAY MATRIX · 24 CELLS`,
      210,
      515
    );

    const ent = payload.scene.entrance;
    const ext = payload.scene.exit;
    const entPx = (ent.x / 12) * w;
    const entPy = (ent.y / 9) * h;
    const extPx = (ext.x / 12) * w;
    const extPy = (ext.y / 9) * h;

    ctx.fillStyle = this.accentHex;
    ctx.font = "700 20px 'JetBrains Mono', sans-serif";
    ctx.fillText(
      "▲ ENTRANCE · IN",
      Math.max(24, Math.min(w - 260, entPx - 90)),
      Math.min(h - 32, entPy + 46)
    );

    ctx.fillStyle = t.textMuted;
    ctx.fillText(
      "▼ EXIT · OUT",
      Math.max(24, Math.min(w - 220, extPx - 75)),
      Math.min(h - 32, extPy + 42)
    );

    this.floorHudTex.needsUpdate = true;
  }

  private rebuildFlowArcs(payload: ThreeStageUpdatePayload): void {
    this.arcsGroup.clear();
    this.arcPackets = [];

    const sc = payload.scene;
    const primaryObs =
      sc.objects.find((o) => o.id === "display") || sc.objects[0];

    const pEnt = new THREE.Vector3(
      this.toWorldX(sc.entrance.x),
      0.35,
      this.toWorldZ(sc.entrance.y)
    );
    const pObs = primaryObs
      ? new THREE.Vector3(
          this.toWorldX(primaryObs.x + primaryObs.w * 0.5),
          0.92,
          this.toWorldZ(primaryObs.y + primaryObs.h * 0.5)
        )
      : new THREE.Vector3(0, 0.8, 0);
    const pOrd = new THREE.Vector3(
      this.toWorldX(sc.order.x),
      1.06,
      this.toWorldZ(sc.order.y - 0.55)
    );
    const pPck = new THREE.Vector3(
      this.toWorldX(sc.pickup.x),
      1.18,
      this.toWorldZ(sc.pickup.y - 0.55)
    );
    const pExt = new THREE.Vector3(
      this.toWorldX(sc.exit.x),
      0.25,
      this.toWorldZ(sc.exit.y)
    );

    const arcPairs: [THREE.Vector3, THREE.Vector3, number, boolean][] = [
      [pEnt, pObs, 2.35, true],
      [pObs, pOrd, 2.65, true],
      [pOrd, pPck, 2.25, true],
      [pPck, pExt, 2.45, false],
    ];

    for (const tb of sc.objects) {
      if (tb.id === "display" || !tb.movable) continue;
      const pTb = new THREE.Vector3(
        this.toWorldX(tb.x + tb.w * 0.5),
        0.72,
        this.toWorldZ(tb.y + tb.h * 0.5)
      );
      arcPairs.push([pPck, pTb, 1.9, false]);
    }

    const t = THEMES[this.theme];

    arcPairs.forEach(([start, end, peakY, isPrimaryArc], idx) => {
      const mid = new THREE.Vector3()
        .addVectors(start, end)
        .multiplyScalar(0.5);
      mid.y = peakY;

      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const pts = curve.getPoints(36);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: isPrimaryArc ? this.accentColor : new THREE.Color(t.edgeMajor),
        transparent: true,
        opacity: isPrimaryArc ? 0.82 : 0.45,
      });
      const line = new THREE.Line(geo, mat);
      this.arcsGroup.add(line);

      const pktGeo = new THREE.SphereGeometry(
        isPrimaryArc ? 0.085 : 0.06,
        10,
        10
      );
      const pktMat = new THREE.MeshBasicMaterial({
        color: isPrimaryArc ? this.accentColor : new THREE.Color(t.edgeMajor),
      });
      const pktMesh = new THREE.Mesh(pktGeo, pktMat);
      this.arcsGroup.add(pktMesh);

      this.arcPackets.push({
        mesh: pktMesh,
        curve,
        speed: isPrimaryArc ? 0.42 : 0.28,
        offset: (idx * 0.27) % 1,
      });
    });

    // 10,000-Scenario Parallel Monte Carlo Trajectory Swarm (multi-lane floor streamlines + 48 parallel packets)
    if (this.swarmEnabled) {
      const swarmLanes = 12;
      const pktGeoSwarm = new THREE.SphereGeometry(0.052, 8, 8);
      for (let lane = 0; lane < swarmLanes; lane++) {
        const laneNorm = (lane / (swarmLanes - 1)) - 0.5; // -0.5 .. +0.5
        const jitterX = laneNorm * 1.45;
        const jitterZ = ((lane % 3) - 1) * 0.45;
        const isSurvivedLane = payload.mode === "proposed" ? lane < 10 : lane < 4;

        const wEnt = pEnt.clone().add(new THREE.Vector3(jitterX * 0.5, -0.18, 0));
        const wMid1 = pObs
          .clone()
          .add(new THREE.Vector3(jitterX * 0.85, -0.62 + (lane % 2) * 0.12, jitterZ));
        const wOrd = pOrd
          .clone()
          .add(new THREE.Vector3(jitterX * 0.55, -0.72, 0.35 + jitterZ * 0.4));
        const wPck = pPck
          .clone()
          .add(new THREE.Vector3(jitterX * 0.55, -0.82, 0.35 - jitterZ * 0.4));
        const wExt = pExt.clone().add(new THREE.Vector3(jitterX * 0.45, -0.08, 0));

        const segs: [THREE.Vector3, THREE.Vector3, number][] = [
          [wEnt, wMid1, 0.24 + (lane % 3) * 0.08],
          [wMid1, wOrd, 0.28 + (lane % 4) * 0.07],
          [wOrd, wPck, 0.26 + (lane % 2) * 0.08],
          [wPck, wExt, 0.22 + (lane % 3) * 0.07],
        ];

        const laneColor = isSurvivedLane
          ? lane % 3 === 0
            ? new THREE.Color("#f97316")
            : this.accentColor
          : new THREE.Color(this.theme === "dark" ? 0x52525b : 0x71717a);

        segs.forEach(([sPt, ePt, hPeak], sIdx) => {
          const midPt = new THREE.Vector3()
            .addVectors(sPt, ePt)
            .multiplyScalar(0.5);
          midPt.y = hPeak;
          const sCurve = new THREE.QuadraticBezierCurve3(sPt, midPt, ePt);
          const sGeo = new THREE.BufferGeometry().setFromPoints(
            sCurve.getPoints(20)
          );
          const sMat = new THREE.LineBasicMaterial({
            color: laneColor,
            transparent: true,
            opacity: isSurvivedLane ? 0.32 : 0.18,
          });
          this.arcsGroup.add(new THREE.Line(sGeo, sMat));

          const pMat = new THREE.MeshBasicMaterial({
            color: laneColor,
          });
          const pMesh = new THREE.Mesh(pktGeoSwarm, pMat);
          this.arcsGroup.add(pMesh);
          this.arcPackets.push({
            mesh: pMesh,
            curve: sCurve,
            speed: isSurvivedLane ? 0.58 + (lane % 4) * 0.09 : 0.22,
            offset: ((lane * 0.19) + sIdx * 0.25) % 1,
          });
        });
      }
    }
  }

  public update(payload: ThreeStageUpdatePayload): void {
    this.lastPayload = payload;
    const t = THEMES[this.theme];
    const sc = payload.scene;

    const orderDeskObj = sc.objects.find((o) => o.id === "order-desk");
    const orderCx = orderDeskObj ? orderDeskObj.x + orderDeskObj.w * 0.5 : sc.order.x;
    const orderCy = orderDeskObj ? orderDeskObj.y + orderDeskObj.h * 0.5 : 0.95;

    this.orderCounterGroup.position.set(
      this.toWorldX(orderCx),
      0,
      this.toWorldZ(orderCy)
    );
    this.orderCounterGroup.userData = {
      partKey: "order-pos",
      title: `ORDER & POS COUNTER · STAFF ${payload.orderStaff}`,
      subtitle: `Mean Wait ${Math.round(payload.result.meanWaitSec ?? 0)}s · P90 Wait ${Math.round(payload.result.p90WaitSec ?? 0)}s`,
      body: `Primary point-of-sale counter where guests place orders. When arrival rate (${payload.arrivalRatePerMin.toFixed(1)}/min) exceeds service throughput, the 16-slot LED buffer illuminates in Signal Orange.`,
    };

    const pickupDeskObj = sc.objects.find(
      (o) => o.id === "pickup-desk" || o.id === "pickup-bar"
    );
    const pickupCx = pickupDeskObj ? pickupDeskObj.x + pickupDeskObj.w * 0.5 : sc.pickup.x;
    const pickupCy = pickupDeskObj ? pickupDeskObj.y + pickupDeskObj.h * 0.5 : 0.95;

    this.pickupCounterGroup.position.set(
      this.toWorldX(pickupCx),
      0,
      this.toWorldZ(pickupCy)
    );
    this.pickupCounterGroup.userData = {
      partKey: "pickup-bar",
      title: `PRODUCTION & PICKUP BAR · STAFF ${payload.pickupStaff}`,
      subtitle: `10m Completed ${payload.result.completed} · Arrivals ${payload.result.arrivalCount} · Peak Queue ${payload.result.maxQueue}`,
      body: `Core production & handoff station for ${payload.categoryName}. Separating the pickup queue from the entrance corridor prevents cross-traffic gridlock.`,
    };

    this.entranceGroup.position.set(
      this.toWorldX(sc.entrance.x),
      0,
      this.toWorldZ(sc.entrance.y)
    );
    this.entranceGroup.userData = {
      partKey: "entrance-in",
      title: `ENTRANCE THRESHOLD · STORE INGRESS (IN)`,
      subtitle: `${payload.scenarioCode} · ${payload.scenarioName} (Clearance ${payload.bodyWidth.toFixed(2)}m)`,
      body: `Main street-level ingress. If display fixtures sit too close to the threshold, strollers and group visitors (${payload.bodyWidth.toFixed(2)}m clearance) cannot enter.`,
    };

    this.exitGroup.position.set(
      this.toWorldX(sc.exit.x),
      0,
      this.toWorldZ(sc.exit.y)
    );

    const frame = sample(payload.result, payload.currentTimeSec);
    const hudTick = Math.floor(payload.currentTimeSec * 2);
    if (hudTick !== this.lastHudTick) {
      this.lastHudTick = hudTick;
      this.drawStationHudCanvas(
        this.orderTopCanvas,
        "ORDER · POS",
        `${payload.categoryName} POS`,
        frame.orderQueue,
        payload.orderStaff,
        frame.orderQueue >= 3
      );
      this.orderTopTex.needsUpdate = true;

      this.drawStationFrontCanvas(
        this.orderFrontCanvas,
        "ORDER · POS",
        `staff ${payload.orderStaff}/2`,
        Math.min(24, frame.orderQueue * 3 + 4),
        24,
        `queue ${frame.orderQueue}  ·  wait ${Math.round(payload.result.meanWaitSec ?? 0)}s`,
        frame.orderQueue >= 3
      );
      this.orderFrontTex.needsUpdate = true;

      const isPckBottle =
        frame.pickupQueue >= 4 || (payload.result.meanWaitSec ?? 0) >= 75;
      this.drawStationHudCanvas(
        this.pickupTopCanvas,
        "PICKUP · BAR",
        `${payload.categoryName} HANDOFF`,
        frame.pickupQueue,
        payload.pickupStaff,
        isPckBottle
      );
      this.pickupTopTex.needsUpdate = true;

      this.drawStationFrontCanvas(
        this.pickupFrontCanvas,
        "pickup · bar",
        `done ${payload.result.completed}/${payload.result.arrivalCount}`,
        Math.min(24, Math.round((payload.result.completed / 2.5) % 24) + 6),
        24,
        `active ${frame.pickupQueue}  ·  staff ${payload.pickupStaff}  ·  p90 ${Math.round(payload.result.p90WaitSec ?? 0)}s`,
        isPckBottle
      );
      this.pickupFrontTex.needsUpdate = true;
    }

    // Sync obstacles (`sc.objects`) built at exact metric dimensions so text is never stretched
    const activeIds = new Set<string>();
    sc.objects.forEach((obs) => {
      if (
        obs.id === "order-desk" ||
        obs.id === "pickup-desk" ||
        obs.id === "pickup-bar"
      ) {
        return;
      }

      activeIds.add(obs.id);
      const isPrimary = obs.id === "display";
      const isSelected = payload.selectedObjectId === obs.id;
      const isBlocked =
        payload.result.routeBlocked ||
        payload.mode === "baseline" ||
        (payload.result.meanWaitSec ?? 0) >= 80;

      let entry = this.obstacleMeshes.get(obs.id);
      if (
        entry &&
        (Math.abs(entry.builtW - obs.w) > 0.05 ||
          Math.abs(entry.builtD - obs.h) > 0.05)
      ) {
        this.obstaclesGroup.remove(entry.group);
        this.obstacleMeshes.delete(obs.id);
        entry = undefined;
      }

      const blockH = isPrimary ? 0.88 : obs.movable ? 0.68 : 0.54;
      const centerX = obs.x + obs.w * 0.5;
      const centerY = obs.y + obs.h * 0.5;

      if (!entry) {
        const group = new THREE.Group();
        const base = this.createBoxWithEdges(
          obs.w,
          blockH,
          obs.h,
          isPrimary ? t.blockTop : t.blockBody,
          t.edgeMajor,
          0.74,
          0.06
        );
        group.add(base.group);

        const topCanvas = document.createElement("canvas");
        topCanvas.width = 512;
        topCanvas.height = Math.max(
          180,
          Math.round(512 * (obs.h / Math.max(0.5, obs.w)))
        );
        const topTex = new THREE.CanvasTexture(topCanvas);
        topTex.colorSpace = THREE.SRGBColorSpace;
        topTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

        const topPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(obs.w - 0.08, obs.h - 0.08),
          new THREE.MeshBasicMaterial({
            map: topTex,
            transparent: true,
            polygonOffset: true,
            polygonOffsetFactor: -1,
          })
        );
        topPlane.rotation.x = -Math.PI / 2;
        topPlane.position.y = blockH + 0.005;
        group.add(topPlane);

        const frontCanvas = document.createElement("canvas");
        frontCanvas.width = 512;
        frontCanvas.height = 140;
        const frontTex = new THREE.CanvasTexture(frontCanvas);
        frontTex.colorSpace = THREE.SRGBColorSpace;
        frontTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

        const frontPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(obs.w - 0.08, blockH - 0.08),
          new THREE.MeshBasicMaterial({
            map: frontTex,
            transparent: true,
            polygonOffset: true,
            polygonOffsetFactor: -1,
          })
        );
        frontPlane.position.set(0, blockH * 0.5, obs.h * 0.5 + 0.005);
        group.add(frontPlane);

        group.position.set(
          this.toWorldX(centerX),
          0,
          this.toWorldZ(centerY)
        );

        this.obstaclesGroup.add(group);
        entry = {
          group,
          targetPos: new THREE.Vector3(
            this.toWorldX(centerX),
            0,
            this.toWorldZ(centerY)
          ),
          builtW: obs.w,
          builtD: obs.h,
          topTex,
          topCanvas,
          frontTex,
          frontCanvas,
          bodyMat: base.bodyMat,
          edgeMat: base.edgeMat,
          obstacleRef: obs,
        };
        this.obstacleMeshes.set(obs.id, entry);
      }

      entry.obstacleRef = obs;
      entry.targetPos.set(
        this.toWorldX(centerX),
        0,
        this.toWorldZ(centerY)
      );

      if (isPrimary && isBlocked) {
        entry.bodyMat.color.copy(this.accentColor);
        entry.edgeMat.color.copy(this.accentColor);
      } else if (isSelected) {
        entry.bodyMat.color.setHex(t.blockTop);
        entry.edgeMat.color.copy(this.accentColor);
      } else {
        entry.bodyMat.color.setHex(isPrimary ? t.blockTop : t.blockBody);
        entry.edgeMat.color.setHex(t.edgeMajor);
      }

      entry.group.userData = {
        obstacleId: obs.id,
        draggable: Boolean(obs.movable),
        obsW: obs.w,
        obsH: obs.h,
        partKey: `obs-${obs.id}`,
        title: `${obs.label || obs.koLabel} (${obs.w.toFixed(1)}m × ${obs.h.toFixed(1)}m)`,
        subtitle: isPrimary
          ? `Primary Merchandising Fixture · Walk Distance ${(payload.result.walkDistance ?? 0).toFixed(1)}m`
          : `Movable Store Fixture · Press [R] to Rotate 90° or Shift+Drag to Move`,
        body: isPrimary
          ? `Key merchandising island between the Entrance and POS counter. Toggle [Proposed / Baseline] or [Design A / B / C] on the right to inspect 360° circulation clearance.`
          : `Guest seating / zone fixture. Click to select, press R to rotate 90°, or drag directly on the floorplan to test bottleneck clearance.`,
      };

      this.drawObstacleTopCanvas(
        entry.topCanvas,
        obs,
        isPrimary,
        isSelected,
        isBlocked
      );
      entry.topTex.needsUpdate = true;

      this.drawObstacleFrontCanvas(
        entry.frontCanvas,
        obs,
        isPrimary,
        isBlocked
      );
      entry.frontTex.needsUpdate = true;
    });

    for (const [id, entry] of this.obstacleMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.obstaclesGroup.remove(entry.group);
        this.obstacleMeshes.delete(id);
      }
    }

    const primary = sc.objects.find((o) => o.id === "display");
    const primCx = primary ? primary.x + primary.w * 0.5 : 99;
    const primCy = primary ? primary.y + primary.h * 0.5 : 99;
    const congestionLevel = Math.min(
      1,
      (payload.result.meanWaitSec ?? 90) / 100
    );

    for (const tile of this.bufferTiles) {
      const distToPrimary = Math.hypot(tile.gx - primCx, tile.gz - primCy);
      if (
        distToPrimary < 1.6 &&
        (payload.mode === "baseline" || congestionLevel > 0.55)
      ) {
        tile.mat.color.copy(this.accentColor);
      } else if (distToPrimary < 2.2 && congestionLevel > 0.35) {
        tile.mat.color.setHex(this.theme === "dark" ? 0x3b2f26 : 0xfed7aa);
      } else {
        tile.mat.color.setHex(t.blockTop);
      }
    }

    const sig = `${payload.categoryId}-${payload.mode}-${payload.scenarioCode}-${payload.showHeatmap}-${this.theme}-${this.accentHex}-${sc.objects
      .map((o) => `${o.id}:${o.x.toFixed(1)},${o.y.toFixed(1)},${o.w},${o.h}`)
      .join("|")}`;
    if (sig !== this.lastSignature) {
      this.lastSignature = sig;
      this.lastHudTick = -1;
      this.drawFloorHudCanvas(payload);
      this.rebuildFlowArcs(payload);
    }
  }

  public setTheme(theme: "light" | "dark"): void {
    if (this.theme === theme) return;
    this.theme = theme;
    const t = THEMES[this.theme];
    this.scene3d.background = new THREE.Color(t.bg);
    this.buildArchitecturalBoard();
    this.buildBufferSensorMatrix();
    this.buildCoreStations();
    this.obstacleMeshes.clear();
    this.obstaclesGroup.clear();
    this.lastSignature = "";
    this.lastHudTick = -1;
    if (this.lastPayload) {
      this.update(this.lastPayload);
    }
  }

  public toggleTheme(): "light" | "dark" {
    const next = this.theme === "light" ? "dark" : "light";
    this.setTheme(next);
    return next;
  }

  public setAccentColor(hex: string): void {
    this.accentHex = hex;
    this.accentColor.set(hex);
    this.lastSignature = "";
    this.lastHudTick = -1;
    if (this.lastPayload) {
      this.update(this.lastPayload);
    }
  }

  public setAutoRevolve(enabled: boolean): void {
    this.autoRevolve = enabled;
  }

  public setSwarmEnabled(enabled: boolean): void {
    this.swarmEnabled = enabled;
    this.lastSignature = "";
    if (this.lastPayload) {
      this.update(this.lastPayload);
    }
  }

  public isSwarmEnabled(): boolean {
    return this.swarmEnabled;
  }

  public snapToIsoView(): void {
    this.camAnim = {
      targetPos: new THREE.Vector3(-9.8, 11.0, 11.4),
      targetLook: new THREE.Vector3(0, 0.25, 0),
    };
  }

  public snapToTopView(): void {
    this.camAnim = {
      targetPos: new THREE.Vector3(0, 18.2, 0.01),
      targetLook: new THREE.Vector3(0, 0, 0),
    };
  }

  public resize(): void {
    const width = Math.max(320, this.container.clientWidth || 1040);
    const height = Math.max(340, this.container.clientHeight || 560);
    const aspect = width / height;

    this.perspCam.aspect = aspect;
    this.perspCam.updateProjectionMatrix();

    const frustumH = 11.2;
    this.orthoCam.left = (-frustumH * aspect) / 2;
    this.orthoCam.right = (frustumH * aspect) / 2;
    this.orthoCam.top = frustumH / 2;
    this.orthoCam.bottom = -frustumH / 2;
    this.orthoCam.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  private updatePointer(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private findInteractiveParent(
    obj: THREE.Object3D | null
  ): THREE.Object3D | null {
    let curr = obj;
    while (curr && curr !== this.scene3d) {
      if (
        curr.userData &&
        (curr.userData.partKey || curr.userData.obstacleId)
      ) {
        return curr;
      }
      curr = curr.parent;
    }
    return null;
  }

  private bindInteractionEvents(): void {
    const dom = this.renderer.domElement;

    dom.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.button !== 0) return;
      this.pointerDownPx.set(e.clientX, e.clientY);
      this.updatePointer(e);
      this.raycaster.setFromCamera(this.pointer, this.activeCam);

      // Only hijack left-drag for furniture movement when Shift is held or editDragMode is enabled;
      // otherwise left-drag ANYWHERE smoothly orbits the 3D floorplan like pgrun.dev/postgres-internals!
      if (e.shiftKey || this.editDragMode) {
        const hits = this.raycaster.intersectObjects(
          this.obstaclesGroup.children,
          true
        );
        if (hits.length > 0) {
          const target = this.findInteractiveParent(hits[0].object);
          if (
            target &&
            target.userData.obstacleId &&
            target.userData.draggable
          ) {
            const obsId = target.userData.obstacleId as string;
            this.onSelectObject?.(obsId);
            if (
              this.raycaster.ray.intersectPlane(this.floorPlane, this._vecA)
            ) {
              this.dragObjectId = obsId;
              this.dragOffset.subVectors(target.position, this._vecA);
              this.controls.enabled = false;
              dom.style.cursor = "grabbing";
            }
          }
        }
      }
    });

    window.addEventListener("pointermove", (e: PointerEvent) => {
      const rect = dom.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        return;
      }

      this.updatePointer(e);
      this.raycaster.setFromCamera(this.pointer, this.activeCam);

      if (this.dragObjectId) {
        if (this.raycaster.ray.intersectPlane(this.floorPlane, this._vecA)) {
          const entry = this.obstacleMeshes.get(this.dragObjectId);
          const w = entry ? entry.obstacleRef.w : 1;
          const h = entry ? entry.obstacleRef.h : 1;
          const newWorldX = this._vecA.x + this.dragOffset.x;
          const newWorldZ = this._vecA.z + this.dragOffset.z;
          const sx = this.toSceneX(newWorldX, w);
          const sy = this.toSceneY(newWorldZ, h);
          this.onMoveObstacle?.(this.dragObjectId, sx, sy);
        }
        return;
      }

      const inspectables = [
        ...this.obstaclesGroup.children,
        ...this.stationsGroup.children,
        ...this.bufferTilesGroup.children,
      ];
      const hits = this.raycaster.intersectObjects(inspectables, true);
      if (hits.length > 0) {
        const hitGroup = this.findInteractiveParent(hits[0].object);
        if (hitGroup && hitGroup.userData.partKey) {
          dom.style.cursor = "pointer";
          if (this.hoveredKey !== hitGroup.userData.partKey) {
            this.hoveredKey = hitGroup.userData.partKey;
            this.onHoverPart?.({
              title: hitGroup.userData.title,
              subtitle: hitGroup.userData.subtitle,
              body: hitGroup.userData.body,
            });
          }
          return;
        }
      }

      dom.style.cursor = "grab";
      if (this.hoveredKey !== null) {
        this.hoveredKey = null;
        this.onHoverPart?.(null);
      }
    });

    window.addEventListener("pointerup", (e: PointerEvent) => {
      if (this.dragObjectId) {
        this.dragObjectId = null;
        this.controls.enabled = true;
        dom.style.cursor = "grab";
        return;
      }

      // If it was a clean click (< 5px movement), select the clicked 3D furniture/station
      if (
        Math.hypot(
          e.clientX - this.pointerDownPx.x,
          e.clientY - this.pointerDownPx.y
        ) < 5
      ) {
        const rect = dom.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          this.updatePointer(e);
          this.raycaster.setFromCamera(this.pointer, this.activeCam);
          const hits = this.raycaster.intersectObjects(
            this.obstaclesGroup.children,
            true
          );
          if (hits.length > 0) {
            const target = this.findInteractiveParent(hits[0].object);
            if (target && target.userData.obstacleId) {
              this.onSelectObject?.(target.userData.obstacleId as string);
              if (target.userData.title) {
                this.onHoverPart?.({
                  title: target.userData.title,
                  subtitle: target.userData.subtitle,
                  body: target.userData.body,
                });
              }
            }
          }
        }
      }
    });

    window.addEventListener("resize", () => this.resize());
  }

  private startLoop(): void {
    const tick = () => {
      this.animFrameId = requestAnimationFrame(tick);
      const dt = Math.min(0.05, this.clock.getDelta());
      const elapsed = this.clock.getElapsedTime();

      for (const entry of this.obstacleMeshes.values()) {
        entry.group.position.x = THREE.MathUtils.damp(
          entry.group.position.x,
          entry.targetPos.x,
          12,
          dt
        );
        entry.group.position.z = THREE.MathUtils.damp(
          entry.group.position.z,
          entry.targetPos.z,
          12,
          dt
        );
      }

      if (this.camAnim) {
        this.activeCam.position.lerp(this.camAnim.targetPos, 0.14);
        this.controls.target.lerp(this.camAnim.targetLook, 0.14);
        if (
          this.activeCam.position.distanceTo(this.camAnim.targetPos) < 0.08
        ) {
          this.activeCam.position.copy(this.camAnim.targetPos);
          this.controls.target.copy(this.camAnim.targetLook);
          this.camAnim = null;
        }
      } else if (this.autoRevolve && !this.dragObjectId) {
        const offset = this._vecA
          .copy(this.activeCam.position)
          .sub(this.controls.target);
        const angle = dt * 0.36;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const nx = offset.x * cos - offset.z * sin;
        const nz = offset.x * sin + offset.z * cos;
        offset.x = nx;
        offset.z = nz;
        this.activeCam.position.copy(this.controls.target).add(offset);
      }

      for (const pkt of this.arcPackets) {
        const t = (elapsed * pkt.speed + pkt.offset) % 1;
        pkt.curve.getPoint(t, pkt.mesh.position);
      }

      if (this.lastPayload) {
        const frame = sample(
          this.lastPayload.result,
          this.lastPayload.currentTimeSec
        );
        const people = frame.people;
        const t = THEMES[this.theme];

        for (let i = 0; i < this.agentPool.length; i++) {
          const item = this.agentPool[i];
          if (i < people.length) {
            const p = people[i];
            item.group.visible = true;
            const bob =
              p.state === "walking"
                ? Math.abs(Math.sin(elapsed * 8 + p.id)) * 0.05
                : 0;
            item.group.position.set(
              this.toWorldX(p.x),
              bob,
              this.toWorldZ(p.y)
            );
            if (p.state === "queue") {
              item.bodyMat.color.copy(this.accentColor);
              item.ringMat.color.copy(this.accentColor);
            } else if (p.state === "service") {
              item.bodyMat.color.setHex(0xf97316);
              item.ringMat.color.setHex(0xf97316);
            } else {
              item.bodyMat.color.setHex(t.blockTop);
              item.ringMat.color.setHex(t.edgeMajor);
            }
          } else {
            item.group.visible = false;
          }
        }
      }

      this.controls.update();
      this.renderer.render(this.scene3d, this.activeCam);
    };
    tick();
  }
}
