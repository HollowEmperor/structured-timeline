// Pure 3D perspective geometry & weighted stacking physics for the Memo Spike.
// Guarantees every rectangular paper slip's puncture point aligns to exact centerX
// and stacks from the metallic base upward with gravity compression and drape.

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
 * Converts a saturated task capsule hex color into a realistic matte stationery
 * paper palette so every slip reads as weighted tinted paper rather than plastic or leaves.
 */
export function buildPaperPalette(taskHex) {
  const paperStock = '#F5F0E6';
  const warmShadow = '#191614';

  // Softly blend toward matte warm parchment so greens/corals read as crisp paper notes
  const face = blendHex(taskHex, paperStock, 0.34);
  const highlight = blendHex(face, '#FFFFFF', 0.24);
  const midShade = blendHex(face, warmShadow, 0.14);
  const deepShade = blendHex(face, warmShadow, 0.32);
  const cutEdge = blendHex(face, '#FFFDF9', 0.42);
  const underside = blendHex(face, warmShadow, 0.46);
  const ink = blendHex(taskHex, '#141210', 0.72);

  return {
    face,
    highlight,
    midShade,
    deepShade,
    cutEdge,
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
 * Projects a 3D world point (wx, wy, wz) into 2D SVG stage coordinates.
 * World origin (0, 0, 0) sits at the top of the chrome base collar:
 *  - +X: right, +Y: depth away from viewer, +Z: vertically up the steel spike.
 * Invariant: any point on the spike axis (wx = 0, wy = 0, wz = z) ALWAYS projects to sx === centerX.
 */
export function projectPoint3D(wx, wy, wz, camera) {
  const { centerX, collarY, camDist, sinE, cosE } = camera;
  const vy = wy * cosE + wz * sinE;
  const vz = wz * cosE - wy * sinE;
  const persp = camDist / (camDist + vy);
  return {
    sx: centerX + wx * persp,
    sy: collarY - vz * persp,
    vy,
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
 * Computes full 3D-projected geometry and weighted stacking layout for completed tasks.
 * Input `completedTasks` is newest-first (as returned by getFilteredTasks);
 * Output `sheets` is ordered bottom-to-top (stackIndex 0 = oldest resting near base,
 * stackIndex N-1 = newest resting on top of the pile).
 */
export function computeMemoSpikeLayout(completedTasks, options = {}) {
  const stageWidth = options.stageWidth || 340;
  const centerX = stageWidth / 2;
  const count = completedTasks.length;

  // Camera elevated ~22 degrees above horizontal, matching desk-level reference photos
  const elevRad = 22 * DEG;
  const sinE = Math.sin(elevRad);
  const cosE = Math.cos(elevRad);
  const camDist = 860;

  // Stack ordered bottom (oldest) -> top (newest)
  const ordered = [...completedTasks].reverse();

  // Compute compressed vertical stack heights (z in world units above collar):
  // Bottom slip settles closely above the chrome collar so the circular metallic base
  // stays clearly visible underneath, while upper slips drape with slightly more loft.
  const zHeights = [];
  let cursorZ = 27;
  for (let i = 0; i < count; i++) {
    zHeights.push(cursorZ);
    const slipsAbove = count - 1 - i;
    // Compression under load: more slips above => tighter vertical pitch (8.5..14.5)
    const compression = clamp(slipsAbove / 7, 0, 1);
    const pitch = 14.2 - compression * 5.6;
    cursorZ += pitch;
  }

  const topZ = count > 0 ? zHeights[count - 1] : 0;
  // Ensure generous gleaming chrome shaft above the topmost paper (like reference photos)
  const shaftAboveTop = count > 0 ? 124 : 210;
  const tipZ = Math.max(210, topZ + shaftAboveTop);

  // Compute dynamic stageHeight so base + pile + tall exposed needle + rubber cap fit cleanly
  const topMargin = 42;
  const baseMarginBottom = 56;
  const projectedSpikePx = tipZ * cosE;
  const stageHeight = Math.max(380, Math.round(topMargin + projectedSpikePx + baseMarginBottom));
  const collarY = stageHeight - baseMarginBottom;

  const camera = { centerX, collarY, camDist, sinE, cosE };
  const tipPt = projectPoint3D(0, 0, tipZ, camera);
  const tipY = tipPt.sy;

  const sheets = ordered.map((task, stackIndex) => {
    const slipsAbove = count - 1 - stackIndex;
    const weightLoad = clamp(slipsAbove / 6, 0, 1); // 1 = heavily weighed down near base, 0 = top sheet
    const seedBase = ((task.id || 1) * 2654435761 + (stackIndex + 1) * 1597334677) >>> 0;

    const r1 = seededUnit(seedBase);
    const r2 = seededUnit(seedBase ^ 0x9e3779b9);
    const r3 = seededUnit(seedBase ^ 0x85ebca6b);
    const r4 = seededUnit(seedBase ^ 0xc2b2ae35);
    const r5 = seededUnit(seedBase ^ 0x27d4eb2f);
    const r6 = seededUnit(seedBase ^ 0x165667b1);

    // Realistic rectangular memo slip dimensions (wider receipt/memo proportions)
    const sheetW = 176 + r1 * 42; // 176..218
    const sheetD = 102 + r2 * 30; // 102..132

    // Off-center puncture location in local sheet coordinates so sheets jut asymmetrically
    // while keeping the puncture hole LOCKED to world (0, 0, z) => exact centerX
    const hx = (r3 - 0.5) * 34; // -17..+17
    const hy = (r4 - 0.5) * 16; // -8..+8

    // Alternate yaw direction across adjacent layers so crisp rectangular corners fan out naturally
    const yawSign = stackIndex % 2 === 0 ? 1 : -1;
    const yawDeg = yawSign * (12 + r5 * 24); // ±12°..±36°
    const yawRad = yawDeg * DEG;
    const cosYaw = Math.cos(yawRad);
    const sinYaw = Math.sin(yawRad);

    // Subtle gravity tilt & downward edge droop; bottom sheets flatten more under weight
    const tiltSpread = 1 - weightLoad * 0.48;
    const pitchTilt = ((r6 - 0.5) * 0.08) * tiltSpread;
    const rollTilt = (((r2 - 0.5) * 0.1)) * tiltSpread;

    // Gravity sag: outer wings droop gently downward around the central spike support
    // Top sheet arches/drapes more noticeably like the top sheet in the reference photo;
    // lower sheets compact flatter under the pile weight.
    const sagStrength = (10.5 + r4 * 6.5) * (1 - weightLoad * 0.46);

    // Optional crisp corner bend (subtle lift or droop on a single corner)
    const hasCornerCurl = r6 > 0.38;
    const curlCornerU = r3 > 0.5 ? 1 : -1;
    const curlCornerV = r5 > 0.45 ? -1 : 1; // prefer front-facing corners for visual read
    const curlSign = r1 > 0.48 ? 1 : -1; // slight upward flick or downward dog-ear droop
    const curlAmp = hasCornerCurl ? curlSign * (5.5 + r2 * 6.5) * (1 - weightLoad * 0.45) : 0;

    const zBase = zHeights[stackIndex];

    // Map local sheet point (u, v) to 3D world point (wx, wy, wz) -> 2D screen point
    const sampleSheetPoint = (u, v) => {
      const du = u - hx;
      const dv = v - hy;

      const wx = du * cosYaw - dv * sinYaw;
      const wy = du * sinYaw + dv * cosYaw;

      const rNorm = Math.hypot(du / (sheetW * 0.52), dv / (sheetD * 0.52));
      // Zero droop at puncture (rNorm = 0) so puncture stays pinned strictly at zBase
      let dz = -sagStrength * Math.pow(rNorm, 1.85);
      dz += rollTilt * wx + pitchTilt * wy;

      // Subtle localized corner curl that stays zero at puncture point
      if (curlAmp !== 0) {
        const cu = clamp((u / (sheetW / 2)) * curlCornerU, 0, 1);
        const cv = clamp((v / (sheetD / 2)) * curlCornerV, 0, 1);
        const cornerWeight = Math.pow(cu * cv, 2.2);
        // Multiply by smoothstep away from puncture so puncture never shifts
        const punctureClear = clamp(rNorm * 2.2, 0, 1);
        dz += curlAmp * cornerWeight * punctureClear;
      }

      const wz = zBase + dz;
      return projectPoint3D(wx, wy, wz, camera);
    };

    const holePt = projectPoint3D(0, 0, zBase, camera);

    // Sample the 4 crisp rectangular edges (6 segments per edge -> gentle droop, razor-sharp corners)
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

    // Identify front-facing edges (moving left-to-right on lower/front silhouette, sx[end] > sx[start])
    // Extrude them slightly downward by paper thickness (2.1px) to show crisp cut paper edges
    const thicknessPx = 2.1;
    const edgeRimPaths = [];
    for (let e = 0; e < 4; e++) {
      const run = edgeRuns[e];
      const startPt = run[0];
      const endPt = run[run.length - 1];
      if (endPt.sx - startPt.sx > 8) {
        const bottomRun = [...run]
          .reverse()
          .map((p) => ({ sx: p.sx, sy: p.sy + thicknessPx }));
        edgeRimPaths.push(pointsToPolylinePath([...run, ...bottomRun], true));
      }
    }

    // Subtle crisp diagonal paper crease passing near the puncture point
    const creaseU1 = -halfW * (0.65 + r1 * 0.25);
    const creaseV1 = halfD * (r3 > 0.5 ? 0.55 : -0.45);
    const creaseU2 = halfW * (0.65 + r2 * 0.25);
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

    // Perspective-projected faint ruled memo/receipt lines in the sheet's own 3D plane
    const ruledLines = [];
    const lineFractions = [-0.54, -0.24, 0.14, 0.44];
    for (let li = 0; li < lineFractions.length; li++) {
      const lv = lineFractions[li] * halfD;
      const startU = -halfW * 0.74;
      const endU = halfW * (li === 0 ? 0.42 : li === lineFractions.length - 1 ? 0.55 : 0.72);
      const linePts = [];
      for (let s = 0; s <= 4; s++) {
        const t = s / 4;
        linePts.push(sampleSheetPoint(startU + (endU - startU) * t, lv));
      }
      ruledLines.push(pointsToPolylinePath(linePts, false));
    }

    // Subtle secondary crease facet (darker shaded wing triangle when corner droops/bends)
    const wingCornerIdx = curlCornerV < 0 ? (curlCornerU > 0 ? 1 : 0) : (curlCornerU > 0 ? 2 : 3);
    const prevEdge = edgeRuns[(wingCornerIdx + 3) % 4];
    const nextEdge = edgeRuns[wingCornerIdx];
    const cornerTip = nextEdge[0];
    const cornerMidA = prevEdge[Math.floor(SEG * 0.55)];
    const cornerMidB = nextEdge[Math.floor(SEG * 0.45)];
    const cornerFacetPath = pointsToPolylinePath([cornerMidA, cornerTip, cornerMidB], true);

    // Tight bounding box with shadow padding so every sheet's SVG maps 1:1 to stage coordinates
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

    // Keep exact stage-aligned padding so drop shadows & rod segment never clip
    const padX = 14;
    const padTop = 14;
    const padBottom = 18;
    const bbox = {
      minX: Math.floor(minX - padX),
      minY: Math.floor(minY - padTop),
      width: Math.ceil(maxX - minX + padX * 2),
      height: Math.ceil(maxY - minY + padTop + padBottom),
    };

    // Exact vertical chrome rod segment emerging straight UP out of the puncture slit
    // to cleanly cover the back half of this sheet and seamlessly meet the continuous static rod!
    const rodSegmentTopY = Math.min(minY - 3, holePt.sy - 16);

    // Subtle soft shadow cast by the vertical steel spike across the paper top-right
    const rodShadowEnd = sampleSheetPoint(hx + 16, hy + 18);
    const rodShadowPath = `M ${fmt(holePt.sx - 1.2)},${fmt(holePt.sy)} L ${fmt(rodShadowEnd.sx)},${fmt(rodShadowEnd.sy)} L ${fmt(rodShadowEnd.sx + 4.5)},${fmt(rodShadowEnd.sy + 1.5)} L ${fmt(holePt.sx + 2.4)},${fmt(holePt.sy + 0.8)} Z`;

    // Clamped vertical drop distance so a falling slip ALWAYS starts on the steel shaft below the cap
    const availableDrop = Math.max(42, holePt.sy - (tipY + 18));
    const dropDistance = Math.round(Math.min(118, availableDrop));

    // Projected corner points for subtle lighting gradient vector across the sheet
    const gradStart = perimeter[0];
    const gradEnd = perimeter[SEG * 2];

    return {
      task,
      stackIndex,
      isTop: stackIndex === count - 1,
      zIndex: 10 + stackIndex * 2,
      zBase,
      weightLoad,
      holeScreenX: fmt(holePt.sx),
      holeScreenY: fmt(holePt.sy),
      bbox,
      mainPath,
      edgeRimPaths,
      creasePath,
      ruledLines,
      cornerFacetPath,
      cornerFacetOpacity: curlSign > 0 ? 0.14 : 0.2,
      cornerFacetLight: curlSign > 0,
      rodShadowPath,
      rodSegment: {
        x: centerX,
        yTop: fmt(rodSegmentTopY),
        yBottom: fmt(holePt.sy),
      },
      gradVector: {
        x1: fmt(gradStart.sx),
        y1: fmt(gradStart.sy),
        x2: fmt(gradEnd.sx),
        y2: fmt(gradEnd.sy),
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
    sheets,
  };
}
