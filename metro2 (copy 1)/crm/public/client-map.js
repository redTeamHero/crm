/* public/client-map.js */

import { api, escapeHtml } from './common.js';

const mapRegistry = new Map();
let locationCache = null;
let pendingRequest = null;

function hasLeaflet(){
  return typeof window !== 'undefined' && typeof window.L !== 'undefined';
}

function waitForLeaflet(){
  if(hasLeaflet()) return Promise.resolve(window.L);
  if(!window.__leafletReady){
    window.__leafletReady = new Promise(resolve => {
      const retry = () => {
        if(hasLeaflet()) resolve(window.L);
        else window.setTimeout(retry, 60);
      };
      retry();
    });
  }
  return window.__leafletReady;
}

function ensureMap(containerId){
  const el = document.getElementById(containerId);
  if(!el) return null;
  el.classList.add('relative');
  if(mapRegistry.has(containerId)){
    const map = mapRegistry.get(containerId);
    window.setTimeout(() => map.invalidateSize(), 120);
    return map;
  }
  const map = window.L.map(el, { zoomControl: true, attributionControl: true }).setView([37.8, -96], 4);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  const layer = window.L.layerGroup().addTo(map);
  map.__markerLayer = layer;
  mapRegistry.set(containerId, map);
  return map;
}

async function fetchClientLocations(forceRefresh = false){
  if(!forceRefresh && locationCache) return locationCache;
  if(!forceRefresh && pendingRequest) return pendingRequest;
  pendingRequest = api('/api/analytics/client-locations').then(res => {
    if(res?.ok && Array.isArray(res.locations)){
      locationCache = res.locations
        .map(loc => ({
          ...loc,
          lat: Number(loc.lat),
          lon: Number(loc.lon),
          status: (loc.status || '').toString().toLowerCase()
        }))
        .filter(loc => Number.isFinite(loc.lat) && Number.isFinite(loc.lon));
      return locationCache;
    }
    console.warn('Unable to load client locations', res?.error || res?.data || res?.status);
    locationCache = [];
    return locationCache;
  }).catch(err => {
    console.error('Client location fetch failed', err);
    locationCache = [];
    return locationCache;
  }).finally(() => {
    pendingRequest = null;
  });
  return pendingRequest;
}

function ensureOverlay(el){
  if(!el) return null;
  let overlay = el.querySelector('.client-map-overlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.className = 'client-map-overlay pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-slate-500 bg-white/70';
    overlay.style.display = 'none';
    el.appendChild(overlay);
  }
  return overlay;
}

function setOverlay(el, message){
  const overlay = ensureOverlay(el);
  if(!overlay) return;
  if(message){
    overlay.textContent = message;
    overlay.style.display = 'flex';
  } else {
    overlay.textContent = '';
    overlay.style.display = 'none';
  }
}

export async function renderClientLocations(containerId, { forceRefresh = false } = {}){
  await waitForLeaflet();
  const el = document.getElementById(containerId);
  if(!el) return;
  const map = ensureMap(containerId);
  if(!map) return;
  const layer = map.__markerLayer;
  if(layer) layer.clearLayers();
  setOverlay(el, 'Loading client locations…');
  const locations = await fetchClientLocations(forceRefresh);
  if(!locations.length){
    map.setView([37.8, -96], 4);
    setOverlay(el, 'No client locations yet. Add addresses to map coverage.');
    return;
  }
  setOverlay(el, null);
  const bounds = [];
  const statusColors = {
    active: '#6366f1',
    completed: '#22c55e',
    won: '#0ea5e9',
    dropped: '#f97316',
    lost: '#ef4444'
  };
  locations.forEach(loc => {
    const color = statusColors[loc.status] || '#6366f1';
    const marker = window.L.circleMarker([loc.lat, loc.lon], {
      radius: 6,
      fillColor: color,
      color: '#312e81',
      weight: 1,
      opacity: 0.85,
      fillOpacity: 0.7
    });
    const name = escapeHtml(loc.name || 'Unnamed');
    const cityState = escapeHtml([loc.city, loc.state].filter(Boolean).join(', '));
    const precision = escapeHtml(loc.precision || 'zip');
    marker.bindPopup(`
      <div class="text-sm font-semibold text-slate-900">${name}</div>
      ${cityState ? `<div class="text-xs text-slate-500 mt-1">${cityState}</div>` : ''}
      <div class="text-[10px] text-slate-400 mt-1">Precision: ${precision.toUpperCase()}</div>
    `);
    marker.addTo(layer || map);
    bounds.push([loc.lat, loc.lon]);
  });
  if(bounds.length){
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 8 });
  } else {
    map.setView([37.8, -96], 4);
  }
  window.setTimeout(() => map.invalidateSize(), 120);
}

export function clearClientLocationsCache(){
  locationCache = null;
}
