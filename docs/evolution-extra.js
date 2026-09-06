// /docs/evolution-extra.js
(() => {
  const list = document.querySelector('#evolutionList');
  if (!list) return;

  function addEquipmentHints() {
    list.querySelectorAll('.evolutionCard').forEach((card) => {
      if (card.dataset.equipmentHintDone === '1') return;

      const power = card.querySelector('.evolutionCardPower')?.textContent?.trim() || '';
      const changes = card.querySelector('.evolutionChanges');
      if (!power || changes) return;

      card.dataset.equipmentHintDone = '1';

      const wrap = document.createElement('div');
      wrap.className = 'evolutionChanges';

      const row = document.createElement('div');
      row.className = 'evolutionChange';

      const text = document.createElement('span');
      text.className = 'evolutionEquipmentHint';
      text.textContent = 'Ajout de pièces d’équipement';

      row.appendChild(text);
      wrap.appendChild(row);
      card.appendChild(wrap);
    });
  }

  function applyUrlSelection() {
    const params = new URLSearchParams(window.location.search);
    const wantedPlayer = params.get('playerKey') || '';
    if (!wantedPlayer) return;

    const allianceSelect = document.querySelector('#allianceSelect');
    const playerSelect = document.querySelector('#playerSelect');
    const periodSelect = document.querySelector('#periodSelect');
    const endSelect = document.querySelector('#endSelect');
    const startSelect = document.querySelector('#startSelect');
    const wantedAlliance = params.get('alliance') || '';
    const wantedPeriod = params.get('period') || '';
    const wantedEnd = params.get('end') || '';
    const wantedStart = params.get('start') || '';

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (attempts > 100) {
        window.clearInterval(timer);
        return;
      }

      if (wantedAlliance && allianceSelect?.querySelector(`option[value="${CSS.escape(wantedAlliance)}"]`) && allianceSelect.value !== wantedAlliance) {
        allianceSelect.value = wantedAlliance;
        allianceSelect.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }

      if (!playerSelect?.querySelector(`option[value="${CSS.escape(wantedPlayer)}"]`)) return;

      if (playerSelect.value !== wantedPlayer) {
        playerSelect.value = wantedPlayer;
        playerSelect.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }

      if (wantedPeriod && periodSelect?.querySelector(`option[value="${CSS.escape(wantedPeriod)}"]`) && periodSelect.value !== wantedPeriod) {
        periodSelect.value = wantedPeriod;
        periodSelect.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }

      if (wantedEnd && endSelect?.querySelector(`option[value="${CSS.escape(wantedEnd)}"]`) && endSelect.value !== wantedEnd) {
        endSelect.value = wantedEnd;
        endSelect.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }

      if (wantedPeriod === 'custom' && wantedStart && startSelect?.querySelector(`option[value="${CSS.escape(wantedStart)}"]`) && startSelect.value !== wantedStart) {
        startSelect.value = wantedStart;
        startSelect.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }

      window.clearInterval(timer);
    }, 100);
  }

  const observer = new MutationObserver(addEquipmentHints);
  observer.observe(list, { childList: true, subtree: true });
  addEquipmentHints();
  applyUrlSelection();
})();
