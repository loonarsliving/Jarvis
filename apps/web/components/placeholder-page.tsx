import { Card, CardContent, CardHeader, CardTitle } from "@aaf/ui";

/**
 * Shared shell for every not-yet-implemented route in this Sprint.
 * Agent 1 scaffolds routing + layout only (Engineering Constitution
 * Article VIII) — the owning agent replaces this with the real page.
 */
export function PlaceholderPage({
  title,
  owner,
  description,
}: {
  title: string;
  owner: string;
  description?: string;
}) {
  return (
    <div className="p-8">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-slate-600">
          <p>Coming soon — owned by {owner}.</p>
          {description && <p>{description}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
