// Генератор manifest.json для offline-кэша
// Запускать вручную при добавлении новых файлов

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const EXTS = [".html", ".js", ".css", ".json", ".mp3", ".wav", ".ogg"];
const EXCLUDE = ["sw.js", "manifest.json"];

function walk(dir) {
  let results = [];
  fs.readdirSync(dir).forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else {
      const ext = path.extname(file);
      if (EXTS.includes(ext) && !EXCLUDE.includes(file)) {
        results.push(path.relative(ROOT, fullPath).replace(/\\/g, "/"));
      }
    }
  });
  return results;
}

const resources = walk(ROOT);
const manifest = { resources };
fs.writeFileSync(
  path.join(ROOT, "manifest.json"),
  JSON.stringify(manifest, null, 2)
);
console.log("manifest.json создан, ресурсов:", resources.length);
