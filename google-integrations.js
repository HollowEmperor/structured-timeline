// Google Maps Platform (Maps JS, Places API New, Routes API) + Google Drive (Firebase Auth)
// Attribution ID override: gmp_mcp_codeassist_v1_aistudio
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

const GMP_ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];
const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
];
const BACKUP_FILE_PREFIX = 'structured-planner-backup';
const DEFAULT_BACKUP_FILENAME = 'structured-planner-backup.json';

// ============================================================================
// TIER 1: EARLY GLOBAL QUOTA DEFENSE (CASE A — AUTO-PROVISIONED DEMO KEY)
// ============================================================================
let quotaWarningActive = false;

function triggerQuotaWarning() {
  if (quotaWarningActive) return;
  quotaWarningActive = true;
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
}

window.gm_authFailure = () => {
  triggerQuotaWarning();
};

const origConsoleError = console.error;
console.error = (...args) => {
  origConsoleError.apply(console, args);
  try {
    const msg = args.map((a) => String(a)).join(' ');
    if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
      triggerQuotaWarning();
    }
  } catch (_) {}
};

function isQuotaError(err, responseStatus = null, payloadErrorStatus = null) {
  if (responseStatus === 429) return true;
  if (payloadErrorStatus === 'RESOURCE_EXHAUSTED' || payloadErrorStatus === 'OVER_QUERY_LIMIT') return true;
  const text = String(err?.message || err?.status || err?.code || err || '');
  return (
    text.includes('RESOURCE_EXHAUSTED') ||
    text.includes('OVER_QUERY_LIMIT') ||
    text.includes('OverQuotaMapError') ||
    text.includes('QuotaExceededError') ||
    text.includes('429')
  );
}

function showQuotaBannerIfPresent() {
  const banner = document.getElementById('gmp-quota-banner');
  if (banner) {
    banner.classList.remove('hidden');
  }
}

window.addEventListener('gmp-quota-exceeded', showQuotaBannerIfPresent);

// ============================================================================
// CLIENT CONFIG LOADER (MAPS API KEY + FIREBASE WEB CONFIG)
// ============================================================================
let clientConfigPromise = null;

async function getClientConfig() {
  if (!clientConfigPromise) {
    clientConfigPromise = fetch('/api/client-config', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`Config fetch failed (${res.status})`);
        return res.json();
      })
      .catch(async (err) => {
        console.warn('Fallback loading firebase-applet-config.json:', err);
        let firebaseConfig = null;
        try {
          const fbRes = await fetch('/firebase-applet-config.json', { cache: 'no-store' });
          if (fbRes.ok) firebaseConfig = await fbRes.json();
        } catch (_) {}
        return { mapsApiKey: '', hasMapsKey: false, firebaseConfig };
      });
  }
  return clientConfigPromise;
}

// ============================================================================
// GOOGLE MAPS PLATFORM CONTROLLER (MAPS JS + PLACES API NEW + ROUTES API)
// ============================================================================
let mapsBootPromise = null;
let mapInstance = null;
let mapInfoWindow = null;
let taskMarkers = [];
let pickedMarker = null;
let userLocationMarker = null;
let routePolylines = [];
let routeMarkers = [];

const mapsUiState = {
  mode: 'explore', // 'explore' | 'pick-task-location' | 'pick-automation-location'
  selectedPlace: null, // { label, placeId, lat, lng }
  userPosition: null, // { lat, lng, accuracy?, timestamp? }
  travelMode: 'DRIVING',
  originKey: 'my-location',
  destinationKey: '',
  searchRequestId: 0,
  taskModalRequestId: 0,
  automationModalRequestId: 0,
  searchSessionToken: null,
  taskModalSessionToken: null,
  automationModalSessionToken: null,
};

const liveLocationState = {
  active: false,
  watchId: null,
  position: null, // { lat, lng, accuracy, timestamp }
  error: '',
  updatedAt: null,
};

function escapeHtmlSafe(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getCurrentMapColorScheme() {
  const themeId = document.documentElement.getAttribute('data-theme') || 'charcoal';
  return themeId === 'paper' ? 'LIGHT' : 'DARK';
}

function installGoogleMapsBootstrap(apiKey) {
  const g = { key: apiKey, v: 'weekly' };
  let h;
  let a;
  let k;
  const p = 'The Google Maps JavaScript API';
  const c = 'google';
  const l = 'importLibrary';
  const q = '__ib__';
  const m = document;
  let b = window;
  b = b[c] || (b[c] = {});
  const d = b.maps || (b.maps = {});
  const r = new Set();
  const e = new URLSearchParams();
  const u = () =>
    h ||
    (h = new Promise((f, n) => {
      a = m.createElement('script');
      e.set('libraries', [...r] + '');
      for (k in g) {
        e.set(
          k.replace(/[A-Z]/g, (t) => '_' + t[0].toLowerCase()),
          g[k]
        );
      }
      e.set('callback', c + '.maps.' + q);
      a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
      d[q] = f;
      a.onerror = () => (h = n(Error(p + ' could not load.')));
      a.nonce = m.querySelector('script[nonce]')?.nonce || '';
      m.head.append(a);
    }));
  if (!d[l]) {
    d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n));
  }
}

async function ensureGoogleMapsLoaded() {
  if (mapsBootPromise) return mapsBootPromise;

  mapsBootPromise = (async () => {
    const cfg = await getClientConfig();
    if (!cfg?.mapsApiKey) {
      mapsBootPromise = null;
      throw new Error('Google Maps API key is not available in the server environment.');
    }
    if (!window.google?.maps?.importLibrary) {
      installGoogleMapsBootstrap(cfg.mapsApiKey);
    }
    await window.google.maps.importLibrary('maps');
    return true;
  })();

  return mapsBootPromise;
}

function setMapsStatusBanner(message, tone = 'info') {
  const el = document.getElementById('maps-status-banner');
  if (!el) return;
  if (!message) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.classList.remove('hidden', 'text-secondarytext', 'text-coral', 'text-amber', 'text-lime');
  if (tone === 'error') el.classList.add('text-coral');
  else if (tone === 'warn') el.classList.add('text-amber');
  else if (tone === 'ok') el.classList.add('text-lime');
  else el.classList.add('text-secondarytext');
  el.textContent = message;
}

function getPlannerDayGeotaggedTasks() {
  if (typeof window.getSelectedDayGeotaggedTasks === 'function') {
    return window.getSelectedDayGeotaggedTasks();
  }
  return [];
}

function clearMapMarkers() {
  taskMarkers.forEach((m) => {
    m.map = null;
  });
  taskMarkers = [];
}

function clearRouteOverlays() {
  routePolylines.forEach((p) => {
    if (typeof p.setMap === 'function') p.setMap(null);
  });
  routePolylines = [];
  routeMarkers.forEach((m) => {
    m.map = null;
  });
  routeMarkers = [];
  const summaryEl = document.getElementById('maps-route-summary');
  if (summaryEl) {
    summaryEl.classList.add('hidden');
    summaryEl.innerHTML = '';
  }
}

async function ensureMapInitialized() {
  await ensureGoogleMapsLoaded();
  const canvas = document.getElementById('maps-canvas');
  if (!canvas) throw new Error('Map container missing.');

  const { Map, InfoWindow } = await window.google.maps.importLibrary('maps');
  if (!mapInstance) {
    const colorScheme = getCurrentMapColorScheme();
    mapInstance = new Map(canvas, {
      center: { lat: 37.7749, lng: -122.4194 },
      zoom: 12,
      mapId: 'DEMO_MAP_ID',
      internalUsageAttributionIds: GMP_ATTRIBUTION_IDS,
      gestureHandling: 'greedy',
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      colorScheme,
    });
    mapInfoWindow = new InfoWindow();

    mapInstance.addListener('click', (event) => {
      if (!event?.latLng) return;
      const lat = event.latLng.lat();
      const lng = event.latLng.lng();
      if (mapsUiState.mode === 'pick-task-location' || mapsUiState.mode === 'pick-automation-location') {
        void placeSelectionPin({
          label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          placeId: '',
          lat,
          lng,
        });
      }
    });
  }
  return mapInstance;
}

