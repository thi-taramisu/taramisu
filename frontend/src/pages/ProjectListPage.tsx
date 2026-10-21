
import { Link } from 'react-router-dom'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { exampleProject } from '../features/workspace/exampleProject'

/** Start page: list of projects. Favorites, archive and "Create project" come later. */
export function ProjectListPage() {
  return (
    <>
      <AppHeader />

      <div className="flex min-h-[calc(100vh-4rem)]">
        <AppSidebar />

        <main className="min-w-0 flex-1 p-6">
          <div className="mx-auto max-w-4xl space-y-4">
            <h1 className="text-xl font-semibold">Projects</h1>

            <Link to={`/projects/${exampleProject.id}`} className="block">
              <Card className="hover:bg-muted">
                <CardHeader>
                  <CardTitle>{exampleProject.name}</CardTitle>
                  <CardDescription>Hard-coded example project</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </main>
      </div>
    </>
  )
}
