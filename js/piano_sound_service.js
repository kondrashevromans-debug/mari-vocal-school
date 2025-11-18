const pianoSoundService = (() => {
  const sounds = {};
  const BASE_PATH = "/mari-vocal-school/assets/audio/piano/";
  const NOTE_NAMES = [
    "C",
    "Cs",
    "D",
    "Ds",
    "E",
    "F",
    "Fs",
    "G",
    "Gs",
    "A",
    "As",
    "B",
  ];

  // Октавы для двухэтапной загрузки
  const PRIORITY_OCTAVES = [3, 4, 5];
  const BACKGROUND_OCTAVES = [1, 2, 6];

  /**
   * Загружает один аудио-семпл и сохраняет его в кэше.
   * @param {string} note - Нота в формате 'C4', 'Gs5'.
   * @returns {Promise<void>}
   */
  const _loadAndStoreSample = (note) => {
    return new Promise((resolve, reject) => {
      // Особый случай для C7, который лежит в папке 6-й октавы
      const octave = note === "C7" ? 6 : note.slice(-1);
      const noteFileName = note.replace("#", "s");
      const path = `${BASE_PATH}${octave}/${noteFileName}.mp3`;

      // Сначала пробуем получить из кэша Service Worker
      if (window.caches) {
        caches
          .match(path)
          .then(function (response) {
            if (response) {
              response.blob().then(function (blob) {
                const audioUrl = URL.createObjectURL(blob);
                const audio = new Audio(audioUrl);
                audio.addEventListener("canplaythrough", () => {
                  sounds[note] = audio;
                  resolve();
                });
                audio.addEventListener("error", (e) => {
                  console.error(
                    `Не удалось загрузить семпл из кэша: ${path}`,
                    e
                  );
                  reject(`Error loading from cache ${path}`);
                });
              });
            } else {
              // Fallback: обычная загрузка
              const audio = new Audio(path);
              audio.addEventListener("canplaythrough", () => {
                sounds[note] = audio;
                resolve();
              });
              audio.addEventListener("error", (e) => {
                console.error(`Не удалось загрузить семпл: ${path}`, e);
                reject(`Error loading ${path}`);
              });
            }
          })
          .catch(() => {
            // Fallback: обычная загрузка
            const audio = new Audio(path);
            audio.addEventListener("canplaythrough", () => {
              sounds[note] = audio;
              resolve();
            });
            audio.addEventListener("error", (e) => {
              console.error(`Не удалось загрузить семпл: ${path}`, e);
              reject(`Error loading ${path}`);
            });
          });
      } else {
        // Fallback: обычная загрузка
        const audio = new Audio(path);
        audio.addEventListener("canplaythrough", () => {
          sounds[note] = audio;
          resolve();
        });
        audio.addEventListener("error", (e) => {
          console.error(`Не удалось загрузить семпл: ${path}`, e);
          reject(`Error loading ${path}`);
        });
      }
    });
  };

  /**
   * Инициализирует сервис, выполняя двухэтапную загрузку семплов.
   * @returns {Promise<void>} - Promise, который разрешается после загрузки приоритетных октав.
   */
  const initialize = async () => {
    // --- ЭТАП 1: Приоритетная загрузка ---
    console.log(
      "PianoSoundService: Начало приоритетной загрузки (октавы 3, 4, 5)..."
    );
    const priorityPromises = [];
    PRIORITY_OCTAVES.forEach((octave) => {
      NOTE_NAMES.forEach((noteName) => {
        const note = noteName.replace("s", "#") + octave;
        priorityPromises.push(_loadAndStoreSample(note));
      });
    });

    // Ждем завершения загрузки только приоритетных семплов
    await Promise.all(priorityPromises);
    console.log("PianoSoundService: Приоритетная загрузка завершена.");

    // --- ЭТАП 2: Фоновая загрузка ---
    // Запускаем и не ждем завершения, чтобы не блокировать интерфейс
    console.log(
      "PianoSoundService: Начало фоновой загрузки (октавы 1, 2, 6)..."
    );
    const backgroundPromises = [];
    BACKGROUND_OCTAVES.forEach((octave) => {
      NOTE_NAMES.forEach((noteName) => {
        const note = noteName.replace("s", "#") + octave;
        // Пропускаем ноты выше C7, т.к. их нет
        if (note === "C7" || octave < 6) {
          backgroundPromises.push(_loadAndStoreSample(note));
        }
      });
    });

    // Добавляем C7 отдельно, так как он в 6-й октаве
    if (BACKGROUND_OCTAVES.includes(6)) {
      backgroundPromises.push(_loadAndStoreSample("C7"));
    }

    Promise.all(backgroundPromises)
      .then(() => {
        console.log("PianoSoundService: Фоновая загрузка завершена.");
      })
      .catch((err) => {
        console.error(
          "PianoSoundService: Ошибка во время фоновой загрузки.",
          err
        );
      });
  };

  /**
   * Воспроизводит звук указанной ноты.
   * Если семпл не загружен, загружает его "на лету".
   * @param {string} note - Нота в формате 'C4', 'Gs5'.
   */
  const playSound = (note) => {
    if (sounds[note]) {
      const audio = sounds[note];
      audio.currentTime = 0; // Позволяет быстро нажимать одну и ту же ноту
      audio.play();
    } else {
      console.warn(
        `Семпл для ${note} не предзагружен. Загрузка по требованию.`
      );
      _loadAndStoreSample(note)
        .then(() => {
          if (sounds[note]) {
            sounds[note].play();
          }
        })
        .catch((err) =>
          console.error(`Не удалось воспроизвести звук для ${note}:`, err)
        );
    }
  };

  return {
    initialize,
    playSound,
  };
})();
