# AI Book Story - Full Stack Application

A complete full-stack application for fine-tuning Flux LoRA models using Replicate and generating custom images for children's books.

## Features

- **User Management**: Add, edit, and manage multiple users (children) with their information
- **Model Fine-Tuning**: Train custom Flux LoRA models for each user using their images
- **Image Generation**: Generate custom images using fine-tuned models with customizable parameters
- **Image Asset Management**: Upload, preview, and curate training photos stored securely on Amazon S3
- **Multi-User Support**: Manage and generate images for multiple users simultaneously
- **Real-time Status Tracking**: Monitor training and generation progress
- **Modern UI**: Clean, responsive React interface with beautiful gradients and animations

## Technology Stack

### Backend
- Node.js & Express.js
- MongoDB with Mongoose
- Replicate API for model training and generation
- Express Validator for input validation

### Frontend
- React 18 with Hooks
- React Router for navigation
- Axios for API calls
- React Hot Toast for notifications
- Vite for fast development and building

## Project Structure

```
ai-book-story/
├── backend/
│   ├── src/
│   │   ├── config/          # Database and Replicate configuration
│   │   ├── controllers/     # Business logic
│   │   ├── models/          # MongoDB schemas
│   │   ├── routes/          # API routes
│   │   ├── middleware/      # Validation middleware
│   │   └── server.js        # Main server file
│   ├── .env                 # Environment variables
│   ├── package.json
│   └── README.md
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable components
│   │   ├── pages/           # Page components
│   │   ├── services/        # API service
│   │   ├── utils/           # Styles and utilities
│   │   ├── App.jsx          # Main app component
│   │   └── main.jsx         # Entry point
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── README.md
└── README.md                # This file
```

## Installation

### Prerequisites
- Node.js >= 16.0.0
- MongoDB (local or Atlas)
- Replicate API token
- OpenRouter API key (for dataset evaluation)

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Update `.env` with your configuration:
```env
MONGODB_URI=mongodb://localhost:27017/ai-book-story
PORT=5000
REPLICATE_API_TOKEN=your_replicate_api_token_here
OPENROUTER_API_KEY=your_openrouter_key_here
# Optional: override default model
# OPENROUTER_MODEL=openai/gpt-4.1-mini
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=your_bucket_region
AWS_S3_BUCKET=book-story-ai-generate
CORS_ORIGIN=http://localhost:3000
```

5. Start the backend server:
```bash
# Development mode
npm run dev

# Production mode
npm start
```

The backend API will be available at `http://localhost:5000`

