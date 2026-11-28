import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useApi } from '@/api/ApiProvider'
import { isExampleProject } from '@/api/mocks/data/headlamp'
import type { RiskValue } from '@/api/models/threatScenario'
import { useProjectAccess } from '@/api/queries/projects'
import {
  createTreatmentDecisionApi,
  type TreatmentDecision,
  type TreatmentDecisionBody,
} from '@/api/treatmentDecisions'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { Placeholder } from '../workspace/Placeholder'

const options = ['AVOIDING', 'REDUCING', 'SHARING', 'RETAINING'] as const

export function ThreatScenarioTreatmentTab() {
  const { projectId = '', entityId = '' } = useParams()
  const { t } = useTranslation()
  if (isExampleProject(projectId)) return <Placeholder title={t('navigation.tabs.treatment')} />
  return <TreatmentDecisions key={`${projectId}/${entityId}`} projectId={projectId} scenarioId={entityId} />
}

function TreatmentDecisions({ projectId, scenarioId }: { projectId: string; scenarioId: string }) {
  const { t } = useTranslation()
  const { client } = useApi()
  const queryClient = useQueryClient()
  const { canEdit } = useProjectAccess(projectId)
  const api = createTreatmentDecisionApi(client, scenarioId)
  const key = ['projects', projectId, 'threat-scenarios', scenarioId, 'treatment-decisions'] as const
  const decisions = useQuery({ queryKey: key, queryFn: ({ signal }) => api.list(signal) })
  const risks = useQuery({
    queryKey: ['projects', projectId, 'threat-scenarios', scenarioId, 'treatment-risk-values'],
    queryFn: ({ signal }) => api.riskValues(signal),
  })
  const [editor, setEditor] = useState<{ decision?: TreatmentDecision } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TreatmentDecision | null>(null)
  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: TreatmentDecisionBody }) => id ? api.update(id, body) : api.create(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key })
      setEditor(null)
    },
  })
  const remove = useMutation({
    mutationFn: api.delete,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key })
      setDeleteTarget(null)
    },
  })
  const busy = save.isPending || remove.isPending

  return (
    <section className="grid max-w-3xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t('ui:treatment.heading')}</h2>
        {canEdit && decisions.data && !editor && (
          <Button size="sm" onClick={() => { save.reset(); setEditor({}) }} disabled={busy}>
            {t('ui:treatment.add')}
          </Button>
        )}
      </div>
      {decisions.isPending && <output className="text-sm text-muted-foreground">{t('ui:loading')}</output>}
      {decisions.isError && (
        <div className="flex items-center justify-between gap-2">
          <p role="alert" className="text-sm text-destructive">{t('ui:treatment.loadError')}</p>
          <Button variant="outline" size="sm" onClick={() => void decisions.refetch()}>{t('ui:retry')}</Button>
        </div>
      )}
      {decisions.data?.length === 0 && <p className="text-sm text-muted-foreground">{t('ui:treatment.empty')}</p>}
      {!!decisions.data?.length && (
        <ul className="divide-y rounded-lg border">
          {decisions.data.map((decision) => {
            const linkedRisk = risks.data?.find(({ id }) => id === decision.risk_value_id)
            return (
              <li key={decision.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <h3 className="text-sm font-semibold">{t(`ui:treatment.options.${decision.treatment_option}`)}</h3>
                  {decision.risk_value_id && (
                    <p className="text-sm text-muted-foreground">
                      {linkedRisk
                        ? t('ui:treatment.riskLabel', { score: linkedRisk.risk_score, reference: linkedRisk.id.slice(-8) })
                        : t('ui:treatment.riskReference', { reference: decision.risk_value_id.slice(-8) })}
                    </p>
                  )}
                  {decision.is_cybersecurity_claim && <p className="text-sm">{t('ui:treatment.claim')}</p>}
                  {decision.decision_rationale && <p className="whitespace-pre-wrap wrap-break-word text-sm">{decision.decision_rationale}</p>}
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={busy || !!editor} onClick={() => {
                      save.reset()
                      setEditor({ decision })
                    }}>{t('ui:treatment.edit')}</Button>
                    <Button variant="outline" size="sm" disabled={busy || !!editor} onClick={() => {
                      remove.reset()
                      setDeleteTarget(decision)
                    }}>{t('ui:treatment.delete')}</Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {canEdit && editor && (
        <DecisionForm
          decision={editor.decision}
          risks={risks.data}
          riskError={risks.isError}
          retryRisks={() => void risks.refetch()}
          pending={save.isPending}
          failed={save.isError}
          cancel={() => setEditor(null)}
          submit={(body) => save.mutate({ id: editor.decision?.id, body })}
        />
      )}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !remove.isPending) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ui:treatment.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('ui:cannotUndo')}</AlertDialogDescription>
          </AlertDialogHeader>
          {remove.isError && <p role="alert" className="text-sm text-destructive">{t('ui:treatment.deleteError')}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>{t('ui:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending || !canEdit}
              onClick={(event) => {
                event.preventDefault()
                if (deleteTarget && !remove.isPending) remove.mutate(deleteTarget.id)
              }}
            >{t('ui:treatment.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function DecisionForm({ decision, risks, riskError, retryRisks, pending, failed, cancel, submit }: {
  decision?: TreatmentDecision
  risks?: RiskValue[]
  riskError: boolean
  retryRisks: () => void
  pending: boolean
  failed: boolean
  cancel: () => void
  submit: (body: TreatmentDecisionBody) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [option, setOption] = useState(decision?.treatment_option ?? options[0])
  const [claim, setClaim] = useState(decision?.is_cybersecurity_claim ?? false)
  const [risk, setRisk] = useState(decision?.risk_value_id ?? '')
  const [rationale, setRationale] = useState(decision?.decision_rationale ?? '')
  const requiresClaim = option === 'SHARING' || option === 'RETAINING'

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || (requiresClaim && !claim)) return
    submit({
      treatment_option: option,
      is_cybersecurity_claim: claim,
      decision_rationale: rationale.trim() || null,
      risk_value_id: risk || null,
    })
  }

  return (
    <form onSubmit={save} className="grid gap-4 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">{t(decision ? 'ui:treatment.editTitle' : 'ui:treatment.add')}</h3>
      <fieldset disabled={pending} className="contents">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-option`}>{t('ui:treatment.option')}</Label>
          <NativeSelect
            id={`${id}-option`}
            value={option}
            onChange={(event) => setOption(event.target.value as TreatmentDecisionBody['treatment_option'])}
          >
            {options.map((value) => <NativeSelectOption key={value} value={value}>{t(`ui:treatment.options.${value}`)}</NativeSelectOption>)}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-risk`}>{t('ui:treatment.risk')}</Label>
          <NativeSelect id={`${id}-risk`} value={risk} disabled={!risks} onChange={(event) => setRisk(event.target.value)}>
            <NativeSelectOption value="">{t('ui:treatment.noRisk')}</NativeSelectOption>
            {risk && !risks?.some((value) => value.id === risk) && (
              <NativeSelectOption value={risk}>{t('ui:treatment.riskReference', { reference: risk.slice(-8) })}</NativeSelectOption>
            )}
            {risks?.map((value) => (
              <NativeSelectOption key={value.id} value={value.id}>
                {t('ui:treatment.riskLabel', { score: value.risk_score, reference: value.id.slice(-8) })}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {riskError && (
            <div className="flex items-center gap-2">
              <p role="alert" className="text-sm text-destructive">{t('ui:treatment.riskLoadError')}</p>
              <Button type="button" variant="outline" size="sm" onClick={retryRisks}>{t('ui:retry')}</Button>
            </div>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-rationale`}>{t('ui:treatment.rationale')}</Label>
          <Textarea id={`${id}-rationale`} value={rationale} onChange={(event) => setRationale(event.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label className="flex gap-2">
            <input
              type="checkbox"
              checked={claim}
              required={requiresClaim}
              aria-describedby={requiresClaim ? `${id}-claim-hint` : undefined}
              onChange={(event) => setClaim(event.target.checked)}
            />
            {t('ui:treatment.claim')}
          </Label>
          {requiresClaim && <p id={`${id}-claim-hint`} className="text-sm text-muted-foreground">{t('ui:treatment.claimRequired')}</p>}
        </div>
      </fieldset>
      {failed && <p role="alert" className="text-sm text-destructive">{t('ui:treatment.saveError')}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || (requiresClaim && !claim)}>{t('ui:save')}</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={cancel}>{t('ui:cancel')}</Button>
      </div>
    </form>
  )
}