async function placeSelectionPin(placeData) {
  mapsUiState.selectedPlace = placeData;
  const map = await ensureMapInitialized();
  const { AdvancedMarkerElement, PinElement } = await window.google.maps.importLibrary('marker');

  if (pickedMarker) {
    pickedMarker.map = null;
    pickedMarker = null;
  }

  const pin = new PinElement({
    background: '#EA7E7E',
    borderColor: '#1B1B1B',
    glyphColor: '#111111',
    glyphText: '★',
    scale: 1.15,
  });

  pickedMarker = new AdvancedMarkerElement({
    map,
    position: { lat: placeData.lat, lng: placeData.lng },
    title: placeData.label || 'Selected Location',
  });
  pickedMarker.append(pin);

  map.panTo({ lat: placeData.lat, lng: placeData.lng });
  if ((map.getZoom() || 12) < 14) map.setZoom(15);

  const pickBar = document.getElementById('maps-pick-confirm-bar');
  const pickLabel = document.getElementById('maps-pick-selected-label');
  if (pickBar && pickLabel) {
    pickLabel.textContent = placeData.label || `${placeData.lat.toFixed(4)}, ${placeData.lng.toFixed(4)}`;
    pickBar.classList.remove('hidden');
  }
  populateRouteSelectors();
}

async function renderTaskPinsOnMap(focusTaskId = null) {
  const map = await ensureMapInitialized();
  const { AdvancedMarkerElement, PinElement } = await window.google.maps.importLibrary('marker');
  const { LatLngBounds } = await window.google.maps.importLibrary('core');

  clearMapMarkers();

  const tasks = getPlannerDayGeotaggedTasks();
  const listEl = document.getElementById('maps-day-locations-list');
  const countEl = document.getElementById('maps-day-locations-count');

  if (countEl) {
    countEl.textContent = `${tasks.length} pinned`;
  }

  if (listEl) {
    if (tasks.length === 0) {
      listEl.innerHTML = `
        <div class="text-xs text-secondarytext bg-cardbg border border-borderline rounded-xl px-3.5 py-3">
          No tasks with map locations on this day yet. Search a place above or edit any task to pin a location.
        </div>
      `;
    } else {
      listEl.innerHTML = tasks
        .map(
          (t, idx) => `
          <button
            type="button"
            data-map-task-id="${t.id}"
            class="tactile-btn w-full text-left bg-cardbg border border-borderline hover:border-coral/70 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2.5 transition"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0" style="background-color:${escapeHtmlSafe(t.colorHex || '#EA7E7E')}24; color:${escapeHtmlSafe(t.colorHex || '#EA7E7E')};">${idx + 1}</span>
              <div class="min-w-0">
                <p class="text-xs font-semibold text-primarytext truncate">${escapeHtmlSafe(t.title)}</p>
                <p class="text-[11px] text-secondarytext truncate">${escapeHtmlSafe(t.timeLabel || '')} • ${escapeHtmlSafe(t.location)}</p>
              </div>
            </div>
            <span class="text-[10px] font-semibold text-coral flex-shrink-0">Focus</span>
          </button>
        `
        )
        .join('');

      listEl.querySelectorAll('button[data-map-task-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetId = btn.getAttribute('data-map-task-id');
          const task = tasks.find((x) => String(x.id) === String(targetId));
          if (task) {
            map.panTo({ lat: task.locationLat, lng: task.locationLng });
            map.setZoom(15);
            const markerObj = taskMarkers.find((m) => String(m.__taskId) === String(task.id));
            if (markerObj && mapInfoWindow) {
              const wrap = document.createElement('div');
              wrap.style.color = '#111';
              wrap.style.padding = '2px 4px';
              const strong = document.createElement('strong');
              strong.textContent = task.title;
              const sub = document.createElement('div');
              sub.style.fontSize = '12px';
              sub.style.marginTop = '2px';
              sub.textContent = `${task.timeLabel || ''} • ${task.location}`;
              wrap.append(strong, sub);
              mapInfoWindow.setContent(wrap);
              mapInfoWindow.open({ anchor: markerObj, map });
            }
          }
        });
      });
    }
  }

  const bounds = new LatLngBounds();
  let focusedTask = null;

  tasks.forEach((task, idx) => {
    const pos = { lat: Number(task.locationLat), lng: Number(task.locationLng) };
    if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return;

    const pin = new PinElement({
      background: task.colorHex || '#EA7E7E',
      borderColor: '#1B1B1B',
      glyphColor: '#111111',
      glyphText: String(idx + 1),
      scale: 1.05,
    });

    const marker = new AdvancedMarkerElement({
      map,
      position: pos,
      title: `${task.title} — ${task.location}`,
    });
    marker.append(pin);
    marker.__taskId = task.id;

    // CF7: on v=weekly, use plain 'click' event on AdvancedMarkerElement
    marker.addListener('click', () => {
      if (!mapInfoWindow) return;
      const wrap = document.createElement('div');
      wrap.style.color = '#111';
      wrap.style.padding = '2px 4px';
      const strong = document.createElement('strong');
      strong.textContent = task.title;
      const sub = document.createElement('div');
      sub.style.fontSize = '12px';
      sub.style.marginTop = '2px';
      sub.textContent = `${task.timeLabel || ''} • ${task.location}`;
      wrap.append(strong, sub);
      mapInfoWindow.setContent(wrap);
      mapInfoWindow.open({ anchor: marker, map });
    });

    taskMarkers.push(marker);
    bounds.extend(pos);

    if (focusTaskId !== null && String(task.id) === String(focusTaskId)) {
      focusedTask = task;
    }
  });

  if (focusedTask) {
    map.setCenter({ lat: focusedTask.locationLat, lng: focusedTask.locationLng });
    map.setZoom(15);
  } else if (tasks.length === 1) {
    map.setCenter({ lat: tasks[0].locationLat, lng: tasks[0].locationLng });
    map.setZoom(14);
  } else if (tasks.length > 1) {
    map.fitBounds(bounds, 56);
  } else if (mapsUiState.userPosition) {
    map.setCenter(mapsUiState.userPosition);
    map.setZoom(13);
  }

  populateRouteSelectors();
}

function populateRouteSelectors() {
  const originSelect = document.getElementById('maps-route-origin');
  const destSelect = document.getElementById('maps-route-destination');
  if (!originSelect || !destSelect) return;

  const tasks = getPlannerDayGeotaggedTasks();
  const options = [];

  if (mapsUiState.userPosition) {
    options.push({ key: 'my-location', label: 'My Current Location' });
  }
  if (mapsUiState.selectedPlace) {
    options.push({
      key: 'selected-place',
      label: `Pinned: ${mapsUiState.selectedPlace.label}`,
    });
  }
  tasks.forEach((t, idx) => {
    options.push({
      key: `task:${t.id}`,
      label: `${idx + 1}. ${t.title} (${t.location})`,
    });
  });

  const prevOrigin = originSelect.value;
  const prevDest = destSelect.value;

  if (options.length === 0) {
    const emptyHtml = `<option value="">Add a pinned place or click My Location</option>`;
    originSelect.innerHTML = emptyHtml;
    destSelect.innerHTML = emptyHtml;
    return;
  }

  const optsHtml = options
    .map((o) => `<option value="${escapeHtmlSafe(o.key)}">${escapeHtmlSafe(o.label)}</option>`)
    .join('');
  originSelect.innerHTML = optsHtml;
  destSelect.innerHTML = optsHtml;

  if (options.some((o) => o.key === prevOrigin)) {
    originSelect.value = prevOrigin;
  } else {
    originSelect.value = options[0].key;
  }

  if (options.some((o) => o.key === prevDest) && prevDest !== originSelect.value) {
    destSelect.value = prevDest;
  } else if (options.length > 1) {
    destSelect.value = options[1].key;
  } else {
    destSelect.value = options[0].key;
  }
}

