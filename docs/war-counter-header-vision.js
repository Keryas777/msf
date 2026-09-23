export const HEADER_REGIONS = Object.freeze({
  power: Object.freeze({
    left: Object.freeze({ x: 0.06, y: 0.27, width: 0.28, height: 0.20 }),
    right: Object.freeze({ x: 0.66, y: 0.27, width: 0.30, height: 0.20 })
  }),
  attackMarker: Object.freeze({
    left: Object.freeze({ x: 0.14, y: 0.01, width: 0.15, height: 0.20 }),
    right: Object.freeze({ x: 0.70, y: 0.01, width: 0.15, height: 0.20 })
  })
});

export const ATTACK_GREEN_MIN_RATIO = 0.006;
export const ATTACK_GREEN_DOMINANCE = 1.8;

// R6.6 a été calibré sur le corpus terrain avec la grande séparation
// cyan/rouge située autour de 52,5 % de la hauteur. Un recadrage manuel
// haut/bas peut déplacer tout le panneau sans modifier sa résolution.
export const PANEL_DIVIDER_TARGET_Y = 0.525;
export const PANEL_DIVIDER_SEARCH_MIN_Y = 0.47;
export const PANEL_DIVIDER_SEARCH_MAX_Y = 0.62;
export const PANEL_DIVIDER_MIN_COVERAGE = 0.60;
export const PANEL_VERTICAL_DEAD_ZONE = 0.012;
export const PANEL_VERTICAL_MAX_SHIFT = 0.08;

export function inferVerticalPanelAlignment(
  rowCounts,
  {
    imageHeight,
    yOffset = 0,
    scanWidth
  } = {}
) {
  const height = Number(imageHeight) || 0;
  const width = Number(scanWidth) || 0;

  const fallback = (verticalReason, dividerYRatio = null, dividerCoverage = 0) => ({
    verticalUsed: false,
    yShift: 0,
    dividerYRatio,
    dividerCoverage,
    verticalReason
  });

  if (!rowCounts?.length || height <= 0 || width <= 0) {
    return fallback("ancre verticale indisponible");
  }

  let bestIndex = -1;
  let bestCoverage = 0;

  for (let index = 0; index < rowCounts.length; index += 1) {
    const absoluteY = yOffset + index;
    const ratio = absoluteY / height;
    if (ratio < PANEL_DIVIDER_SEARCH_MIN_Y || ratio > PANEL_DIVIDER_SEARCH_MAX_Y) continue;

    const coverage = (Number(rowCounts[index]) || 0) / width;
    if (coverage > bestCoverage) {
      bestCoverage = coverage;
      bestIndex = index;
    }
  }

  if (bestIndex < 0 || bestCoverage < PANEL_DIVIDER_MIN_COVERAGE) {
    return fallback("séparation horizontale insuffisante", null, bestCoverage);
  }

  const dividerYRatio = (yOffset + bestIndex) / height;
  const rawShift = dividerYRatio - PANEL_DIVIDER_TARGET_Y;

  if (Math.abs(rawShift) > PANEL_VERTICAL_MAX_SHIFT) {
    return fallback("décalage vertical non plausible", dividerYRatio, bestCoverage);
  }

  if (Math.abs(rawShift) <= PANEL_VERTICAL_DEAD_ZONE) {
    return fallback("capture déjà alignée verticalement", dividerYRatio, bestCoverage);
  }

  return {
    verticalUsed: true,
    yShift: rawShift,
    dividerYRatio,
    dividerCoverage: bestCoverage,
    verticalReason: "recalage vertical automatique"
  };
}

export function mapPanelRegion(region, bounds, imageWidth) {
  if (!region) throw new Error("Région d’en-tête manquante.");

  const mapped = { ...region };

  if (bounds?.used) {
    const leftRatio = bounds.left / imageWidth;
    const widthRatio = (bounds.right - bounds.left) / imageWidth;
    mapped.x = leftRatio + region.x * widthRatio;
    mapped.width = region.width * widthRatio;
  }

  if (bounds?.verticalUsed && Number.isFinite(bounds.yShift)) {
    mapped.y = region.y + bounds.yShift;
  }

  return mapped;
}

export function greenMarkerRatio(imageData) {
  const data = imageData?.data;
  if (!data?.length) return 0;

  let greenPixels = 0;
  let pixels = 0;

  for (let offset = 0; offset + 2 < data.length; offset += 4) {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];

    if (
      green > 105 &&
      green > red * 1.18 &&
      green > blue * 1.08 &&
      green - red > 20
    ) {
      greenPixels += 1;
    }

    pixels += 1;
  }

  return pixels ? greenPixels / pixels : 0;
}

export function inferAttackSide(
  leftRatio,
  rightRatio,
  {
    minRatio = ATTACK_GREEN_MIN_RATIO,
    dominance = ATTACK_GREEN_DOMINANCE
  } = {}
) {
  const left = Number(leftRatio) || 0;
  const right = Number(rightRatio) || 0;

  if (left >= minRatio && left >= right * dominance) return "left";
  if (right >= minRatio && right >= left * dominance) return "right";
  return null;
}
