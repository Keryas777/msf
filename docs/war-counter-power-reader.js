export const POWER_READER_VERSION = "1.0.0";
export const POWER_DIGIT_WIDTH = 20;
export const POWER_DIGIT_HEIGHT = 24;
export const POWER_SCORE_THRESHOLD = 0.84;

const DIGIT_PROTOTYPES = Object.freeze({"0":{"bitmap":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSm//////7isygAAAAAAAAAAAAXkf3////////zpAAAAAAAAAAAADrs//////////+4AAAAAAAAAAAAiv//9K14s////7MAAAAAAAAAAADW///SLAN8///pPgAAAAAAAAAALPr//rAMDsD//8IbAAAAAAAAAACW///7gwAe3v//pRAAAAAAAAAAAKP///s1AF30//F+AwAAAAAAAAAhyv//mgQA3P//5FsAAAAAAAAAAE3z//98AADi//7GDAAAAAAAAAAIkf3//SsAR////pAAAAAAAAAAABzQ///aDQB2///+UgAAAAAAAAAAKO7//6UEErf//98gAAAAAAAAAAA27v/8cwE74v//xgAAAAAAAAAAAI78//qpdZfz//CBAAAAAAAAAAAA4f//////////0yoAAAAAAAAAAADk//////////qLBQAAAAAAAAAAAGPh/P/////roicAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","aspect":0.763333,"holes":1,"samples":7},"1":{"bitmap":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAF18v//3o8AAAAAAAAAAAAAAAAAF+L///7RmgAAAAAAAAAAAAAAAAAh5v///9t4AAAAAAAAAAAAAAAAAAqg9P//+k0AAAAAAAAAAAAAAAAAAAnd//rEIQAAAAAAAAAAAAAAAAAALfr/9ZUQAAAAAAAAAAAAAAAAAABm+v/7bQUAAAAAAAAAAAAAAAAAAMD8/9tOAAAAAAAAAAAAAAAAAAAh5f//3igAAAAAAAAAAAAAAAAAAFT1//u1DgAAAAAAAAAAAAAAAAADh/r/7GoDAAAAAAAAAAAAAAAAABGm///qLgAAAAAAAAAAAAAAAAAAJ+P/9sQEAAAAAAAAAAAAAAAAAAE+9P/tdQAAAAAAAAAAAAAAAAAAA3T///ZbAAAAAAAAAAAAAAAAAAAD6f//zS4AAAAAAAAAAAAAAAAAABLe9eaTFAAAAAAAAAAAAAAAAAAABo/XsSoCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","aspect":0.432704,"holes":0,"samples":14},"2":{"bitmap":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA545P//////72gAAAAAAAAAAAADifT////////62wAAAAAAAAAAADr0///r4/r///2rAAAAAAAAAAABXfz99658wv//9aUAAAAAAAAAAAJo49TIKgBt///jSgAAAAAAAAAAAT+nnXMADMH//7sXAAAAAAAAAAAAFDs4Kg2N+PjsaAIAAAAAAAAAAAAAAAAAlPjswnoKAAAAAAAAAAAAAAAADqfi99JtCAAAAAAAAAAAAAAAAAKh8/bZfQ0AAAAAAAAAAAAAAAAIpvr04HwJAAAAAAAAAAAAAAAABJDw/+NyEgAAAAAAAAAAAAAAAAWq/v//rgkAAAAAAAAAAAAAAAAOn/v//8oiAAAAAAAAAAAAAAAAAGL6////yGdUXDQOAAAAAAAAAAAA7/////////35gxUAAAAAAAAAAADk8Pn09//07dyUEQAAAAAAAAAAAH/X29TA4rnHqmUCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","aspect":0.786111,"holes":0,"samples":12},"3":{"bitmap":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAiqU8fHy8fPtrkYAAAAAAAAAAAAXxf3////////rnwAAAAAAAAAAADTq///24Pf//9SfAAAAAAAAAAAAlfzzuJug3f/603EAAAAAAAAAAACf8LhqGw+I//y5JgAAAAAAAAAAAFTIoEIAFbr//b0iAAAAAAAAAAAAAAAPDSVm9/7fYAYAAAAAAAAAAAAAAD/c9/r//8gzAAAAAAAAAAAAAAAHXOT////7kAAAAAAAAAAAAAAAAAds3/////mMAAAAAAAAAAAAAAAAAAdx1f//5mUAAAAAAAAAAAAAAAAAABCR//+6UQAAAAAAAAAABm+sgBsAEJj//8AgAAAAAAAAAABK9//cXgE58P//nwIAAAAAAAAAAJj///vPbqL//+5rAQAAAAAAAAAA0/z////////8qzIAAAAAAAAAAACv7fT/9O/9/b1NEgAAAAAAAAAAACitx+ThvuCzaAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","aspect":0.75125,"holes":0,"samples":8},"4":{"bitmap":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAp/i9P/qkgAAAAAAAAAAAAAAAABA9//////oAAAAAAAAAAAAAAAAJvz/////78MAAAAAAAAAAAAAABGh///////yjgAAAAAAAAAAAAABX+z///////VOAAAAAAAAAAAAAC3f////////7ycAAAAAAAAAAAAAw/////////+uDgAAAAAAAAAAAZP////Rkf///4kBAAAAAAAAAABC3///7UK8///2bQAAAAAAAAAAC7n///+vGeD///dKAAAAAAAAAABT//////zk/////7UOAAAAAAAAAJj////////////9kgwAAAAAAAAAm////////////+ZqAQAAAAAAAAA6gZGLueH////7kRgAAAAAAAAAAAAAAAAASf//6aMEAAAAAAAAAAAAAAAAAACB+//JTwAAAAAAAAAAAAAAAAAAAKDo7agjAAAAAAAAAAAAAAAAAAAAdtOhaAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","aspect":0.710929,"holes":1,"samples":11},"5":{"bitmap":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABGTI9P//8Ojo5GUAAAAAAAAAAAAj2vf////////lbgAAAAAAAAAAAC3y///p6L+/4pUtAAAAAAAAAAABkP//87x2Tk5OIQQAAAAAAAAAAAK5///ePwAAAAAAAAAAAAAAAAAAAt7//+MaAAAAAAAAAAAAAAAAAABF////3S0PBgAAAAAAAAAAAAAAAKj////87s7ctYEAAAAAAAAAAAAS7P/////////udhcAAAAAAAAAABTM0d6r2f/////ZJAAAAAAAAAAACB1dcmZvqf///rQIAAAAAAAAAAAAAAAAAABW///2jgAAAAAAAAAAB4vQjUQBAIP//fRPAAAAAAAAAABs//LjqAIO2//0twQAAAAAAAAAAIj////UVmjv//2TAgAAAAAAAAAA7P//////////81oAAAAAAAAAAADf////////9vKpKAAAAAAAAAAAAFnM/fnozMy/l0kFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","aspect":0.771988,"holes":0,"samples":9},"6":{"bitmap":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAhGk8fH///Hxz1YAAAAAAAAAAAANr/7////////7fAAAAAAAAAAAADDy9P/o2/b///lyAAAAAAAAAAAApvf07M6Xv///4GkAAAAAAAAAAADX///KMgGI/++fJwAAAAAAAAAAG/v/9bwmAFrw02YgAAAAAAAAAABw////sTweHCYNAgAAAAAAAAAAEK3////++uXe5pIUAAAAAAAAAAAt4f/////////5oRUAAAAAAAAAAELr////7f///+69FQAAAAAAAAAInfv//72du/b/9qIUAAAAAAAAABDB//66HQFe7f/8cA4AAAAAAAAAGd7/4qEQCY3w/99KAAAAAAAAAABW7v//lg4UzP/gqSUAAAAAAAAAAJP////ISWrZ//94FwAAAAAAAAAA0v/////////51zgAAAAAAAAAAADK8/T////665qDHQAAAAAAAAAAAFez1NPk79G7ZiIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","aspect":0.754419,"holes":1,"samples":8},"7":{"bitmap":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAles5///8///ngAAAAAAAAAAAAAPpeX////////uAAAAAAAAAAAAABKU//7+/////7kAAAAAAAAAAAAABiaYnLLy///ybgAAAAAAAAAAAAAAAAAAVPz//7wYAAAAAAAAAAAAAAAAAB3F///zTgAAAAAAAAAAAAAAAAADVvj//7EOAAAAAAAAAAAAAAAAAB3V///wHwAAAAAAAAAAAAAAAAALm///5mkFAAAAAAAAAAAAAAAABlLu//+yHAAAAAAAAAAAAAAAAAAUsP//+V8AAAAAAAAAAAAAAAAAAGTw//99AgAAAAAAAAAAAAAAAAA46///1h4AAAAAAAAAAAAAAAAAFJfy//hxAAAAAAAAAAAAAAAAAAM95P//yBIAAAAAAAAAAAAAAAAAD6r///QuAAAAAAAAAAAAAAAAAAA/5OzphgYAAAAAAAAAAAAAAAAAAD2u4aANAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","aspect":0.686159,"holes":0,"samples":10},"8":{"bitmap":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB+86+vy/PLwxkQAAAAAAAAAAAAVxvj////////2mwAAAAAAAAAAAFvV///91P////LCAAAAAAAAAAAAqP7/6LB+zP//0WIAAAAAAAAAAADm///FEALE/+m+QQAAAAAAAAAALf///6YICOb/2KkWAAAAAAAAAACG////iSdc8P/gawUAAAAAAAAAAJb////89vj//8kpAAAAAAAAAAAAqv//////////lQAAAAAAAAAAADf2///w1P////aDAAAAAAAAAAABhf///5yA2//+9XwAAAAAAAAAABPV//nKCwCx//jcRwAAAAAAAAAAKOT/6IEBGOn/+rkEAAAAAAAAAABj+///cAEg8f7rjgAAAAAAAAAAANH///+egtP//9hWAAAAAAAAAAAA2//////////9zhwAAAAAAAAAAACu//////b29cpbCAAAAAAAAAAAAEO84NOaopOTdR0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","aspect":0.758177,"holes":2,"samples":9},"9":{"bitmap":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSS6P/////wpiEAAAAAAAAAAAAPqu3////////okgAAAAAAAAAAAEnz//////////+SAAAAAAAAAAABlP//97Kj3v///2IAAAAAAAAAAAXy///VFArB///oJAAAAAAAAAAABv///4oMEun//9kWAAAAAAAAAABD///8ZAA6////oAsAAAAAAAAAAML///7Sse///+9dCAAAAAAAAAA4z///////////6jYAAAAAAAAAADqz//////////+tFwAAAAAAAAAAAJXu7u7u+////4gAAAAAAAAAAAAAKD4gFhbR///9LAAAAAAAAAAADqDn20kBANH//9knAAAAAAAAAABL////VwE66///ggAAAAAAAAAAAMX///+7o9H//+RIAAAAAAAAAAAA////////////zh8AAAAAAAAAAADx/////////9JCCwAAAAAAAAAAAGC7vd3y893GTggCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","aspect":0.766667,"holes":1,"samples":6}});

let decodedPrototypes = null;

function decodeBase64Bytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getDecodedPrototypes() {
  if (decodedPrototypes) return decodedPrototypes;
  decodedPrototypes = Object.fromEntries(
    Object.entries(DIGIT_PROTOTYPES).map(([digit, proto]) => [
      digit,
      {
        ...proto,
        bitmap: decodeBase64Bytes(proto.bitmap)
      }
    ])
  );
  return decodedPrototypes;
}

export function isPowerYellow(red, green, blue) {
  return (
    red > 130 &&
    green > 120 &&
    blue < 170 &&
    red + green - 2 * blue > 110
  );
}

function connectedComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  const stack = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;

    visited[start] = 1;
    stack.length = 0;
    stack.push(start);

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    const pixels = [];

    while (stack.length) {
      const index = stack.pop();
      pixels.push(index);

      const x = index % width;
      const y = Math.floor(index / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;

        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;

          const neighbor = ny * width + nx;
          if (!mask[neighbor] || visited[neighbor]) continue;

          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }

    components.push({
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      area: pixels.length,
      pixels
    });
  }

  return components;
}

export function findPowerDigitComponents(imageData) {
  const width = Number(imageData?.width) || 0;
  const height = Number(imageData?.height) || 0;
  const data = imageData?.data;

  if (!width || !height || !data || data.length < width * height * 4) {
    throw new Error("Image de puissance invalide.");
  }

  const mask = new Uint8Array(width * height);
  const minX = Math.floor(width * 0.35);
  const minY = Math.floor(height * 0.25);

  for (let y = minY; y < height; y += 1) {
    for (let x = minX; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const offset = pixelIndex * 4;
      if (isPowerYellow(data[offset], data[offset + 1], data[offset + 2])) {
        mask[pixelIndex] = 1;
      }
    }
  }

  const minArea = Math.max(12, Math.round(width * height * 0.0004));
  const minHeight = height * 0.18;
  const maxHeight = height * 0.50;

  return connectedComponents(mask, width, height)
    .filter((component) =>
      component.area >= minArea &&
      component.height >= minHeight &&
      component.height <= maxHeight &&
      component.y >= minY
    )
    .sort((a, b) => a.x - b.x);
}

function componentMask(component, imageWidth) {
  const width = component.width;
  const height = component.height;
  const mask = new Uint8Array(width * height);

  for (const sourceIndex of component.pixels) {
    const sourceX = sourceIndex % imageWidth;
    const sourceY = Math.floor(sourceIndex / imageWidth);
    const x = sourceX - component.x;
    const y = sourceY - component.y;
    if (x >= 0 && x < width && y >= 0 && y < height) {
      mask[y * width + x] = 255;
    }
  }

  return mask;
}

function countSignificantHoles(mask, width, height) {
  const background = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    background[index] = mask[index] ? 0 : 1;
  }

  const visited = new Uint8Array(background.length);
  const stack = [];
  const minHoleArea = width * height * 0.02;
  let holes = 0;

  for (let start = 0; start < background.length; start += 1) {
    if (!background[start] || visited[start]) continue;

    visited[start] = 1;
    stack.length = 0;
    stack.push(start);

    let area = 0;
    let touchesBorder = false;

    while (stack.length) {
      const index = stack.pop();
      area += 1;

      const x = index % width;
      const y = Math.floor(index / width);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        touchesBorder = true;
      }

      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;

        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;

          const neighbor = ny * width + nx;
          if (!background[neighbor] || visited[neighbor]) continue;

          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }

    if (!touchesBorder && area >= minHoleArea) holes += 1;
  }

  return holes;
}

