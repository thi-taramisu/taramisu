import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Ellipsis, Star, Trash2 } from 'lucide-react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { ProjectCard } from '@/features/projects/ProjectCard'
import { CreateProjectDialog } from '@/features/projects/CreateProjectDialog'
import { DeleteProjectDialog } from '@/features/projects/DeleteProjectDialog'
import { mockProjects, type Project } from '@/features/projects/mockProjects'
import { exampleProject } from '../features/workspace/exampleProject'

/** Start page: project overview with favorites and all projects. */
export function ProjectListPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>(() => [...mockProjects])
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)

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

  function handleToggleFavorite(projectId: string) {
    setProjects((previous) =>
      previous.map((project) =>
        project.id === projectId
          ? { ...project, favorite: !project.favorite }
          : project,
      ),
    )
  }

  function handleDeleteProject() {
    if (!projectToDelete || projectToDelete.id === exampleProject.id) {
      return
    }

    setProjects((previous) =>
      previous.filter((project) => project.id !== projectToDelete.id),
    )

    setProjectToDelete(null)
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
                      onToggleFavorite={() =>
                        handleToggleFavorite(project.id)
                      }
                    />
                  ))}
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold">All Projects</h2>

              <div className="space-y-3">
                {projects.map((project) => {
                  const projectDetails = (
                    <div className="min-w-0 flex-1">
                      <CardTitle>{project.name}</CardTitle>
                      <CardDescription>
                        {project.description} &middot; {project.owner}
                      </CardDescription>
                    </div>
                  )

                  return (
                    <Card key={project.id} className="py-3">
                      <CardHeader className="flex flex-row items-center gap-4">
                        {project.id === exampleProject.id ? (
                          <Link
                            to={`/projects/${project.id}`}
                            aria-label={`${project.name} (example)`}
                            className="min-w-0 flex-1 hover:opacity-80"
                          >
                            {projectDetails}
                          </Link>
                        ) : (
                          projectDetails
                        )}

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => handleToggleFavorite(project.id)}
                          aria-label={
                            project.favorite
                              ? `Remove ${project.name} from favorites`
                              : `Add ${project.name} to favorites`
                          }
                          aria-pressed={project.favorite}
                        >
                          <Star
                            className="size-5"
                            fill={project.favorite ? 'currentColor' : 'none'}
                          />
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0"
                              aria-label={`Actions for ${project.name}`}
                            >
                              <Ellipsis className="size-5" />
                            </Button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={project.id === exampleProject.id}
                              onSelect={() => setProjectToDelete(project)}
                            >
                              <Trash2 className="size-4" />
                              Delete Project
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </CardHeader>
                    </Card>
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

      <DeleteProjectDialog
        projectName={projectToDelete?.name ?? null}
        onOpenChange={(open) => {
          if (!open) {
            setProjectToDelete(null)
          }
        }}
        onConfirm={handleDeleteProject}
      />
    </>
  )
}
