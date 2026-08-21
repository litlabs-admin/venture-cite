type DevelopmentEnvironment = {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  OPENAI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  RESEND_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  CONTENT_GENERATION_PROVIDER?: string;
  ALLOW_REMOTE_DEVELOPMENT_SERVICES?: string;
};

const loopbackHostnames = new Set(["localhost", "127.0.0.1", "::1"]);

function isLoopbackUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return loopbackHostnames.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function remoteDevelopmentServiceNames(env: DevelopmentEnvironment): string[] {
  if (env.NODE_ENV !== "development" || env.ALLOW_REMOTE_DEVELOPMENT_SERVICES === "true") {
    return [];
  }

  const names: string[] = [];
  if (hasValue(env.DATABASE_URL) && !isLoopbackUrl(env.DATABASE_URL)) names.push("DATABASE_URL");
  if (hasValue(env.SUPABASE_URL) && !isLoopbackUrl(env.SUPABASE_URL)) names.push("SUPABASE_URL");
  if (
    hasValue(env.VITE_SUPABASE_URL) &&
    !isLoopbackUrl(env.VITE_SUPABASE_URL) &&
    !names.includes("SUPABASE_URL")
  ) {
    names.push("VITE_SUPABASE_URL");
  }
  if (hasValue(env.OPENAI_API_KEY) && env.CONTENT_GENERATION_PROVIDER !== "fake") {
    names.push("OPENAI_API_KEY");
  }
  if (hasValue(env.OPENROUTER_API_KEY)) names.push("OPENROUTER_API_KEY");
  if (hasValue(env.RESEND_API_KEY)) names.push("RESEND_API_KEY");
  if (hasValue(env.STRIPE_SECRET_KEY)) names.push("STRIPE_SECRET_KEY");
  return names;
}

export function isEmailDeliveryEnabled(env: {
  NODE_ENV?: string;
  EMAIL_DELIVERY_ENABLED?: string;
}): boolean {
  const setting = env.EMAIL_DELIVERY_ENABLED?.trim().toLowerCase();
  if (setting === "false" || setting === "0" || setting === "no") return false;
  if (setting === "true" || setting === "1" || setting === "yes") return true;
  return env.NODE_ENV === "production";
}
