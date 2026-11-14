// Reads coordinates out of what the player typed or pasted. Plain logic, no DOM.
// For map links we only read the numbers in the link text; the link is never opened
// and no map service's data is used.

import type { LatLon } from "@somewhere/world";

const NUMBER = "(-?\\d{1,3}(?:\\.\\d+)?)";
const PAIR = `${NUMBER}\\s*[,\\s]\\s*${NUMBER}`;

const PATTERNS: RegExp[] = [
  // Google Maps: the pinned place, e.g. ...!3d43.5245!4d-79.619
  new RegExp(`!3d${NUMBER}!4d${NUMBER}`),
  // OpenStreetMap: the marker, e.g. ...?mlat=43.5245&mlon=-79.619
  new RegExp(`mlat=${NUMBER}.*?mlon=${NUMBER}`),
  // Google Maps: the middle of the view, e.g. .../@43.5245,-79.619,17z
  new RegExp(`@${NUMBER},${NUMBER}`),
  // Links with the coordinates as a parameter, e.g. ?q=43.5245,-79.619
  new RegExp(`[?&](?:q|ll|query|center|destination)=(?:loc:)?${NUMBER}(?:,|%2C)${NUMBER}`, "i"),
  // OpenStreetMap: the middle of the view, e.g. ...#map=17/43.5245/-79.619
  new RegExp(`#map=\\d+(?:\\.\\d+)?/${NUMBER}/${NUMBER}`),
];
const PLAIN = new RegExp(`^${PAIR}$`);

function valid(lat: number, lon: number): LatLon | undefined {
  const ok =
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  return ok ? { lat, lon } : undefined;
}

/** "43.5245, -79.619", or a map link containing coordinates. Undefined if there are none. */
export function parseLocation(input: string): LatLon | undefined {
  const text = input.trim();
  if (text === "") return undefined;
  const plain = PLAIN.exec(text);
  if (plain) return valid(Number(plain[1]), Number(plain[2]));
  for (const pattern of PATTERNS) {
    const match = pattern.exec(text);
    if (match) return valid(Number(match[1]), Number(match[2]));
  }
  return undefined;
}

export function formatLocation(p: LatLon): string {
  return `${p.lat}, ${p.lon}`;
}
