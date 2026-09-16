/**
 * Geo helpers for photo attendance (geofencing).
 * All distances in meters.
 */
function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// Haversine great-circle distance between two WGS84 points.
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // earth radius (m)
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

function isValidLatitude(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90;
}

function isValidLongitude(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180;
}

function parseCoord(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

module.exports = { haversineMeters, isValidLatitude, isValidLongitude, parseCoord };
