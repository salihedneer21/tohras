# Quick Start Guide

Get up and running with AI Book Story in 5 minutes!

## Prerequisites

- Node.js 16+ installed
- MongoDB running locally or MongoDB Atlas account
- Replicate API token (get it from https://replicate.com)

## Step 1: Install Backend Dependencies

```bash
cd backend
npm install
```

## Step 2: Configure Backend

The `.env` file is already created. Update the `REPLICATE_API_TOKEN` if needed:

```bash
# backend/.env already exists with your token
# Verify MongoDB is running at mongodb://localhost:27017
```

## Step 3: Start Backend Server

```bash
# From backend directory
npm run dev
```

You should see:
```
✅ MongoDB Connected: localhost
🚀 Server running on port 5000
```

## Step 4: Install Frontend Dependencies

Open a new terminal:

```bash
cd frontend
npm install
```

## Step 5: Start Frontend

```bash
# From frontend directory
npm run dev
```

The app will open at `http://localhost:3000`

## Step 6: Test the Application

1. **Add a User:**
   - Go to Users page
   - Click "+ Add User"
   - Fill in the form
   - Add some image URLs (or skip for now)
   - Click "Create User"

2. **Start Training:**
   - Go to Training page
   - Click "+ Start Training"
   - Select the user you created
   - Add image URLs (at least 5-10 for best results)
   - Click "Start Training"
   - Wait for training to complete (10-30 minutes)

3. **Generate Images:**
   - Go to Generate page
   - Click "+ Generate Images"
   - Select user and trained model
   - Enter a prompt
   - Click "Generate Images"
   - Wait for generation to complete
   - View your generated images!

## Common Issues

### MongoDB Connection Error
```bash
# Start MongoDB
mongod

# Or use MongoDB Atlas URI in .env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ai-book-story
```

### Port Already in Use
```bash
# Backend (change PORT in backend/.env)
PORT=5001

# Frontend (change port in frontend/vite.config.js)
server: { port: 3001 }
```

### Replicate API Errors
- Verify your API token is correct in `backend/.env`
- Check your Replicate account has sufficient credits
- Ensure API token has proper permissions

## Next Steps

- Read the full README.md for detailed documentation
- Check backend/README.md for API documentation
- Explore configuration options for training and generation

## Support

For issues or questions, please refer to:
- Main README.md
- Backend API documentation
- Replicate documentation: https://replicate.com/docs

Happy creating! 🎨
