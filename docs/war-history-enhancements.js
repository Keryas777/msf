/* docs/war-history-enhancements.js */

(() => {
  "use strict";

  const allianceSelectEl = document.getElementById("allianceSelect");
  const yearSelectEl = document.getElementById("yearSelect");
  const monthSelectEl = document.getElementById("monthSelect");
  const daySelectEl = document.getElementById("daySelect");
  const debriefEl = document.getElementById("warHistoryDebrief");

  if (!allianceSelectEl || !yearSelectEl || !monthSelectEl || !daySelectEl || !debriefEl) {
    return;
  }

  function escape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function number(value, maximumFractionDigits = 0) {
    if (value === null || value === undefined || value === "") return "—";

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return escape(value);

    return parsed.toLocaleString("fr-FR", {
      maximumFractionDigits
    });
  }

  function decimal(value, decimals = 2) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "—";

    return parsed.toLocaleString("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function ensureSelectedOption(select, value, label) {
    if (!value) return;

    const exists = Array.from(select.options).some((option) => option.value === value);
    if (!exists) {
      select.add(new Option(label || value, value));
    }

    select.value = value;
  }

  function preserveDateWhenAllianceChanges() {
    const previousYear = yearSelectEl.value;
    const previousMonth = monthSelectEl.value;
    const previousDay = daySelectEl.value;

    if (!allianceSelectEl.value) {
      ensureSelectedOption(yearSelectEl, previousYear, previousYear);
      ensureSelectedOption(
        monthSelectEl,
        previousMonth,
        previousMonth ? `${previousMonth} (${MONTH_NAMES[previousMonth] || ""})` : ""
      );
      ensureSelectedOption(daySelectEl, previousDay, previousDay);
      updateSelectStates();
      loadSelectedWar();
      return;
    }

    populateYears();
    ensureSelectedOption(yearSelectEl, previousYear, previousYear);

    if (previousYear) {
      populateMonths();
      ensureSelectedOption(
        monthSelectEl,
        previousMonth,
        previousMonth ? `${previousMonth} (${MONTH_NAMES[previousMonth] || ""})` : ""
      );
    } else {
      clearMonthSelect();
    }

    if (previousYear && previousMonth) {
      populateDays();
      ensureSelectedOption(daySelectEl, previousDay, previousDay);
    } else {
      clearDaySelect();
    }

    updateSelectStates();
    loadSelectedWar();
  }

  function getSummaryHtml(report, players) {
    const summary = report?.summary || null;
    if (!summary) return "";

    const avgValues = players
      .map((player) => Number(player?.avg_damage))
      .filter(Number.isFinite);
    const shareValues = players
      .map((player) => Number(player?.damage_share_pct))
      .filter(Number.isFinite);

    const bestAvgDamage = summary.best_avg_damage ?? (avgValues.length ? Math.max(...avgValues) : null);
    const bestDamageSharePct = summary.best_damage_share_pct
      ?? (summary.best_damage_share !== undefined ? Number(summary.best_damage_share) * 100 : null)
      ?? (shareValues.length ? Math.max(...shareValues) : null);

    return `
      <div class="warHistorySummary warHistorySummary--debrief">
        <div class="warHistorySummaryLine"><strong>Joueurs :</strong> ${number(summary.player_count ?? players.length)}</div>
        <div class="warHistorySummaryLine"><strong>Dégâts totaux :</strong> ${number(summary.total_damage)}</div>
        <div class="warHistorySummaryLine"><strong>Meilleurs dégâts moyens :</strong> ${number(bestAvgDamage)}</div>
        <div class="warHistorySummaryLine"><strong>Meilleure part dégâts :</strong> ${bestDamageSharePct === null ? "—" : `${decimal(bestDamageSharePct, 2)}%`}</div>
      </div>
    `;
  }

  function scoreItem(label, value, maximum) {
    const parsed = Number(value);
    const score = Number.isFinite(parsed) ? decimal(parsed, Number.isInteger(parsed) ? 0 : 1) : "—";

    return `
      <div class="warHistoryScoreItem">
        <span>${escape(label)}</span>
        <strong>${score}/${maximum}</strong>
      </div>
    `;
  }

  function statItem(label, value) {
    return `
      <div class="warHistoryDetailStat">
        <span>${escape(label)}</span>
        <strong>${value}</strong>
      </div>
    `;
  }

  function renderDebriefAccordion(report) {
    const players = Array.isArray(report?.players)
      ? report.players.filter((player) => player && (
          player.analysis ||
          player.score_total !== undefined ||
          player.rank !== undefined
        ))
      : [];

    if (!players.length) {
      debriefEl.innerHTML = `
        <div class="warHistoryDebriefPlaceholder">
          <p class="warHistoryDebriefTitle">Aucun débrief disponible</p>
          <p class="warHistoryDebriefText">
            Cette guerre ne contient pas encore d’analyse enrichie.
          </p>
        </div>
      `;
      return;
    }

    const playerHtml = players.map((player, index) => {
      const rank = player?.rank ?? index + 1;
      const score = player?.score_total ?? 0;
      const damageShare = Number(player?.damage_share_pct);
      const deviations = player?.deviations ?? player?.defense_bonus;

      return `
        <details class="warHistoryReportPlayer">
          <summary>
            <span class="warHistoryReportRank">#${number(rank)}</span>
            <span class="warHistoryReportName">${escape(player?.name || "—")}</span>
            <span class="warHistoryReportScore">${number(score)}/100</span>
          </summary>

          <div class="warHistoryReportDetails">
            <div class="warHistoryScoreGrid" aria-label="Détail de la note">
              ${scoreItem("Activité", player?.score_activity, 25)}
              ${scoreItem("Efficacité", player?.score_efficiency, 25)}
              ${scoreItem("Impact", player?.score_impact, 35)}
              ${scoreItem("Défense", player?.score_defense, 15)}
            </div>

            <div class="warHistoryDetailGrid">
              ${statItem("Attaques", number(player?.attacks))}
              ${statItem("Réussies", number(player?.successful_attacks))}
              ${statItem("Échecs", number(player?.misses))}
              ${statItem("Pts attaque", number(player?.attack_points))}
              ${statItem("Dégâts", number(player?.damage))}
              ${statItem("Dégâts moyens", number(player?.avg_damage))}
              ${statItem("Part dégâts", Number.isFinite(damageShare) ? `${decimal(damageShare, 2)}%` : "—")}
              ${statItem("V. Déf", number(player?.defense_wins))}
              ${statItem("B. Déf", number(deviations))}
            </div>

            <div class="warHistoryReportAnalysis">
              ${escape(player?.analysis || "Aucune analyse disponible.")}
            </div>
          </div>
        </details>
      `;
    }).join("");

    debriefEl.innerHTML = `
      ${getSummaryHtml(report, players)}
      <div class="warHistoryReportList">
        ${playerHtml}
      </div>
    `;
  }

  if (typeof window.hydrateSelectionFromAlliance === "function") {
    window.hydrateSelectionFromAlliance = preserveDateWhenAllianceChanges;
  }

  window.renderDebrief = renderDebriefAccordion;
})();
