export type WorkServiceErrorCode =
  | "configuration_error"
  | "revision_conflict"
  | "invalid_transition"
  | "missing_evidence"
  | "invalid_evidence"
  | "invalid_verification";

export class WorkServiceError extends Error {
  readonly code: WorkServiceErrorCode;
  readonly currentRevision: number | undefined;

  constructor(
    code: WorkServiceErrorCode,
    message: string,
    options: { currentRevision?: number } = {},
  ) {
    super(message);
    this.name = "WorkServiceError";
    this.code = code;
    this.currentRevision = options.currentRevision;
  }
}
