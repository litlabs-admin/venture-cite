export type MentionPlatform = "reddit" | "hackernews" | "quora";

export function canonicalizeMentionUrl(platform: MentionPlatform, raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }

  if (platform === "reddit") {
    // Path forms:
    //   /r/<sub>/comments/<postId>/<slug>/        → /r/<sub>/comments/<postId>
    //   /r/<sub>/comments/<postId>/<slug>/<cmt>/  → /r/<sub>/comments/<postId>/<cmt>
    const segs = u.pathname.split("/").filter(Boolean);
    const cIdx = segs.indexOf("comments");
    if (cIdx >= 0 && segs.length >= cIdx + 2) {
      const postId = segs[cIdx + 1];
      const cmt = segs[cIdx + 3]; // slug at +2, comment id at +3
      const sub = segs.slice(0, cIdx).join("/");
      const tail = cmt ? `${postId}/${cmt}` : postId;
      return `https://reddit.com/${sub}/comments/${tail}`;
    }
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  }

  if (platform === "hackernews") {
    const id = u.searchParams.get("id");
    if (!id) return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}?id=${id}`;
  }

  if (platform === "quora") {
    return `${u.origin}${u.pathname.replace(/\/+$/, "").toLowerCase()}`;
  }

  return raw;
}