function resolveRouteEndpoint(key) {
  if (!key) return null;
  if (key === 'my-location' && mapsUiState.userPosition) {
    return {
      lat: mapsUiState.userPosition.lat,
      lng: mapsUiState.userPosition.lng,
      label: 'My Location',
    };
  }
  if (key === 'selected-place' && mapsUiState.selectedPlace) {
    return {
      lat: mapsUiState.selectedPlace.lat,
      lng: mapsUiState.selectedPlace.lng,
      label: mapsUiState.selectedPlace.label,
    };
  }
  if (key.startsWith('task:')) {
    const id = key.slice(5);
    const task = getPlannerDayGeotaggedTasks().find((t) => String(t.id) === id);
    if (task) {
      return {
        lat: Number(task.locationLat),
        lng: Number(task.locationLng),
        label: task.title,
      };
    }
  }
  return null;
}

async function computeAndDrawRoute() {
  const originKey = document.getElementById('maps-route-origin')?.value || '';
  const destKey = document.getElementById('maps-route-destination')?.value || '';
  const mode = document.getElementById('maps-route-mode')?.value || 'DRIVING';
  const summaryEl = document.getElementById('maps-route-summary');

  const origin = resolveRouteEndpoint(originKey);
  const destination = resolveRouteEndpoint(destKey);

  if (!origin || !destination) {
    setMapsStatusBanner('Select two different locations (or click My Location) to calculate commute time.', 'warn');
    return;
  }
  if (originKey === destKey) {
    setMapsStatusBanner('Choose a different destination from the origin to compute a route.', 'warn');
    return;
  }

  clearRouteOverlays();
  setMapsStatusBanner('Calculating route via Google Maps Routes API...', 'info');

  try {
    const map = await ensureMapInitialized();
    const { Route, RouteLabel } = await window.google.maps.importLibrary('routes');

    const request = {
      origin: { location: { lat: origin.lat, lng: origin.lng } },
      destination: { location: { lat: destination.lat, lng: destination.lng } },
      travelMode: mode,
      fields: [
        'routeLabels',
        'legs',
        'distanceMeters',
        'durationMillis',
        'staticDurationMillis',
        'path',
        'viewport',
        'localizedValues',
      ],
      internalUsageAttributionIds: GMP_ATTRIBUTION_IDS,
    };

    // routingPreference is only supported for motor vehicles (DRIVING / TWO_WHEELER)
    if (mode === 'DRIVING') {
      request.routingPreference = 'TRAFFIC_AWARE';
    }

    const response = await Route.computeRoutes(request);
    const routes = response?.routes || [];

    if (routes.length === 0) {
      setMapsStatusBanner('No route found for this travel mode between those two points.', 'warn');
      return;
    }

    const primaryRoute =
      routes.find((r) => r.routeLabels?.includes(RouteLabel?.DEFAULT_ROUTE)) || routes[0];

    const createdPolylines = primaryRoute.createPolylines({
      polylineOptions: {
        map,
        zIndex: 2,
        strokeColor: '#EA7E7E',
        strokeOpacity: 0.92,
        strokeWeight: 5,
      },
      colorScheme: map.get('colorScheme'),
    });
    routePolylines = routePolylines.concat(createdPolylines || []);

    if (primaryRoute.viewport) {
      map.fitBounds(primaryRoute.viewport, 48);
    }

    const durText =
      primaryRoute.localizedValues?.duration ||
      (primaryRoute.durationMillis
        ? `${Math.max(1, Math.round(primaryRoute.durationMillis / 60000))} min`
        : '—');
    const distText =
      primaryRoute.localizedValues?.distance ||
      (primaryRoute.distanceMeters
        ? `${(primaryRoute.distanceMeters / 1000).toFixed(1)} km`
        : '—');

    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[10.5px] uppercase tracking-wider font-semibold text-secondarytext">${escapeHtmlSafe(mode)} Route</p>
            <p class="text-sm font-bold text-primarytext mt-0.5">${escapeHtmlSafe(durText)} <span class="text-secondarytext font-medium text-xs">• ${escapeHtmlSafe(distText)}</span></p>
            <p class="text-[11px] text-secondarytext truncate mt-0.5">${escapeHtmlSafe(origin.label)} → ${escapeHtmlSafe(destination.label)}</p>
          </div>
          <button type="button" id="maps-clear-route-btn" class="tactile-btn px-2.5 py-1.5 rounded-lg bg-pillbg border border-borderline text-[11px] font-semibold text-secondarytext hover:text-primarytext flex-shrink-0">
            Clear
          </button>
        </div>
      `;
      summaryEl.classList.remove('hidden');
      document.getElementById('maps-clear-route-btn')?.addEventListener('click', clearRouteOverlays);
    }
    setMapsStatusBanner('');
  } catch (err) {
    console.error('Route.computeRoutes failed:', err);
    if (isQuotaError(err)) {
      triggerQuotaWarning();
      setMapsStatusBanner('Google Maps quota reached while computing route.', 'error');
    } else {
      setMapsStatusBanner('Unable to calculate route for this travel mode. Try another mode or destination.', 'error');
    }
  }
}

async function locateCurrentUser() {
  if (!navigator.geolocation) {
    setMapsStatusBanner('Geolocation is not supported by your browser.', 'warn');
    return;
  }
  setMapsStatusBanner('Requesting your current location...', 'info');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const coords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
      mapsUiState.userPosition = coords;
      try {
        const map = await ensureMapInitialized();
        const { AdvancedMarkerElement } = await window.google.maps.importLibrary('marker');

        if (userLocationMarker) {
          userLocationMarker.map = null;
          userLocationMarker = null;
        }
        const dot = document.createElement('div');
        dot.style.width = '16px';
        dot.style.height = '16px';
        dot.style.borderRadius = '9999px';
        dot.style.backgroundColor = '#4285F4';
        dot.style.border = '3px solid #FFFFFF';
        dot.style.boxShadow = '0 0 0 5px rgba(66, 133, 244, 0.28)';

        userLocationMarker = new AdvancedMarkerElement({
          map,
          position: coords,
          title: 'Your current location',
        });
        userLocationMarker.append(dot);

        map.panTo(coords);
        map.setZoom(14);
        populateRouteSelectors();
        setMapsStatusBanner('Centered on your current location.', 'ok');
      } catch (err) {
        console.error('Failed to place user location marker:', err);
        setMapsStatusBanner('Location found, but map failed to initialize.', 'error');
      }
    },
    (geoErr) => {
      const msg =
        geoErr?.code === 1
          ? 'Location permission was declined.'
          : 'Unable to determine your current location.';
      setMapsStatusBanner(msg, 'warn');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ============================================================================
// OPT-IN LIVE LOCATION PRESENCE TRACKER (TASK VERIFICATION & AUTOMATIONS)
// ============================================================================
function emitLiveLocationUpdate() {
  if (typeof window.onLiveLocationPositionUpdate === 'function') {
    window.onLiveLocationPositionUpdate({
      active: liveLocationState.active,
      position: liveLocationState.position ? { ...liveLocationState.position } : null,
      error: liveLocationState.error,
      updatedAt: liveLocationState.updatedAt,
    });
  }
}

function startLiveLocationTracking() {
  if (!navigator.geolocation) {
    liveLocationState.active = false;
    liveLocationState.error = 'Geolocation is not supported in this browser.';
    emitLiveLocationUpdate();
    return false;
  }
  if (liveLocationState.watchId !== null) {
    liveLocationState.active = true;
    emitLiveLocationUpdate();
    return true;
  }

  liveLocationState.active = true;
  liveLocationState.error = '';
  emitLiveLocationUpdate();

  liveLocationState.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const coords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy || 0),
        timestamp: pos.timestamp || Date.now(),
      };
      liveLocationState.position = coords;
      liveLocationState.updatedAt = Date.now();
      liveLocationState.error = '';
      mapsUiState.userPosition = { lat: coords.lat, lng: coords.lng };
      emitLiveLocationUpdate();
    },
    (geoErr) => {
      if (geoErr?.code === 1) {
        liveLocationState.error = 'Location permission denied.';
        stopLiveLocationTracking(true);
      } else {
        liveLocationState.error = 'Waiting for GPS signal...';
        emitLiveLocationUpdate();
      }
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
  return true;
}

function stopLiveLocationTracking(preserveError = false) {
  if (liveLocationState.watchId !== null && navigator.geolocation) {
    try {
      navigator.geolocation.clearWatch(liveLocationState.watchId);
    } catch (_) {}
  }
  liveLocationState.watchId = null;
  liveLocationState.active = false;
  if (!preserveError) liveLocationState.error = '';
  emitLiveLocationUpdate();
}

function toggleLiveLocationTracking() {
  if (liveLocationState.active) {
    stopLiveLocationTracking();
    return false;
  }
  return startLiveLocationTracking();
}

function getLiveLocationState() {
  return {
    active: liveLocationState.active,
    position: liveLocationState.position ? { ...liveLocationState.position } : null,
    error: liveLocationState.error,
    updatedAt: liveLocationState.updatedAt,
  };
}

// ============================================================================
// PLACES API (NEW) AUTOCOMPLETE — SESSION TOKEN MANAGEMENT
// ============================================================================
function attachPlacesAutocomplete({ inputEl, listEl, statePrefix, onPlaceSelected }) {
  if (!inputEl || !listEl || inputEl.dataset.placesBound === 'true') return;
  inputEl.dataset.placesBound = 'true';

  let debounceTimer = null;

  const hideList = () => {
    listEl.classList.add('hidden');
    listEl.innerHTML = '';
  };

  inputEl.addEventListener('input', () => {
    const query = inputEl.value.trim();
    clearTimeout(debounceTimer);
    if (query.length < 2) {
      hideList();
      return;
    }

    debounceTimer = setTimeout(async () => {
      const reqKey = `${statePrefix}RequestId`;
      const tokKey = `${statePrefix}SessionToken`;
      const requestId = ++mapsUiState[reqKey];

      try {
        await ensureGoogleMapsLoaded();
        const { AutocompleteSuggestion, AutocompleteSessionToken } =
          await window.google.maps.importLibrary('places');

        if (!mapsUiState[tokKey]) {
          mapsUiState[tokKey] = new AutocompleteSessionToken();
        }

        const request = {
          input: query,
          sessionToken: mapsUiState[tokKey],
          internalUsageAttributionIds: GMP_ATTRIBUTION_IDS,
        };

        if (mapInstance) {
          const center = mapInstance.getCenter();
          if (center) {
            request.origin = center;
          }
        }

        const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        if (requestId !== mapsUiState[reqKey]) return;

        const suggestions = response?.suggestions || [];
        if (suggestions.length === 0) {
          hideList();
          return;
        }

        listEl.innerHTML = '';
        suggestions.slice(0, 5).forEach((suggestion) => {
          const pred = suggestion?.placePrediction;
          if (!pred) return;

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className =
            'w-full text-left px-3 py-2 text-xs text-primarytext hover:bg-pillbg transition flex items-start gap-2 border-b border-borderline/60 last:border-b-0';

          const pinSpan = document.createElement('span');
          pinSpan.className = 'text-coral mt-0.5 flex-shrink-0';
          pinSpan.textContent = '•';

          const textWrap = document.createElement('div');
          textWrap.className = 'min-w-0';
          const mainText = document.createElement('p');
          mainText.className = 'font-medium text-primarytext truncate';
          mainText.textContent = pred.mainText?.text || pred.text?.toString() || '';

          const secText = document.createElement('p');
          secText.className = 'text-[10.5px] text-secondarytext truncate';
          secText.textContent = pred.secondaryText?.text || '';

          textWrap.append(mainText);
          if (secText.textContent) textWrap.append(secText);
          btn.append(pinSpan, textWrap);

          btn.addEventListener('pointerdown', (ev) => {
            ev.preventDefault();
          });

          btn.addEventListener('click', async () => {
            hideList();
            try {
              const place = pred.toPlace();
              await place.fetchFields({
                fields: ['id', 'displayName', 'formattedAddress', 'location'],
              });
              // Concluded session — immediately rotate token per billing best practice
              mapsUiState[tokKey] = new AutocompleteSessionToken();

              const label =
                place.displayName && place.formattedAddress && !place.formattedAddress.startsWith(place.displayName)
                  ? `${place.displayName}, ${place.formattedAddress}`
                  : place.formattedAddress || place.displayName || pred.text?.toString() || query;
              const lat = place.location ? place.location.lat() : null;
              const lng = place.location ? place.location.lng() : null;

              onPlaceSelected({
                label,
                placeId: place.id || '',
                lat,
                lng,
              });
            } catch (fetchErr) {
              console.error('place.fetchFields failed:', fetchErr);
              if (isQuotaError(fetchErr)) {
                triggerQuotaWarning();
              }
            }
          });

          listEl.appendChild(btn);
        });

        listEl.classList.remove('hidden');
      } catch (err) {
        if (requestId !== mapsUiState[reqKey]) return;
        console.error('Places AutocompleteSuggestion failed:', err);
        if (isQuotaError(err)) {
          triggerQuotaWarning();
        }
        hideList();
      }
    }, 240);
  });

  document.addEventListener('pointerdown', (e) => {
    if (!inputEl.contains(e.target) && !listEl.contains(e.target)) {
      hideList();
    }
  });
}

async function openMapsModal(options = {}) {
  const modal = document.getElementById('maps-explorer-modal');
  if (!modal) return;

  mapsUiState.mode =
    options.mode === 'pick-task-location' || options.mode === 'pick-automation-location'
      ? options.mode
      : 'explore';
  mapsUiState.selectedPlace = null;
  clearRouteOverlays();

  const subtitleEl = document.getElementById('maps-modal-subtitle');
  const pickBar = document.getElementById('maps-pick-confirm-bar');
  const searchInput = document.getElementById('maps-search-input');

  if (pickBar) pickBar.classList.add('hidden');
  if (searchInput) searchInput.value = options.initialQuery || '';

  if (subtitleEl) {
    subtitleEl.textContent =
      mapsUiState.mode === 'pick-task-location'
        ? 'Search a place or tap anywhere on the map to pin it to your task'
        : mapsUiState.mode === 'pick-automation-location'
          ? 'Search a place or tap anywhere on the map to set your automation location trigger'
          : 'Day locations, place search, and live commute routes';
  }

  modal.classList.remove('hidden');
  setMapsStatusBanner('Loading Google Maps...', 'info');

  try {
    await ensureMapInitialized();
    setMapsStatusBanner('');

    if (
      typeof options.initialLat === 'number' &&
      typeof options.initialLng === 'number' &&
      Number.isFinite(options.initialLat) &&
      Number.isFinite(options.initialLng)
    ) {
      await placeSelectionPin({
        label: options.initialLabel || `${options.initialLat.toFixed(4)}, ${options.initialLng.toFixed(4)}`,
        placeId: options.initialPlaceId || '',
        lat: options.initialLat,
        lng: options.initialLng,
      });
    } else if (pickedMarker) {
      pickedMarker.map = null;
      pickedMarker = null;
    }

    await renderTaskPinsOnMap(options.focusTaskId ?? null);
  } catch (err) {
    console.error('Maps modal initialization failed:', err);
    if (isQuotaError(err)) {
      triggerQuotaWarning();
    }
    setMapsStatusBanner(
      err?.message || 'Unable to load Google Maps right now. Please check your connection or API key.',
      'error'
    );
  }
}

function closeMapsModal() {
  document.getElementById('maps-explorer-modal')?.classList.add('hidden');
}

// ============================================================================
// FIREBASE AUTH + GOOGLE DRIVE INTEGRATION (IN-MEMORY TOKEN ONLY)
// ============================================================================
let firebaseAuth = null;
let googleProvider = null;
let isSigningIn = false;
// STRICT SECURITY: Cached strictly in module memory. NEVER stored in localStorage/sessionStorage.
let cachedAccessToken = null;
let currentGoogleUser = null;

const driveUiState = {
  activeTab: 'backup', // 'backup' | 'files'
  attachTarget: null, // null | 'task' | 'project' | 'routine-note'
  attachNoteId: null,
  backups: [],
  files: [],
  pendingConfirmAction: null,
};

async function ensureFirebaseAuthInitialized() {
  if (firebaseAuth && googleProvider) return { auth: firebaseAuth, provider: googleProvider };

  const cfg = await getClientConfig();
  if (!cfg?.firebaseConfig?.apiKey) {
    throw new Error('Firebase web configuration is missing.');
  }

  const app = getApps().length > 0 ? getApps()[0] : initializeApp(cfg.firebaseConfig);
  firebaseAuth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  DRIVE_SCOPES.forEach((scope) => googleProvider.addScope(scope));

  onAuthStateChanged(firebaseAuth, (user) => {
    if (user) {
      if (cachedAccessToken) {
        currentGoogleUser = user;
      } else if (!isSigningIn) {
        // Reloaded session has no in-memory OAuth access token -> require fresh Google sign-in
        cachedAccessToken = null;
        currentGoogleUser = null;
      }
    } else {
      cachedAccessToken = null;
      currentGoogleUser = null;
    }
    syncDriveAuthUI();
  });

  return { auth: firebaseAuth, provider: googleProvider };
}

function isDriveConnected() {
  return Boolean(currentGoogleUser && cachedAccessToken);
}

async function signInWithGoogleForDrive() {
  setDriveStatus('Opening Google sign-in...', 'info');
  try {
    const { auth, provider } = await ensureFirebaseAuthInitialized();
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google Drive access token was not returned. Please try again.');
    }
    cachedAccessToken = credential.accessToken;
    currentGoogleUser = result.user;
    syncDriveAuthUI();
    setDriveStatus(`Connected as ${result.user.email || result.user.displayName || 'Google Account'}.`, 'ok');
    await Promise.all([refreshDriveBackups(), refreshDriveFiles('')]);
  } catch (err) {
    console.error('Google Drive sign-in error:', err);
    const code = err?.code || '';
    if (code === 'auth/popup-closed-by-user') {
      setDriveStatus('Sign-in was canceled.', 'warn');
    } else if (code === 'auth/popup-blocked') {
      setDriveStatus('Pop-up blocked by browser. Allow pop-ups for this site and try again.', 'error');
    } else {
      setDriveStatus(err?.message || 'Unable to sign in with Google.', 'error');
    }
  } finally {
    isSigningIn = false;
  }
}

async function signOutFromGoogleDrive() {
  try {
    const { auth } = await ensureFirebaseAuthInitialized();
    await firebaseSignOut(auth);
  } catch (err) {
    console.warn('Sign out warning:', err);
  } finally {
    cachedAccessToken = null;
    currentGoogleUser = null;
    driveUiState.backups = [];
    driveUiState.files = [];
    syncDriveAuthUI();
    setDriveStatus('Signed out of Google Drive.', 'info');
  }
}

async function driveFetch(url, options = {}) {
  if (!cachedAccessToken) {
    throw new Error('AUTH_REQUIRED');
  }
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${cachedAccessToken}`);

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    cachedAccessToken = null;
    currentGoogleUser = null;
    syncDriveAuthUI();
    throw new Error('AUTH_EXPIRED');
  }
  if (!res.ok) {
    let errDetail = `Drive request failed (${res.status})`;
    try {
      const json = await res.json();
      if (json?.error?.message) errDetail = json.error.message;
    } catch (_) {}
    throw new Error(errDetail);
  }
  return res;
}

