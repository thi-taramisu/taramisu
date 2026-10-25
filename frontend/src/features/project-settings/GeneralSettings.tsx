import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { headlampDetails } from './headlampSettings'

function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
}

export function GeneralSettings() {
  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <h2 className="text-lg font-semibold">General</h2>
      <div className="grid gap-2">
        <Label htmlFor="project-name">Name</Label>
        {/* The pattern also rejects names that only contain spaces. */}
        <Input id="project-name" name="name" defaultValue={headlampDetails.name} required pattern=".*\S.*" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="project-description">Description</Label>
        <Textarea id="project-description" name="description" defaultValue={headlampDetails.description} className="min-h-32" />
      </div>
      <div className="flex justify-end">
        <Button type="submit">Save</Button>
      </div>
    </form>
  )
}
