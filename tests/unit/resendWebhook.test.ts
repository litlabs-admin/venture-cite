import { describe, it, expect } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
import { verifyResendWebhook } from "../../server/lib/resendWebhook";

const SECRET = "whsec_" + randomBytes(32).toString("base64");

function sign(svixId: string, ts: string, body: Buffer | string, secret = SECRET): string {
  const trimmed = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const key = Buffer.from(trimmed, "base64");
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
  const input = `${svixId}.${ts}.${buf.toString("utf8")}`;
  const sig = createHmac("sha256", key).update(input).digest("base64");
  return `v1,${sig}`;
}

function nowSec(): string {
  return String(Math.floor(Date.now() / 1000));
}

describe("verifyResendWebhook", () => {
  it("accepts a correctly signed payload", () => {
    const body = Buffer.from('{"type":"email.bounced","data":{"to":"x@example.com"}}');
    const id = "msg_01HX";
    const ts = nowSec();
    const sig = sign(id, ts, body);
    expect(
      verifyResendWebhook({
        rawBody: body,
        svixId: id,
        svixTimestamp: ts,
        svixSignature: sig,
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it("accepts when multiple v1 signatures are present and one matches (key rotation)", () => {
    const body = Buffer.from('{"x":1}');
    const id = "msg_01HY";
    const ts = nowSec();
    const goodSig = sign(id, ts, body);
    // Attacker-supplied "wrong" signature, plus the real one — should still pass.
    const combined = `v1,AAAAAA== ${goodSig}`;
    expect(
      verifyResendWebhook({
        rawBody: body,
        svixId: id,
        svixTimestamp: ts,
        svixSignature: combined,
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it("rejects when the body has been tampered with", () => {
    const body = Buffer.from('{"x":1}');
    const tampered = Buffer.from('{"x":2}');
    const id = "msg_01HZ";
    const ts = nowSec();
    const sig = sign(id, ts, body);
    expect(
      verifyResendWebhook({
        rawBody: tampered,
        svixId: id,
        svixTimestamp: ts,
        svixSignature: sig,
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("rejects an old timestamp (replay defense)", () => {
    const body = Buffer.from("{}");
    const id = "msg_old";
    const oldTs = String(Math.floor(Date.now() / 1000) - 10 * 60); // 10 min ago
    const sig = sign(id, oldTs, body);
    expect(
      verifyResendWebhook({
        rawBody: body,
        svixId: id,
        svixTimestamp: oldTs,
        svixSignature: sig,
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("rejects when signed with a different secret", () => {
    const body = Buffer.from("{}");
    const id = "msg_ks";
    const ts = nowSec();
    const otherSecret = "whsec_" + randomBytes(32).toString("base64");
    const sig = sign(id, ts, body, otherSecret);
    expect(
      verifyResendWebhook({
        rawBody: body,
        svixId: id,
        svixTimestamp: ts,
        svixSignature: sig,
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("rejects malformed signature header", () => {
    const body = Buffer.from("{}");
    expect(
      verifyResendWebhook({
        rawBody: body,
        svixId: "x",
        svixTimestamp: nowSec(),
        svixSignature: "definitely-not-a-svix-signature",
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("rejects when any required field is missing", () => {
    expect(
      verifyResendWebhook({
        rawBody: Buffer.from("{}"),
        svixId: "",
        svixTimestamp: nowSec(),
        svixSignature: "v1,xxxx",
        secret: SECRET,
      }),
    ).toBe(false);
  });
});
