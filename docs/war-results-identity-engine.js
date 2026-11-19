/* Local alliance-name OCR and color reconstruction. Numeric image processing is kept separate. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WarResultsIdentityEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const clean = (value) => String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().normalize("NFC");
  const normalizeName = (value) => clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  const now = () => typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

  function graphemes(value) {
    const output = [];
    for (const char of Array.from(String(value || ""))) {
      if (/\p{M}/u.test(char) && output.length) output[output.length - 1] += char;
      else output.push(char);
    }
    return output;
  }

  function normalizeRect(rect, width, height) {
    if (!rect || width < 1 || height < 1) return null;
    const x0 = Math.max(0, Math.min(width - 1, Math.floor(Number(rect.x) || 0)));
    const y0 = Math.max(0, Math.min(height - 1, Math.floor(Number(rect.y) || 0)));
    const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil((Number(rect.x) || 0) + (Number(rect.width) || 0))));
    const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil((Number(rect.y) || 0) + (Number(rect.height) || 0))));
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }

  function pixelColor(data, index) {
    const r = data[index], g = data[index + 1], b = data[index + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), chroma = max - min;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    if (brightness < 72 || max < 90) return null;
    let hue = 0;
    if (chroma) {
      if (max === r) hue = ((g - b) / chroma) % 6;
      else if (max === g) hue = (b - r) / chroma + 2;
      else hue = (r - g