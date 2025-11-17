document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("achievements-container");
  const statsEl = document.getElementById("achievements-stats");

  const tierIcons = {
    Bronze: "🥉",
    Silver: "🥈",
    Gold: "🥇",
    Platinum: "💎",
    Legendary: "🏆",
  };

  try {
    const response = await fetch("/mari-vocal-school/data/achievements.json");
    if (!response.ok) throw new Error("Не удалось загрузить достижения");
    const data = await response.json();
    const allAchievements = data.achievements;

    const unlockedAchievements =
      JSON.parse(localStorage.getItem("unlockedAchievements")) || {};

    const allAchievementsList = Object.values(allAchievements).flat();
    const totalCount = allAchievementsList.length;
    const unlockedCount = Object.keys(unlockedAchievements).length;

    if (statsEl) {
      statsEl.textContent = `${unlockedCount}/${totalCount}`;
      statsEl.className = "achievements-header-stats";
    }

    container.innerHTML = "";

    for (const categoryKey in allAchievements) {
      const category = allAchievements[categoryKey];
      if (category.length === 0) continue;

      const categoryEl = document.createElement("div");
      categoryEl.className = "achievement-category";

      const categoryTitle = document.createElement("h2");
      categoryTitle.textContent =
        categoryKey.charAt(0).toUpperCase() +
        categoryKey.slice(1).replace(/_/g, " ");
      categoryEl.appendChild(categoryTitle);

      const listEl = document.createElement("div");
      listEl.className = "achievements-list";

      category.forEach((ach) => {
        const isUnlocked = !!unlockedAchievements[ach.id];
        const unlockedDate = isUnlocked
          ? new Date(unlockedAchievements[ach.id]).toLocaleDateString()
          : "";

        const card = document.createElement("div");
        card.className = `achievement-card tier-${ach.tier} ${
          isUnlocked ? "unlocked" : "locked"
        }`;

        let descriptionText;
        let iconContent;

        if (categoryKey === "Секретные достижения" && !isUnlocked) {
          descriptionText = `<em>Условие скрыто. Исследуйте приложение, и вы обязательно его откроете!</em>`;
          iconContent = "❓";
        } else {
          descriptionText = `<em>Условие:</em> ${ach.condition}`;
          if (isUnlocked) {
            descriptionText += `<br><em style="color: #888;">Получено: ${unlockedDate}</em>`;
          }
          iconContent = tierIcons[ach.tier] || "🏅";
        }

        card.innerHTML = `
          <div class="achievement-icon">${iconContent}</div>
          <div class="achievement-text">
            <h3 class="achievement-title">${ach.title}</h3>
            <p class="achievement-condition">${descriptionText}</p>
          </div>
        `;
        listEl.appendChild(card);
      });

      categoryEl.appendChild(listEl);
      container.appendChild(categoryEl);
    }
  } catch (error) {
    console.error("Ошибка:", error);
    container.innerHTML = `<div class="error-container"><h2>Ошибка</h2><p>Не удалось загрузить список достижений.</p></div>`;
  }
});