function resizeBilinear(source, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const output = new Float64Array(targetWidth * targetHeight);

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = (y + 0.5) * sourceHeight / targetHeight - 0.5;
    const y0 = Math.floor(sourceY);
    const y1 = y0 + 1;
    const wy = sourceY - y0;
    const sy0 = Math.max(0, Math.min(sourceHeight - 1, y0));
    const sy1 = Math.max(0, Math.min(sourceHeight - 1, y1));

    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = (x + 0.5) * sourceWidth / targetWidth - 0.5;
      const x0 = Math.floor(sourceX);
      const x1 = x0 + 1;
      const wx = sourceX - x0;
      const sx0 = Math.max(0, Math.min(sourceWidth - 1, x0));
      const sx1 = Math.max(0, Math.min(sourceWidth - 1, x1));

      const top =
        source[sy0 * sourceWidth + sx0] * (1 - wx) +
        source[sy0 * sourceWidth + sx1] * wx;
      const bottom =
        source[sy1 * sourceWidth + sx0] * (1 - wx) +
        source[sy1 * sourceWidth + sx1] * wx;

      output[y * targetWidth + x] = top * (1 - wy) + bottom * wy;
    }
  }

  return output;
}

function normalizeGlyph(mask, width, height) {
  const target = new Float64Array(POWER_DIGIT_WIDTH * POWER_DIGIT_HEIGHT);
  const scale = Math.min(
    (POWER_DIGIT_WIDTH - 6) / width,
    (POWER_DIGIT_HEIGHT - 6) / height
  );
  const resizedWidth = Math.max(1, Math.round(width * scale));
  const resizedHeight = Math.max(1, Math.round(height * scale));
  const resized = resizeBilinear(mask, width, height, resizedWidth, resizedHeight);
  const offsetX = Math.floor((POWER_DIGIT_WIDTH - resizedWidth) / 2);
  const offsetY = Math.floor((POWER_DIGIT_HEIGHT - resizedHeight) / 2);

  for (let y = 0; y < resizedHeight; y += 1) {
    for (let x = 0; x < resizedWidth; x += 1) {
      target[(offsetY + y) * POWER_DIGIT_WIDTH + offsetX + x] =
        resized[y * resizedWidth + x];
    }
  }

  return target;
}

