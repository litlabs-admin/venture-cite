export function isEmailDeliveryEnabled(env: {
  NODE_ENV?: string;
  EMAIL_DELIVERY_ENABLED?: string;
}): boolean {
  const setting = env.EMAIL_DELIVERY_ENABLED?.trim().toLowerCase();
  if (setting === "false" || setting === "0" || setting === "no") return false;
  if (setting === "true" || setting === "1" || setting === "yes") return true;
  return env.NODE_ENV === "production";
}
