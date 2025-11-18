# Copilot Instructions for AI Agents (mari-vocal-school)

## Обзор

Веб-приложение для вокального тренинга: статические HTML/JS/CSS, аудиосэмплы, прогресс пользователя в localStorage. Telegram WebApp интеграция для идентификации пользователя.

## Архитектура

- **Точки входа:** каждая функция — отдельная пара HTML+JS (например, `tuner.html` + `js/tuner.js`).
- **Данные:** JSON-файлы в `data/` (треки, модули, тренажёры, достижения).
- **Аудио:** сэмплы пианино в `assets/audio/piano/` (по октавам/нотам).
- **Сервисы:** общая логика (например, воспроизведение звука) — в сервисах типа `js/piano_sound_service.js`.
- **Достижения:** реализованы через `js/achievements_engine.js` и `js/achievements.js`.

## Ключевые паттерны

- **Изоляция фич:** каждая страница/тренажёр — независим, кросс-фичи через сервисы.
- **Прогресс пользователя:** хранится в localStorage (`vocal_progress_data`), ключ — userId (из Telegram WebApp, fallback: `dev_user`).
- **Воспроизведение аудио:** всегда через `pianoSoundService.playSound(note)`. Не использовать устаревший синтез.
- **UI:** прямое управление DOM, без фреймворков. Состояние UI — в JS-файле фичи.
- **Достижения:** разблокировка через флаги localStorage и вызов `AchievementsEngine.checkAndUnlock()`.

## Рабочие процессы

- **Нет сборки:** все файлы статичны, изменения видны сразу.
- **Отладка:** браузерные DevTools, тест Telegram — только в WebApp-контексте.
- **Тесты:** отсутствуют, только ручная проверка.

## Конвенции

- **Имена файлов:** JS-файл совпадает с HTML (например, `tuner.html` ↔ `js/tuner.js`).
- **Доступ к данным:** использовать сервисы/файлы для прогресса и аудио.
- **Сэмплы:** только из `assets/audio/piano/`, синтез — только для reference oscillator в тюнере.
- **User ID:** приоритет — Telegram WebApp, иначе `dev_user`.

## Интеграции

- **Telegram WebApp:** userId и ready через `Telegram.WebApp`.
- **localStorage:** всё состояние — только на клиенте.

## Примеры

- Воспроизвести ноту: `pianoSoundService.playSound('C4')`
- Обновить прогресс: изменить `userProgress` и вызвать `saveProgress()`
- Разблокировать достижение: установить флаг в localStorage и вызвать `AchievementsEngine.checkAndUnlock()`

## Ключевые файлы

- `js/tuner.js`, `js/trainer.js`, `js/achievements_engine.js`, `js/piano_sound_service.js`
- `data/` (JSON)
- `assets/audio/piano/` (сэмплы)

---

Если что-то неясно или нужен пример — уточните, и инструкция будет дополнена.
