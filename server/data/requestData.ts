import { db } from "../db";
import type { RequestActor } from "../lib/requestActor";
import {
  createRequestBrandRepository,
  type RequestBrandRepository,
} from "./requestBrandRepository";
import { createRequestUserRepository, type RequestUserRepository } from "./requestUserRepository";

export type RequestRepositories = {
  users: RequestUserRepository;
  brands: RequestBrandRepository;
};

export type RequestData = {
  forActor(actor: RequestActor): RequestRepositories;
};

export function createRequestData(database: typeof db): RequestData {
  return {
    forActor(actor: RequestActor): RequestRepositories {
      return {
        users: createRequestUserRepository({ actor, database }),
        brands: createRequestBrandRepository({ actor, database }),
      };
    },
  };
}

export const requestData = createRequestData(db);
