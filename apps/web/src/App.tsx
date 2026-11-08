import { Navigate, Route, Routes, BrowserRouter } from 'react-router-dom'
import AuthLayout from './components/auth/AuthLayout'
import Login from './pages/login'
import Signup from './pages/signup'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
