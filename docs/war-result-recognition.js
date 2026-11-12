(() => {
  const fileInput = document.querySelector("#capture");
  const preview = document.querySelector("#preview");
  const runButton = document.querySelector("#recognize");
  const resetButton = document.querySelector("#reset");
  const status = document.querySelector("#status");
  const progress = document.querySelector("#progress");
  const form = document.querySelector("#draft");
  const raw = document.querySelector("#raw");
  const fieldWarnings = document.querySelector("#fieldWarnings");
  const opponentMatchKey = document.querySelector("#opponentMatchKey");
  const confirmBox = document.querySelector("#confirmed");
  const exportButton = document.querySelector("#export");
  let file = null;
  let worker = null;
  let previewUrl = null;

  fileInput.addEventListener("change", () => {
    file = fileInput.files?.[0] || null;
    runButton.disabled = !file;
    form.hidden = true;
    raw.textContent = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!file) { preview.hidden = true; return; }
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    preview.hidden = false;
    status.textContent = "Capture prête. Le traitement restera local à cet appareil.";
  });

  runButton.addEventListener("click", recognize);
  resetButton.addEventListener("click", reset);
  confirmBox.addEventListener("change", () => { exportButton.disabled = !confirmBox.checked; });
  form.addEventListener("input", (event) => {
    if (event.target !== confirmBox) { confirmBox.checked = false; exportButton.disabled = true; }
    if (event.target?.name === "opponentAlliance") updateMatchKey();
  });
  exportButton.addEventListener("click", exportDraft);

  async function loadEngine() {
    if (window.Tesseract) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@v5.0.0/dist/tesseract.min.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Chargement du moteur impossible. Vérifie la connexion, puis réessaie."));
      document.head.appendChild(script);
    });
  }

  async function recognize() {
    if (!file) return;
    runButton.disabled = true;
    progress.hidden = false;
    progress.value = 0;
    status.textContent = "Chargement différé du moteur OCR…";
    try {
      await loadEngine();
      worker = await Tesseract.createWorker("eng", 1, {
        logger: (message) => {
          if (message.status) status.textContent = `OCR local : ${message.status}`;
          if (typeof message.progress === "number") progress.value = Math.round(message.progress * 100);
        },
        workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@v5.0.0/dist/worker.min.js",
        corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.0.0",
        langPath: "https://tessdata.projectnaptha.com/4.0.0",
        cacheMethod: "write",
        gzip: true
      });
      const canvas = await prepareCanvas(file);
      await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
      const fullPage = await worker.recognize(canvas);
      await worker.setParameters({ tessedit_pageseg_mode: "11", preserve_interword_spaces: "1" });
      const sparseText = await worker.recognize(canvas);
      const fullData = fullPage.data || {};
      const sparseData = sparseText.data || {};
      const colorResult = detectResultFromColor(canvas);
      const primary = WarResultRecognition.extract(sparseData.words || [], canvas.width, canvas.height, { colorResult });
      const secondary = WarResultRecognition.extract(fullData.words || [], canvas.width, canvas.height, { colorResult });
      const extraction = mergePasses(primary, secondary, colorResult);
      const pointWord = (fullData.words || []).find((word) => normalize(word.text) === "points");
      if (pointWord && (!extraction.fields.localScore.value || !extraction.fields.opponentScore.value)) {
        await worker.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789" });
        if (!extraction.fields.localScore.value) {
          const value = await recognizeScoreCrop(canvas, pointWord, "left");
          if (value) extraction.fields.localScore = { value, confidence: 45, source: "score-crop-psm7", uncertain: true };
        }
        if (!extraction.fields.opponentScore.value) {
          const value = await recognizeScoreCrop(canvas, pointWord, "right");
          if (value) extraction.fields.opponentScore = { value, confidence: 45, source: "score-crop-psm7", uncertain: true };
        }
      }
      renderDraft({ text: `${fullData.text || ""}\n${sparseData.text || ""}` }, canvas.width, canvas.height, extraction);
      status.textContent = "Reconnaissance terminée. Vérifie manuellement les sept champs avant tout export.";
      progress.value = 100;
    } catch (error) {
      status.textContent = error.message || "La reconnaissance a échoué.";
    } finally {
      if (worker) { await worker.terminate(); worker = null; }
      runButton.disabled = !file;
    }
  }

  async function prepareCanvas(imageFile) {
    const source = typeof createImageBitmap === "function"
      ? await createImageBitmap(imageFile)
      : await loadImageElement(imageFile);
    const scale = Math.min(1, 1800 / source.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(source.width * scale);
    canvas.height = Math.round(source.height * scale);
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: false });
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    source.close?.();
    return canvas;
  }

  function loadImageElement(imageFile) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(imageFile);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Le format de cette image ne peut pas être ouvert dans ce navigateur.")); };
      image.src = url;
    });
  }

  function renderDraft(data, width, height, extraction) {
    const text = data.text || "";
    raw.textContent = text;
    const fields = form.elements;
    fields.localAlliance.value = extraction.fields.localAlliance.value || "";
    fields.opponentAlliance.value = extraction.fields.opponentAlliance.value || "";
    fields.localScore.value = extraction.fields.localScore.value || "";
    fields.opponentScore.value = extraction.fields.opponentScore.value || "";
    fields.localTrophies.value = extraction.fields.localTrophies.value || "";
    fields.localTrophyChange.value = "";
    fields.opponentTrophies.value = extraction.fields.opponentTrophies.value || "";
    fields.opponentTrophyChange.value = "";
    fields.result.value = extraction.fields.result.value || "";
    form.hidden = false;
    confirmBox.checked = false;
    exportButton.disabled = true;
    form.dataset.opponentNameOriginal = fields.opponentAlliance.value;
    form.dataset.opponentNameMatchKey = WarResultRecognition.toSearchKey(fields.opponentAlliance.value);
    updateMatchKey();
    form.dataset.needsManualReview = "true";
    form.dataset.warnings = JSON.stringify(extraction.warnings);
    fieldWarnings.textContent = extraction.warnings.length
      ? `À vérifier : ${extraction.warnings.map((warning) => warning.replaceAll("_", " ")).join(" · ")}`
      : "Aucune incohérence automatique détectée; la vérification manuelle reste obligatoire.";
  }

  function updateMatchKey() {
    const original = form.elements.opponentAlliance.value;
    opponentMatchKey.textContent = `Clé de rapprochement : ${WarResultRecognition.toSearchKey(original) || "—"}`;
    form.dataset.opponentNameOriginal = original;
    form.dataset.opponentNameMatchKey = WarResultRecognition.toSearchKey(original);
  }

  function mergePasses(primary, secondary, colorResult) {
    const fields = { ...primary.fields };
    const numericFields = ["localScore", "opponentScore", "localTrophies", "opponentTrophies"];
    for (const key of numericFields) {
      const a = primary.fields[key], b = secondary.fields[key];
      if (!a.value && b.value) fields[key] = b;
      else if (a.value && b.value && a.value !== b.value) {
        const delta = Math.abs((a.confidence || 0) - (b.confidence || 0));
        fields[key] = delta >= 18 ? (a.confidence > b.confidence ? a : b) : { ...a, value: "", uncertain: true, alternatives: [a.value, b.value] };
      } else if (a.value && b.value && a.value === b.value) {
        fields[key] = { ...a, confidence: Math.max(a.confidence || 0, b.confidence || 0), uncertain: a.uncertain && b.uncertain };
      }
    }
    const knownLocal = ["Zeus", "Dionysos", "Poseidon", "Athena", "Kronos"];
    const isKnownLocal = (entry) => knownLocal.some((name) => WarResultRecognition.toSearchKey(name) === WarResultRecognition.toSearchKey(entry.value));
    if ((!fields.localAlliance.value || !isKnownLocal(fields.localAlliance)) && isKnownLocal(secondary.fields.localAlliance)) fields.localAlliance = secondary.fields.localAlliance;
    if (!fields.opponentAlliance.value && secondary.fields.opponentAlliance.value) fields.opponentAlliance = secondary.fields.opponentAlliance;
    fields.result = { value: colorResult || "", confidence: null, source: "title-color-cue", uncertain: !colorResult };
    const warnings = new Set([...primary.warnings, ...secondary.warnings]);
    for (const key of [...numericFields, "localAlliance", "opponentAlliance"]) {
      if (!fields[key].value || fields[key].uncertain || fields[key].alternatives) warnings.add(`${key}_uncertain`);
    }
    if (colorResult && fields.localScore.value && fields.opponentScore.value) {
      const expected = Number(fields.localScore.value) > Number(fields.opponentScore.value) ? "win" : "loss";
      if (expected !== colorResult) warnings.add("score_result_conflict");
    }
    return { ...primary, fields, warnings: [...warnings], needsManualReview: true };
  }

  async function recognizeScoreCrop(source, labelWord, side) {
    const canvas = makeScoreCrop(source, labelWord, side);
    if (!canvas) return "";
    const result = await worker.recognize(canvas);
    const digits = String(result.data.text || "").replace(/\D/g, "");
    return digits.length === 6 ? digits : "";
  }

  function makeScoreCrop(source, labelWord, side) {
    const height = source.height;
    const width = source.width;
    const labelY = ((labelWord.bbox?.y0 ?? 0) + (labelWord.bbox?.y1 ?? 0)) / 2;
    const xRange = side === "left" ? [0.18, 0.43] : [0.59, 0.80];
    const sx = Math.floor(width * xRange[0]);
    const sw = Math.floor(width * (xRange[1] - xRange[0]));
    const sy = Math.max(0, Math.floor(labelY - height * 0.035));
    const sh = Math.min(height - sy, Math.ceil(height * 0.07));
    if (sw <= 0 || sh <= 0) return null;
    const crop = document.createElement("canvas");
    crop.width = sw * 2;
    crop.height = sh * 2;
    const context = crop.getContext("2d", { alpha: false, willReadFrequently: true });
    context.drawImage(source, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
    const pixels = context.getImageData(0, 0, crop.width, crop.height);
    let min = 255, max = 0;
    for (let i = 0; i < pixels.data.length; i += 4) {
      const gray = Math.round(0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2]);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = gray;
      min = Math.min(min, gray);
      max = Math.max(max, gray);
    }
    const range = Math.max(1, max - min);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const contrast = Math.max(0, Math.min(255, Math.round((pixels.data[i] - min) * 255 / range)));
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = contrast;
    }
    context.putImageData(pixels, 0, 0);
    return crop;
  }

  function detectResultFromColor(canvas) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const x1 = Math.floor(canvas.width * 0.30);
    const x2 = Math.ceil(canvas.width * 0.70);
    const y2 = Math.ceil(canvas.height * 0.12);
    const pixels = context.getImageData(x1, 0, x2 - x1, y2).data;
    let blue = 0;
    let red = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      if (b > 150 && b > r * 1.18 && b > g * 1.08) blue++;
      if (r > 165 && r > g * 1.25 && r > b * 1.1) red++;
    }
    const high = Math.max(blue, red), low = Math.min(blue, red);
    if (!high || high < 3 * low) return "";
    return blue > red ? "win" : "loss";
  }

  function detectResult(text) {
    const value = normalize(text);
    if (value.includes("victoire")) return "win";
    if (value.includes("defaite")) return "loss";
    return "";
  }

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function exportDraft() {
    if (!confirmBox.checked || !file) return;
    const formData = Object.fromEntries(new FormData(form).entries());
    const validation = WarResultRecognition.validate(formData, 1, 1);
    if (!validation.valid) {
      status.textContent = `Export bloqué. Vérifie : ${validation.problems.join(" · ")}`;
      confirmBox.checked = false;
      exportButton.disabled = true;
      return;
    }
    const payload = {
      schemaVersion: "1.0.0",
      status: "manually-verified-draft",
      date: null,
      sourceFile: file.name,
      result: formData.result || null,
      localAlliance: formData.localAlliance.trim() || null,
      opponentAlliance: formData.opponentAlliance.trim() || null,
      opponentAllianceOriginal: formData.opponentAlliance.trim() || null,
      opponentAllianceMatchKey: WarResultRecognition.toSearchKey(formData.opponentAlliance),
      localScore: parseNullableNumber(formData.localScore),
      opponentScore: parseNullableNumber(formData.opponentScore),
      localTrophies: parseNullableNumber(formData.localTrophies),
      localTrophyChange: parseNullableSignedNumber(formData.localTrophyChange),
      opponentTrophies: parseNullableNumber(formData.opponentTrophies),
      opponentTrophyChange: parseNullableSignedNumber(formData.opponentTrophyChange),
      requiresManualReview: true
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "war-result-draft.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function parseNullableNumber(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits ? Number(digits) : null;
  }

  function parseNullableSignedNumber(value) {
    const match = String(value || "").trim().replace("−", "-").match(/^([+-]?)\s*(\d+)$/);
    if (!match) return null;
    return Number(`${match[1]}${match[2]}`);
  }

  function reset() {
    fileInput.value = "";
    file = null;
    preview.hidden = true;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    form.hidden = true;
    raw.textContent = "";
    fieldWarnings.textContent = "";
    opponentMatchKey.textContent = "Clé de rapprochement : —";
    progress.hidden = true;
    progress.value = 0;
    runButton.disabled = true;
    status.textContent = "Le moteur OCR sera chargé seulement au lancement.";
  }
})();
