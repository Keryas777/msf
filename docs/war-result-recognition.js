(() => {
  const fileInput = document.querySelector("#capture");
  const preview = document.querySelector("#preview");
  const runButton = document.querySelector("#recognize");
  const resetButton = document.querySelector("#reset");
  const status = document.querySelector("#status");
  const progress = document.querySelector("#progress");
  const form = document.querySelector("#draft");
  const raw = document.querySelector("#raw");
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
      const data = {
        text: `${fullPage.data.text || ""}\n${sparseText.data.text || ""}`,
        words: sparseText.data.words || [],
        scoreWords: fullPage.data.words || [],
        scoreText: fullPage.data.text || ""
      };
      const suggestions = detectSuggestions(data, canvas);
      const pointWord = data.scoreWords.find((word) => normalize(word.text) === "points");
      if (pointWord && (!suggestions.localScore || !suggestions.opponentScore)) {
        await worker.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789" });
        if (!suggestions.localScore) {
          suggestions.localScore = await recognizeScoreCrop(canvas, pointWord, "left");
        }
        if (!suggestions.opponentScore) {
          suggestions.opponentScore = await recognizeScoreCrop(canvas, pointWord, "right");
        }
      }
      renderDraft(data, canvas.width, canvas.height, canvas, suggestions);
      status.textContent = "Reconnaissance terminée. Corrige les propositions en comparant avec la capture.";
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

  function renderDraft(data, width, height, canvas, suggestions) {
    const text = data.text || "";
    raw.textContent = text;
    const fields = form.elements;
    fields.localAlliance.value = detectLocalAlliance(text);
    fields.opponentAlliance.value = "";
    fields.localScore.value = suggestions.localScore || "";
    fields.opponentScore.value = suggestions.opponentScore || "";
    fields.localTrophies.value = suggestions.localTrophies || "";
    fields.localTrophyChange.value = "";
    fields.opponentTrophies.value = suggestions.opponentTrophies || "";
    fields.opponentTrophyChange.value = "";
    fields.result.value = detectResultFromColor(canvas) || detectResult(text);
    form.hidden = false;
    confirmBox.checked = false;
    exportButton.disabled = true;
    form.dataset.width = String(width);
    form.dataset.height = String(height);
  }

  function detectLocalAlliance(text) {
    const canonical = ["Zeus", "Athena", "Kronos", "Dionysos", "Poseidon"];
    const normalized = normalize(text);
    return canonical.find((name) => normalized.includes(normalize(name))) || "";
  }

  function detectSuggestions(data, canvas) {
    const words = Array.isArray(data.words) ? data.words : [];
    const pointWord = words.find((word) => normalize(word.text) === "points");
    const lineText = String(data.scoreText || data.text || "").split("\n").find((line) => normalize(line).includes("points")) || "";
    let leftScore = "";
    let rightScore = "";
    if (lineText && pointWord) {
      const before = lineText.slice(0, lineText.toLowerCase().indexOf("points"));
      const after = lineText.slice(lineText.toLowerCase().indexOf("points") + 6);
      leftScore = sixDigits(before);
      rightScore = sixDigits(after);
    }

    const width = canvas.width;
    const height = canvas.height;
    const trophies = { left: new Set(), right: new Set() };
    for (const word of words) {
      const y = (word.bbox?.y0 ?? height) / height;
      const x = ((word.bbox?.x0 ?? width) + (word.bbox?.x1 ?? width)) / 2 / width;
      if (y < 0.34 && Number(word.confidence || 0) >= 20) {
        const digits = String(word.text || "").replace(/\D/g, "");
        if (digits.length === 4) trophies[x < 0.5 ? "left" : "right"].add(digits);
      }
    }
    const localTrophies = trophies.left.size === 1 ? [...trophies.left][0] : "";
    const opponentTrophies = trophies.right.size === 1 ? [...trophies.right][0] : "";
    return {
      localScore: leftScore,
      opponentScore: rightScore,
      localTrophies,
      opponentTrophies
    };
  }

  function sixDigits(value) {
    const match = String(value || "").match(/\d(?:[\s,.]*\d){5}/);
    return match ? match[0].replace(/\D/g, "") : "";
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
    const payload = {
      schemaVersion: "1.0.0",
      status: "manually-verified-draft",
      date: null,
      sourceFile: file.name,
      result: formData.result || null,
      localAlliance: formData.localAlliance.trim() || null,
      opponentAlliance: formData.opponentAlliance.trim() || null,
      localScore: parseNullableNumber(formData.localScore),
      opponentScore: parseNullableNumber(formData.opponentScore),
      localTrophies: parseNullableNumber(formData.localTrophies),
      localTrophyChange: parseNullableSignedNumber(formData.localTrophyChange),
      opponentTrophies: parseNullableNumber(formData.opponentTrophies),
      opponentTrophyChange: parseNullableSignedNumber(formData.opponentTrophyChange)
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
    progress.hidden = true;
    progress.value = 0;
    runButton.disabled = true;
    status.textContent = "Le moteur OCR sera chargé seulement au lancement.";
  }
})();
