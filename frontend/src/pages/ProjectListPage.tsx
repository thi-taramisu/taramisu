import { useRef, useState } from 'react'
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
import { ProjectImage } from '@/features/projects/ProjectImage'
import { ProjectCard } from '@/features/projects/ProjectCard'
import { CreateProjectDialog } from '@/features/projects/CreateProjectDialog'
import { ArchiveProjectDialog } from '@/features/projects/ArchiveProjectDialog'
import { DeleteProjectDialog } from '@/features/projects/DeleteProjectDialog'
import { changeError } from '@/features/projects/changeError'
import { exampleProject } from '@/api/mocks/data/headlamp'
import { isUnauthorized } from '@/api/errors'
import { SignInPrompt } from '@/auth/SignInPrompt'
import type { Project } from '@/api/models/project'
import { useTranslation } from 'react-i18next'
import {
  useArchiveProject,
  useCreateProject,
  useDeleteProject,
  useProjects,
  useRestoreProject,
  useSetFavorite,
  resetFailed,
} from '@/api/queries/projects'

type MainView = 'projects' | 'archive'

/** Start page: project overview, favorites, and archived projects. */
export function ProjectListPage() {
  const { t } = useTranslation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeView, setActiveView] = useState<MainView>('projects')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createDialogOpener, setCreateDialogOpener] =
    useState<HTMLButtonElement | null>(null)
  const projectsQuery = useProjects()
  const createProject = useCreateProject()
  const setFavorite = useSetFavorite()
  const archiveProject = useArchiveProject()
  const restoreProject = useRestoreProject()
  const deleteProject = useDeleteProject()
  const actionsButtons = useRef(new Map<string, HTMLButtonElement>())
  const [deleteDialogOpener, setDeleteDialogOpener] =
    useState<HTMLButtonElement | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)
  const [archiveDialogOpener, setArchiveDialogOpener] =
    useState<HTMLButtonElement | null>(null)
  const [projectToArchive, setProjectToArchive] = useState<Project | null>(null)

  const mutations = [createProject, setFavorite, archiveProject, restoreProject, deleteProject]

  function handleCreateProject(name: string, image?: File) {
    resetFailed(...mutations)
    createProject.mutate(
      { name, description: t('ui:newProjectDescription'), image },
      { onSuccess: () => setActiveView('projects') },
    )
  }

  function handleToggleFavorite(project: Project) {
    if (project.archived) return
    resetFailed(...mutations)
    setFavorite.mutate({ projectId: project.id, favorite: !project.favorite })
  }

  function handleDeleteProject() {
    // A second confirm while the request runs would delete twice and report the second 404.
    if (!projectToDelete || deleteProject.isPending) return
    resetFailed(...mutations)
    deleteProject.mutate(projectToDelete.id, { onSettled: () => setProjectToDelete(null) })
  }

  const projects = projectsQuery.data ?? []
  const activeProjects = projects.filter((project) => !project.archived)
  const archivedProjects = projects.filter((project) => project.archived)
  const failedMutation = mutations.find((mutation) => mutation.isError)
  const actionFailed = failedMutation !== undefined

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
            {projectsQuery.isPending && (
              <p className="text-sm text-muted-foreground">{t('ui:loadingProjects')}</p>
            )}
            {isUnauthorized(projectsQuery.error) && (
              <SignInPrompt>{t('ui:signInToSeeYourProjects')}</SignInPrompt>
            )}
            {projectsQuery.isError && !isUnauthorized(projectsQuery.error) && (
              <div className="flex items-center justify-between gap-2">
                <p role="alert" className="text-sm text-destructive">{t('ui:theProjectsCouldNotBeLoaded')}</p>
                <Button variant="outline" size="sm" onClick={() => void projectsQuery.refetch()}>{t('ui:retry')}</Button>
              </div>
            )}
            {actionFailed && (
              <p role="alert" className="text-sm text-destructive">{t(changeError(failedMutation?.error))}</p>
            )}
            {activeView === 'projects' ? (
              <>
                <h1 className="text-2xl font-semibold">{t('navigation.projects')}</h1>
                <section className="space-y-4">
                  <div className="flex justify-end">
                    <Link
                      to="/design-system/colors"
                      className="text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {t('navigation.colourSchemes')}
                    </Link>
                  </div>
                  <h2 className="text-xl font-semibold">{t('navigation.favorites')}</h2>

                  <div className="flex flex-wrap gap-4">
                    {activeProjects
                      .filter((project) => project.favorite)
                      .map((project) => (
                        <ProjectCard
                          key={project.id}
                          projectId={project.id}
                          name={project.name}
                          description={project.description}
                          image={project.image}
                          favorite={project.favorite}
                          onToggleFavorite={() =>
                            handleToggleFavorite(project)
                          }
                        />
                      ))}
                  </div>
                </section>

                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">{t('navigation.allProjects')}</h2>

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
                            <ProjectImage projectId={project.id} image={project.image} className="size-14 rounded-md" />
                            <Link
                              to={`/projects/${project.id}`}
                              aria-label={project.id === exampleProject.id ? t('ui:exampleProjectName', { name: project.name }) : project.name}
                              className="min-w-0 flex-1 hover:opacity-80"
                            >
                              {projectDetails}
                            </Link>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0"
                              onClick={() => handleToggleFavorite(project)}
                              aria-label={
                                project.favorite
                                  ? t('ui:removeFavorite', { name: project.name })
                                  : t('ui:addFavorite', { name: project.name })
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
                                  ref={(button) => {
                                    if (button) {
                                      actionsButtons.current.set(project.id, button)
                                    } else {
                                      actionsButtons.current.delete(project.id)
                                    }
                                  }}
                                  aria-label={t('ui:projectActions', { name: project.name })}
                                >
                                  <Ellipsis className="size-5" />
                                </Button>
                              </DropdownMenuTrigger>

                              <DropdownMenuContent align="end" className="w-max">
                                <DropdownMenuItem
                                  onSelect={() => {
                                    setArchiveDialogOpener(actionsButtons.current.get(project.id) ?? null)
                                    setProjectToArchive(project)
                                  }}
                                >
                                  <Archive className="size-4" />
                                  {t('ui:archiveProject')}
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() => {
                                    setDeleteDialogOpener(actionsButtons.current.get(project.id) ?? null)
                                    setProjectToDelete(project)
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                  {t('ui:deleteProject')}
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
                <h1 className="text-xl font-semibold">{t('navigation.archive')}</h1>

                {archivedProjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('ui:noArchivedProjects')}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {archivedProjects.map((project) => (
                      <Card key={project.id} className="py-3">
                        <CardHeader className="flex flex-row items-center gap-4">
                          <ProjectImage projectId={project.id} image={project.image} className="size-14 rounded-md" />
                          <div className="min-w-0 flex-1">
                            <CardTitle>{project.name}</CardTitle>
                            <CardDescription>
                              {project.description} &middot; {project.owner}
                            </CardDescription>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              resetFailed(...mutations)
                              restoreProject.mutate(project.id)
                            }}
                            aria-label={t('ui:restoreNamedProject', { name: project.name })}
                          >
                            <ArchiveRestore className="size-4" />
                            {t('ui:restoreProject')}
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

      <ArchiveProjectDialog
        projectName={projectToArchive?.name ?? null}
        onOpenChange={(open) => {
          if (!open) {
            setProjectToArchive(null)
          }
        }}
        onConfirm={() => {
          if (!projectToArchive) return
          resetFailed(...mutations)
          archiveProject.mutate(projectToArchive.id)
        }}
        returnFocusTo={archiveDialogOpener}
      />

      <DeleteProjectDialog
        projectName={projectToDelete?.name ?? null}
        onOpenChange={(open) => {
          if (!open) {
            setProjectToDelete(null)
          }
        }}
        onConfirm={handleDeleteProject}
        returnFocusTo={deleteDialogOpener}
      />
    </>
  )
}
