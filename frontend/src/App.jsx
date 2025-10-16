import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Users from './pages/Users';
import Training from './pages/Training';
import Generate from './pages/Generate';
import './utils/styles.css';

function App() {
  return (
    <Router>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#48bb78',
              secondary: '#fff',
            },
          },
          error: {
            duration: 4000,
            iconTheme: {
              primary: '#f56565',
              secondary: '#fff',
            },
          },
        }}
      />
      <Navbar />
      <Routes>
        <Route path="/" element={<Users />} />
        <Route path="/training" element={<Training />} />
        <Route path="/generate" element={<Generate />} />
      </Routes>
    </Router>
  );
}

export default App;
