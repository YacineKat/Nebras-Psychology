let settingsCache = null;

function resolvePublicSettingsUrl() {
  return window.API_URL + '/settings';
}

async function loadPublicSettings() {
  if (settingsCache) return settingsCache;
  try {
    const res = await fetch(resolvePublicSettingsUrl());
    if (!res.ok) throw new Error('Failed to load settings');
    const data = await res.json();
    settingsCache = data.settings || {};
    return settingsCache;
  } catch (e) {
    settingsCache = {};
    return settingsCache;
  }
}

async function getPublicSetting(key, defaultValue) {
  const s = await loadPublicSettings();
  return s[key] !== undefined && s[key] !== null ? s[key] : defaultValue;
}

window.loadPublicSettings = loadPublicSettings;
window.getPublicSetting = getPublicSetting;
