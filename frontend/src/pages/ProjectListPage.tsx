import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { ProjectCard } from '@/features/projects/ProjectCard'
import { exampleProject } from '../features/workspace/exampleProject'
import { mockProjects } from '@/features/projects/mockProjects'

/** Start page: project overview with favorites and all projects. */
export function ProjectListPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <>
      <AppHeader
        collapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((previous) => !previous)}
      />

      <div className="flex min-h-[calc(100vh-4rem)]">
        <AppSidebar collapsed={sidebarCollapsed} />

        <main className="min-w-0 flex-1 p-6">
          <div className="mx-auto max-w-4xl space-y-8">
            <section className="space-y-4">
              <h1 className="text-xl font-semibold">Favorites</h1>

              <div className="flex flex-wrap gap-4">
                {mockProjects
                  .filter((project) => project.favorite)
                  .map((project) => (
                    <ProjectCard
                      key={project.id}
                      name={project.name}
                      description={project.description}
                      favorite={project.favorite}
                    />
                  ))}
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold">All Projects</h2>

              <Link to={`/projects/${exampleProject.id}`} className="block">
                <Card className="hover:bg-muted">
                  <CardHeader>
                    <CardTitle>{exampleProject.name}</CardTitle>
                    <CardDescription>Hard-coded example project</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </section>
          </div>
        </main>
      </div>
    </>
  )
}
