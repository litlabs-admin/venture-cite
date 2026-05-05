import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

type AddMentionDialogProps = {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { platform: string; sourceUrl: string }) => Promise<void>;
};

export function AddMentionDialog({
  brandId: _brandId,
  open,
  onOpenChange,
  onSubmit,
}: AddMentionDialogProps) {
  const [platform, setPlatform] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reset = () => {
    setPlatform("");
    setSourceUrl("");
    setErrorMessage(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) reset();
  };

  const handleCancel = () => {
    onOpenChange(false);
    reset();
  };

  const handleSubmit = async () => {
    if (!platform || !sourceUrl.trim()) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onSubmit({ platform, sourceUrl: sourceUrl.trim() });
      onOpenChange(false);
      reset();
    } catch (err: unknown) {
      const e = err as { body?: { message?: string }; message?: string };
      setErrorMessage(e?.body?.message ?? e?.message ?? "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDisabled = !platform || !sourceUrl.trim() || isSubmitting;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a brand mention</DialogTitle>
          <DialogDescription>
            Add a mention the scanner missed by providing the platform and source URL.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="add-mention-platform">Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger id="add-mention-platform">
                <SelectValue placeholder="Select a platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reddit">Reddit</SelectItem>
                <SelectItem value="hackernews">Hacker News</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-mention-url">Source URL</Label>
            <Input
              id="add-mention-url"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://reddit.com/r/saas/comments/..."
            />
            <p className="text-xs text-muted-foreground">
              We&apos;ll fetch the page and check that your brand is mentioned.
            </p>
          </div>
          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button disabled={isDisabled} onClick={handleSubmit}>
            {isSubmitting ? "Adding..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
