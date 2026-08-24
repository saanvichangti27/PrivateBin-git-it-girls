import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import CreatePaste from './pages/CreatePaste';
import ViewPaste from './pages/ViewPaste';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center py-10 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-4xl">
          <header className="mb-8 text-center">
            <Link to="/" className="inline-block group">
              <h1 className="text-4xl font-extrabold tracking-tight text-white mb-1.5 transition-transform group-hover:scale-[1.02]">
                <span className="text-emerald-500">Secure</span>Share
              </h1>
            </Link>
            <p className="text-zinc-400 text-xs sm:text-sm">
              End-to-end client-side encrypted secret sharing with real-time audit telemetry & access control.
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
