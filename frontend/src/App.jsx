import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './contexts/ThemeContext';
import Sidebar from './components/Sidebar';
import Books from './pages/Books';
import Prompts from './pages/Prompts';
import Users from './pages/Users';
import Training from './pages/Training';
import Generate from './pages/Generate';
import Evaluate from './pages/Evaluate';
import Storybooks from './pages/Storybooks';
import Automate from './pages/Automate';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'hsl(var(--card))',
              color: 'hsl(var(--foreground))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.75rem',
              padding: '16px',
              fontSize: '14px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              maxWidth: '400px',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: 'hsl(var(--foreground))',
                secondary: 'hsl(var(--card))',
              },
              style: {
                background: 'hsl(var(--card))',
                color: 'hsl(var(--foreground))',
                border: '1px solid hsl(var(--border))',
              },
            },
            error: {
              duration: 4500,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#ffffff',
              },
              style: {
                background: 'hsl(var(--card))',
                color: 'hsl(var(--foreground))',
                border: '1px solid #ef4444',
              },
            },
            loading: {
              iconTheme: {
                primary: 'hsl(var(--foreground))',
                secondary: 'hsl(var(--card))',
              },
            },
          }}
        />
        <div className="min-h-screen bg-background">
          <Sidebar />
          <main className="min-h-screen lg:pl-72">
            <div className="page-wrapper pt-[70px] lg:pt-6">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/books" element={<Books />} />
                <Route path="/prompts" element={<Prompts />} />
                <Route path="/users" element={<Users />} />
                <Route path="/training" element={<Training />} />
                <Route path="/generate" element={<Generate />} />
                <Route path="/evaluate" element={<Evaluate />} />
                <Route path="/storybooks" element={<Storybooks />} />
                <Route path="/automate" element={<Automate />} />
              </Routes>
            </div>
          </main>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
