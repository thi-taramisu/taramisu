import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-2 p-6">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link to="/projects" className="text-sm hover:underline">
        Back to projects
      </Link>
    </main>
  )
}
