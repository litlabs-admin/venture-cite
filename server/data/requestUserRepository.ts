import { eq } from "drizzle-orm";
import { users, type InsertUser, type User } from "@shared/schema";
import type { db } from "../db";
import type { RequestActor } from "../lib/requestActor";
import type { RequestRepositoryTransaction } from "./requestRepositoryTransaction";
import { setRestrictedRequestContext } from "./restrictedRequestTransaction";

const requestUserColumns = {
  id: users.id,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  timezone: users.timezone,
  profileImageUrl: users.profileImageUrl,
  accessTier: users.accessTier,
  trialEndsAt: users.trialEndsAt,
  isAdmin: users.isAdmin,
  weeklyReportEnabled: users.weeklyReportEnabled,
  onboardingState: users.onboardingState,
  deletedAt: users.deletedAt,
};

export type RequestUser = Pick<User, keyof typeof requestUserColumns>;

export type RequestUserProfilePatch = Pick<
  InsertUser,
  | "firstName"
  | "lastName"
  | "timezone"
  | "profileImageUrl"
  | "weeklyReportEnabled"
  | "onboardingState"
>;

export type RequestUserRepository = {
  get(): Promise<RequestUser | undefined>;
  updateProfile(patch: RequestUserProfilePatch): Promise<RequestUser | undefined>;
};

export function createRequestUserRepository({
  actor,
  database,
}: {
  actor: RequestActor;
  database: typeof db;
}): RequestUserRepository {
  const run = <T>(
    operation: (transaction: RequestRepositoryTransaction) => Promise<T>,
  ): Promise<T> =>
    database.transaction(async (transaction) => {
      await setRestrictedRequestContext({ actor, role: "venturecite_request", transaction });
      return operation(transaction);
    });

  return {
    get(): Promise<RequestUser | undefined> {
      return run(async (transaction) => {
        const [user] = await transaction
          .select(requestUserColumns)
          .from(users)
          .where(eq(users.id, actor.userId))
          .limit(1);
        return user;
      });
    },

    updateProfile(patch: RequestUserProfilePatch): Promise<RequestUser | undefined> {
      return run(async (transaction) => {
        const [user] = await transaction
          .update(users)
          .set(patch)
          .where(eq(users.id, actor.userId))
          .returning(requestUserColumns);
        return user;
      });
    },
  };
}