function setDriveStatus(message, tone = 'info') {
  const el = document.getElementById('drive-status-banner');
  if (!el) return;
  if (!message) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.classList.remove('hidden', 'text-secondarytext', 'text-coral', 'text-amber', 'text-lime');
  if (tone === 'error') el.classList.add('text-coral');
  else if (tone === 'warn') el.classList.add('text-amber');
  else if (tone === 'ok') el.classList.add('text-lime');
  else el.classList.add('text-secondarytext');
  el.textContent = message;
}

function syncDriveAuthUI() {
  const connected = isDriveConnected();
  const signedOutBox = document.getElementById('drive-auth-signed-out');
  const signedInBox = document.getElementById('drive-auth-signed-in');
  const userNameEl = document.getElementById('drive-user-name');
  const userEmailEl = document.getElementById('drive-user-email');
  const contentArea = document.getElementById('drive-connected-workspace');
  const settingsSummary = document.getElementById('settings-drive-summary');

  if (signedOutBox) signedOutBox.classList.toggle('hidden', connected);
  if (signedInBox) signedInBox.classList.toggle('hidden', !connected);
  if (contentArea) contentArea.classList.toggle('hidden', !connected);

  if (connected && currentGoogleUser) {
    if (userNameEl) userNameEl.textContent = currentGoogleUser.displayName || 'Google Account';
    if (userEmailEl) userEmailEl.textContent = currentGoogleUser.email || '';
    if (settingsSummary) settingsSummary.textContent = `Connected • ${currentGoogleUser.email || 'Google Drive'}`;
  } else {
    if (settingsSummary) settingsSummary.textContent = 'Sign in to back up & attach Drive files';
  }

  const railDot = document.getElementById('dnav-drive-dot');
  if (railDot) railDot.classList.toggle('hidden', !connected);
}

