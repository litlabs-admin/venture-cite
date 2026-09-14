// Live: brand profile, measurement cadence, and competitor set through the
// app's existing /api/brands and /api/competitors endpoints; account profile
// through /api/user/profile; audit history through the new, brand-scoped
// GET /api/v2/settings/:brandId/audit-log (server/routes/v2Settings.ts).
//
// Every read here uses an explicit queryFn (apiRequest + parse), the same
// convention as the other v2 screen adapters (see b04/b07/b39's data.ts) -
// not the app-wide default queryFn, which is tuned for the legacy dashboard's
// retry/backoff behavior and would make this screen's own error and loading
// states depend on that unrelated tuning.
//
// Pending backend work: tracked AI engines are shown as the account-wide
// active platform list (shared/constants.ts AI_PLATFORMS_ACTIVE) because no
// per-brand engine selection exists in the schema - editing that set would
// require a new column and a migration, which is out of scope here.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useV2Mode } from "@/v2/shell/useV2Mode";
import { AI_PLATFORMS_ACTIVE } from "@shared/constants";
import type { Competitor } from "@shared/schema";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type {
  Board24AccountPatch,
  Board24AuditEntry,
  Board24BrandProfilePatch,
  Board24Cadence,
  Board24Data,
  Board24Value,
} from "./Screen";

type CompetitorsResponse = { success: boolean; data: Competitor[] };
type AuditLogResponse = { success: boolean; data: Board24AuditEntry[] };

async function readJson<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  return (await response.json()) as T;
}

function toCadence(value: string | null | undefined): Board24Cadence {
  return value === "weekly" || value === "biweekly" || value === "monthly" ? value : "off";
}

function toTier(value: string | null | undefined): "core" | "discovered" {
  return value === "core" ? "core" : "discovered";
}

function toAuditEntry(row: {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
}): Board24AuditEntry {
  return { id: row.id, action: row.action, entityType: row.entityType, createdAt: row.createdAt };
}

export function useBoard24Data(): V2LiveResult<Board24Data> {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const { user, isLoading: userLoading } = useAuth();
  const { mode } = useV2Mode();
  const queryClient = useQueryClient();

  const competitorsQuery = useQuery<CompetitorsResponse>({
    queryKey: ["/api/competitors", { brandId: selectedBrandId }],
    enabled: Boolean(selectedBrandId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readJson<CompetitorsResponse>(
        `/api/competitors?brandId=${encodeURIComponent(selectedBrandId)}`,
      ),
  });

  const auditQuery = useQuery<AuditLogResponse>({
    queryKey: ["/api/v2/settings", selectedBrandId, "audit-log"],
    enabled: Boolean(selectedBrandId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readJson<AuditLogResponse>(
        `/api/v2/settings/${encodeURIComponent(selectedBrandId)}/audit-log`,
      ),
  });

  const invalidateBrands = () => queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
  const invalidateCompetitors = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/competitors", { brandId: selectedBrandId }] });

  const saveBrandMutation = useMutation({
    mutationFn: async (patch: Board24BrandProfilePatch) => {
      if (!selectedBrand) throw new Error("No brand is selected.");
      const res = await apiRequest("PUT", `/api/brands/${selectedBrand.id}`, {
        ...patch,
        expectedVersion: selectedBrand.version,
      });
      return res.json();
    },
    onSuccess: invalidateBrands,
  });

  const saveCadenceMutation = useMutation({
    mutationFn: async (cadence: Board24Cadence) => {
      if (!selectedBrand) throw new Error("No brand is selected.");
      const res = await apiRequest("PUT", `/api/brands/${selectedBrand.id}`, {
        autoCitationSchedule: cadence,
        expectedVersion: selectedBrand.version,
      });
      return res.json();
    },
    onSuccess: invalidateBrands,
  });

  const addCompetitorMutation = useMutation({
    mutationFn: async (input: { name: string; domain: string }) => {
      if (!selectedBrandId) throw new Error("No brand is selected.");
      const res = await apiRequest("POST", "/api/competitors", {
        ...input,
        brandId: selectedBrandId,
      });
      return res.json();
    },
    onSuccess: invalidateCompetitors,
  });

  const removeCompetitorMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/competitors/${id}`);
      return res.json();
    },
    onSuccess: invalidateCompetitors,
  });

  const saveAccountMutation = useMutation({
    mutationFn: async (patch: Board24AccountPatch) => {
      const res = await apiRequest("PATCH", "/api/user/profile", patch);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
  });

  if (brandsLoading || userLoading) return { state: { kind: "loading" } };
  if (!selectedBrandId || !selectedBrand) {
    return { state: { kind: "empty", reason: "No brand is selected." } };
  }
  if (!user) {
    return { state: { kind: "error", message: "Could not load your account." } };
  }
  if (competitorsQuery.isPending || auditQuery.isPending) {
    return { state: { kind: "loading" } };
  }
  if (competitorsQuery.isError) {
    return {
      state: {
        kind: "error",
        message:
          competitorsQuery.error instanceof Error
            ? competitorsQuery.error.message
            : "Failed to load the competitor set.",
      },
    };
  }

  const auditHistory: Board24Value<readonly Board24AuditEntry[]> =
    auditQuery.isError || !auditQuery.data
      ? { kind: "not-measured", reason: "Audit history could not be loaded." }
      : { kind: "available", value: auditQuery.data.data.map(toAuditEntry) };

  const data: Board24Data = {
    brandId: selectedBrandId,
    mode,
    brand: {
      name: selectedBrand.name,
      companyName: selectedBrand.companyName,
      industry: selectedBrand.industry,
      website: selectedBrand.website ?? "",
      description: selectedBrand.description ?? "",
      targetAudience: selectedBrand.targetAudience ?? "",
    },
    cadence: toCadence(selectedBrand.autoCitationSchedule),
    engines: AI_PLATFORMS_ACTIVE,
    competitors: (competitorsQuery.data?.data ?? []).map((competitor) => ({
      id: competitor.id,
      name: competitor.name,
      domain: competitor.domain,
      tier: toTier(competitor.tier),
    })),
    account: {
      email: user.email ?? "",
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      timezone: user.timezone ?? "",
    },
    auditHistory,
    actions: {
      saveBrandProfile: async (patch) => {
        await saveBrandMutation.mutateAsync(patch);
      },
      saveCadence: async (cadence) => {
        await saveCadenceMutation.mutateAsync(cadence);
      },
      addCompetitor: async (input) => {
        await addCompetitorMutation.mutateAsync(input);
      },
      removeCompetitor: async (id) => {
        await removeCompetitorMutation.mutateAsync(id);
      },
      saveAccountProfile: async (patch) => {
        await saveAccountMutation.mutateAsync(patch);
      },
    },
  };

  const stale = competitorsQuery.isFetching || auditQuery.isFetching;
  if (stale) {
    const timestamps = [competitorsQuery.dataUpdatedAt, auditQuery.dataUpdatedAt].filter(
      (time) => time > 0,
    );
    return {
      state: {
        kind: "stale",
        reason: "Settings data is refreshing.",
        asOf: new Date(Math.min(...timestamps)).toISOString(),
      },
      data,
    };
  }

  return { state: { kind: "ready" }, data };
}
