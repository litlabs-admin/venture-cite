export type MigrationLedgerEnvironment = Readonly<{
  NODE_ENV?: string;
  ALLOW_REMOTE_DEVELOPMENT_SERVICES?: string;
  SUPABASE_CUSTOM_ORM_PREVIEW?: string;
  SUPABASE_CUSTOM_ORM_PREVIEW_BASELINE?: string;
}>;

/**
 * Allow the application migration runner to work with a Supabase preview
 * branch whose platform ledger contains a schema snapshot, not root files.
 *
 * The policy is deliberately narrow. It requires development mode, the
 * existing remote-service opt-in, the explicit preview flag, and a baseline
 * filename. Production can never enter this mode.
 */
export function isCustomOrmPreviewLedgerMode(environment: MigrationLedgerEnvironment): boolean {
  return (
    environment.NODE_ENV === "development" &&
    environment.ALLOW_REMOTE_DEVELOPMENT_SERVICES === "true" &&
    environment.SUPABASE_CUSTOM_ORM_PREVIEW === "true" &&
    Boolean(environment.SUPABASE_CUSTOM_ORM_PREVIEW_BASELINE?.trim())
  );
}
