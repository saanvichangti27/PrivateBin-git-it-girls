import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import CreatePaste from './pages/CreatePaste';
import ViewPaste from './pages/ViewPaste';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-custom-bg text-custom-textPrimary flex flex-col font-sans">

        <header className="pt-8 pb-6 flex flex-col items-center justify-center border-b border-transparent">
          <Link to="/" className="flex flex-col items-center hover:opacity-90 transition-opacity">
            <div className="flex items-center justify-center w-full mb-2">
              <div className="h-px bg-custom-border w-6 mx-2"></div>
              <KeyRound size={16} className="text-custom-textSecondary -rotate-45" />
              <div className="h-px bg-custom-border w-6 mx-2"></div>
            </div>

            <h1 className="text-2xl font-bold tracking-tight mb-2">
              <span className="text-custom-textPrimary">private </span>
              <span className="text-custom-accent">bin</span>
            </h1>

            <p className="text-custom-textSecondary text-[10px] font-bold tracking-[0.15em] uppercase">
              Share What Matters. Privately.
            </p>
          </Link>
        </header>

        <main className="flex-grow w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<CreatePaste />} />
            <Route path="/view/:id" element={<ViewPaste />} />
            <Route path="/dashboard/:id" element={<Dashboard />} />
          </Routes>
        </main>

        <footer className="w-full text-center py-8 border-t border-custom-border mt-auto">
          <p className="text-sm text-custom-textSecondary tracking-wide">
            Powered by private bin &bull; End-to-End Encrypted Sharing
          </p>
        </footer>

      </div>
    </Router>
  );
}

export default App;