function correlation(left, right) {
  let leftMean = 0;
  let rightMean = 0;

  for (let index = 0; index < left.length; index += 1) {
    leftMean += left[index];
    rightMean += right[index];
  }

  leftMean /= left.length;
  rightMean /= right.length;

  let numerator = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;

  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] - leftMean;
    const b = right[index] - rightMean;
    numerator += a * b;
    leftEnergy += a * a;
    rightEnergy += b * b;
  }

  return numerator / (Math.sqrt(leftEnergy * rightEnergy) + 1e-9);
}

export function classifyPowerDigit(component, imageWidth) {
  const mask = componentMask(component, imageWidth);
  const normalized = normalizeGlyph(mask, component.width, component.height);
  const significantHoles = countSignificantHoles(mask, component.width, component.height);
  const aspect = component.width / component.height;
  const prototypes = getDecodedPrototypes();

  const scores = Object.entries(prototypes)
    .map(([digit, proto]) => {
      const score =
        correlation(normalized, proto.bitmap) -
        0.02 * Math.abs(aspect - proto.aspect) -
        0.05 * Math.abs(significantHoles - proto.holes);

      return { digit, score };
    })
    .sort((a, b) => b.score - a.score);

  return {
    digit: scores[0].digit,
    score: scores[0].score,
    margin: scores[0].score - scores[1].score,
    significantHoles,
    top: scores.slice(0, 3)
  };
}

export function readPowerFromImageData(imageData) {
  const components = findPowerDigitComponents(imageData);

  if (components.length < 6 || components.length > 9) {
    return {
      value: null,
      componentCount: components.length,
      reason: "digit-count",
      digits: []
    };
  }

  const digits = components.map((component) =>
    classifyPowerDigit(component, imageData.width)
  );
  const minScore = Math.min(...digits.map((digit) => digit.score));

  if (minScore < POWER_SCORE_THRESHOLD) {
    return {
      value: null,
      componentCount: components.length,
      minScore,
      reason: "low-confidence",
      digits
    };
  }

  return {
    value: digits.map((digit) => digit.digit).join(""),
    componentCount: components.length,
    minScore,
    reason: null,
    digits
  };
}
