import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import CreatePaste from './pages/CreatePaste';
import ViewPaste from './pages/ViewPaste';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-3xl">
          <header className="mb-10 text-center">
            <Link to="/" className="inline-block hover:opacity-80 transition-opacity">
              <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
                <span className="text-emerald-500">Secure</span>Share
              </h1>
            </Link>
            <p className="text-zinc-400 text-sm">
              End-to-end encrypted secret sharing. Links self-destruct.
            </p>
          </header>

          <main>
            <Routes>
              <Route path="/" element={<CreatePaste />} />
              <Route path="/view/:id" element={<ViewPaste />} />
              <Route path="/dashboard/:id" element={<Dashboard />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;
