const fs = require("fs").promises;
const path = require("path");
const { parse } = require("csv-parse/sync"); // Понадобится установить библиотеку

// --- КОНФИГУРАЦИЯ ---
const CSV_FILE_PATH = "video_links.csv";
const MODULES_DIR = path.join(__dirname, "data", "modules"); // Путь к папке с JSON-файлами модулей
// --------------------

async function main() {
  console.log("🚀 Начинаем процесс обновления видео...");

  // 1. Читаем и парсим CSV-файл с ссылками
  let videoLinksMap;
  try {
    const csvContent = await fs.readFile(CSV_FILE_PATH, "utf8");
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
    });

    videoLinksMap = new Map();
    records.forEach((record) => {
      const url = record.rutube_link;
      if (url) {
        const urlParts = url.split("/private/")[1]?.split("/?");
        const videoId = urlParts ? urlParts[0] : null;
        const params = new URLSearchParams(urlParts ? urlParts[1] : "");
        const accessKey = params.get("p");

        if (videoId && accessKey) {
          videoLinksMap.set(record.exercise_id, { videoId, accessKey });
        } else {
          console.warn(
            `⚠️ Не удалось разобрать ссылку для ID: ${record.exercise_id}`
          );
        }
      }
    });
    console.log(
      `✅ CSV-файл успешно прочитан. Найдено ${videoLinksMap.size} ссылок.`
    );
  } catch (error) {
    console.error(
      `❌ Ошибка чтения CSV-файла (${CSV_FILE_PATH}):`,
      error.message
    );
    return;
  }

  // 2. Находим все JSON-файлы в папке с модулями
  let moduleFiles;
  try {
    const allFiles = await fs.readdir(MODULES_DIR);
    moduleFiles = allFiles.filter((file) => file.endsWith(".json"));
    console.log(`🔍 Найдено ${moduleFiles.length} JSON-файлов модулей.`);
  } catch (error) {
    console.error(
      `❌ Не удалось прочитать папку с модулями (${MODULES_DIR}):`,
      error.message
    );
    return;
  }

  let updatedExercisesCount = 0;

  // 3. Обрабатываем каждый JSON-файл
  for (const fileName of moduleFiles) {
    const filePath = path.join(MODULES_DIR, fileName);
    try {
      const fileContent = await fs.readFile(filePath, "utf8");
      const exercises = JSON.parse(fileContent);

      let fileWasModified = false;

      exercises.forEach((exercise) => {
        if (videoLinksMap.has(exercise.id)) {
          const videoData = videoLinksMap.get(exercise.id);
          exercise.videoId = videoData.videoId;
          exercise.accessKey = videoData.accessKey;
          fileWasModified = true;
          updatedExercisesCount++;
          console.log(
            `   - Обновлено упражнение "${exercise.id}" в файле ${fileName}`
          );
        }
      });

      // 4. Если файл был изменен, перезаписываем его
      if (fileWasModified) {
        const newContent = JSON.stringify(exercises, null, 2); // null, 2 для красивого форматирования
        await fs.writeFile(filePath, newContent, "utf8");
        console.log(`   💾 Файл ${fileName} сохранен.`);
      }
    } catch (error) {
      console.error(
        `❌ Ошибка при обработке файла ${fileName}:`,
        error.message
      );
    }
  }

  console.log(
    `\n🎉 Готово! Всего обновлено упражнений: ${updatedExercisesCount}.`
  );
}

main();
