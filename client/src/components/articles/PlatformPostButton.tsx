// Per-card "Post to Buffer" button with a four-state machine.
//
//   1. platformPostId truthy             → "Queued ✓ View in Buffer" (link to queue)
//   2. !bufferConnected                  → "Connect Buffer to post" (opens connect dialog)
//   3. matches.length === 0              → "Add to Buffer Queue" disabled, tooltip explains
//   4. matches.length === 1              → "Add to Buffer Queue" → enqueues via Buffer's mode:addToQueue
//   5. matches.length > 1                → "Add to Buffer Queue ▾" → popover picker
//
// Posted state is stored on the distributions row (platformPostId), so
// closing and reopening the dialog preserves it across sessions.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Send, ExternalLink, ChevronDown } from "lucide-react";

const BUFFER_QUEUE_URL = "https://publish.buffer.com/queue";

export interface BufferChannelMatch {
  id: string;
  service: string;
  formattedService: string;
  username: string;
  avatar?: string | null;
}

interface PlatformPostButtonProps {
  platform: string;
  distributionId: string | undefined;
  platformPostId: string | null | undefined;
  bufferConnected: boolean;
  matches: BufferChannelMatch[];
  isPosting: boolean;
  error: string | undefined;
  onPost: (channelId: string) => void;
  onConnectClick: () => void;
}

export default function PlatformPostButton({
  platform,
  distributionId,
  platformPostId,
  bufferConnected,
  matches,
  isPosting,
  error,
  onPost,
  onConnectClick,
}: PlatformPostButtonProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  // 1. Already posted.
  if (platformPostId) {
    return (
      <div className="flex flex-col gap-1">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="text-green-700 border-green-300 dark:text-green-400 dark:border-green-800"
          data-testid={`button-buffer-posted-${platform.toLowerCase()}`}
        >
          <a href={BUFFER_QUEUE_URL} target="_blank" rel="noopener noreferrer">
            Queued <ExternalLink className="w-3 h-3 ml-1" />
          </a>
        </Button>
      </div>
    );
  }

  // Defensive: distribution row not yet persisted (shouldn't normally render).
  if (!distributionId) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        Generating…
      </Button>
    );
  }

  // 2. Buffer not connected — prompt to connect.
  if (!bufferConnected) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onConnectClick}
        data-testid={`button-buffer-connect-${platform.toLowerCase()}`}
      >
        Connect Buffer to post
      </Button>
    );
  }

  // 3. No matching channel for this platform.
  if (matches.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button variant="outline" size="sm" disabled>
                  <Send className="w-3 h-3 mr-1" />
                  Add to Buffer Queue
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>No {platform} channel in your Buffer.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  const renderError = () =>
    error ? (
      <p
        className="text-sm text-red-600 mt-1"
        data-testid={`text-buffer-post-error-${platform.toLowerCase()}`}
      >
        {error}
      </p>
    ) : null;

  // 4. Exactly one match — post directly.
  if (matches.length === 1) {
    const channel = matches[0];
    return (
      <div className="flex flex-col gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPost(channel.id)}
          disabled={isPosting}
          data-testid={`button-buffer-post-${platform.toLowerCase()}`}
        >
          {isPosting ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Posting…
            </>
          ) : (
            <>
              <Send className="w-3 h-3 mr-1" />
              Add to Buffer Queue
            </>
          )}
        </Button>
        {renderError()}
      </div>
    );
  }

  // 5. Multiple matches — popover picker.
  return (
    <div className="flex flex-col gap-1">
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={isPosting}
            data-testid={`button-buffer-post-picker-${platform.toLowerCase()}`}
          >
            {isPosting ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Posting…
              </>
            ) : (
              <>
                <Send className="w-3 h-3 mr-1" />
                Add to Buffer Queue
                <ChevronDown className="w-3 h-3 ml-1" />
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-1">
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Choose a {platform} account</p>
          {matches.map((ch) => (
            <Button
              key={ch.id}
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setPickerOpen(false);
                onPost(ch.id);
              }}
              data-testid={`button-buffer-channel-${ch.id}`}
            >
              <span className="truncate">{ch.username || ch.formattedService}</span>
            </Button>
          ))}
        </PopoverContent>
      </Popover>
      {renderError()}
    </div>
  );
}
