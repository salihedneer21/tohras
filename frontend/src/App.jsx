import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Users from './pages/Users';
import Training from './pages/Training';
import Generate from './pages/Generate';

function App() {
  return (
    <Router>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4200,
          className:
            'glass-panel border border-border bg-card text-foreground shadow-subtle',
          style: {
            background: 'rgba(15, 23, 42, 0.92)',
            color: '#f8fafc',
            borderRadius: '0.8rem',
            border: '1px solid rgba(148, 163, 184, 0.25)',
          },
          success: {
            iconTheme: {
              primary: '#34d399',
              secondary: '#030712',
            },
          },
          error: {
            iconTheme: {
              primary: '#f97316',
              secondary: '#030712',
            },
          },
        }}
      />
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 sm:pt-28">
          <div className="page-wrapper">
            <Routes>
              <Route path="/" element={<Users />} />
              <Route path="/training" element={<Training />} />
              <Route path="/generate" element={<Generate />} />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
}

export default App;
