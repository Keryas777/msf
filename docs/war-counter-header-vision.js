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

export function mapPanelRegion(region, bounds, imageWidth) {
  if (!region) throw new Error("Région d’en-tête manquante.");

  if (!bounds?.used) {
    return { ...region };
  }

  const leftRatio = bounds.left / imageWidth;
  const widthRatio = (bounds.right - bounds.left) / imageWidth;

  return {
    ...region,
    x: leftRatio + region.x * widthRatio,
    width: region.width * widthRatio
  };
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
