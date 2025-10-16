# AI Book Story - Frontend

React-based frontend for AI Book Story application.

## Features

- User management interface
- Model training workflow
- Image generation interface
- Real-time status updates
- Responsive design
- Toast notifications

## Tech Stack

- React 18
- React Router DOM
- Axios
- React Hot Toast
- Vite

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Build

```bash
npm run build
```

## Preview Production Build

```bash
npm run preview
```

## Project Structure

```
src/
├── components/        # Reusable components
│   └── Navbar.jsx    # Navigation bar
├── pages/            # Page components
│   ├── Users.jsx     # User management
│   ├── Training.jsx  # Model training
│   └── Generate.jsx  # Image generation
├── services/         # API services
│   └── api.js        # API client
├── utils/            # Utilities
│   └── styles.css    # Global styles
├── App.jsx           # Main app component
└── main.jsx          # Entry point
```

## API Configuration

The frontend connects to the backend API at:
- Development: `http://localhost:5000/api`
- Can be configured via `VITE_API_URL` environment variable

## Available Pages

- `/` - User Management
- `/training` - Model Training
- `/generate` - Image Generation

## Styling

- Custom CSS with modern design
- Gradient backgrounds
- Responsive grid layouts
- Smooth animations and transitions

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