function switchDriveTab(tab) {
  driveUiState.activeTab = tab === 'files' ? 'files' : 'backup';
  const backupBtn = document.getElementById('drive-tab-backup-btn');
  const filesBtn = document.getElementById('drive-tab-files-btn');
  const backupPanel = document.getElementById('drive-panel-backup');
  const filesPanel = document.getElementById('drive-panel-files');

  const isBackup = driveUiState.activeTab === 'backup';
  if (backupBtn) {
    backupBtn.classList.toggle('bg-coral', isBackup);
    backupBtn.classList.toggle('text-onaccent', isBackup);
    backupBtn.classList.toggle('text-secondarytext', !isBackup);
  }
  if (filesBtn) {
    filesBtn.classList.toggle('bg-coral', !isBackup);
    filesBtn.classList.toggle('text-onaccent', !isBackup);
    filesBtn.classList.toggle('text-secondarytext', isBackup);
  }
  if (backupPanel) backupPanel.classList.toggle('hidden', !isBackup);
  if (filesPanel) filesPanel.classList.toggle('hidden', isBackup);
}

// ============================================================================
// MANDATORY CUSTOM CONFIRMATION MODAL FOR ALL DRIVE MUTATIONS
// ============================================================================
function openDriveConfirmModal({ title, description, confirmLabel, tone = 'coral', onConfirm }) {
  const modal = document.getElementById('drive-confirm-modal');
  const titleEl = document.getElementById('drive-confirm-title');
  const descEl = document.getElementById('drive-confirm-desc');
  const confirmBtn = document.getElementById('drive-confirm-proceed-btn');
  if (!modal || !titleEl || !descEl || !confirmBtn) return;

  titleEl.textContent = title;
  descEl.textContent = description;
  confirmBtn.textContent = confirmLabel || 'Confirm';
  confirmBtn.classList.remove('bg-coral', 'text-onaccent', 'bg-red-500', 'text-white');
  if (tone === 'danger') {
    confirmBtn.classList.add('bg-red-500', 'text-white');
  } else {
    confirmBtn.classList.add('bg-coral', 'text-onaccent');
  }

  driveUiState.pendingConfirmAction = onConfirm;
  modal.classList.remove('hidden');
}

