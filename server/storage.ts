import { type User, type InsertUser, type Citation, type InsertCitation, type Analytics, type InsertAnalytics, type Article, type InsertArticle, type Distribution, type InsertDistribution, type GeoRanking, type InsertGeoRanking, type BrandPrompt, type InsertBrandPrompt, type VisibilityProgress, type CitationRun, type InsertCitationRun, type ContentGenerationJob, type InsertContentGenerationJob, type Brand, type InsertBrand, type CommerceSession, type InsertCommerceSession, type PurchaseEvent, type InsertPurchaseEvent, type PublicationReference, type InsertPublicationReference, type PublicationMetric, type InsertPublicationMetric, type Competitor, type InsertCompetitor, type CompetitorCitationSnapshot, type InsertCompetitorCitationSnapshot, type BrandVisibilitySnapshot, type InsertBrandVisibilitySnapshot, type Listicle, type InsertListicle, type WikipediaMention, type InsertWikipediaMention, type BofuContent, type InsertBofuContent, type FaqItem, type InsertFaqItem, type BrandMention, type InsertBrandMention, type PromptPortfolio, type InsertPromptPortfolio, type CitationQuality, type InsertCitationQuality, type BrandHallucination, type InsertBrandHallucination, type BrandFactSheet, type InsertBrandFactSheet, type MetricsHistory, type InsertMetricsHistory, type AlertSettings, type InsertAlertSettings, type AlertHistory, type InsertAlertHistory, type AiSource, type InsertAiSource, type AiTrafficSession, type InsertAiTrafficSession, type PromptTestRun, type InsertPromptTestRun, type AgentTask, type InsertAgentTask, type OutreachCampaign, type InsertOutreachCampaign, type PublicationTarget, type InsertPublicationTarget, type OutreachEmail, type InsertOutreachEmail, type AutomationRule, type InsertAutomationRule, type AutomationExecution, type InsertAutomationExecution, type BetaInviteCode, type InsertBetaInviteCode, type KeywordResearch, type InsertKeywordResearch, type CommunityPost, type InsertCommunityPost, type PromptGeneration, type ContentDraft, type InsertContentDraft } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getCitations(): Promise<Citation[]>;
  getCitationsByUserId(userId: string): Promise<Citation[]>;
  createCitation(citation: InsertCitation): Promise<Citation>;
  
  getAnalytics(): Promise<Analytics | undefined>;
  updateAnalytics(analytics: InsertAnalytics): Promise<Analytics>;
  
  // Brand methods
  createBrand(brand: InsertBrand): Promise<Brand>;
  getBrands(): Promise<Brand[]>;
  getBrandsByUserId(userId: string): Promise<Brand[]>;
  getBrandById(id: string): Promise<Brand | undefined>;
  getBrandByIdForUser(id: string, userId: string): Promise<Brand | undefined>;
  updateBrand(id: string, brand: Partial<InsertBrand>): Promise<Brand | undefined>;
  deleteBrand(id: string): Promise<boolean>;
  
  // Article methods
  createArticle(article: InsertArticle): Promise<Article>;
  getArticles(): Promise<Article[]>;
  getArticleById(id: string): Promise<Article | undefined>;
  getArticleBySlug(slug: string): Promise<Article | undefined>;
  updateArticle(id: string, article: Partial<InsertArticle>): Promise<Article | undefined>;
  deleteArticle(id: string): Promise<boolean>;
  incrementArticleViews(id: string): Promise<void>;
  incrementArticleCitations(id: string): Promise<void>;
  
  // Distribution methods
  createDistribution(distribution: InsertDistribution): Promise<Distribution>;
  getDistributions(articleId?: string): Promise<Distribution[]>;
  getDistributionById(id: string): Promise<Distribution | undefined>;
  updateDistribution(id: string, update: Partial<InsertDistribution>): Promise<Distribution | undefined>;

  // GEO Ranking methods
  createGeoRanking(ranking: InsertGeoRanking): Promise<GeoRanking>;
  getGeoRankings(articleId?: string): Promise<GeoRanking[]>;
  getGeoRankingsByPlatform(platform: string): Promise<GeoRanking[]>;
  countCitedRankingsForArticle(articleId: string): Promise<number>;
  getGeoRankingsByBrandPromptIds(ids: string[], sinceDate?: Date): Promise<GeoRanking[]>;
  updateGeoRanking(id: string, update: Partial<GeoRanking>): Promise<GeoRanking | undefined>;

  // Brand Prompt methods
  createBrandPrompt(p: InsertBrandPrompt): Promise<BrandPrompt>;
  getBrandPromptsByBrandId(brandId: string, opts?: { status?: "tracked" | "suggested" | "archived" | "all" }): Promise<BrandPrompt[]>;
  deleteBrandPromptsByBrandId(brandId: string): Promise<void>;
  archiveBrandPrompts(brandId: string): Promise<void>;
  archiveSuggestedPrompts(brandId: string): Promise<void>;
  updateBrandPromptText(id: string, prompt: string): Promise<BrandPrompt | undefined>;
  archiveBrandPrompt(id: string): Promise<void>;
  promoteSuggestionToTracked(suggestionId: string, replaceTrackedId: string): Promise<void>;
  createPromptGeneration(brandId: string): Promise<PromptGeneration>;
  getPromptGenerationsByBrandId(brandId: string): Promise<PromptGeneration[]>;
  getGeoRankingsByRunId(runId: string): Promise<GeoRanking[]>;
  getRecentArticlesByBrandId(brandId: string, limit: number): Promise<Article[]>;

  // AI Visibility Checklist progress
  getVisibilityProgress(brandId: string): Promise<VisibilityProgress[]>;
  setVisibilityStep(brandId: string, engineId: string, stepId: string): Promise<void>;
  unsetVisibilityStep(brandId: string, engineId: string, stepId: string): Promise<void>;

  // Citation run history
  createCitationRun(run: InsertCitationRun): Promise<CitationRun>;
  updateCitationRun(id: string, update: Partial<CitationRun>): Promise<CitationRun | undefined>;
  getCitationRunsByBrandId(brandId: string, limit?: number): Promise<CitationRun[]>;

  // Content generation job queue
  enqueueContentJob(job: InsertContentGenerationJob): Promise<ContentGenerationJob>;
  claimPendingContentJob(): Promise<ContentGenerationJob | undefined>;
  updateContentJob(id: string, update: Partial<ContentGenerationJob>): Promise<ContentGenerationJob | undefined>;
  getContentJobById(id: string, userId: string): Promise<ContentGenerationJob | undefined>;
  getActiveContentJob(userId: string): Promise<ContentGenerationJob | undefined>;
  getRecentCompletedContentJob(userId: string): Promise<ContentGenerationJob | undefined>;
  failStuckContentJobs(olderThanMinutes: number): Promise<number>;
  
  // Commerce Session methods
  createCommerceSession(session: InsertCommerceSession): Promise<CommerceSession>;
  getCommerceSessions(filters?: { articleId?: string; brandId?: string; aiPlatform?: string }): Promise<CommerceSession[]>;
  
  // Purchase Event methods
  createPurchaseEvent(event: InsertPurchaseEvent): Promise<PurchaseEvent>;
  getPurchaseEvents(filters?: { articleId?: string; brandId?: string; aiPlatform?: string }): Promise<PurchaseEvent[]>;
  getTotalRevenue(filters?: { brandId?: string; aiPlatform?: string }): Promise<number>;
  
  // Publication Reference methods
  createPublicationReference(ref: InsertPublicationReference): Promise<PublicationReference>;
  getPublicationReferences(filters?: { industry?: string; aiPlatform?: string }): Promise<PublicationReference[]>;
  updatePublicationReference(id: string, update: Partial<InsertPublicationReference>): Promise<PublicationReference | undefined>;
  
  // Publication Metrics methods
  upsertPublicationMetric(metric: InsertPublicationMetric): Promise<PublicationMetric>;
  getPublicationMetrics(industry?: string): Promise<PublicationMetric[]>;
  getTopPublicationsByIndustry(industry: string, limit?: number): Promise<PublicationMetric[]>;
  
  // Competitor methods
  createCompetitor(competitor: InsertCompetitor): Promise<Competitor>;
  getCompetitors(brandId?: string): Promise<Competitor[]>;
  getCompetitorById(id: string): Promise<Competitor | undefined>;
  deleteCompetitor(id: string): Promise<boolean>;
  
  // Competitor Citation Snapshot methods
  createCompetitorCitationSnapshot(snapshot: InsertCompetitorCitationSnapshot): Promise<CompetitorCitationSnapshot>;
  getCompetitorCitationSnapshots(competitorId: string): Promise<CompetitorCitationSnapshot[]>;
  getCompetitorLatestCitations(competitorId: string): Promise<{ platform: string; count: number }[]>;
  
  // Leaderboard methods
  getCompetitorLeaderboard(brandId?: string): Promise<{ name: string; domain: string; isOwn: boolean; totalCitations: number; platformBreakdown: Record<string, number> }[]>;
  
  // Brand Visibility Snapshot methods
  createBrandVisibilitySnapshot(snapshot: InsertBrandVisibilitySnapshot): Promise<BrandVisibilitySnapshot>;
  getBrandVisibilitySnapshots(brandId: string, limit?: number): Promise<BrandVisibilitySnapshot[]>;
  getLatestBrandVisibility(brandId: string): Promise<{ visibilityScore: number; shareOfVoice: number; sentiment: { positive: number; neutral: number; negative: number }; platformBreakdown: Record<string, number> } | null>;
  
  // Listicle tracking methods
  createListicle(listicle: InsertListicle): Promise<Listicle>;
  getListicles(brandId?: string): Promise<Listicle[]>;
  getListicleById(id: string): Promise<Listicle | undefined>;
  updateListicle(id: string, update: Partial<InsertListicle>): Promise<Listicle | undefined>;
  deleteListicle(id: string): Promise<boolean>;
  
  // Wikipedia mention methods
  createWikipediaMention(mention: InsertWikipediaMention): Promise<WikipediaMention>;
  getWikipediaMentions(brandId?: string): Promise<WikipediaMention[]>;
  updateWikipediaMention(id: string, update: Partial<InsertWikipediaMention>): Promise<WikipediaMention | undefined>;
  deleteWikipediaMention(id: string): Promise<boolean>;
  
  // BOFU content methods
  createBofuContent(content: InsertBofuContent): Promise<BofuContent>;
  getBofuContent(brandId?: string, contentType?: string): Promise<BofuContent[]>;
  getBofuContentById(id: string): Promise<BofuContent | undefined>;
  updateBofuContent(id: string, update: Partial<InsertBofuContent>): Promise<BofuContent | undefined>;
  deleteBofuContent(id: string): Promise<boolean>;
  
  // FAQ methods
  createFaqItem(faq: InsertFaqItem): Promise<FaqItem>;
  getFaqItems(brandId?: string, articleId?: string): Promise<FaqItem[]>;
  getFaqItemById(id: string): Promise<FaqItem | undefined>;
  updateFaqItem(id: string, update: Partial<InsertFaqItem>): Promise<FaqItem | undefined>;
  deleteFaqItem(id: string): Promise<boolean>;
  
  // Brand mention methods
  createBrandMention(mention: InsertBrandMention): Promise<BrandMention>;
  getBrandMentions(brandId?: string, platform?: string): Promise<BrandMention[]>;
  getBrandMentionById(id: string): Promise<BrandMention | undefined>;
  updateBrandMention(id: string, update: Partial<InsertBrandMention>): Promise<BrandMention | undefined>;
  deleteBrandMention(id: string): Promise<boolean>;
  
  // Prompt Portfolio methods (Share-of-Answer)
  createPromptPortfolio(prompt: InsertPromptPortfolio): Promise<PromptPortfolio>;
  getPromptPortfolio(brandId?: string, filters?: { category?: string; funnelStage?: string; aiPlatform?: string }): Promise<PromptPortfolio[]>;
  getPromptPortfolioById(id: string): Promise<PromptPortfolio | undefined>;
  updatePromptPortfolio(id: string, update: Partial<InsertPromptPortfolio>): Promise<PromptPortfolio | undefined>;
  deletePromptPortfolio(id: string): Promise<boolean>;
  getShareOfAnswerStats(brandId: string): Promise<{ totalPrompts: number; citedPrompts: number; shareOfAnswer: number; byCategory: Record<string, { total: number; cited: number }>; byFunnel: Record<string, { total: number; cited: number }>; byCompetitor: Record<string, { total: number; cited: number; shareAgainst: number }>; avgVolatility: number; avgConsensus: number; volatilityDistribution: { stable: number; moderate: number; volatile: number } }>;
  
  // Citation Quality methods
  createCitationQuality(quality: InsertCitationQuality): Promise<CitationQuality>;
  getCitationQualities(brandId?: string, filters?: { aiPlatform?: string; minScore?: number }): Promise<CitationQuality[]>;
  getCitationQualityById(id: string): Promise<CitationQuality | undefined>;
  updateCitationQuality(id: string, update: Partial<InsertCitationQuality>): Promise<CitationQuality | undefined>;
  deleteCitationQuality(id: string): Promise<boolean>;
  getCitationQualityStats(brandId: string): Promise<{ avgQualityScore: number; primaryCitations: number; secondaryCitations: number; bySourceType: Record<string, number> }>;
  
  // Brand Hallucination methods
  createBrandHallucination(hallucination: InsertBrandHallucination): Promise<BrandHallucination>;
  getBrandHallucinations(brandId?: string, filters?: { severity?: string; isResolved?: boolean }): Promise<BrandHallucination[]>;
  getBrandHallucinationById(id: string): Promise<BrandHallucination | undefined>;
  updateBrandHallucination(id: string, update: Partial<InsertBrandHallucination>): Promise<BrandHallucination | undefined>;
  deleteBrandHallucination(id: string): Promise<boolean>;
  resolveBrandHallucination(id: string): Promise<BrandHallucination | undefined>;
  getHallucinationStats(brandId: string): Promise<{ total: number; resolved: number; bySeverity: Record<string, number>; byType: Record<string, number> }>;
  
  // Brand Fact Sheet methods
  createBrandFact(fact: InsertBrandFactSheet): Promise<BrandFactSheet>;
  getBrandFacts(brandId: string): Promise<BrandFactSheet[]>;
  getBrandFactById(id: string): Promise<BrandFactSheet | undefined>;
  updateBrandFact(id: string, update: Partial<InsertBrandFactSheet>): Promise<BrandFactSheet | undefined>;
  deleteBrandFact(id: string): Promise<boolean>;
  
  // Metrics History methods
  createMetricsSnapshot(snapshot: InsertMetricsHistory): Promise<MetricsHistory>;
  getMetricsHistory(brandId: string, metricType?: string, days?: number): Promise<MetricsHistory[]>;
  recordCurrentMetrics(brandId: string): Promise<void>;
  
  // Alert Settings methods
  createAlertSetting(setting: InsertAlertSettings): Promise<AlertSettings>;
  getAlertSettings(brandId: string): Promise<AlertSettings[]>;
  getAlertSettingById(id: string): Promise<AlertSettings | undefined>;
  updateAlertSetting(id: string, update: Partial<InsertAlertSettings>): Promise<AlertSettings | undefined>;
  deleteAlertSetting(id: string): Promise<boolean>;
  
  // Alert History methods
  createAlertHistory(history: InsertAlertHistory): Promise<AlertHistory>;
  getAlertHistory(brandId: string, limit?: number): Promise<AlertHistory[]>;
  
  // AI Sources methods (Citation Network Tracing)
  createAiSource(source: InsertAiSource): Promise<AiSource>;
  getAiSources(brandId?: string, filters?: { aiPlatform?: string; sourceType?: string }): Promise<AiSource[]>;
  getAiSourceById(id: string): Promise<AiSource | undefined>;
  updateAiSource(id: string, update: Partial<InsertAiSource>): Promise<AiSource | undefined>;
  deleteAiSource(id: string): Promise<boolean>;
  getTopAiSources(brandId: string, limit?: number): Promise<AiSource[]>;
  
  // AI Traffic Analytics methods
  createAiTrafficSession(session: InsertAiTrafficSession): Promise<AiTrafficSession>;
  getAiTrafficSessions(brandId?: string, filters?: { aiPlatform?: string; converted?: boolean }): Promise<AiTrafficSession[]>;
  getAiTrafficStats(brandId: string): Promise<{ totalSessions: number; totalPageViews: number; conversions: number; conversionRate: number; byPlatform: Record<string, { sessions: number; conversions: number }>; avgSessionDuration: number }>;
  
  // Prompt Test Run methods
  createPromptTestRun(run: InsertPromptTestRun): Promise<PromptTestRun>;
  getPromptTestRuns(brandId?: string, filters?: { status?: string; promptPortfolioId?: string }): Promise<PromptTestRun[]>;
  getPromptTestRunById(id: string): Promise<PromptTestRun | undefined>;
  updatePromptTestRun(id: string, update: Partial<InsertPromptTestRun>): Promise<PromptTestRun | undefined>;
  
  // Agent Task Queue methods
  createAgentTask(task: InsertAgentTask): Promise<AgentTask>;
  getAgentTasks(brandId?: string, filters?: { status?: string; taskType?: string; priority?: string }): Promise<AgentTask[]>;
  getAgentTaskById(id: string): Promise<AgentTask | undefined>;
  updateAgentTask(id: string, update: Partial<InsertAgentTask>): Promise<AgentTask | undefined>;
  deleteAgentTask(id: string): Promise<boolean>;
  getNextQueuedTask(): Promise<AgentTask | undefined>;
  getAgentTaskStats(brandId?: string): Promise<{ queued: number; inProgress: number; completed: number; failed: number; totalTokensUsed: number }>;
  
  // Outreach Campaign methods
  createOutreachCampaign(campaign: InsertOutreachCampaign): Promise<OutreachCampaign>;
  getOutreachCampaigns(brandId?: string, filters?: { status?: string; campaignType?: string }): Promise<OutreachCampaign[]>;
  getOutreachCampaignById(id: string): Promise<OutreachCampaign | undefined>;
  updateOutreachCampaign(id: string, update: Partial<InsertOutreachCampaign>): Promise<OutreachCampaign | undefined>;
  deleteOutreachCampaign(id: string): Promise<boolean>;
  getOutreachStats(brandId: string): Promise<{ total: number; byStatus: Record<string, number>; successRate: number }>;
  
  // Publication Target methods
  createPublicationTarget(target: InsertPublicationTarget): Promise<PublicationTarget>;
  getPublicationTargets(brandId?: string, filters?: { status?: string; category?: string; industry?: string }): Promise<PublicationTarget[]>;
  getPublicationTargetById(id: string): Promise<PublicationTarget | undefined>;
  updatePublicationTarget(id: string, update: Partial<InsertPublicationTarget>): Promise<PublicationTarget | undefined>;
  deletePublicationTarget(id: string): Promise<boolean>;
  discoverPublications(brandId: string, industry: string): Promise<PublicationTarget[]>;
  findContacts(targetId: string): Promise<PublicationTarget | undefined>;
  
  // Outreach Email methods
  createOutreachEmail(email: InsertOutreachEmail): Promise<OutreachEmail>;
  getOutreachEmails(brandId?: string, filters?: { status?: string; campaignId?: string }): Promise<OutreachEmail[]>;
  getOutreachEmailById(id: string): Promise<OutreachEmail | undefined>;
  updateOutreachEmail(id: string, update: Partial<InsertOutreachEmail>): Promise<OutreachEmail | undefined>;
  deleteOutreachEmail(id: string): Promise<boolean>;
  sendOutreachEmail(id: string): Promise<OutreachEmail | undefined>;
  getOutreachEmailStats(brandId: string): Promise<{ sent: number; opened: number; replied: number; openRate: number; replyRate: number }>;
  
  // Automation Rule methods
  createAutomationRule(rule: InsertAutomationRule): Promise<AutomationRule>;
  getAutomationRules(brandId?: string, filters?: { triggerType?: string; isEnabled?: boolean }): Promise<AutomationRule[]>;
  getAutomationRuleById(id: string): Promise<AutomationRule | undefined>;
  updateAutomationRule(id: string, update: Partial<InsertAutomationRule>): Promise<AutomationRule | undefined>;
  deleteAutomationRule(id: string): Promise<boolean>;
  
  // Automation Execution methods
  createAutomationExecution(execution: InsertAutomationExecution): Promise<AutomationExecution>;
  getAutomationExecutions(ruleId?: string, limit?: number): Promise<AutomationExecution[]>;
  updateAutomationExecution(id: string, update: Partial<InsertAutomationExecution>): Promise<AutomationExecution | undefined>;

  // Beta Invite Code methods
  createBetaInviteCode(code: InsertBetaInviteCode): Promise<BetaInviteCode>;
  getBetaInviteCodeByCode(code: string): Promise<BetaInviteCode | undefined>;
  useBetaInviteCode(code: string): Promise<BetaInviteCode | undefined>;
  getAllBetaInviteCodes(): Promise<BetaInviteCode[]>;
  deleteBetaInviteCode(id: string): Promise<boolean>;

  // User Stripe methods
  updateUserStripeInfo(userId: string, info: { stripeCustomerId?: string; stripeSubscriptionId?: string; accessTier?: string }): Promise<User | undefined>;
  getUserByStripeCustomerId(customerId: string): Promise<User | undefined>;

  // Usage tracking methods
  getUserUsage(userId: string): Promise<{ articlesUsed: number; brandsUsed: number; resetDate: Date | null } | undefined>;
  incrementArticleUsage(userId: string): Promise<boolean>;
  resetMonthlyUsage(userId: string): Promise<void>;
  updateBrandsUsed(userId: string, count: number): Promise<void>;

  // Keyword Research methods
  createKeywordResearch(keyword: InsertKeywordResearch): Promise<KeywordResearch>;
  getKeywordResearch(brandId: string, filters?: { status?: string; category?: string }): Promise<KeywordResearch[]>;
  getKeywordResearchById(id: string): Promise<KeywordResearch | undefined>;
  updateKeywordResearch(id: string, update: Partial<InsertKeywordResearch>): Promise<KeywordResearch | undefined>;
  deleteKeywordResearch(id: string): Promise<boolean>;
  getTopKeywordOpportunities(brandId: string, limit?: number): Promise<KeywordResearch[]>;

  // Community Post methods
  createCommunityPost(post: InsertCommunityPost): Promise<CommunityPost>;
  getCommunityPosts(brandId?: string, filters?: { platform?: string; status?: string }): Promise<CommunityPost[]>;
  getCommunityPostById(id: string): Promise<CommunityPost | undefined>;
  updateCommunityPost(id: string, update: Partial<InsertCommunityPost>): Promise<CommunityPost | undefined>;
  deleteCommunityPost(id: string): Promise<boolean>;

  // Content Draft methods (multi-draft persistence for the content page)
  createContentDraft(userId: string, data: Partial<InsertContentDraft>): Promise<ContentDraft>;
  getContentDraftsByUserId(userId: string): Promise<ContentDraft[]>;
  getContentDraftById(id: string, userId: string): Promise<ContentDraft | null>;
  getContentDraftByJobId(jobId: string, userId: string): Promise<ContentDraft | null>;
  updateContentDraft(id: string, userId: string, data: Partial<InsertContentDraft>): Promise<ContentDraft | null>;
  deleteContentDraft(id: string, userId: string): Promise<void>;
  deleteContentDraftsByBrandId(brandId: string): Promise<void>;
}


import { DatabaseStorage } from "./databaseStorage";
export const storage: IStorage = new DatabaseStorage();
