# Installation Instructions

Complete installation guide for AI Book Story.

## System Requirements

- **Node.js**: Version 16.0.0 or higher
- **npm**: Version 7.0.0 or higher
- **MongoDB**: Version 4.4 or higher (local or Atlas)
- **Memory**: Minimum 4GB RAM
- **Disk Space**: 500MB for dependencies

## Installation Steps

### 1. Backend Installation

```bash
# Navigate to backend directory
cd ai-book-story/backend

# Install dependencies
npm install

# Expected packages installed:
# - express (4.18.2)
# - mongoose (8.0.0)
# - dotenv (16.3.1)
# - cors (2.8.5)
# - replicate (0.25.0)
# - body-parser (1.20.2)
# - express-validator (7.0.1)
# - fs-extra (11.2.0)
# - nodemon (3.0.2) [dev]
```

### 2. Configure Backend Environment

```bash
# The .env file is already created, verify it contains:
cat .env

# Should show:
# MONGODB_URI=mongodb://localhost:27017/ai-book-story
# PORT=5000
# NODE_ENV=development
# REPLICATE_API_TOKEN=r8_JTgCQAGaSBqC05mFAKrPCGRArrBLoaW0YC1jq
# CORS_ORIGIN=http://localhost:3000
# IMAGES_FOLDER=./generated-images
```

### 3. Verify MongoDB

**Option A: Local MongoDB**
```bash
# Check if MongoDB is running
mongosh

# If not running, start it:
mongod --dbpath /path/to/data/db
```

**Option B: MongoDB Atlas**
```bash
# Update MONGODB_URI in backend/.env:
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ai-book-story?retryWrites=true&w=majority
```

### 4. Start Backend Server

```bash
# From backend directory
npm run dev

# Expected output:
# ✅ Replicate API token configured
# ✅ MongoDB Connected: localhost
# 📊 Database: ai-book-story
# ==================================================
# 🚀 Server running on port 5000
# 📡 Environment: development
# 🌐 API URL: http://localhost:5000
# 💚 Health check: http://localhost:5000/health
# ==================================================
```

### 5. Test Backend (in new terminal)

```bash
# Test health endpoint
curl http://localhost:5000/health

# Expected response:
# {"success":true,"message":"AI Book Story API is running","timestamp":"..."}
```

### 6. Frontend Installation

```bash
# Open new terminal
cd ai-book-story/frontend

# Install dependencies
npm install

# Expected packages installed:
# - react (18.2.0)
# - react-dom (18.2.0)
# - react-router-dom (6.20.0)
# - axios (1.6.2)
# - react-hot-toast (2.4.1)
# - vite (5.0.5) [dev]
# - @vitejs/plugin-react (4.2.1) [dev]
```

### 7. Start Frontend Development Server

```bash
# From frontend directory
npm run dev

# Expected output:
# VITE v5.0.5  ready in 500 ms
# ➜  Local:   http://localhost:3000/
# ➜  Network: use --host to expose
# ➜  press h to show help
```

### 8. Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

You should see the AI Book Story application with the navigation bar showing:
- Users
- Training
- Generate

## Verification Checklist

- [ ] Backend server running on port 5000
- [ ] MongoDB connected successfully
- [ ] Replicate API token configured
- [ ] Frontend server running on port 3000
- [ ] Can access http://localhost:3000 in browser
- [ ] No console errors in browser
- [ ] Can navigate between pages

## Build for Production

### Backend Production Build
```bash
cd backend
npm start
```

### Frontend Production Build
```bash
cd frontend
npm run build

# Outputs to: frontend/dist/
# To preview:
npm run preview
```

## Docker Installation (Optional)

### Backend Dockerfile
```dockerfile
# backend/Dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

### Frontend Dockerfile
```dockerfile
# frontend/Dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "preview"]
```

### Docker Compose
```yaml
# docker-compose.yml (in root directory)
version: '3.8'
services:
  mongodb:
    image: mongo:6
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

  backend:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/ai-book-story
    depends_on:
      - mongodb

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  mongodb_data:
```

Run with Docker:
```bash
docker-compose up -d
```

## Troubleshooting

### Backend won't start
```bash
# Check if port 5000 is in use
lsof -i :5000

# Kill the process if needed
kill -9 <PID>

# Or change port in backend/.env
PORT=5001
```

### Frontend won't start
```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill the process if needed
kill -9 <PID>

# Or change port in frontend/vite.config.js
server: { port: 3001 }
```

### MongoDB connection failed
```bash
# Check MongoDB status
mongosh

# If fails, start MongoDB
brew services start mongodb-community  # macOS
sudo systemctl start mongod            # Linux
net start MongoDB                      # Windows
```

### Module not found errors
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### CORS errors
```bash
# Verify CORS_ORIGIN in backend/.env matches frontend URL
CORS_ORIGIN=http://localhost:3000
```

## Uninstallation

```bash
# Stop servers (Ctrl+C in each terminal)

# Remove dependencies
cd backend && rm -rf node_modules
cd frontend && rm -rf node_modules

# Remove build artifacts
cd frontend && rm -rf dist

# Optional: Remove database
mongosh
use ai-book-story
db.dropDatabase()
```

## Next Steps

After successful installation:
1. Read QUICKSTART.md for a quick tutorial
2. Read README.md for detailed documentation
3. Explore the application features
4. Check API documentation in backend/README.md

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review error messages in terminal
3. Check browser console for frontend errors
4. Verify all prerequisites are met
5. Ensure MongoDB is running
6. Verify Replicate API token is valid

## Version Information

- Node.js: 16.0.0+
- React: 18.2.0
- Express: 4.18.2
- MongoDB: 4.4+
- Vite: 5.0.5
