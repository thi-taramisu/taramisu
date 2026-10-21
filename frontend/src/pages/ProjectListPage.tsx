import { Link } from 'react-router-dom'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { exampleProject } from '../features/workspace/exampleProject'

/** Start page: list of projects. Favorites, archive and "Create project" come later. */
export function ProjectListPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Projects</h1>
      <Link to={`/projects/${exampleProject.id}`} className="block">
        <Card className="hover:bg-muted">
          <CardHeader>
            <CardTitle>{exampleProject.name}</CardTitle>
            <CardDescription>Hard-coded example project</CardDescription>
          </CardHeader>
        </Card>
      </Link>
    </main>
  )
}
