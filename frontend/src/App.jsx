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
            duration: 4200,
            className: 'bg-card border border-border text-foreground shadow-lg rounded-lg',
            style: {
              borderRadius: '0.5rem',
            },
            success: {
              iconTheme: {
                primary: '#4318FF',
                secondary: '#ffffff',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#ffffff',
              },
            },
          }}
        />
        <div className="min-h-screen bg-background">
          <Sidebar />
          <main className="lg:pl-72">
            <div className="page-wrapper">
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
