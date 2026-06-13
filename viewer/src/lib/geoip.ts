/**
 * geoip — lazy, keyless IP → city/lat-long resolution.
 *
 * The DB captures IP + Cloudflare country at login time (instant, free). City
 * and coordinates are filled in on first VIEW by an admin/teacher via ipwho.is
 * (HTTPS, CORS-enabled, no API key, generous free tier), then persisted back
 * through `set_login_geo` so the next viewer reads them from cache. Keeping the
 * lookup here means no geo-IP key, edge function, or cron is required.
 */
export interface GeoResult {
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  lat?: number;
  lon?: number;
}

interface IpWhoResponse {
  success?: boolean;
  city?: string;
  region?: string;
  country?: string;
  country_code?: string;
  latitude?: number;
  longitude?: number;
}

const cache = new Map<string, GeoResult | null>();

/** Resolve a single IP. Returns null on any failure (never throws). */
export async function lookupIp(ip: string): Promise<GeoResult | null> {
  if (!ip) return null;
  if (cache.has(ip)) return cache.get(ip) ?? null;
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`);
    if (!res.ok) {
      cache.set(ip, null);
      return null;
    }
    const j = (await res.json()) as IpWhoResponse;
    if (!j || j.success === false) {
      cache.set(ip, null);
      return null;
    }
    const out: GeoResult = {
      city: j.city || undefined,
      region: j.region || undefined,
      country: j.country || undefined,
      countryCode: j.country_code || undefined,
      lat: typeof j.latitude === "number" ? j.latitude : undefined,
      lon: typeof j.longitude === "number" ? j.longitude : undefined,
    };
    cache.set(ip, out);
    return out;
  } catch {
    cache.set(ip, null);
    return null;
  }
}
