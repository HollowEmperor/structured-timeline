// Pure 3D pinhole perspective geometry & weighted stacking physics for the Memo Spike.
// Uses ONE unified 50mm-style pinhole camera for the metallic base, chrome spindle,
// and every center-stabbed square paper slip so perspective convergence is physically exact.

const DEG = Math.PI / 180;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function hexToRgb(hex) {
  const clean = String(hex || '#F28B82').replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((ch) => ch + ch).join('')
    : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return { r: 242, g: 139, b: 130 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r, g, b) {
  const toHex = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function blendHex(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t
  );
}

/**
 * Produces a 100% solid, opaque matte cardstock paper palette from a task color.
 * Keeps shadows rich in the paper's own hue (never blending toward dark grey/transparent)
 * so every sheet reads as thick opaque stationery paper.
 */
export function buildPaperPalette(taskHex) {
  const paperStock = '#FAF5EC';
  const warmUmber = '#3A2E2A';

  // Solid bright matte pastel cardstock (like stacked colored square memo notes)
  const face = blendHex(taskHex, paperStock, 0.36);
  const highlight = blendHex(face, '#FFFFFF', 0.22);
  const midShade = blendHex(face, warmUmber, 0.09);
  const deepShade = blendHex(face, warmUmber, 0.19);
  const cutEdge = blendHex(face, '#FFFFFF', 0.56);
  const edgeOutline = blendHex(face, warmUmber, 0.34);
  const underside = blendHex(face, warmUmber, 0.32);
  const ink = blendHex(taskHex, '#241E1C', 0.68);

  return {
    face,
    highlight,
    midShade,
    deepShade,
    cutEdge,
    edgeOutline,
    underside,
    ink,
  };
}

/**
 * Deterministic PRNG seeded from task id & stack position so slips keep
 * consistent physical character across re-renders without jittering.
 */
function seededUnit(seed) {
  let x = (seed >>> 0) || 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) % 10000) / 10000;
}

/**
 * Projects a 3D world point (wx, wy, wz) through a real pinhole perspective camera.
 * World origin (0, 0, 0) sits on the top center of the circular metallic desk base:
 *  - +X: right, +Y: depth away from viewer, +Z: vertically up the steel spike.
 * Camera sits at (0, -camDist, camZ) looking toward (0, 0, lookZ).
 * Invariant: any point on the vertical spike axis (wx = 0, wy = 0, wz = z)
 * ALWAYS projects to exact sx === centerX.
 */
export function projectPoint3D(wx, wy, wz, camera) {
  const { centerX, lookScreenY, camDist, camZ, focal, sinP, cosP } = camera;
  const dx = wx;
  const dy = wy + camDist;
  const dz = wz - camZ;

  // Camera-space depth (forward along optical axis) and vertical offset (up)
  const czDepth = dy * cosP - dz * sinP;
  const cyUp = dy * sinP + dz * cosP;
  const persp = focal / Math.max(80, czDepth);

  return {
    sx: centerX + dx * persp,
    sy: lookScreenY - cyUp * persp,
    depth: czDepth,
    persp,
  };
}

function fmt(n) {
  return Number(n.toFixed(2));
}

function pointsToPolylinePath(pts, close = false) {
  if (!pts.length) return '';
  let d = `M ${fmt(pts[0].sx)},${fmt(pts[0].sy)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${fmt(pts[i].sx)},${fmt(pts[i].sy)}`;
  }
  return close ? `${d} Z` : d;
}

/**
 * Computes full 3D pinhole-projected geometry for the circular base, chrome spindle,
 * and every stacked center-stabbed square memo slip.
 * Input `completedTasks` is newest-first; Output `sheets` is ordered bottom-to-top.
 */
