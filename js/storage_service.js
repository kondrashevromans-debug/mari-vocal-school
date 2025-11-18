// StorageService: централизованная работа с localStorage
const StorageService = {
  get(key, fallback = null) {
    try {
      const value = localStorage.getItem(key);
      return value !== null ? JSON.parse(value) : fallback;
    } catch (e) {
      console.error("StorageService: ошибка чтения", key, e);
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error("StorageService: ошибка записи", key, e);
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error("StorageService: ошибка удаления", key, e);
    }
  },
  clear() {
    try {
      localStorage.clear();
    } catch (e) {
      console.error("StorageService: ошибка очистки", e);
    }
  },
};
window.StorageService = StorageService;
