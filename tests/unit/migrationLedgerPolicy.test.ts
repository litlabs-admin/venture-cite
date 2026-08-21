import { describe, expect, it } from "vitest";
import { isCustomOrmPreviewLedgerMode } from "../../server/lib/migrationLedgerPolicy";

describe("custom ORM preview migration ledger policy", () => {
  it("requires all preview gates", () => {
    expect(
      isCustomOrmPreviewLedgerMode({
        NODE_ENV: "development",
        ALLOW_REMOTE_DEVELOPMENT_SERVICES: "true",
        SUPABASE_CUSTOM_ORM_PREVIEW: "true",
        SUPABASE_CUSTOM_ORM_PREVIEW_BASELINE: "0093_stripe_owned_trial.sql",
      }),
    ).toBe(true);
  });

  it("rejects production even when the flag is present", () => {
    expect(
      isCustomOrmPreviewLedgerMode({
        NODE_ENV: "production",
        ALLOW_REMOTE_DEVELOPMENT_SERVICES: "true",
        SUPABASE_CUSTOM_ORM_PREVIEW: "true",
        SUPABASE_CUSTOM_ORM_PREVIEW_BASELINE: "0093_stripe_owned_trial.sql",
      }),
    ).toBe(false);
  });

  it("rejects the flag without remote-service opt-in", () => {
    expect(
      isCustomOrmPreviewLedgerMode({
        NODE_ENV: "development",
        SUPABASE_CUSTOM_ORM_PREVIEW: "true",
        SUPABASE_CUSTOM_ORM_PREVIEW_BASELINE: "0093_stripe_owned_trial.sql",
      }),
    ).toBe(false);
  });

  it("rejects an absent or false flag", () => {
    expect(
      isCustomOrmPreviewLedgerMode({
        NODE_ENV: "development",
        ALLOW_REMOTE_DEVELOPMENT_SERVICES: "true",
      }),
    ).toBe(false);
    expect(
      isCustomOrmPreviewLedgerMode({
        NODE_ENV: "development",
        ALLOW_REMOTE_DEVELOPMENT_SERVICES: "true",
        SUPABASE_CUSTOM_ORM_PREVIEW: "false",
        SUPABASE_CUSTOM_ORM_PREVIEW_BASELINE: "0093_stripe_owned_trial.sql",
      }),
    ).toBe(false);
  });

  it("rejects the flag without an explicit baseline filename", () => {
    expect(
      isCustomOrmPreviewLedgerMode({
        NODE_ENV: "development",
        ALLOW_REMOTE_DEVELOPMENT_SERVICES: "true",
        SUPABASE_CUSTOM_ORM_PREVIEW: "true",
      }),
    ).toBe(false);
  });
});
