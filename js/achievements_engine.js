window.AchievementsEngine = (() => {
  let allAchievements = null;
  let unlockedAchievements = {};

  const getStorageItem = (key, defaultValue) => {
    try {
      return JSON.parse(localStorage.getItem(key)) || defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const getTotalCompletedExercises = () => {
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("completed_")) {
        count += getStorageItem(key, []).length;
      }
    }
    return count;
  };

  const showToast = (title) => {
    const toast = document.getElementById("achievement-toast");
    const titleEl = document.getElementById("toast-achievement-title");
    if (!toast || !titleEl) return;

    titleEl.textContent = title;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 4000);
  };

  const unlock = (achievement) => {
    if (unlockedAchievements[achievement.id]) return;

    console.log(`ACHIEVEMENT UNLOCKED: ${achievement.title}`);
    unlockedAchievements[achievement.id] = new Date().toISOString();
    localStorage.setItem(
      "unlockedAchievements",
      JSON.stringify(unlockedAchievements)
    );
    showToast(achievement.title);
  };

  const isModuleCompleted = (module, completedExercisesSet) => {
    if (!module || !module.exercises || module.exercises.length === 0)
      return false;
    return module.exercises.every((ex) => completedExercisesSet.has(ex.id));
  };

  const isTrackCompleted = (track) => {
    if (!track || !track.modules || !track.id || !track.partKey) return false;

    const progressKey = `completed_${track.partKey}_${track.id}`;
    const completedInTrack = new Set(getStorageItem(progressKey, []));

    let totalExercises = 0;
    track.modules.forEach((module) => {
      if (module.exercises) {
        totalExercises += module.exercises.length;
      }
    });

    return totalExercises > 0 && completedInTrack.size >= totalExercises;
  };

  const checkers = {
    // === ONBOARDING ===
    first_exercise: () => getTotalCompletedExercises() > 0,
    first_daily_practice: () => !!localStorage.getItem("lastCompletedDaily"),
    first_foundation_module: (data) => {
      const foundationTrack = window.DataService.getTrackById(
        data,
        "foundation_main"
      );
      if (!foundationTrack) return false;
      const completedFoundation = new Set(
        getStorageItem(
          `completed_${foundationTrack.partKey}_${foundationTrack.id}`,
          []
        )
      );
      return foundationTrack.modules.some((module) =>
        isModuleCompleted(module, completedFoundation)
      );
    },
    body_explorer: (data) => {
      const foundationTrack = window.DataService.getTrackById(
        data,
        "foundation_main"
      );
      if (!foundationTrack) return false;
      const completedExercises = new Set(
        getStorageItem(
          `completed_${foundationTrack.partKey}_${foundationTrack.id}`,
          []
        )
      );

      const requiredModules = [
        "Расслабление Лица",
        "Расслабление Шеи",
        "Расслабление Языка",
      ];
      let completedRequiredModules = 0;

      foundationTrack.modules.forEach((module) => {
        if (requiredModules.includes(module.title)) {
          if (
            module.exercises &&
            module.exercises.some((ex) => completedExercises.has(ex.id))
          ) {
            completedRequiredModules++;
          }
        }
      });
      return completedRequiredModules >= 3;
    },
    breathing_trainer_first_use: () =>
      !!localStorage.getItem("breathing_trainer_first_use"),
    tuner_first_use: () => !!localStorage.getItem("tuner_first_use"),

    // === HABIT BUILDING ===
    daily_streak_3: () =>
      (parseInt(localStorage.getItem("dailyStreak")) || 0) >= 3,
    daily_streak_7: () =>
      (parseInt(localStorage.getItem("dailyStreak")) || 0) >= 7,
    daily_streak_14: () =>
      (parseInt(localStorage.getItem("dailyStreak")) || 0) >= 14,
    daily_streak_30: () =>
      (parseInt(localStorage.getItem("dailyStreak")) || 0) >= 30,
    perfect_week_daily: () => !!localStorage.getItem("perfect_week_daily"),
    total_sessions_50: () =>
      (parseInt(localStorage.getItem("totalSessions")) || 0) >= 50,
    total_sessions_100: () =>
      (parseInt(localStorage.getItem("totalSessions")) || 0) >= 100,
    time_spent_10h: () => {
      const ms = parseInt(localStorage.getItem("totalTimeSpent")) || 0;
      return ms >= 10 * 60 * 60 * 1000;
    },

    // === FOUNDATION MASTERY ===
    foundation_relax_completed: (data) => {
      const foundationTrack = window.DataService.getTrackById(
        data,
        "foundation_main"
      );
      if (!foundationTrack) return false;
      const completedExercises = new Set(
        getStorageItem(
          `completed_${foundationTrack.partKey}_${foundationTrack.id}`,
          []
        )
      );
      const relaxModules = foundationTrack.modules.filter((m) =>
        m.title.includes("Расслабление")
      );
      return (
        relaxModules.length > 0 &&
        relaxModules.every((m) => isModuleCompleted(m, completedExercises))
      );
    },
    foundation_breathing_completed: (data) => {
      const foundationTrack = window.DataService.getTrackById(
        data,
        "foundation_main"
      );
      const module = foundationTrack?.modules.find((m) =>
        m.title.includes("Дыхание")
      );
      const completedExercises = new Set(
        getStorageItem(
          `completed_${foundationTrack.partKey}_${foundationTrack.id}`,
          []
        )
      );
      return module ? isModuleCompleted(module, completedExercises) : false;
    },
    foundation_ligaments_completed: (data) => {
      const foundationTrack = window.DataService.getTrackById(
        data,
        "foundation_main"
      );
      const module = foundationTrack?.modules.find((m) =>
        m.title.includes("Связок")
      );
      const completedExercises = new Set(
        getStorageItem(
          `completed_${foundationTrack.partKey}_${foundationTrack.id}`,
          []
        )
      );
      return module ? isModuleCompleted(module, completedExercises) : false;
    },
    foundation_completed_all: (data) => {
      const track = window.DataService.getTrackById(data, "foundation_main");
      return track ? isTrackCompleted(track) : false;
    },

    // === SPECIALIZATION MASTERY ===
    track_relax_completed: (data) =>
      isTrackCompleted(window.DataService.getTrackById(data, "advanced_relax")),
    track_speech_completed: (data) =>
      isTrackCompleted(
        window.DataService.getTrackById(data, "confident_speech")
      ),
    track_vocal_completed: (data) =>
      isTrackCompleted(window.DataService.getTrackById(data, "pro_vocal")),
    diction_module_completed: (data) => {
      const speechTrack = window.DataService.getTrackById(
        data,
        "confident_speech"
      );
      const module = speechTrack?.modules.find((m) =>
        m.title.includes("Дикции")
      );
      const completedExercises = new Set(
        getStorageItem(`completed_${speechTrack.partKey}_${speechTrack.id}`, [])
      );
      return module ? isModuleCompleted(module, completedExercises) : false;
    },
    all_vip_completed: (data) => {
      return !!localStorage.getItem("all_vip_completed");
    },
    two_tracks_completed: (data) => {
      const specializationTracks = [
        window.DataService.getTrackById(data, "advanced_relax"),
        window.DataService.getTrackById(data, "confident_speech"),
        window.DataService.getTrackById(data, "pro_vocal"),
      ];
      const completedTracks = specializationTracks.filter((track) =>
        isTrackCompleted(track)
      ).length;
      return completedTracks >= 2;
    },
    all_tracks_completed: (data) => {
      const allTracks = Object.values(data).flatMap((part) =>
        Object.values(part.tracks)
      );
      return allTracks.every((track) => isTrackCompleted(track));
    },

    // === TECHNICAL PERFECTION ===
    tuner_hold_note_5s: () => !!localStorage.getItem("tuner_hold_5s"),
    tuner_hold_note_10s: () => !!localStorage.getItem("tuner_hold_note_10s"),
    tuner_chromatic_12: () => !!localStorage.getItem("tuner_chromatic_12"),
    breathing_trainer_5min: () =>
      !!localStorage.getItem("breathing_trainer_5min"),
    breathing_trainer_10min: () =>
      !!localStorage.getItem("breathing_trainer_10min"),
    trainer_first_use: () => !!localStorage.getItem("trainer_first_use"),
    trainer_accuracy_80: () => !!localStorage.getItem("trainer_accuracy_80"),
    trainer_accuracy_95: () => !!localStorage.getItem("trainer_accuracy_95"),
    trainer_accuracy_100: () => !!localStorage.getItem("trainer_accuracy_100"),
    trainer_hard_mode_completed: () =>
      !!localStorage.getItem("trainer_hard_mode_completed"),
    trainer_all_exercises_completed: async () => {
      try {
        const response = await fetch(
          "/mari-vocal-school/data/trainers/trainers_index.json"
        );
        const index = await response.json();
        const totalExercises = index.length;

        const completed = getStorageItem("trainerCompletedExercises", []);
        return completed.length >= totalExercises;
      } catch (e) {
        console.error(
          "Не удалось проверить ачивку trainer_all_exercises_completed",
          e
        );
        return false;
      }
    },

    // === SECRET ===
    secret_night_owl: () => !!localStorage.getItem("secret_night_owl"),
    secret_early_bird: () => !!localStorage.getItem("secret_early_bird"),
    secret_curious_mind: () => {
      const TOTAL_INFO_ICONS = 6;
      const clickedIcons = getStorageItem("clickedInfoIcons", []);
      const clickedIconsSet = new Set(clickedIcons);
      return clickedIconsSet.size >= TOTAL_INFO_ICONS;
    },
    secret_holiday_practice: () =>
      !!localStorage.getItem("secret_holiday_practice"),
    secret_perfectionist: () => !!localStorage.getItem("secret_perfectionist"),
    secret_well_rounded: () => !!localStorage.getItem("secret_well_rounded"),
  };

  const checkAndUnlock = async () => {
    if (!allAchievements) {
      try {
        const response = await fetch(
          "/mari-vocal-school/data/achievements.json"
        );
        const data = await response.json();
        allAchievements = Object.values(data.achievements).flat();
      } catch (e) {
        console.error("Could not load achievements data for engine", e);
        return;
      }
    }

    const tracksData = await window.DataService.getData();
    if (!tracksData) {
      console.error("Could not get tracks data for achievement check");
      return;
    }

    unlockedAchievements = getStorageItem("unlockedAchievements", {});

    for (const ach of allAchievements) {
      if (unlockedAchievements[ach.id]) continue;

      const checker = checkers[ach.id];
      if (checker) {
        const result = await Promise.resolve(checker(tracksData));
        if (result) {
          unlock(ach);
        }
      }
    }
  };

  const devUnlock = async (achievementId) => {
    console.log(`DEV: Попытка разблокировать '${achievementId}'`);

    const simulators = {
      first_exercise: () =>
        localStorage.setItem("completed_dev_test", '["test"]'),
      first_daily_practice: () =>
        localStorage.setItem("lastCompletedDaily", "2023-01-01"),
      first_foundation_module: async () => {
        const data = await window.DataService.getData();
        const foundationTrack = window.DataService.getTrackById(
          data,
          "foundation_main"
        );
        if (!foundationTrack || !foundationTrack.modules[0]?.exercises) return;
        const exercisesToComplete = foundationTrack.modules[0].exercises.map(
          (ex) => ex.id
        );
        localStorage.setItem(
          `completed_${foundationTrack.partKey}_${foundationTrack.id}`,
          JSON.stringify(exercisesToComplete)
        );
      },
      daily_streak_3: () => localStorage.setItem("dailyStreak", "3"),
      daily_streak_7: () => localStorage.setItem("dailyStreak", "7"),
      daily_streak_14: () => localStorage.setItem("dailyStreak", "14"),
      daily_streak_30: () => localStorage.setItem("dailyStreak", "30"),
      perfect_week_daily: () =>
        localStorage.setItem("perfect_week_daily", "true"),
      total_sessions_50: () => localStorage.setItem("totalSessions", "50"),
      total_sessions_100: () => localStorage.setItem("totalSessions", "100"),
      time_spent_10h: () =>
        localStorage.setItem("totalTimeSpent", 10 * 60 * 60 * 1000 + 1),
      foundation_completed_all: async () => {
        const data = await window.DataService.getData();
        const track = window.DataService.getTrackById(data, "foundation_main");
        if (!track) return;
        const allExercises = track.modules.flatMap((m) =>
          m.exercises.map((e) => e.id)
        );
        localStorage.setItem(
          `completed_${track.partKey}_${track.id}`,
          JSON.stringify(allExercises)
        );
      },
      tuner_hold_note_5s: () => localStorage.setItem("tuner_hold_5s", "true"),
      tuner_hold_note_10s: () =>
        localStorage.setItem("tuner_hold_note_10s", "true"),
      tuner_chromatic_12: () =>
        localStorage.setItem("tuner_chromatic_12", "true"),
      breathing_trainer_5min: () =>
        localStorage.setItem("breathing_trainer_5min", "true"),
      breathing_trainer_10min: () =>
        localStorage.setItem("breathing_trainer_10min", "true"),
      trainer_accuracy_100: () =>
        localStorage.setItem("trainer_accuracy_100", "true"),
      trainer_hard_mode_completed: () =>
        localStorage.setItem("trainer_hard_mode_completed", "true"),
      trainer_all_exercises_completed: () =>
        localStorage.setItem(
          "trainerCompletedExercises",
          '["five_note_sequence_c4", "major_arpeggio_g3", "interval_major_third_f4"]'
        ),
      secret_perfectionist: () =>
        localStorage.setItem("secret_perfectionist", "true"),
      secret_night_owl: () => localStorage.setItem("secret_night_owl", "true"),
      secret_curious_mind: () =>
        localStorage.setItem(
          "clickedInfoIcons",
          '["id1","id2","id3","id4","id5"]'
        ),
    };

    if (achievementId === "all") {
      console.log("DEV: Разблокировка всех возможных ачивок...");
      for (const id in simulators) {
        await simulators[id]();
      }
    } else if (simulators[achievementId]) {
      await simulators[achievementId]();
    } else {
      console.warn(
        `DEV: Симулятор для '${achievementId}' не найден. Проверьте ID.`
      );
      return;
    }

    await checkAndUnlock();
    console.log(`DEV: Проверка завершена.`);
  };

  const MODAL_TEXTS = {
    "main-menu-exercises": {
      title: "Упражнения",
      text: "Пошаговые треки развития голоса. Начните с 'Фундамента', чтобы снять зажимы, а затем переходите к специализированным трекам.",
    },
    "main-menu-warmups": {
      title: "Вокальные распевки",
      text: "Здесь собраны короткие аудио-распевки для ежедневной практики или разогрева. Повторяйте за пианино, чтобы развивать интонирование и вокальную технику.",
    },
    "main-menu-tuner": {
      title: "Тюнер",
      text: "Инструмент для проверки слуха. Пойте в микрофон, и тюнер покажет, в какую ноту вы попали.",
    },
    "main-menu-trainer": {
      title: "Вокальный тренажер",
      text: "Интерактивные распевки. Повторяйте мелодии за пианино, а приложение проверит точность интонирования.",
    },
    "main-menu-breathing": {
      title: "Тренажер на дыхание",
      text: "Визуальный помощник для выполнения дыхательных практик. Анимированный круг поможет вам контролировать ритм вдоха, задержки и выдоха для максимального расслабления и концентрации.",
    },
    "main-menu-achievements": {
      title: "Мои достижения",
      text: "Система достижений мотивирует вас на дальнейший прогресс. Разблокируйте награды, выполняя упражнения, тренируясь и развивая свой голос. Каждое достижение отмечает важный этап вашего пути к идеальному голосу.",
    },
    welcome: {
      title: "Добро пожаловать!",
      text: "Это приложение поможет вам освободить природный голос. Выполняйте упражнения, следите за прогрессом и тренируйте слух.",
    },
  };

  const infoModal = document.getElementById("info-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalText = document.getElementById("modal-text");
  const modalCloseBtn = document.getElementById("modal-close-button");

  function openInfoModal(infoId) {
    if (!infoModal || !modalTitle || !modalText) return;
    const content = MODAL_TEXTS[infoId];
    if (!content) {
      console.warn(`Текст для infoId '${infoId}' не найден.`);
      return;
    }
    modalTitle.textContent = content.title;
    modalText.textContent = content.text;
    infoModal.classList.add("modal-active");
  }

  function closeInfoModal() {
    if (infoModal) infoModal.classList.remove("modal-active");
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeInfoModal);
  if (infoModal) {
    infoModal.addEventListener("click", (event) => {
      if (event.target === infoModal) {
        closeInfoModal();
      }
    });
  }

  function handleInfoIconClick(event) {
    const icon = event.target.closest(".info-icon");
    if (!icon) return;

    event.preventDefault();
    event.stopPropagation();

    const infoId = icon.dataset.infoId;
    if (!infoId) return;

    openInfoModal(infoId);

    try {
      let clickedIcons = getStorageItem("clickedInfoIcons", []);
      const clickedIconsSet = new Set(clickedIcons);

      if (!clickedIconsSet.has(infoId)) {
        clickedIconsSet.add(infoId);
        localStorage.setItem(
          "clickedInfoIcons",
          JSON.stringify(Array.from(clickedIconsSet))
        );
        console.log(
          `Info icon clicked: ${infoId}. Total unique clicks: ${clickedIconsSet.size}`
        );
        checkAndUnlock();
      }
    } catch (e) {
      console.error("Ошибка при обработке клика по info-icon:", e);
    }
  }

  document.addEventListener("click", handleInfoIconClick);

  return {
    checkAndUnlock,
    devUnlock,
    openInfoModal,
  };
})();

window.devUnlock = window.AchievementsEngine.devUnlock;
window.openInfoModal = window.AchievementsEngine.openInfoModal;
