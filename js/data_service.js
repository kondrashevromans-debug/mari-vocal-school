// --- START OF FILE data_service.js ---

window.DataService = (() => {
  // ИЗМЕНЕНИЕ ЗДЕСЬ
  let fullData = null;
  let initializationPromise = null;

  const fetchModule = async (path) => {
    try {
      const response = await fetch(path);
      if (!response.ok) return [];
      return await response.json();
    } catch (e) {
      console.error(`Failed to fetch module at ${path}`, e);
      return [];
    }
  };

  const init = async () => {
    if (fullData) return fullData;

    try {
      const response = await fetch("/mari-vocal-school/data/tracks_data.json");
      if (!response.ok) throw new Error("Could not fetch tracks_data.json");
      const tracksData = await response.json();

      const allModulePromises = [];
      for (const partKey in tracksData) {
        for (const trackId in tracksData[partKey].tracks) {
          const track = tracksData[partKey].tracks[trackId];

          track.id = trackId;
          track.partKey = partKey;

          track.modules.forEach((module) => {
            const promise = fetchModule(module.path).then((exercises) => {
              module.exercises = exercises;
            });
            allModulePromises.push(promise);
          });
        }
      }
      await Promise.all(allModulePromises);

      fullData = tracksData;
      return fullData;
    } catch (error) {
      console.error("DataService initialization failed:", error);
      throw error;
    }
  };

  const getData = () => {
    if (!initializationPromise) {
      initializationPromise = init();
    }
    return initializationPromise;
  };

  const getTrackById = (data, trackId) => {
    for (const partKey in data) {
      if (data[partKey].tracks[trackId]) {
        return data[partKey].tracks[trackId];
      }
    }
    return null;
  };

  return {
    getData,
    getTrackById,
  };
})();
