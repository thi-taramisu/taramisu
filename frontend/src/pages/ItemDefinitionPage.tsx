import { ItemDefinitionFlow } from '../features/item-definition/ItemDefinitionFlow'

export function ItemDefinitionPage() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <h1 style={{ margin: 0, padding: '0.75rem 1rem', fontSize: '1.25rem' }}>
        Item Definition: Headlamp system (example)
      </h1>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ItemDefinitionFlow />
      </div>
    </main>
  )
}
