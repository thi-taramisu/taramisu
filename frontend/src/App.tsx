import { Navigate, Route, Routes } from 'react-router-dom'
import { ItemDefinitionPage } from './pages/ItemDefinitionPage'

export default function App() {
  return (
    <Routes>
      <Route path="/item-definition" element={<ItemDefinitionPage />} />
      <Route path="*" element={<Navigate to="/item-definition" replace />} />
    </Routes>
  )
}
