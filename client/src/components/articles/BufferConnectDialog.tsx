// Buffer connect dialog — bring-your-own-key.
//
// Renders one of two states based on `connected`:
//   • Disconnected: the Connect button opens a dialog with a masked
//     input for the user's Buffer access token. Submit posts to
//     /api/buffer/connect; on success we close the dialog, invalidate
//     the /profiles query (so the parent picker repopulates), and
//     toast. On 400 invalid_token / missing_token we render an inline
//     error under the input. On 502 we show "Couldn't reach Buffer."
//   • Connected: the Disconnect button hits DELETE /api/buffer/connection
//     and invalidates /profiles. No confirmation modal — disconnecting
//     is reversible by reconnecting with the same (or a fresh) token.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface BufferConnectDialogProps {
  connected: boolean;
  // Optional controlled mode. When both `open` and `onOpenChange` are
  // passed, the dialog defers to the parent for open state. This lets
  // sibling buttons (e.g. PlatformPostButton's "Connect Buffer to post")
  // open the dialog without owning its own trigger.
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}

export default function BufferConnectDialog({
  connected,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: BufferConnectDialogProps) {
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) controlledOnOpenChange!(next);
    else setInternalOpen(next);
  };
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const connectMutation = useMutation({
    mutationFn: async (accessToken: string) => {
      const response = await apiRequest("POST", "/api/buffer/connect", { accessToken });
      const json = await response.json();
      return { status: response.status, body: json };
    },
    onSuccess: ({ status, body }) => {
      if (status === 200 && body?.success) {
        setOpen(false);
        setToken("");
        setError(null);
        queryClient.invalidateQueries({ queryKey: ["/api/buffer/profiles"] });
        toast({ title: "Buffer connected" });
        return;
      }
      if (body?.error === "missing_token") {
        setError("Token is required.");
      } else if (body?.error === "invalid_token") {
        setError("That token didn't work. Double-check it in Buffer's dashboard.");
      } else if (body?.error === "buffer_unreachable") {
        setError("Couldn't reach Buffer. Try again.");
      } else {
        setError("Connection failed. Try again.");
      }
    },
    onError: () => setError("Couldn't reach the server. Try again."),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/buffer/connection");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buffer/profiles"] });
      toast({ title: "Buffer disconnected" });
    },
  });

  if (connected) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => disconnectMutation.mutate()}
        disabled={disconnectMutation.isPending}
        data-testid="button-disconnect-buffer"
      >
        {disconnectMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
        Disconnect Buffer
      </Button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setToken("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-connect-buffer">
          Connect Buffer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Buffer</DialogTitle>
          <DialogDescription>
            Create an API key in Buffer Settings → API, then paste it below. We store it encrypted
            and use it only to publish on your behalf.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <a
            href="https://publish.buffer.com/settings/api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            Where do I get this?
          </a>
          <Input
            type="password"
            placeholder="Paste your Buffer API key"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              if (error) setError(null);
            }}
            data-testid="input-buffer-token"
          />
          {error && (
            <p className="text-sm text-red-600" data-testid="text-buffer-connect-error">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => connectMutation.mutate(token.trim())}
            disabled={connectMutation.isPending || !token.trim()}
            data-testid="button-submit-buffer-token"
          >
            {connectMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
            Connect
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
