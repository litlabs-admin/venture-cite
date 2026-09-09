// Composition only - the Today screen's three blocks (priority task,
// progress rail, observed visibility) land in a later wave. This file exists
// now because `/v2/today` needs a component to mount, and an empty route that
// renders nothing would look like a broken screen rather than an unbuilt one.
export default function TodayPage() {
  return (
    <div className="px-8 py-6">
      <h1 className="text-vc-primary text-base font-medium">Today</h1>
      <p className="mt-2 text-caption text-vc-secondary">This screen is not built yet.</p>
    </div>
  );
}
