// Direct, no-HTTP tests for server/services/userSettings.ts (B7 service
// extraction). HTTP-level behavior for both endpoints is already covered by
// tests/unit/userProfileUpdate.test.ts and
// tests/unit/userPasswordChange.test.ts; this file proves the extracted
// applyProfileUpdate and changeUserPassword functions work when called
// directly.

import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const stubs = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  forActor: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUserById: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../../server/data/requestData", () => ({
  requestData: { forActor: stubs.forActor },
}));

vi.mock("../../server/supabase", () => ({
  supabaseAdmin: {
    auth: { admin: { updateUserById: stubs.updateUserById, signOut: stubs.signOut } },
  },
}));

vi.mock("../../server/lib/supabaseAuth", () => ({
  supabaseAuth: { auth: { signInWithPassword: stubs.signInWithPassword } },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { applyProfileUpdate, changeUserPassword } =
  await import("../../server/services/userSettings");

beforeEach(() => {
  for (const s of Object.values(stubs)) s.mockReset();
  stubs.forActor.mockReturnValue({ users: { updateProfile: stubs.updateProfile } });
  stubs.updateProfile.mockResolvedValue({ id: USER_ID });
  stubs.signOut.mockResolvedValue({ data: null, error: null });
});

describe("applyProfileUpdate", () => {
  it("rejects a timezone that isn't in the IANA list", async () => {
    const result = await applyProfileUpdate(USER_ID, { timezone: "Not/A_Real_Zone" });
    expect(result).toEqual({ kind: "invalid_timezone" });
    expect(stubs.updateProfile).not.toHaveBeenCalled();
  });

  it("writes only the trimmed, non-empty fields", async () => {
    const result = await applyProfileUpdate(USER_ID, {
      firstName: "  Ada  ",
      lastName: "",
      timezone: "America/New_York",
    });

    expect(result).toEqual({ kind: "updated" });
    expect(stubs.forActor).toHaveBeenCalledWith({ userId: USER_ID });
    const patch = stubs.updateProfile.mock.calls[0][0];
    expect(patch.firstName).toBe("Ada");
    expect("lastName" in patch).toBe(false);
    expect(patch.timezone).toBe("America/New_York");
  });

  it("returns no_change without writing when every field is empty", async () => {
    const result = await applyProfileUpdate(USER_ID, { firstName: "   " });
    expect(result).toEqual({ kind: "no_change" });
    expect(stubs.updateProfile).not.toHaveBeenCalled();
  });
});

describe("changeUserPassword", () => {
  const baseParams = {
    userId: USER_ID,
    email: "u@example.com",
    currentPassword: "oldpassword",
    newPassword: "Newpassword123",
    bearerToken: "test-jwt-token",
  };

  it("rejects a weak new password before touching Supabase", async () => {
    const result = await changeUserPassword({ ...baseParams, newPassword: "short" });
    expect(result.kind).toBe("weak_password");
    expect(stubs.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns wrong_current_password when re-auth fails", async () => {
    stubs.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });

    const result = await changeUserPassword(baseParams);

    expect(result).toEqual({ kind: "wrong_current_password" });
    expect(stubs.updateUserById).not.toHaveBeenCalled();
  });

  it("changes the password and revokes other sessions on success", async () => {
    stubs.signInWithPassword.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    stubs.updateUserById.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });

    const result = await changeUserPassword(baseParams);

    expect(result).toEqual({ kind: "changed" });
    expect(stubs.updateUserById).toHaveBeenCalledWith(USER_ID, { password: "Newpassword123" });
    expect(stubs.signOut).toHaveBeenCalledWith("test-jwt-token", "others");
  });

  it("still returns changed when revoking other sessions fails", async () => {
    stubs.signInWithPassword.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    stubs.updateUserById.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    stubs.signOut.mockRejectedValue(new Error("revoke boom"));

    const result = await changeUserPassword(baseParams);

    expect(result).toEqual({ kind: "changed" });
  });

  it("classifies a 4xx GoTrue rejection as update_rejected/400 with the real message", async () => {
    stubs.signInWithPassword.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    stubs.updateUserById.mockResolvedValue({
      data: null,
      error: { status: 422, message: "Password is known to be compromised" },
    });

    const result = await changeUserPassword(baseParams);

    expect(result).toEqual({
      kind: "update_rejected",
      status: 400,
      error: "Password is known to be compromised",
    });
  });

  it("classifies a non-4xx GoTrue failure as update_rejected/502 with a generic message", async () => {
    stubs.signInWithPassword.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    stubs.updateUserById.mockResolvedValue({
      data: null,
      error: { status: 500, message: "internal details we should not leak" },
    });

    const result = await changeUserPassword(baseParams);

    expect(result).toEqual({
      kind: "update_rejected",
      status: 502,
      error: "Password update failed",
    });
  });
});
