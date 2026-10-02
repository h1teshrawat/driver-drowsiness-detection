import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="mx-auto mt-20 max-w-md text-center">
      <p className="font-mono text-sm text-cyan-500">404</p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Page not found</h1>
      <Link to="/" className="btn-primary mt-6">
        Back home
      </Link>
    </div>
  )
}
