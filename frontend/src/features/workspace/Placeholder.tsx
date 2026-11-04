/** Stand-in for a page or tab that is routed but not built yet. */
export function Placeholder({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
      {title}: not implemented yet
    </div>
  )
}
