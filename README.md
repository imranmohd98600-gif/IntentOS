# IntentOS — AI-Powered Hand Gesture and Voice PC Control System

IntentOS is a hands-free computer interaction system that lets you control your PC using natural hand gestures and voice commands.

## Architecture
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Recharts.
- **Backend**: Python 3.11, FastAPI, WebSockets.
- **AI/ML**: MediaPipe (hand tracking), OpenCV (image processing), SpeechRecognition (voice commands).
- **Control**: PyAutoGUI (mouse/keyboard actions).

## Project Structure
- `frontend/`: React Dashboard.
- `backend/`: FastAPI application and ML engines.

## Setup Instructions

### Backend
1. Ensure Python 3.11+ is installed.
2. Navigate to `backend/`.
3. Create a virtual environment: `python -m venv venv`
4. Activate the virtual environment:
   - Windows: `.\venv\Scripts\activate`
   - Mac/Linux: `source venv/bin/activate`
5. Install dependencies: `pip install -r requirements.txt`
6. Run the server: `uvicorn main:app --reload`

### Frontend
1. Ensure Node.js is installed.
2. Navigate to `frontend/`.
3. Install dependencies: `npm install`
4. Run the development server: `npm run dev`
