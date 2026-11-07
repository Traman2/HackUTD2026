
import { useSpacetimeDB } from 'spacetimedb/react'
import { databaseName } from './lib/spacetime'

function App() {
  const { isActive, connectionError } = useSpacetimeDB()

  return (
    <>
      <p>Testing</p>
      <p role="status">
        {isActive ? `Connected to ${databaseName}` : connectionError
          ? 'Unable to connect. Check that SpacetimeDB is running.'
          : 'Connecting to database…'}
      </p>
    </>
  )
}

export default App
