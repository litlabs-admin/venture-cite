// tests/unit/tourRegistryParity.test.ts
//
// The server validates every inbound tour state-write and event against
// KNOWN_TOUR_IDS. If the client registers a tour the server doesn't know,
// the PATCH/events 400 silently and completions/telemetry are lost. This
// test fails CI on drift so the two lists can never diverge unnoticed.
import { describe, it, expect } from "vitest";
import { listTourIds } from "../../client/src/tours/registry";
import { KNOWN_TOUR_IDS } from "../../server/lib/tourRegistry";

describe("tour registry parity (client ↔ server)", () => {
  it("server KNOWN_TOUR_IDS exactly equals the client registry", () => {
    const client = [...listTourIds()].sort();
    const server = [...KNOWN_TOUR_IDS].sort();
    expect(server).toEqual(client);
  });

  it("has no duplicate ids on either side", () => {
    expect(new Set(listTourIds()).size).toBe(listTourIds().length);
    expect(new Set(KNOWN_TOUR_IDS).size).toBe(KNOWN_TOUR_IDS.length);
  });
});
