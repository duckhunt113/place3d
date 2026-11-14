import { describe, expect, it } from "vitest";
import { formatLocation, parseLocation } from "./location.ts";

const PLACE = { lat: 43.5245, lon: -79.619 };

describe("parseLocation", () => {
  it("reads plain coordinates, with a comma or a space", () => {
    expect(parseLocation("43.5245, -79.619")).toEqual(PLACE);
    expect(parseLocation("43.5245,-79.619")).toEqual(PLACE);
    expect(parseLocation("  43.5245 -79.619  ")).toEqual(PLACE);
    expect(parseLocation("-33.8568, 151.2153")).toEqual({ lat: -33.8568, lon: 151.2153 });
  });

  it("reads the view centre from a Google Maps link", () => {
    expect(parseLocation("https://www.google.com/maps/@43.5245,-79.619,17z")).toEqual(PLACE);
    expect(
      parseLocation("https://www.google.ca/maps/@43.5245,-79.619,17z/data=!3m1!1e3?entry=ttu"),
    ).toEqual(PLACE);
  });

  it("prefers the pinned place over the view centre", () => {
    const link =
      "https://www.google.com/maps/place/Somewhere/@43.6,-79.7,15z/data=!4m6!3m5!1s0x0:0x0!8m2!3d43.5245!4d-79.619!16s";
    expect(parseLocation(link)).toEqual(PLACE);
  });

  it("reads coordinates from link parameters", () => {
    expect(parseLocation("https://maps.google.com/?q=43.5245,-79.619")).toEqual(PLACE);
    expect(parseLocation("https://www.google.com/maps?ll=43.5245,-79.619&z=17")).toEqual(PLACE);
    expect(
      parseLocation("https://www.google.com/maps/search/?api=1&query=43.5245%2C-79.619"),
    ).toEqual(PLACE);
  });

  it("reads OpenStreetMap links", () => {
    expect(parseLocation("https://www.openstreetmap.org/#map=17/43.5245/-79.619")).toEqual(PLACE);
    expect(
      parseLocation("https://www.openstreetmap.org/?mlat=43.5245&mlon=-79.619#map=12/43.6/-79.7"),
    ).toEqual(PLACE);
  });

  it("returns nothing when there are no coordinates", () => {
    for (const text of [
      "",
      "   ",
      "Albertson Crescent",
      "https://maps.app.goo.gl/AbCdEf123",
      "43.5245",
      "abc, def",
    ]) {
      expect(parseLocation(text)).toBeUndefined();
    }
  });

  it("rejects coordinates that are not on Earth", () => {
    expect(parseLocation("91, 10")).toBeUndefined();
    expect(parseLocation("10, 181")).toBeUndefined();
    expect(parseLocation("https://www.google.com/maps/@123.4,-79.6,17z")).toBeUndefined();
  });
});

describe("formatLocation", () => {
  it("writes coordinates the way parseLocation reads them", () => {
    expect(formatLocation(PLACE)).toBe("43.5245, -79.619");
    expect(parseLocation(formatLocation(PLACE))).toEqual(PLACE);
  });
});
