import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateProject, useDeleteProject, useProjects } from '../../api/projects'

function ProjectPicker() {
  const { data: projects, isLoading } = useProjects()
  const createProject = useCreateProject()
  const deleteProject = useDeleteProject()
  const navigate = useNavigate()
  const [newTitle, setNewTitle] = useState('')

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    const project = await createProject.mutateAsync(title)
    setNewTitle('')
    navigate(`/project/${project.projectId}`)
  }

  function handleDelete(event: React.MouseEvent, projectId: string) {
    event.stopPropagation()
    if (confirm('Delete this project? This cannot be undone.')) {
      deleteProject.mutate(projectId)
    }
  }

  return (
    <div className="project-picker">
      <h1>Scriblr</h1>

      <form className="project-picker__new" onSubmit={handleCreate}>
        <input
          type="text"
          placeholder="New project title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button type="submit" disabled={createProject.isPending}>
          Create
        </button>
      </form>

      {isLoading && <p>Loading projects…</p>}

      <ul className="project-picker__list">
        {projects?.map((project) => (
          <li
            key={project.projectId}
            className="project-picker__item"
            onClick={() => navigate(`/project/${project.projectId}`)}
          >
            <span>{project.title}</span>
            <button type="button" onClick={(e) => handleDelete(e, project.projectId)}>
              Delete
            </button>
          </li>
        ))}
      </ul>

      {projects && projects.length === 0 && !isLoading && (
        <p className="project-picker__empty">No projects yet — create your first one above.</p>
      )}
    </div>
  )
}

export default ProjectPicker
