// /docs/evolution-extra.js
(() => {
  const list = document.querySelector('#evolutionList');
  if (!list) return;

  function addEquipmentHints() {
    list.querySelectorAll('.evolutionCard').forEach((card) => {
      if (card.dataset.equipmentHintDone === '1') return;
      card.dataset.equipmentHintDone = '1';

      const power = card.querySelector('.evolutionCardPower')?.textContent?.trim() || '';
      const changes = card.querySelector('.evolutionChanges');

      if (!power || changes) return;

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

  const observer = new MutationObserver(addEquipmentHints);
  observer.observe(list, { childList: true, subtree: true });
  addEquipmentHints();
})();
