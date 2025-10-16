import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Books from './pages/Books';
import Prompts from './pages/Prompts';
import Users from './pages/Users';
import Training from './pages/Training';
import Generate from './pages/Generate';
import Evaluate from './pages/Evaluate';
import Storybooks from './pages/Storybooks';

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
            background: '#2a2d33',
            color: '#f3f3f3',
            borderRadius: '0.8rem',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          },
          success: {
            iconTheme: {
              primary: '#569cd6',
              secondary: '#1e1e1e',
            },
          },
          error: {
            iconTheme: {
              primary: '#f97316',
              secondary: '#1e1e1e',
            },
          },
        }}
      />
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 sm:pt-28">
          <div className="page-wrapper">
            <Routes>
              <Route path="/" element={<Books />} />
              <Route path="/books" element={<Books />} />
              <Route path="/prompts" element={<Prompts />} />
              <Route path="/users" element={<Users />} />
              <Route path="/training" element={<Training />} />
              <Route path="/generate" element={<Generate />} />
              <Route path="/evaluate" element={<Evaluate />} />
              <Route path="/storybooks" element={<Storybooks />} />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
}

export default App;