export function computeMemoSpikeLayout(completedTasks, options = {}) {
  const stageWidth = options.stageWidth || 340;
  const centerX = stageWidth / 2;
  const count = completedTasks.length;

  // Stack ordered bottom (oldest) -> top (newest)
  const ordered = [...completedTasks].reverse();

  // Compressed vertical stack heights (world Z above the top surface of the base at Z = 0):
  // Bottom slip settles closely above the chrome collar; upper slips gain slightly more loft.
  const zHeights = [];
  let cursorZ = 28;
  for (let i = 0; i < count; i++) {
    zHeights.push(cursorZ);
    const slipsAbove = count - 1 - i;
    const compression = clamp(slipsAbove / 7, 0, 1);
    const pitch = 10.6 - compression * 3.8; // 6.8..10.6 world units for crisp thin paper stacking
    cursorZ += pitch;
  }

  const topZ = count > 0 ? zHeights[count - 1] : 0;
  const shaftAboveTop = count > 0 ? 118 : 200;
  const tipZ = Math.max(200, topZ + shaftAboveTop);

  // Unified 50mm-style pinhole camera looking slightly down from above the pile:
  // Gives real front-to-back perspective convergence (near edge wider, far edge narrower)
  // AND guarantees the circular metallic base and all square sheets share ONE camera angle.
  const camDist = 460;
  const lookZ = Math.min(72, Math.max(40, topZ * 0.65));
  const camZ = lookZ + 148; // ~17.8 deg downward look angle to center of pile
  const pitchRad = Math.atan2(camZ - lookZ, camDist);
  const sinP = Math.sin(pitchRad);
  const cosP = Math.cos(pitchRad);
  const focal = 450;

  // Preliminary probe to place the base cleanly near the bottom of stageHeight
  const probeCam = { centerX, lookScreenY: 0, camDist, camZ, focal, sinP, cosP };
  const probeTip = projectPoint3D(0, 0, tipZ, probeCam);
  const probeBaseBottom = projectPoint3D(0, -64, -18, probeCam);

  const topMargin = 38;
  const bottomMargin = 26;
  const requiredHeight = (probeBaseBottom.sy - probeTip.sy) + topMargin + bottomMargin;
  const stageHeight = Math.max(380, Math.ceil(requiredHeight));

  // Anchor lookScreenY so the base bottom sits neatly at stageHeight - bottomMargin
  const lookScreenY = (stageHeight - bottomMargin) - probeBaseBottom.sy;
  const camera = { centerX, lookScreenY, camDist, camZ, focal, sinP, cosP };

  const collarPt = projectPoint3D(0, 0, 0, camera);
  const tipPt = projectPoint3D(0, 0, tipZ, camera);
  const collarY = collarPt.sy;
  const tipY = tipPt.sy;

  // Project the circular metallic base (radius = 62, height = 18) through the EXACT SAME camera
  const baseRadius = 62;
  const baseHeight = 18;
  const BASE_SEG = 40;
  const baseTopPts = [];
  const baseFrontTopPts = [];
  const baseFrontBotPts = [];
  for (let i = 0; i < BASE_SEG; i++) {
    const theta = (i / BASE_SEG) * Math.PI * 2;
    const bx = Math.cos(theta) * baseRadius;
    const by = Math.sin(theta) * baseRadius;
    baseTopPts.push(projectPoint3D(bx, by, 0, camera));
  }
  // Front half arc (theta from 0 -> PI corresponds to +X -> front(-Y) -> -X using sin <= 0)
  for (let i = 0; i <= 24; i++) {
    const theta = Math.PI + (i / 24) * Math.PI; // PI (-X) -> 1.5*PI (front -Y) -> 2*PI (+X)
    const bx = Math.cos(theta) * baseRadius;
    const by = Math.sin(theta) * baseRadius;
    baseFrontTopPts.push(projectPoint3D(bx, by, 0, camera));
    baseFrontBotPts.push(projectPoint3D(bx, by, -baseHeight, camera));
  }

  const baseTopPath = pointsToPolylinePath(baseTopPts, true);
  const baseWallPath = pointsToPolylinePath(
    [...baseFrontTopPts, ...[...baseFrontBotPts].reverse()],
    true
  );
  const baseShadowCenter = projectPoint3D(0, 0, -baseHeight - 2, camera);
  const baseLeftPt = projectPoint3D(-baseRadius, 0, 0, camera);
  const baseRightPt = projectPoint3D(baseRadius, 0, 0, camera);
  const baseFrontPt = projectPoint3D(0, -baseRadius, 0, camera);
  const baseBackPt = projectPoint3D(0, baseRadius, 0, camera);

  const base = {
    topPath: baseTopPath,
    wallPath: baseWallPath,
    collarX: fmt(collarPt.sx),
    collarY: fmt(collarPt.sy),
    shadowCx: fmt(baseShadowCenter.sx),
    shadowCy: fmt(baseShadowCenter.sy),
    rx: fmt((baseRightPt.sx - baseLeftPt.sx) / 2),
    ry: fmt((baseFrontPt.sy - baseBackPt.sy) / 2),
  };

  // Deterministic well-spaced yaw offsets (degrees, mod 90°) so adjacent center-stabbed
  // square sheets fan out crisp, visible, individually clickable corners
  const yawFanSlots = [-34, 18, -10, 36, 4, -24, 28, -40];

  const sheets = ordered.map((task, stackIndex) => {
    const slipsAbove = count - 1 - stackIndex;
    const weightLoad = clamp(slipsAbove / 6, 0, 1);
    const seedBase = ((task.id || 1) * 2654435761 + (stackIndex + 1) * 1597334677) >>> 0;

    const r1 = seededUnit(seedBase);
    const r2 = seededUnit(seedBase ^ 0x9e3779b9);
    const r3 = seededUnit(seedBase ^ 0x85ebca6b);
    const r4 = seededUnit(seedBase ^ 0xc2b2ae35);
    const r5 = seededUnit(seedBase ^ 0x27d4eb2f);
    const r6 = seededUnit(seedBase ^ 0x165667b1);

    // True square memo pad paper (equal width and depth)
    const sheetSize = Number((144 + r1 * 12).toFixed(1)); // 144..156 square
    const sheetW = sheetSize;
    const sheetD = sheetSize;

    // Stabbed dead in the middle of every square paper slip
    const hx = 0;
    const hy = 0;

    // Fan yaw angles cleanly across stacked squares so every sheet's corners peek out
    const baseYaw = yawFanSlots[stackIndex % yawFanSlots.length];
    const yawJitter = (r5 - 0.5) * 6; // ±3° subtle organic hand-placed variation
    const yawDeg = Number((baseYaw + yawJitter).toFixed(2));
    const yawRad = yawDeg * DEG;
    const cosYaw = Math.cos(yawRad);
    const sinYaw = Math.sin(yawRad);

    // Subtle gravity tilt & gentle outer droop; bottom sheets flatten more under weight.
    // Kept restrained so straight converging perspective edges stay razor-clear.
    const tiltSpread = 1 - weightLoad * 0.5;
    const pitchTilt = ((r6 - 0.5) * 0.055) * tiltSpread;
    const rollTilt = ((r2 - 0.5) * 0.07) * tiltSpread;
    const sagStrength = (3.2 + r4 * 2.4) * (1 - weightLoad * 0.4);

    // Subtle crisp corner bend on select sheets without warping perspective straightness
    const hasCornerCurl = r6 > 0.45;
    const curlCornerU = r3 > 0.5 ? 1 : -1;
    const curlCornerV = r5 > 0.45 ? -1 : 1;
    const curlSign = r1 > 0.5 ? 1 : -1;
    const curlAmp = hasCornerCurl ? curlSign * (3.5 + r2 * 4.5) * (1 - weightLoad * 0.45) : 0;

    const zBase = zHeights[stackIndex];

    const sampleSheetPoint = (u, v) => {
      const du = u - hx;
      const dv = v - hy;

      const wx = du * cosYaw - dv * sinYaw;
      const wy = du * sinYaw + dv * cosYaw;

      const rNorm = Math.hypot(du / (sheetW * 0.54), dv / (sheetD * 0.54));
      let dz = -sagStrength * Math.pow(rNorm, 2.0);
      dz += rollTilt * wx + pitchTilt * wy;

      if (curlAmp !== 0) {
        const cu = clamp((u / (sheetW / 2)) * curlCornerU, 0, 1);
        const cv = clamp((v / (sheetD / 2)) * curlCornerV, 0, 1);
        const cornerWeight = Math.pow(cu * cv, 2.4);
        const punctureClear = clamp(rNorm * 2.2, 0, 1);
        dz += curlAmp * cornerWeight * punctureClear;
      }

      const wz = zBase + dz;
      return projectPoint3D(wx, wy, wz, camera);
    };

    const holePt = projectPoint3D(0, 0, zBase, camera);

    const halfW = sheetW / 2;
    const halfD = sheetD / 2;
    const corners = [
      { u: -halfW, v: -halfD }, // C0: front-left
      { u: halfW, v: -halfD },  // C1: front-right
      { u: halfW, v: halfD },   // C2: back-right
      { u: -halfW, v: halfD },  // C3: back-left
    ];

    const SEG = 6;
    const perimeter = [];
    const edgeRuns = [];
    for (let e = 0; e < 4; e++) {
      const a = corners[e];
      const b = corners[(e + 1) % 4];
      const run = [];
      for (let s = 0; s <= SEG; s++) {
        const t = s / SEG;
        const pt = sampleSheetPoint(a.u + (b.u - a.u) * t, a.v + (b.v - a.v) * t);
        run.push(pt);
        if (s < SEG) perimeter.push(pt);
      }
      edgeRuns.push(run);
    }

    const mainPath = pointsToPolylinePath(perimeter, true);

    // Extrude front-facing edges by razor-thin real paper thickness (0.85px)
    const thicknessPx = 0.85;
    const edgeRimPaths = [];
    for (let e = 0; e < 4; e++) {
      const run = edgeRuns[e];
      const startPt = run[0];
      const endPt = run[run.length - 1];
      if (endPt.sx - startPt.sx > 6) {
        const bottomRun = [...run]
          .reverse()
          .map((p) => ({ sx: p.sx, sy: p.sy + thicknessPx }));
        edgeRimPaths.push(pointsToPolylinePath([...run, ...bottomRun], true));
      }
    }

    // Subtle crisp paper crease across the sheet
    const creaseU1 = -halfW * (0.68 + r1 * 0.22);
    const creaseV1 = halfD * (r3 > 0.5 ? 0.5 : -0.45);
    const creaseU2 = halfW * (0.68 + r2 * 0.22);
    const creaseV2 = -creaseV1 * 0.72;
    const creasePts = [];
    for (let s = 0; s <= 5; s++) {
      const t = s / 5;
      creasePts.push(
        sampleSheetPoint(
          creaseU1 + (creaseU2 - creaseU1) * t,
          creaseV1 + (creaseV2 - creaseV1) * t
        )
      );
    }
    const creasePath = pointsToPolylinePath(creasePts, false);

    // Perspective-projected faint ruled memo lines converging to the sheet's true vanishing points
    const ruledLines = [];
    const lineFractions = [-0.56, -0.26, 0.16, 0.48];
    for (let li = 0; li < lineFractions.length; li++) {
      const lv = lineFractions[li] * halfD;
      const startU = -halfW * 0.74;
      const endU = halfW * (li === 0 ? 0.44 : li === lineFractions.length - 1 ? 0.56 : 0.74);
      const linePts = [];
      for (let s = 0; s <= 4; s++) {
        const t = s / 4;
        linePts.push(sampleSheetPoint(startU + (endU - startU) * t, lv));
      }
      ruledLines.push(pointsToPolylinePath(linePts, false));
    }

    // Tight stage-aligned bounding box with shadow padding
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of perimeter) {
      if (p.sx < minX) minX = p.sx;
      if (p.sx > maxX) maxX = p.sx;
      if (p.sy < minY) minY = p.sy;
      if (p.sy > maxY) maxY = p.sy;
    }

    const padX = 14;
    const padTop = 14;
    const padBottom = 18;
    const bbox = {
      minX: Math.floor(minX - padX),
      minY: Math.floor(minY - padTop),
      width: Math.ceil(maxX - minX + padX * 2),
      height: Math.ceil(maxY - minY + padTop + padBottom),
    };

    const rodSegmentTopY = Math.min(minY - 3, holePt.sy - 16);

    // Soft directional shadow cast by the vertical steel spike across the opaque paper
    const rodShadowEnd = sampleSheetPoint(hx + 15, hy + 16);
    const rodShadowPath = `M ${fmt(holePt.sx - 1.1)},${fmt(holePt.sy)} L ${fmt(rodShadowEnd.sx)},${fmt(rodShadowEnd.sy)} L ${fmt(rodShadowEnd.sx + 4.2)},${fmt(rodShadowEnd.sy + 1.4)} L ${fmt(holePt.sx + 2.3)},${fmt(holePt.sy + 0.7)} Z`;

    const availableDrop = Math.max(42, holePt.sy - (tipY + 18));
    const dropDistance = Math.round(Math.min(116, availableDrop));

    // Lighting gradient from front-top toward far-back so closer face catches studio light
    const frontMid = sampleSheetPoint(0, -halfD);
    const backMid = sampleSheetPoint(0, halfD);

    // Measure true perspective foreshortening: front edge vs back edge in camera space
    const c0 = perimeter[0];
    const c1 = perimeter[SEG];
    const c2 = perimeter[SEG * 2];
    const c3 = perimeter[SEG * 3];
    const frontEdgeLen = Math.hypot(c1.sx - c0.sx, c1.sy - c0.sy);
    const backEdgeLen = Math.hypot(c2.sx - c3.sx, c2.sy - c3.sy);

    return {
      task,
      stackIndex,
      isTop: stackIndex === count - 1,
      zIndex: 10 + stackIndex * 2,
      zBase,
      weightLoad,
      sheetW,
      sheetD,
      hx,
      hy,
      yawDeg,
      frontEdgeLen: fmt(frontEdgeLen),
      backEdgeLen: fmt(backEdgeLen),
      projectedCorners: [c0, c1, c2, c3].map((p) => ({
        sx: fmt(p.sx),
        sy: fmt(p.sy),
        persp: fmt(p.persp),
      })),
      holeScreenX: fmt(holePt.sx),
      holeScreenY: fmt(holePt.sy),
      bbox,
      mainPath,
      edgeRimPaths,
      edgeThicknessPx: thicknessPx,
      creasePath,
      ruledLines,
      rodShadowPath,
      rodSegment: {
        x: centerX,
        yTop: fmt(rodSegmentTopY),
        yBottom: fmt(holePt.sy),
      },
      gradVector: {
        x1: fmt(frontMid.sx),
        y1: fmt(frontMid.sy),
        x2: fmt(backMid.sx),
        y2: fmt(backMid.sy),
      },
      dropDistance,
      colors: buildPaperPalette(task.hex || '#F28B82'),
    };
  });

  return {
    stageWidth,
    stageHeight,
    centerX,
    collarY: fmt(collarY),
    tipY: fmt(tipY),
    base,
    sheets,
  };
}
