import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyShopifyHmac } from "../../server/lib/shopifyWebhook";

const SECRET = "shpss_test_secret_value_xyz";

function sign(rawBody: Buffer | string, secret = SECRET): string {
  const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");
  return createHmac("sha256", secret).update(buf).digest("base64");
}

describe("verifyShopifyHmac", () => {
  it("accepts a correctly signed payload", () => {
    const body = Buffer.from('{"id":12345,"total_price":"19.99"}');
    const sig = sign(body);
    expect(verifyShopifyHmac(body, sig, SECRET)).toBe(true);
  });

  it("rejects when the body has been tampered with", () => {
    const original = Buffer.from('{"id":12345,"total_price":"19.99"}');
    const tampered = Buffer.from('{"id":12345,"total_price":"99999.99"}');
    const sig = sign(original);
    expect(verifyShopifyHmac(tampered, sig, SECRET)).toBe(false);
  });

  it("rejects when the signature is wrong", () => {
    const body = Buffer.from('{"id":12345}');
    const wrongSig = sign(body, "different_secret");
    expect(verifyShopifyHmac(body, wrongSig, SECRET)).toBe(false);
  });

  it("rejects when the signature is malformed (not base64-decodable to right length)", () => {
    const body = Buffer.from('{"id":12345}');
    expect(verifyShopifyHmac(body, "obviously-not-a-real-signature", SECRET)).toBe(false);
  });

  it("rejects empty signature", () => {
    const body = Buffer.from('{"id":12345}');
    expect(verifyShopifyHmac(body, "", SECRET)).toBe(false);
  });

  it("accepts an empty body if signed (separate concern from rejecting it at the route level)", () => {
    // The HMAC primitive itself doesn't care about content; an empty body
    // with a matching signature is mathematically authenticated. The route
    // layer is responsible for rejecting empty / malformed payloads as a
    // semantic concern — that's a different test surface.
    const body = Buffer.from("");
    const sig = sign(body);
    expect(verifyShopifyHmac(body, sig, SECRET)).toBe(true);
  });

  it("rejects when secret is empty", () => {
    const body = Buffer.from('{"id":12345}');
    const sig = sign(body);
    expect(verifyShopifyHmac(body, sig, "")).toBe(false);
  });

  it("is byte-exact: a single-character change in the body invalidates the signature", () => {
    const a = Buffer.from('{"a":1}');
    const b = Buffer.from('{"a":2}');
    const sigA = sign(a);
    expect(verifyShopifyHmac(b, sigA, SECRET)).toBe(false);
  });

  it("handles binary body correctly (HMAC operates on bytes, not characters)", () => {
    const body = Buffer.from([0x00, 0xff, 0x10, 0x20, 0xab]);
    const sig = sign(body);
    expect(verifyShopifyHmac(body, sig, SECRET)).toBe(true);
  });
});
