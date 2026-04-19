const container = document.getElementById("warHistoryList");

// Exemple temporaire (à remplacer par ton JSON)
const wars = [
  { date: "2026-04-18", result: "Victoire", opponent: "Alliance X" },
  { date: "2026-04-17", result: "Défaite", opponent: "Alliance Y" },
];

container.innerHTML = wars.map(w => `
  <div class="rankRow">
    <div class="rankLeft">
      <div class="rankName">${w.opponent}</div>
    </div>
    <div class="rankBars">
      ${w.result === "Victoire" ? "🟢" : "🔴"}
    </div>
    <div class="rankPower">${w.date}</div>
  </div>
`).join("");
