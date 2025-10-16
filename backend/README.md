# AI Book Story - Backend API

Backend API for fine-tuning Flux models using Replicate and generating custom images for children's books.

## Features

- User management (CRUD operations)
- Fine-tune Flux LoRA models with Replicate
- Generate images using fine-tuned models
- Multi-user support
- MongoDB database
- RESTful API architecture

## Prerequisites

- Node.js >= 16.0.0
- MongoDB (local or Atlas)
- Replicate API token

## Installation

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

4. Update `.env` with your configuration:
```env
MONGODB_URI=mongodb://localhost:27017/ai-book-story
PORT=5000
REPLICATE_API_TOKEN=your_token_here
CORS_ORIGIN=http://localhost:3000
```

## Running the Server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `POST /api/users/:id/images` - Add image URLs to user
- `DELETE /api/users/:id/images` - Remove image URL from user

### Trainings
- `GET /api/trainings` - Get all training jobs
- `GET /api/trainings/:id` - Get training by ID
- `POST /api/trainings` - Start new training
- `GET /api/trainings/:id/status` - Check training status
- `POST /api/trainings/:id/cancel` - Cancel training
- `GET /api/trainings/user/:userId/successful` - Get successful trainings for user

### Generations
- `GET /api/generations` - Get all generations
- `GET /api/generations/:id` - Get generation by ID
- `POST /api/generations` - Generate new image
- `POST /api/generations/:id/download` - Download generated images
- `GET /api/generations/user/:userId` - Get generations by user

## Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration files
│   │   ├── database.js  # MongoDB connection
│   │   └── replicate.js # Replicate client setup
│   ├── controllers/     # Request handlers
│   │   ├── userController.js
│   │   ├── trainingController.js
│   │   └── generationController.js
│   ├── models/          # Database models
│   │   ├── User.js
│   │   ├── Training.js
│   │   └── Generation.js
│   ├── routes/          # API routes
│   │   ├── userRoutes.js
│   │   ├── trainingRoutes.js
│   │   └── generationRoutes.js
│   ├── middleware/      # Custom middleware
│   │   └── validators.js
│   └── server.js        # Main server file
├── .env                 # Environment variables
├── .env.example         # Example environment file
├── package.json         # Dependencies
└── README.md           # Documentation
```

## Example Requests

### Create User
```bash
curl -X POST http://localhost:5000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "age": 8,
    "gender": "male",
    "email": "john@example.com",
    "countryCode": "+1",
    "phoneNumber": "1234567890",
    "imageUrls": ["https://example.com/image1.jpg"]
  }'
```

### Start Training
```bash
curl -X POST http://localhost:5000/api/trainings \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID",
    "imageUrls": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],
    "modelName": "john_character",
    "trainingConfig": {
      "steps": 1000,
      "learningRate": 0.0004
    }
  }'
```

### Generate Image
```bash
curl -X POST http://localhost:5000/api/generations \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID",
    "trainingId": "TRAINING_ID",
    "prompt": "A happy child playing in a garden",
    "config": {
      "numOutputs": 1,
      "aspectRatio": "1:1"
    }
  }'
```

## License

MIT
