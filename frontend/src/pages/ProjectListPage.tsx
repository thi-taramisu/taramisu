
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, Ellipsis, Star, Trash2 } from 'lucide-react'
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
import { exampleProject } from '@/api/mocks/data/headlamp'
import { mockProjects } from '@/api/mocks/data/projects'
import type { Project } from '@/api/models/project'

type MainView = 'projects' | 'archive'

/** Start page: project overview, favorites, and archived projects. */
export function ProjectListPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeView, setActiveView] = useState<MainView>('projects')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createDialogOpener, setCreateDialogOpener] =
    useState<HTMLButtonElement | null>(null)
  const [projects, setProjects] = useState<Project[]>(() => [...mockProjects])
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)

  function handleCreateProject(name: string) {
    const newProject: Project = {
      id: crypto.randomUUID(),
      name,
      description: 'New TARA project',
      favorite: false,
      archived: false,
      owner: 'Demo User',
      updatedAt: new Date().toISOString().slice(0, 10),
    }

    setProjects((previous) => [...previous, newProject])
    setActiveView('projects')
  }

  function handleToggleFavorite(projectId: string) {
    setProjects((previous) =>
      previous.map((project) =>
        project.id === projectId && !project.archived
          ? { ...project, favorite: !project.favorite }
          : project,
      ),
    )
  }

  function handleArchiveProject(projectId: string) {
    if (projectId === exampleProject.id) {
      return
    }

    setProjects((previous) =>
      previous.map((project) =>
        project.id === projectId
          ? { ...project, archived: true }
          : project,
      ),
    )
  }

  function handleRestoreProject(projectId: string) {
    setProjects((previous) =>
      previous.map((project) =>
        project.id === projectId
          ? { ...project, archived: false }
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

  const activeProjects = projects.filter((project) => !project.archived)
  const archivedProjects = projects.filter((project) => project.archived)

  return (
    <>
      <AppHeader
        collapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((previous) => !previous)}
      />

      <div className="flex min-h-[calc(100vh-4rem)]">
        <AppSidebar
          collapsed={sidebarCollapsed}
          activeView={activeView}
          onShowProjects={() => setActiveView('projects')}
          onShowArchive={() => setActiveView('archive')}
          onCreateProject={(opener) => {
          setCreateDialogOpener(opener)
          setCreateDialogOpen(true)
        }}
        />

        <main className="min-w-0 flex-1 p-6">
          <div className="mx-auto max-w-4xl space-y-8">
            {activeView === 'projects' ? (
              <>
                <h1 className="text-2xl font-semibold">Projects</h1>
                <section className="space-y-4">
                  <div className="flex justify-end">
                    <Link
                      to="/design-system/colors"
                      className="text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      Colour schemes
                    </Link>
                  </div>
                  <h2 className="text-xl font-semibold">Favorites</h2>

                  <div className="flex flex-wrap gap-4">
                    {activeProjects
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
                    {activeProjects.map((project) => {
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
                                  disabled={project.id === exampleProject.id}
                                  onSelect={() => handleArchiveProject(project.id)}
                                >
                                  <Archive className="size-4" />
                                  Archive Project
                                </DropdownMenuItem>

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
              </>
            ) : (
              <section className="space-y-4">
                <h1 className="text-xl font-semibold">Archive</h1>

                {archivedProjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No archived projects.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {archivedProjects.map((project) => (
                      <Card key={project.id} className="py-3">
                        <CardHeader className="flex flex-row items-center gap-4">
                          <div className="min-w-0 flex-1">
                            <CardTitle>{project.name}</CardTitle>
                            <CardDescription>
                              {project.description} &middot; {project.owner}
                            </CardDescription>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleRestoreProject(project.id)}
                            aria-label={`Restore ${project.name}`}
                          >
                            <ArchiveRestore className="size-4" />
                            Restore Project
                          </Button>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </main>
      </div>

      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreateProject={handleCreateProject}
        returnFocusTo={createDialogOpener}
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
