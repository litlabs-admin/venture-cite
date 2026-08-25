import { z } from "zod";

const requestUserIdSchema = z.string().uuid().brand<"RequestUserId">();

export type RequestUserId = z.infer<typeof requestUserIdSchema>;

export type RequestActor = {
  readonly userId: RequestUserId;
};

export function createRequestActor(userId: string): RequestActor {
  return { userId: requestUserIdSchema.parse(userId) };
}
