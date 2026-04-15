import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAccessToken, clearSession } from "@/lib/authStore";

interface User {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  accessTier: string;
  profileImageUrl?: string | null;
  isAdmin?: boolean;
}

async function fetchUser(): Promise<User | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const response = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);

  const data = await response.json();
  return data.success ? data.user : null;
}

async function logoutUser(): Promise<void> {
  await clearSession();
  await fetch("/api/auth/logout", { method: "POST" });
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const logoutMutation = useMutation({
    mutationFn: logoutUser,
    onSuccess: () => {
      // Wipe EVERY cached query so the next user (or anon state) can't see
      // the previous user's brands/articles/citations.
      queryClient.clear();
      window.location.href = "/login";
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