function closeDriveConfirmModal() {
  driveUiState.pendingConfirmAction = null;
  document.getElementById('drive-confirm-modal')?.classList.add('hidden');
}

async function confirmDrivePendingAction() {
  const fn = driveUiState.pendingConfirmAction;
  closeDriveConfirmModal();
  if (typeof fn === 'function') {
    await fn();
  }
}

// ============================================================================
// GOOGLE DRIVE CLOUD BACKUP & RESTORE (drive.file)
// ============================================================================
function formatDriveTimestamp(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch (_) {
    return iso;
  }
}

function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function refreshDriveBackups() {
  if (!isDriveConnected()) return;
  const listEl = document.getElementById('drive-backups-list');
  if (listEl) {
    listEl.innerHTML = `<p class="text-xs text-secondarytext py-3 text-center">Loading backups from Google Drive...</p>`;
  }

  try {
    const q = `name contains '${BACKUP_FILE_PREFIX}' and trashed = false`;
    const url =
      `https://www.googleapis.com/drive/v3/files?` +
      new URLSearchParams({
        q,
        fields: 'files(id,name,modifiedTime,size,webViewLink)',
        orderBy: 'modifiedTime desc',
        pageSize: '15',
      }).toString();

    const res = await driveFetch(url);
    const data = await res.json();
    driveUiState.backups = Array.isArray(data?.files) ? data.files : [];
    renderDriveBackupsList();
  } catch (err) {
    console.error('Failed to list Drive backups:', err);
    if (err.message === 'AUTH_EXPIRED' || err.message === 'AUTH_REQUIRED') {
      setDriveStatus('Session expired. Please sign in with Google again.', 'warn');
    } else {
      setDriveStatus(`Unable to load backups: ${err.message}`, 'error');
    }
    if (listEl) listEl.innerHTML = '';
  }
}

function renderDriveBackupsList() {
  const listEl = document.getElementById('drive-backups-list');
  if (!listEl) return;

  if (driveUiState.backups.length === 0) {
    listEl.innerHTML = `
      <div class="text-xs text-secondarytext bg-pillbg/60 border border-borderline rounded-xl px-3.5 py-3 text-center">
        No planner backups found in Google Drive yet. Click <strong>Save Backup to Drive</strong> above to create your first snapshot.
      </div>
    `;
    return;
  }

  listEl.innerHTML = driveUiState.backups
    .map(
      (file) => `
      <div class="bg-cardbg border border-borderline rounded-xl px-3.5 py-3 flex items-center justify-between gap-2.5">
        <div class="min-w-0">
          <p class="text-xs font-semibold text-primarytext truncate">${escapeHtmlSafe(file.name)}</p>
          <p class="text-[11px] text-secondarytext mt-0.5">${escapeHtmlSafe(formatDriveTimestamp(file.modifiedTime))}${file.size ? ` • ${escapeHtmlSafe(formatFileSize(file.size))}` : ''}</p>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            data-drive-restore="${escapeHtmlSafe(file.id)}"
            class="tactile-btn px-2.5 py-1.5 rounded-lg bg-pillbg border border-borderline hover:border-coral text-[11px] font-semibold text-primarytext"
          >
            Restore
          </button>
          <button
            type="button"
            data-drive-delete="${escapeHtmlSafe(file.id)}"
            class="tactile-btn px-2 py-1.5 rounded-lg bg-pillbg border border-borderline hover:border-red-500/60 text-[11px] font-semibold text-red-400"
            title="Delete backup from Google Drive"
          >
            Delete
          </button>
        </div>
      </div>
    `
    )
    .join('');

  listEl.querySelectorAll('button[data-drive-restore]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-drive-restore');
      const file = driveUiState.backups.find((f) => f.id === id);
      if (!file) return;
      openDriveConfirmModal({
        title: 'Restore Backup from Google Drive?',
        description: `Restoring "${file.name}" (updated ${formatDriveTimestamp(file.modifiedTime)}) will replace your current local tasks, projects, habits, and journal entries on this device.`,
        confirmLabel: 'Restore Backup',
        tone: 'coral',
        onConfirm: () => executeRestoreBackup(file),
      });
    });
  });

  listEl.querySelectorAll('button[data-drive-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-drive-delete');
      const file = driveUiState.backups.find((f) => f.id === id);
      if (!file) return;
      openDriveConfirmModal({
        title: 'Delete Backup from Google Drive?',
        description: `Permanently delete "${file.name}" from your Google Drive? This action cannot be undone.`,
        confirmLabel: 'Delete File',
        tone: 'danger',
        onConfirm: () => executeDeleteBackup(file),
      });
    });
  });
}

function buildPlannerBackupJson() {
  if (typeof window.exportPlannerBackupPayload === 'function') {
    return JSON.stringify(window.exportPlannerBackupPayload(), null, 2);
  }
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      stateRaw: localStorage.getItem('structured_timeline_state_v1') || null,
      horizonRaw: localStorage.getItem('structured_timeline_horizon_v1') || null,
    },
    null,
    2
  );
}

function requestSavePlannerBackup() {
  if (!isDriveConnected()) {
    setDriveStatus('Sign in with Google first to save a cloud backup.', 'warn');
    return;
  }

  const existingDefault = driveUiState.backups.find((f) => f.name === DEFAULT_BACKUP_FILENAME);
  if (existingDefault) {
    openDriveConfirmModal({
      title: 'Overwrite Existing Google Drive Backup?',
      description: `This will overwrite "${existingDefault.name}" (last updated ${formatDriveTimestamp(existingDefault.modifiedTime)}) in your Google Drive with your current planner data.`,
      confirmLabel: 'Overwrite Backup',
      tone: 'coral',
      onConfirm: () => executeSaveBackup(existingDefault.id),
    });
  } else {
    void executeSaveBackup(null);
  }
}

async function executeSaveBackup(existingFileId = null) {
  setDriveStatus(existingFileId ? 'Updating backup in Google Drive...' : 'Creating backup in Google Drive...', 'info');
  try {
    const content = buildPlannerBackupJson();
    const metadata = existingFileId
      ? { name: DEFAULT_BACKUP_FILENAME, mimeType: 'application/json' }
      : { name: DEFAULT_BACKUP_FILENAME, mimeType: 'application/json' };

    const boundary = 'structured_planner_boundary_' + Date.now();
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;

    const endpoint = existingFileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingFileId)}?uploadType=multipart&fields=id,name,modifiedTime,size`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size`;

    await driveFetch(endpoint, {
      method: existingFileId ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    setDriveStatus(`Saved "${DEFAULT_BACKUP_FILENAME}" to Google Drive.`, 'ok');
    await refreshDriveBackups();
  } catch (err) {
    console.error('Save backup failed:', err);
    setDriveStatus(`Backup failed: ${err.message}`, 'error');
  }
}

