import { Link, useLocation } from 'react-router-dom';

function Navbar() {
  const location = useLocation();

  const isActive = (path) => location.pathname === path ? 'active' : '';

  return (
    <div className="navbar">
      <div className="navbar-content">
        <h1>AI Book Story</h1>
        <nav>
          <Link to="/" className={isActive('/')}>
            Users
          </Link>
          <Link to="/training" className={isActive('/training')}>
            Training
          </Link>
          <Link to="/generate" className={isActive('/generate')}>
            Generate
          </Link>
        </nav>
      </div>
    </div>
  );
}

export default Navbar;
