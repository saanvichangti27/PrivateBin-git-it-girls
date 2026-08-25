import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import CreatePaste from './pages/CreatePaste';
import ViewPaste from './pages/ViewPaste';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-[#FAF9F6] text-[#1a1a1a] flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
        <div className="w-full max-w-3xl">
          <header className="mb-12 text-center">
            <Link to="/" className="inline-flex flex-col items-center hover:opacity-80 transition-opacity">
              <div className="flex items-center justify-center gap-2 text-[#3733A5] font-semibold tracking-wide text-xl">
                <div className="bg-white border border-[#E5E7EB] rounded-lg p-1.5 shadow-sm">
                  <Lock size={16} className="text-[#3733A5]" />
                </div>
                <div className="flex items-center">
                  <span className="text-[#1a1a1a] font-bold">private</span>
                  <span className="font-bold">bin</span>
                </div>
              </div>
            </Link>
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
