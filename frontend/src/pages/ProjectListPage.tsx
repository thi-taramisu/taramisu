
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { ProjectCard } from '@/features/projects/ProjectCard'
import { CreateProjectDialog } from '@/features/projects/CreateProjectDialog'
import { mockProjects, type Project } from '@/features/projects/mockProjects'
import { exampleProject } from '../features/workspace/exampleProject'

/** Start page: project overview with favorites and all projects. */
export function ProjectListPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  // Start with the existing mock projects.
  const [projects, setProjects] = useState<Project[]>(() => [...mockProjects])

  function handleCreateProject(name: string) {
    const newProject: Project = {
      id: crypto.randomUUID(),
      name,
      description: 'New TARA project',
      favorite: false,
      owner: 'Demo User',
      updatedAt: new Date().toISOString().slice(0, 10),
    }

    setProjects((previous) => [...previous, newProject])
  }

  return (
    <>
      <AppHeader
        collapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((previous) => !previous)}
      />

      <div className="flex min-h-[calc(100vh-4rem)]">
        <AppSidebar
          collapsed={sidebarCollapsed}
          onCreateProject={() => setCreateDialogOpen(true)}
        />

        <main className="min-w-0 flex-1 p-6">
          <div className="mx-auto max-w-4xl space-y-8">
            <section className="space-y-4">
              <h1 className="text-xl font-semibold">Favorites</h1>

              <div className="flex flex-wrap gap-4">
                {projects
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

              <div className="space-y-3">
                {projects.map((project) => {
                  const card = (
                    <Card className="py-3">
                      <CardHeader>
                        <CardTitle>{project.name}</CardTitle>
                        <CardDescription>
                          {project.description} · {project.owner}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  )

                  return project.id === exampleProject.id ? (
                    <Link
                      key={project.id}
                      to={`/projects/${project.id}`}
                      aria-label={`${project.name} (example)`}
                      className="block hover:opacity-80"
                    >
                      {card}
                    </Link>
                  ) : (
                    <div key={project.id}>{card}</div>
                  )
                })}
              </div>
            </section>
          </div>
        </main>
      </div>

      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreateProject={handleCreateProject}
      />
    </>
  )
}
