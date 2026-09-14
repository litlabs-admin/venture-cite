import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// /v2/settings/team's reads and writes. Namespaced ["v2", ...] for the same
// reason workTasks.ts is: the query client is shared with the live dashboard,
// so a plain key would let an invalidation here re-render it.

export type TeamInvitationRole = "editor" | "analyst" | "viewer";
export type TeamInvitationStatus = "pending" | "revoked" | "accepted";

export type TeamInvitationView = {
  id: string;
  email: string;
  role: TeamInvitationRole;
  status: TeamInvitationStatus;
  createdAt: string;
};

export type TeamAuditEventView = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  occurredAt: string;
  summary: string;
};

export type TeamOverviewView = {
  owner: { id: string; name: string; email: string | null };
  assignedBrandCount: number;
  seatsUsed: number;
  invitations: TeamInvitationView[];
  auditEvents: TeamAuditEventView[];
};

async function readJson<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  const payload = (await response.json()) as { success: boolean; data: T };
  return payload.data;
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await apiRequest("POST", url, body);
  const payload = (await response.json()) as { success: boolean; data: T };
  return payload.data;
}

function overviewKey(brandId: string) {
  return ["v2", "team", "overview", brandId] as const;
}

export function useTeamOverview(brandId: string) {
  return useQuery<TeamOverviewView>({
    queryKey: overviewKey(brandId),
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readJson<TeamOverviewView>(`/api/v2/team/${encodeURIComponent(brandId)}/overview`),
  });
}

export function useCreateInvitation(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation<TeamInvitationView, Error, { email: string; role: TeamInvitationRole }>({
    mutationFn: (input) =>
      postJson<TeamInvitationView>(
        `/api/v2/team/${encodeURIComponent(brandId)}/invitations`,
        input,
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: overviewKey(brandId) }),
  });
}

export function useRevokeInvitation(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation<{ id: string }, Error, { invitationId: string }>({
    mutationFn: ({ invitationId }) =>
      postJson<{ id: string }>(
        `/api/v2/team/${encodeURIComponent(brandId)}/invitations/${encodeURIComponent(invitationId)}/revoke`,
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: overviewKey(brandId) }),
  });
}

export function useResendInvitation(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation<{ id: string; createdAt: string }, Error, { invitationId: string }>({
    mutationFn: ({ invitationId }) =>
      postJson<{ id: string; createdAt: string }>(
        `/api/v2/team/${encodeURIComponent(brandId)}/invitations/${encodeURIComponent(invitationId)}/resend`,
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: overviewKey(brandId) }),
  });
}

export type TaskHandoffInput = {
  taskId: string;
  toEmail: string | null;
  note: string;
  dueDate: string | null;
};

export function useTaskHandoff(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation<{ id: string }, Error, TaskHandoffInput>({
    mutationFn: (input) =>
      postJson<{ id: string }>(`/api/v2/team/${encodeURIComponent(brandId)}/handoff`, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: overviewKey(brandId) }),
  });
}
