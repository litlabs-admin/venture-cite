import { Lightbulb } from "lucide-react";

export default function BeginnerTips() {
  return (
    <div className="mt-4 p-4 bg-muted border border-border rounded-lg">
      <div className="flex items-start gap-3">
        <Lightbulb className="w-5 h-5 text-muted-foreground mt-0.5" />
        <div>
          <h3 className="font-semibold text-foreground text-sm">💡 Content Tips for Beginners</h3>
          <ul className="text-muted-foreground text-sm mt-2 space-y-1 list-disc list-inside">
            <li>Use specific keywords your customers search for</li>
            <li>Choose your industry to get targeted content</li>
            <li>Articles work best for building authority and getting citations</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
