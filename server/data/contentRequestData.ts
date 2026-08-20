import { db } from "../db";
import type { RequestActor } from "../lib/requestActor";
import {
  createContentRequestArticleRepository,
  type ContentRequestArticleRepository,
} from "./contentRequestArticleRepository";
import {
  createContentRequestDistributionRepository,
  type ContentRequestDistributionRepository,
} from "./contentRequestDistributionRepository";
import {
  createContentRequestJobRepository,
  type ContentRequestJobRepository,
} from "./contentRequestJobRepository";
import {
  createContentRequestKeywordRepository,
  type ContentRequestKeywordRepository,
} from "./contentRequestKeywordRepository";
import {
  createContentRequestRevisionRepository,
  type ContentRequestRevisionRepository,
} from "./contentRequestRevisionRepository";

export type ContentRequestRepositories = {
  articles: ContentRequestArticleRepository;
  revisions: ContentRequestRevisionRepository;
  distributions: ContentRequestDistributionRepository;
  keywords: ContentRequestKeywordRepository;
  jobs: ContentRequestJobRepository;
};

export type ContentRequestData = {
  forActor(actor: RequestActor): ContentRequestRepositories;
};

export function createContentRequestData(database: typeof db): ContentRequestData {
  return {
    forActor(actor: RequestActor): ContentRequestRepositories {
      return {
        articles: createContentRequestArticleRepository({ actor, database }),
        revisions: createContentRequestRevisionRepository({ actor, database }),
        distributions: createContentRequestDistributionRepository({ actor, database }),
        keywords: createContentRequestKeywordRepository({ actor, database }),
        jobs: createContentRequestJobRepository({ actor, database }),
      };
    },
  };
}

export const contentRequestData = createContentRequestData(db);