> ℹ️ The AWS credentials must have `s3:PutObject` and `s3:DeleteObject` permissions for the bucket specified by `AWS_S3_BUCKET` (default `book-story-ai-generate`).

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`

## Usage Guide

### 1. User Management

**Add a New User:**
1. Navigate to the "Users" page
2. Click "+ Add User" button
3. Fill in the form:
   - Name, Age, Gender
   - Email, Country Code, Phone Number
   - Image URLs (optional - can be added later)
4. Click "Create User"

**Edit User:**
1. Click "Edit" button on any user card
2. Update the information
3. Click "Update User"

### 2. Model Training

**Start Training:**
1. Navigate to the "Training" page
2. Click "+ Start Training" button
3. Select a user from the dropdown
4. Upload 10-15 clear portrait photos (drag in multiple at once)
5. Review the thumbnails and remove any image that doesn’t meet the guidelines
6. Optionally provide a custom model name
7. Click "Start Training" – the app automatically zips the photos, stores them in S3, and kicks off the Replicate job

**Monitor Training:**
- Training status will be displayed in the training list
- Click "Check Status" to update the training status
- Training can take 10-30 minutes depending on configuration
- Once status shows "succeeded", the model is ready for generation

### 3. Image Generation

**Generate Images:**
1. Navigate to the "Generate" page
2. Click "+ Generate Images" button
3. Select a user (only users with successful trainings will show models)
4. Select a trained model from the dropdown
5. Enter a prompt describing the image you want
6. Adjust generation settings:
   - Number of outputs (1-4)
   - Aspect ratio
   - Output format (WebP, JPG, PNG)
   - Guidance scale and quality
7. Click "Generate Images"

**View Results:**
- Generated images will appear in the generation history
- Click "Refresh" to check generation status
- Once completed, images will be displayed
- Click "Download" to save images locally
- Click "View Full Size" on any image to open in a new tab

### 4. Dataset Evaluation

**Assess Image Quality:**
1. Navigate to the "Evaluate" page
2. Upload a reference image (files are not persisted)
3. Click "Run evaluation" to receive scores, issues, and recommendations
4. Use the feedback (accept/reject, percentage scores, actionable tips) to curate higher quality datasets before fine-tuning

## API Endpoints

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `POST /api/users/:id/images/upload` - Upload an image to S3 for the user
- `DELETE /api/users/:id/images/:assetId` - Remove an uploaded image

### Training
- `GET /api/trainings` - Get all trainings
- `GET /api/trainings/:id` - Get training by ID
- `POST /api/trainings` - Start new training (uploads images, zips to S3, kicks off Replicate job)
- `GET /api/trainings/:id/status` - Check training status
- `POST /api/trainings/:id/cancel` - Cancel training
- `GET /api/trainings/user/:userId/successful` - Get successful trainings for user

### Generation
- `GET /api/generations` - Get all generations
- `GET /api/generations/:id` - Get generation by ID
- `POST /api/generations` - Generate new image
- `POST /api/generations/:id/download` - Download images
- `GET /api/generations/user/:userId` - Get generations by user

### Evaluation
- `POST /api/evals` - Evaluate uploaded images for fine-tuning readiness (OpenRouter vision)

## Configuration

### Training Configuration
Default training settings can be customized when starting a training job:
- Steps: 1000 (default)
- Learning Rate: 0.0004 (default)
- Batch Size: 1 (default)

### Generation Configuration
Available parameters for image generation:
- Model: dev (default)
- LoRA Scale: 1 (0-2)
- Megapixels: 1
- Number of Outputs: 1-4
- Aspect Ratio: 1:1, 16:9, 9:16, 4:3, 3:4
- Output Format: webp, jpg, png
- Guidance Scale: 3 (0-10)
- Output Quality: 80 (0-100)
- Prompt Strength: 0.8 (0-1)
- Inference Steps: 28 (1-50)

## Tips for Best Results

### Training Images
- Use 10-30 high-quality images of the subject
- Include variety in poses, angles, and lighting
- Ensure images are clear and well-lit
- Use consistent subject across images

### Prompts
- Be specific and descriptive
- Include the trigger word (model name) in your prompt
- Describe style, mood, and setting
- Example: "john_character playing in a sunny garden, children's book style"

## Troubleshooting

### Backend Issues
- Ensure MongoDB is running
- Verify Replicate API token is valid
- Check that all environment variables are set correctly

### Frontend Issues
- Ensure backend is running on port 5000
- Clear browser cache if styles don't load
- Check browser console for errors

### Training Issues
- Training can take 10-30 minutes
- Ensure you have at least 5-10 training images
- Check Replicate dashboard for detailed logs

### Generation Issues
- Ensure training has completed successfully (status: succeeded)
- Wait a few seconds after starting generation
- Click "Refresh" to check status

## Development

### Backend Development
```bash
cd backend
npm run dev
```

### Frontend Development
```bash
cd frontend
npm run dev
```

### Building for Production

**Backend:**
```bash
cd backend
npm start
```

**Frontend:**
```bash
cd frontend
npm run build
npm run preview
```

## Environment Variables

### Backend (.env)
```env
MONGODB_URI=mongodb://localhost:27017/ai-book-story
PORT=5000
NODE_ENV=development
REPLICATE_API_TOKEN=your_token_here
CORS_ORIGIN=http://localhost:3000
IMAGES_FOLDER=./generated-images
```

### Frontend (optional .env)
```env
VITE_API_URL=http://localhost:5000/api
```

## License

MIT

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review API documentation
3. Check Replicate documentation: https://replicate.com/docs

## Credits

- Built with React, Node.js, Express, and MongoDB
- Powered by Replicate's Flux LoRA trainer
- UI inspired by modern design principles