async function executeRestoreBackup(file) {
  setDriveStatus(`Downloading "${file.name}"...`, 'info');
  try {
    const res = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`
    );
    const payload = await res.json();
    if (typeof window.applyRestoredPlannerBackup === 'function') {
      window.applyRestoredPlannerBackup(payload);
    }
    setDriveStatus(`Restored planner data from "${file.name}".`, 'ok');
  } catch (err) {
    console.error('Restore backup failed:', err);
    setDriveStatus(`Restore failed: ${err.message}`, 'error');
  }
}

async function executeDeleteBackup(file) {
  setDriveStatus(`Deleting "${file.name}"...`, 'info');
  try {
    await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`, {
      method: 'DELETE',
    });
    setDriveStatus(`Deleted "${file.name}" from Google Drive.`, 'ok');
    await refreshDriveBackups();
  } catch (err) {
    console.error('Delete backup failed:', err);
    setDriveStatus(`Delete failed: ${err.message}`, 'error');
  }
}

// ============================================================================
// STICKY NOTE MARKDOWN EXPORT TO GOOGLE DRIVE (drive.file)
// ============================================================================
async function executeUploadStickyNoteMarkdown({ filename, markdownContent, existingFileId = null }) {
  try {
    const metadata = { name: filename, mimeType: 'text/markdown' };
    const boundary = 'structured_note_boundary_' + Date.now();
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: text/markdown; charset=UTF-8\r\n\r\n` +
      `${markdownContent}\r\n` +
      `--${boundary}--`;

    const endpoint = existingFileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingFileId)}?uploadType=multipart&fields=id,name,webViewLink,modifiedTime`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,modifiedTime`;

    const res = await driveFetch(endpoint, {
      method: existingFileId ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    const savedFile = await res.json();
    if (typeof window.showPlannerToast === 'function') {
      window.showPlannerToast(
        existingFileId ? `Updated "${filename}" in Google Drive` : `Saved "${filename}" to Google Drive`,
        'ok'
      );
    }
    return savedFile;
  } catch (err) {
    console.error('Export sticky note to Drive failed:', err);
    if (typeof window.showPlannerToast === 'function') {
      window.showPlannerToast(`Google Drive export failed: ${err.message}`, 'error');
    }
    return null;
  }
}

async function exportStickyNoteToDrive({ filename, markdownContent, noteTitle }) {
  if (!isDriveConnected()) {
    await openDriveHubModal({ tab: 'backup' });
    setDriveStatus(`Sign in with Google to save "${noteTitle || filename}" to Google Drive.`, 'warn');
    return null;
  }

  try {
    const escaped = String(filename || 'structured-note.md').replace(/'/g, "\\'");
    const checkUrl =
      `https://www.googleapis.com/drive/v3/files?` +
      new URLSearchParams({
        q: `name = '${escaped}' and trashed = false`,
        fields: 'files(id,name,modifiedTime)',
        pageSize: '3',
      }).toString();

    const checkRes = await driveFetch(checkUrl);
    const checkData = await checkRes.json();
    const existing = Array.isArray(checkData?.files) && checkData.files.length > 0 ? checkData.files[0] : null;

    if (existing) {
      openDriveConfirmModal({
        title: 'Overwrite Note in Google Drive?',
        description: `"${existing.name}" already exists in your Google Drive (updated ${formatDriveTimestamp(existing.modifiedTime)}). Replace it with the latest steps from "${noteTitle || existing.name}"?`,
        confirmLabel: 'Overwrite Note',
        tone: 'coral',
        onConfirm: () =>
          executeUploadStickyNoteMarkdown({
            filename,
            markdownContent,
            existingFileId: existing.id,
          }),
      });
      return null;
    }

    return await executeUploadStickyNoteMarkdown({
      filename,
      markdownContent,
      existingFileId: null,
    });
  } catch (err) {
    console.error('Drive sticky note check failed:', err);
    if (err.message === 'AUTH_EXPIRED' || err.message === 'AUTH_REQUIRED') {
      await openDriveHubModal({ tab: 'backup' });
      setDriveStatus('Google Drive session expired. Please sign in again.', 'warn');
    } else if (typeof window.showPlannerToast === 'function') {
      window.showPlannerToast(`Unable to save note to Drive: ${err.message}`, 'error');
    }
    return null;
  }
}

// ============================================================================
// GOOGLE DRIVE FILE BROWSER & ATTACHMENT PICKER (drive.readonly)
// ============================================================================
function getFriendlyMimeLabel(mimeType) {
  if (!mimeType) return 'File';
  if (mimeType.includes('document')) return 'Google Doc';
  if (mimeType.includes('spreadsheet')) return 'Google Sheet';
  if (mimeType.includes('presentation')) return 'Google Slides';
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('folder')) return 'Folder';
  if (mimeType.includes('image/')) return 'Image';
  if (mimeType.includes('json')) return 'JSON';
  return 'Drive File';
}

