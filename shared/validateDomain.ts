export type DomainValidationResult =
  | { valid: true; normalized: string }
  | { valid: false; reason: string };

const LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_LIKE_REGEX = /:/;

export function validateDomain(raw: string): DomainValidationResult {
  if (typeof raw !== "string") {
    return { valid: false, reason: "Domain must be a string" };
  }

  let value = raw.trim();
  if (!value) {
    return { valid: false, reason: "Domain is required" };
  }

  if (/\s/.test(value)) {
    return { valid: false, reason: "Domain cannot contain whitespace" };
  }

  value = value.replace(/^https?:\/\//i, "");
  value = value.replace(/^\/\//, "");
  value = value.replace(/^www\./i, "");

  const pathIdx = value.search(/[/?#]/);
  if (pathIdx !== -1) {
    value = value.slice(0, pathIdx);
  }

  if (value.endsWith(".")) {
    value = value.slice(0, -1);
  }

  value = value.toLowerCase();

  if (!value) {
    return { valid: false, reason: "Domain is required" };
  }

  if (value.length > 253) {
    return { valid: false, reason: "Domain is too long" };
  }

  if (value === "localhost") {
    return { valid: false, reason: "localhost is not a valid domain" };
  }

  if (IPV4_REGEX.test(value) || IPV6_LIKE_REGEX.test(value)) {
    return { valid: false, reason: "IP addresses are not allowed" };
  }

  const labels = value.split(".");
  if (labels.length < 2) {
    return { valid: false, reason: "Domain must include a TLD" };
  }

  for (const label of labels) {
    if (!label) {
      return { valid: false, reason: "Domain has an empty label" };
    }
    if (label.length > 63) {
      return { valid: false, reason: "Domain label exceeds 63 characters" };
    }
    if (!LABEL_REGEX.test(label)) {
      return { valid: false, reason: "Domain contains invalid characters" };
    }
  }

  const tld = labels[labels.length - 1];
  if (tld.length < 2) {
    return { valid: false, reason: "TLD must be at least 2 characters" };
  }
  if (!/[a-z]/.test(tld)) {
    return { valid: false, reason: "TLD must contain at least one letter" };
  }

  return { valid: true, normalized: value };
}
