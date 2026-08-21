import { cleanupLocalE2EDatabaseAccess } from "./local-database-access";

export default async function globalTeardown(): Promise<void> {
  if (!process.env.E2E_BASE_URL && process.env.E2E_LOCAL_FAKE_GENERATION === "1") {
    await cleanupLocalE2EDatabaseAccess(process.env);
  }
}