async function refreshDriveFiles(queryText = '') {
  if (!isDriveConnected()) return;
  const listEl = document.getElementById('drive-files-list');
  if (listEl) {
    listEl.innerHTML = `<p class="text-xs text-secondarytext py-4 text-center">Searching your Google Drive...</p>`;
  }

  try {
    const clean = String(queryText || '').trim().replace(/'/g, "\\'");
    const qParts = ['trashed = false', "mimeType != 'application/vnd.google-apps.folder'"];
    if (clean) {
      qParts.push(`name contains '${clean}'`);
    }

    const url =
      `https://www.googleapis.com/drive/v3/files?` +
      new URLSearchParams({
        q: qParts.join(' and '),
        fields: 'files(id,name,mimeType,modifiedTime,webViewLink,iconLink)',
        orderBy: 'modifiedTime desc',
        pageSize: '25',
      }).toString();

    const res = await driveFetch(url);
    const data = await res.json();
    driveUiState.files = Array.isArray(data?.files) ? data.files : [];
    renderDriveFilesList();
  } catch (err) {
    console.error('Drive files list error:', err);
    if (err.message === 'AUTH_EXPIRED' || err.message === 'AUTH_REQUIRED') {
      setDriveStatus('Please sign in with Google to browse your Drive files.', 'warn');
    } else {
      setDriveStatus(`Unable to list Drive files: ${err.message}`, 'error');
    }
    if (listEl) listEl.innerHTML = '';
  }
}

function renderDriveFilesList() {
  const listEl = document.getElementById('drive-files-list');
  if (!listEl) return;

  if (driveUiState.files.length === 0) {
    listEl.innerHTML = `
      <div class="text-xs text-secondarytext bg-pillbg/60 border border-borderline rounded-xl px-3.5 py-4 text-center">
        No matching files found in your Google Drive.
      </div>
    `;
    return;
  }

  const hasAttachTarget =
    driveUiState.attachTarget === 'task' ||
    driveUiState.attachTarget === 'project' ||
    driveUiState.attachTarget === 'routine-note';
  const targetLabel =
    driveUiState.attachTarget === 'project'
      ? 'Attach to Project'
      : driveUiState.attachTarget === 'routine-note'
        ? 'Attach to Note'
        : 'Attach to Task';

  listEl.innerHTML = driveUiState.files
    .map(
      (file) => `
      <div class="bg-cardbg border border-borderline rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2.5">
        <div class="flex items-center gap-2.5 min-w-0">
          ${
            file.iconLink
              ? `<img src="${escapeHtmlSafe(file.iconLink)}" alt="" class="w-4 h-4 flex-shrink-0 rounded-sm" />`
              : `<span class="w-4 h-4 rounded bg-pillbg border border-borderline flex-shrink-0"></span>`
          }
          <div class="min-w-0">
            <p class="text-xs font-semibold text-primarytext truncate">${escapeHtmlSafe(file.name)}</p>
            <p class="text-[10.5px] text-secondarytext truncate">${escapeHtmlSafe(getFriendlyMimeLabel(file.mimeType))} • ${escapeHtmlSafe(formatDriveTimestamp(file.modifiedTime))}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          ${
            hasAttachTarget
              ? `<button
                  type="button"
                  data-drive-attach="${escapeHtmlSafe(file.id)}"
                  class="tactile-btn px-2.5 py-1.5 rounded-lg bg-coral text-onaccent text-[11px] font-bold"
                >
                  ${targetLabel}
                </button>`
              : ''
          }
          ${
            file.webViewLink
              ? `<a
                  href="${escapeHtmlSafe(file.webViewLink)}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="tactile-btn px-2.5 py-1.5 rounded-lg bg-pillbg border border-borderline hover:border-coral text-[11px] font-semibold text-secondarytext hover:text-primarytext"
                >
                  Open
                </a>`
              : ''
          }
        </div>
      </div>
    `
    )
    .join('');

  if (hasAttachTarget) {
    listEl.querySelectorAll('button[data-drive-attach]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-drive-attach');
        const file = driveUiState.files.find((f) => f.id === id);
        if (!file) return;
        const cleanFile = {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType || '',
          webViewLink: file.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`,
          iconLink: file.iconLink || '',
        };
        if (typeof window.attachDriveFileToTarget === 'function') {
          window.attachDriveFileToTarget(driveUiState.attachTarget, cleanFile, driveUiState.attachNoteId);
        }
        closeDriveHubModal();
      });
    });
  }
}

async function openDriveHubModal(options = {}) {
  const modal = document.getElementById('drive-hub-modal');
  if (!modal) return;

  driveUiState.attachTarget = options.attachTarget || null;
  driveUiState.attachNoteId = options.noteId ?? null;
  const targetTab = options.tab || (driveUiState.attachTarget ? 'files' : 'backup');
  switchDriveTab(targetTab);

  const attachBanner = document.getElementById('drive-attach-context-banner');
  if (attachBanner) {
    if (driveUiState.attachTarget === 'task') {
      attachBanner.textContent = 'Select a Google Drive file below to attach to your task.';
      attachBanner.classList.remove('hidden');
    } else if (driveUiState.attachTarget === 'project') {
      attachBanner.textContent = 'Select a Google Drive file below to attach to your project.';
      attachBanner.classList.remove('hidden');
    } else if (driveUiState.attachTarget === 'routine-note') {
      attachBanner.textContent = 'Select a Google Drive file below to attach to your step-by-step sticky note.';
      attachBanner.classList.remove('hidden');
    } else {
      attachBanner.classList.add('hidden');
    }
  }

  modal.classList.remove('hidden');
  setDriveStatus('');

  try {
    await ensureFirebaseAuthInitialized();
    syncDriveAuthUI();
    if (isDriveConnected()) {
      await Promise.all([
        refreshDriveBackups(),
        refreshDriveFiles(document.getElementById('drive-files-search-input')?.value || ''),
      ]);
    }
  } catch (err) {
    console.error('Drive modal init error:', err);
    setDriveStatus(err?.message || 'Unable to initialize Google Drive authentication.', 'error');
  }
}

function closeDriveHubModal() {
  driveUiState.attachTarget = null;
  driveUiState.attachNoteId = null;
  document.getElementById('drive-hub-modal')?.classList.add('hidden');
}

// ============================================================================
// DOM WIRING & PUBLIC BRIDGE
// ============================================================================
function wireDomControls() {
  if (quotaWarningActive) showQuotaBannerIfPresent();

  // Task Modal Location Autocomplete (Places API New)
  const taskLocInput = document.getElementById('modal-task-location');
  const taskLocList = document.getElementById('modal-location-suggestions');
  if (taskLocInput && taskLocList) {
    attachPlacesAutocomplete({
      inputEl: taskLocInput,
      listEl: taskLocList,
      statePrefix: 'taskModal',
      onPlaceSelected: (placeData) => {
        if (typeof window.setTaskModalSelectedPlace === 'function') {
          window.setTaskModalSelectedPlace(placeData);
        }
      },
    });
  }

  // Automation Modal Location Autocomplete (Places API New)
  const autoLocInput = document.getElementById('auto-trigger-location-input');
  const autoLocList = document.getElementById('auto-trigger-location-suggestions');
  if (autoLocInput && autoLocList) {
    attachPlacesAutocomplete({
      inputEl: autoLocInput,
      listEl: autoLocList,
      statePrefix: 'automationModal',
      onPlaceSelected: (placeData) => {
        if (typeof window.setAutomationModalSelectedPlace === 'function') {
          window.setAutomationModalSelectedPlace(placeData);
        }
      },
    });
  }

  // Maps Modal Place Search Autocomplete (Places API New)
  const mapsSearchInput = document.getElementById('maps-search-input');
  const mapsSearchList = document.getElementById('maps-search-suggestions');
  if (mapsSearchInput && mapsSearchList) {
    attachPlacesAutocomplete({
      inputEl: mapsSearchInput,
      listEl: mapsSearchList,
      statePrefix: 'search',
      onPlaceSelected: async (placeData) => {
        mapsSearchInput.value = placeData.label;
        if (placeData.lat !== null && placeData.lng !== null) {
          await placeSelectionPin(placeData);
        }
      },
    });
  }

  // Maps Modal Action Buttons
  document.getElementById('maps-locate-me-btn')?.addEventListener('click', locateCurrentUser);
  document.getElementById('maps-compute-route-btn')?.addEventListener('click', computeAndDrawRoute);
  document.getElementById('maps-pick-apply-btn')?.addEventListener('click', () => {
    if (mapsUiState.selectedPlace) {
      if (
        mapsUiState.mode === 'pick-automation-location' &&
        typeof window.setAutomationModalSelectedPlace === 'function'
      ) {
        window.setAutomationModalSelectedPlace(mapsUiState.selectedPlace);
      } else if (typeof window.setTaskModalSelectedPlace === 'function') {
        window.setTaskModalSelectedPlace(mapsUiState.selectedPlace);
      }
    }
    closeMapsModal();
  });

  // Drive Modal Action Buttons
  document.getElementById('drive-signin-btn')?.addEventListener('click', signInWithGoogleForDrive);
  document.getElementById('drive-signout-btn')?.addEventListener('click', signOutFromGoogleDrive);
  document.getElementById('drive-tab-backup-btn')?.addEventListener('click', () => switchDriveTab('backup'));
  document.getElementById('drive-tab-files-btn')?.addEventListener('click', () => switchDriveTab('files'));
  document.getElementById('drive-save-backup-btn')?.addEventListener('click', requestSavePlannerBackup);
  document.getElementById('drive-refresh-backups-btn')?.addEventListener('click', refreshDriveBackups);
  document.getElementById('drive-confirm-cancel-btn')?.addEventListener('click', closeDriveConfirmModal);
  document.getElementById('drive-confirm-proceed-btn')?.addEventListener('click', confirmDrivePendingAction);

  const driveSearchInput = document.getElementById('drive-files-search-input');
  if (driveSearchInput) {
    let searchTimer = null;
    driveSearchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        void refreshDriveFiles(driveSearchInput.value);
      }, 300);
    });
  }

  // Eagerly initialize Firebase auth listener quietly so UI reflects state cleanly
  ensureFirebaseAuthInitialized().catch(() => {});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireDomControls);
} else {
  wireDomControls();
}

window.GoogleIntegrations = {
  openMapsModal,
  closeMapsModal,
  openDriveHubModal,
  closeDriveHubModal,
  signInWithGoogleForDrive,
  signOutFromGoogleDrive,
  isDriveConnected,
  refreshDriveBackups,
  refreshDriveFiles,
  exportStickyNoteToDrive,
  startLiveLocationTracking,
  stopLiveLocationTracking,
  toggleLiveLocationTracking,
  getLiveLocationState,
};
