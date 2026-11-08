import { Navigate, Route, Routes, BrowserRouter } from 'react-router-dom'
import Login from './pages/login'
import Signup from './pages/signup'
import Spaces from './pages/spaces'
import SpaceDetails from './pages/space-details'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/spaces" element={<Spaces />} />
        <Route path="/spaces/:spaceId" element={<SpaceDetails />} />
        <Route path="*" element={<Navigate to="/spaces" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

