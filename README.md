# 🎥 SmartMeet - AI-Powered Conference App

AI-powered video conferencing platform with real-time meeting summaries, transcription, and smart features. Built with WebRTC, React, Node.js, Socket.IO, and Google Gemini AI. Features include HD video calls, screen sharing, real-time chat, face detection, missed conversation tracking, and automated meeting summaries.
## 🚀Live Link: https://smartmeet-zeta.vercel.app

## ✨ Features

### 🎬 Core Video Conferencing
- **HD Video & Audio**: High-quality peer-to-peer video and audio communication via WebRTC
- **Screen Sharing**: Share your screen with all participants
- **Multiple Participants**: Support for group video conferences
- **Grid/Speaker View**: Toggle between different layout modes
- **Meeting Controls**: Mute/unmute audio, turn video on/off, raise hand

### 🤖 AI-Powered Features
- **Real-time Transcription**: Automatic speech-to-text during meetings
- **AI Meeting Summaries**: Auto-generated summaries using Google Gemini AI
- **Smart Insights**: Key points extraction and action items
- **Conversation Analysis**: Context-aware meeting intelligence

### 👤 Smart Presence Detection
- **Face Detection**: ML-based presence detection using MediaPipe
- **Missed Conversation Tracking**: Track missed messages and speech when away
- **Auto-Away Detection**: Detects when users leave their screen
- **Return Notifications**: Smart catch-up summaries when you return

### 💬 Real-time Communication
- **Live Chat**: Text messaging during meetings
- **Typing Indicators**: See when others are typing
- **Message History**: Persistent chat storage with MongoDB
- **Emoji Support**: Express yourself with emojis

### 🔒 Additional Features
- **Persistent Meetings**: Meeting data stored in MongoDB
- **Connection Quality Indicator**: Real-time connection status monitoring
- **Auto Reconnection**: Automatically reconnects on network issues
- **Responsive Design**: Works on desktop and mobile devices

## 🏗️ Architecture

```
smartmeet-ai-conference/
├── frontend/                  # React frontend application
│   ├── src/
│   │   ├── App.js            # Main application component
│   │   ├── components/       # React components
│   │   │   ├── VideoCall.js  # WebRTC video interface
│   │   │   ├── Chat.js       # Real-time chat
│   │   │   ├── Settings.js   # User settings
│   │   │   ├── MeetingSummary.js    # AI-generated summaries
│   │   │   ├── MissedMessages.js    # Missed chat messages
│   │   │   ├── MissedSpeech.js      # Missed transcriptions
│   │   │   └── ConfirmModal.js      # Confirmation dialogs
│   │   └── hooks/
│   │       ├── useFaceDetection.js  # ML-based presence
│   │       └── usePageVisibility.js # Tab visibility API
│   ├── package.json
│   └── .env.example
│
├── backend/                   # Node.js + Express backend
│   ├── server.js             # Main server entry point
│   ├── config/
│   │   └── db.js            # MongoDB connection
│   ├── controllers/
│   │   ├── meetingController.js   # Meeting CRUD operations
│   │   └── summaryController.js   # AI summary generation
│   ├── models/
│   │   ├── Meeting.js       # Meeting database schema
│   │   └── User.js          # User database schema
│   ├── services/
│   │   └── geminiService.js # Google Gemini AI integration
│   ├── socket/
│   │   └── socketHandler.js # WebRTC signaling & real-time events
│   ├── utils/
│   │   └── meetingStore.js  # In-memory meeting state
│   ├── package.json
│   └── .env.example
│
├── .gitignore
└── README.md
```

## 🛠️ Technology Stack

### Frontend
- **React 18** - UI framework
- **WebRTC** - Peer-to-peer video/audio communication
- **Socket.IO Client** - Real-time bidirectional communication
- **MediaPipe** - ML-based face detection for presence tracking
- **CSS3** - Styling and animations

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Socket.IO** - WebSocket server for signaling
- **MongoDB** - NoSQL database for meetings and messages
- **Mongoose** - MongoDB ODM
- **Google Gemini AI** - AI-powered summaries and transcription analysis
- **dotenv** - Environment configuration

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **MongoDB** (local or MongoDB Atlas account)
- **Google Gemini API Key** ([Get one here](https://makersuite.google.com/app/apikey))
- Modern web browser with WebRTC support (Chrome, Firefox, Safari, Edge)

### Installation

#### 1. Clone the repository

```bash
git clone https://github.com/yourusername/smartmeet-ai-conference.git
cd smartmeet-ai-conference
```

#### 2. Setup Backend

```bash
cd backend
npm install
```

Create `.env` file in `backend/` directory (copy from `.env.example`):

```env
# MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/smartmeet

# Gemini AI
GEMINI_API_KEY=your_gemini_api_key_here

# Server
PORT=5000
NODE_ENV=development

# CORS
ALLOWED_ORIGINS=http://localhost:3000
```

Start the backend server:

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

#### 3. Setup Frontend

Open a new terminal:

```bash
cd frontend
npm install
```

Create `.env` file in `frontend/` directory (copy from `.env.example`):

```env
REACT_APP_API_URL=http://localhost:5000
```

Start the frontend:

```bash
npm start
```

The application will open at `http://localhost:3000`

## 📖 Usage

### Creating a Meeting

1. Open the application in your browser
2. Click **"Create Meeting"**
3. Enter your name
4. Click **"Create"**
5. Copy the **Meeting ID** and share it with participants
6. Wait for others to join

### Joining a Meeting

1. Open the application
2. Click **"Join Meeting"**
3. Enter your name
4. Enter the **Meeting ID** received from the host
5. Click **"Join"**

### During the Meeting

#### Video Controls
- **🎤 Microphone**: Toggle audio on/off
- **📹 Camera**: Toggle video on/off
- **🖥️ Screen Share**: Share your screen with participants
- **📞 Leave**: Exit the meeting

#### Chat & Features
- **💬 Chat**: Open real-time chat panel
- **⚙️ Settings**: Configure video quality and preferences
- **✋ Raise Hand**: Raise your hand to get attention
- **👥 Participants**: View all meeting participants
- **📊 View Mode**: Toggle between grid and speaker view

#### AI-Powered Features
- **Meeting Summary**: Generate AI summary of conversations
- **Transcription**: View real-time speech-to-text
- **Missed Conversations**: Catch up on what you missed when away

### Face Detection & Away Mode

SmartMeet automatically detects when you're away from your screen:
- Uses ML-based face detection (MediaPipe)
- Tracks missed messages and speech while you're away
- Shows a summary when you return
- Configurable away sensitivity in settings

## 🔧 Configuration

### Backend Configuration

Edit `backend/.env`:

```env
# Server
PORT=5000
NODE_ENV=development
HOST=0.0.0.0

# MongoDB - Store meetings and messages
MONGODB_URI=mongodb://localhost:27017/smartmeet
# Or use MongoDB Atlas
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/smartmeet

# Google Gemini AI - Required for summaries
GEMINI_API_KEY=your_api_key_here
GEMINI_API2=backup_key_optional
GEMINI_API3=backup_key_optional

# CORS - Frontend URLs (production)
ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://app.yourdomain.com

# TURN (Metered.ca) - required for reliable cross-network/global WebRTC connectivity
METERED_TURN_URLS=turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp
METERED_TURN_USERNAME=your_metered_username
METERED_TURN_CREDENTIAL=your_metered_password
```

### Frontend Configuration

Edit `frontend/.env`:

```env
# Backend API URL
REACT_APP_API_URL=http://localhost:5000
# Production
REACT_APP_API_URL=https://your-backend.railway.app

# Socket URL (usually same as API)
REACT_APP_SOCKET_URL=https://your-backend.railway.app

# TURN credentials are NOT required in frontend env.
# Frontend fetches ICE/TURN config from backend endpoint: /api/webrtc/ice-config
```

### Advanced Configuration

#### Face Detection Sensitivity

Edit [useFaceDetection.js](frontend/src/hooks/useFaceDetection.js):

```javascript
awayThreshold: 5000,        // Time before marked as away (ms)
detectionInterval: 500,     // Detection check frequency (ms)
confidenceThreshold: 0.5    // Face detection confidence
```

#### Video Quality Settings

Edit [VideoCall.js](frontend/src/components/VideoCall.js):

```javascript
video: {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 }
}
```

## 🔒 Security & Best Practices

### Production Security Checklist

- ✅ **HTTPS Required**: Always use HTTPS in production for WebRTC
- ✅ **Environment Variables**: Never commit `.env` files
- ✅ **CORS Configuration**: Restrict `ALLOWED_ORIGINS` to your domains only
- ✅ **MongoDB Security**: Use strong passwords, enable IP whitelist
- ✅ **API Keys**: Rotate Gemini API keys regularly
- ✅ **Rate Limiting**: Implement rate limiting for API endpoints (TODO)
- ✅ **Input Validation**: Validate all user inputs server-side
- ✅ **File Upload Limits**: Configure max file sizes
- ✅ **TURN Server**: Use authenticated TURN servers
- ✅ **Content Security Policy**: Add CSP headers (TODO)

### Recommended TURN Server

For production, use a TURN server to handle NAT traversal:
- **Free Option**: [Open Relay](https://www.metered.ca/tools/openrelay/)
- **Self-hosted**: [Coturn](https://github.com/coturn/coturn)
- **Commercial**: [Twilio TURN](https://www.twilio.com/stun-turn)

## 🐛 Troubleshooting

### Camera/Microphone Not Working

**Symptoms**: No video/audio, permissions denied
 
**Solutions**:
- ✅ Check browser permissions (click 🔒 in address bar)
- ✅ Ensure HTTPS is used (required for `getUserMedia`)
- ✅ Close other apps using camera/microphone (Zoom, Teams, etc.)
- ✅ Try different browser (Chrome recommended)
- ✅ Check browser console for errors (F12)
- ✅ Verify camera/mic work in other apps

### Connection Issues

**Symptoms**: Can't connect to meeting, WebSocket errors

**Solutions**:
- ✅ Check backend server is running
- ✅ Verify `REACT_APP_API_URL` is correct
- ✅ Check firewall/antivirus settings
- ✅ Configure TURN server for restricted networks
- ✅ Check browser console for WebSocket errors
- ✅ Ensure MongoDB is connected

### Face Detection Not Working

**Symptoms**: Away status not updating, detection errors

**Solutions**:
- ✅ Ensure camera permission granted
- ✅ Check browser console for MediaPipe errors
- ✅ Verify lighting conditions (needs visible face)
- ✅ Wait for model to load (5-10 seconds)
- ✅ Try refreshing the page
- ✅ Use Chrome/Edge (best MediaPipe support)

### AI Summaries Not Generating

**Symptoms**: Summary fails, API errors

**Solutions**:
- ✅ Verify `GEMINI_API_KEY` is set correctly
- ✅ Check API key quota/limits
- ✅ Ensure internet connectivity
- ✅ Check backend logs for errors
- ✅ Try using backup API keys (`GEMINI_API2`, `GEMINI_API3`)
- ✅ Verify Gemini API is enabled in Google Cloud

### MongoDB Connection Errors

**Symptoms**: Backend crashes, database errors

**Solutions**:
- ✅ Check `MONGODB_URI` format is correct
- ✅ Verify MongoDB server is running (if local)
- ✅ Check MongoDB Atlas IP whitelist
- ✅ Verify username/password in connection string
- ✅ Ensure database name exists
- ✅ Check network connectivity

### Audio/Video Quality Issues

**Symptoms**: Choppy video, audio lag, freezing

**Solutions**:
- ✅ Check internet connection speed (min 2 Mbps upload/download)
- ✅ Reduce video resolution in settings
- ✅ Close bandwidth-heavy applications
- ✅ Use wired connection instead of WiFi
- ✅ Ensure other participants have good connection
- ✅ Try disabling video if audio is priority

### CORS Errors

**Symptoms**: Network errors in browser console, blocked requests

**Solutions**:
- ✅ Add frontend URL to `ALLOWED_ORIGINS` in backend
- ✅ Remove trailing slashes from URLs
- ✅ Ensure both frontend and backend use same protocol (http/https)
- ✅ Clear browser cache
- ✅ Check backend CORS middleware configuration

## 📝 API Documentation

### REST API Endpoints

#### Meeting Management

```http
POST /api/meetings/create
Content-Type: application/json

{
  "hostName": "John Doe",
  "hostId": "user-123"
}

Response: {
  "success": true,
  "meeting": {
    "meetingId": "abc-123",
    "hostId": "user-123",
    "hostName": "John Doe",
    "createdAt": "2026-02-06T10:00:00Z"
  }
}
```

```http
GET /api/meetings/:meetingId
Response: { meeting details, participants, chat history }
```

```http
POST /api/meetings/:meetingId/end
Ends the meeting and triggers final summary generation
```

#### AI Summary Generation

```http
POST /api/summary/generate
Content-Type: application/json

{
  "meetingId": "abc-123",
  "transcripts": [...],
  "messages": [...]
}

Response: {
  "summary": "Meeting summary text...",
  "keyPoints": [...],
  "actionItems": [...],
  "participants": [...]
}
```

```http
GET /api/summary/:meetingId
Retrieves saved summary for a meeting
```

#### Health Check

```http
GET /health
Response: { status: "ok", uptime: 12345, mongodb: "connected" }
```

---

### Socket.IO Events

#### Client → Server

| Event | Description | Payload |
|-------|-------------|---------|
| `join-meeting` | Join a meeting room | `{ meetingId, userId, username }` |
| `leave-meeting` | Leave meeting | `{ meetingId, userId }` |
| `offer` | Send WebRTC offer | `{ offer, to, from }` |
| `answer` | Send WebRTC answer | `{ answer, to, from }` |
| `ice-candidate` | Send ICE candidate | `{ candidate, to, from }` |
| `toggle-audio` | Mute/unmute audio | `{ userId, muted }` |
| `toggle-video` | Turn video on/off | `{ userId, videoOff }` |
| `raise-hand` | Raise/lower hand | `{ userId, raised }` |
| `screen-share-start` | Start screen sharing | `{ userId }` |
| `screen-share-stop` | Stop screen sharing | `{ userId }` |
| `chat-message` | Send chat message | `{ meetingId, message, senderId, senderName }` |
| `typing` | User typing indicator | `{ meetingId, userId, username }` |
| `speech-transcript` | Send speech transcript | `{ meetingId, transcript, speakerId, speakerName }` |
| `request-summary` | Request AI summary | `{ meetingId, type, content }` |

#### Server → Client

| Event | Description | Payload |
|-------|-------------|---------|
| `joined-meeting` | Confirm meeting join | `{ meeting, existingParticipants }` |
| `user-joined` | New user joined | `{ userId, username, socketId }` |
| `user-left` | User left meeting | `{ userId, username }` |
| `offer` | Receive WebRTC offer | `{ offer, from }` |
| `answer` | Receive WebRTC answer | `{ answer, from }` |
| `ice-candidate` | Receive ICE candidate | `{ candidate, from }` |
| `audio-toggled` | User audio status | `{ userId, muted }` |
| `video-toggled` | User video status | `{ userId, videoOff }` |
| `hand-raised` | Hand raise status | `{ userId, raised }` |
| `screen-share-started` | Screen share started | `{ userId, username }` |
| `screen-share-stopped` | Screen share stopped | `{ userId }` |
| `chat-message` | New chat message | `{ message, senderId, senderName, timestamp }` |
| `user-typing` | User typing notification | `{ userId, username }` |
| `speech-transcript` | New transcript | `{ transcript, speakerId, speakerName, timestamp }` |
| `summary-generated` | AI summary ready | `{ summary, keyPoints, actionItems }` |
| `error` | Error occurred | `{ message, code }` |

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines

- Follow existing code style
- Add comments for complex logic
- Update documentation for new features
- Test thoroughly before submitting PR
- Keep PRs focused on single features

### Areas for Contribution

- 🎨 UI/UX improvements
- 🔐 Authentication & authorization
- 📱 Mobile responsiveness
- 🌍 Internationalization (i18n)
- ♿ Accessibility improvements
- 🧪 Test coverage
- 📖 Documentation
- 🐛 Bug fixes

---

## 📄 License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2026 SmartMeet Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 🙏 Acknowledgments

### Technologies & Libraries
- **[WebRTC](https://webrtc.org/)** - Real-time peer-to-peer communication
- **[Socket.IO](https://socket.io/)** - Real-time bidirectional event-based communication
- **[React](https://react.dev/)** - UI framework
- **[Express](https://expressjs.com/)** - Web framework for Node.js
- **[MongoDB](https://www.mongodb.com/)** - NoSQL database
- **[Google Gemini AI](https://deepmind.google/technologies/gemini/)** - AI-powered summaries and analysis
- **[MediaPipe](https://mediapipe.dev/)** - ML-based face detection
- **[Vercel](https://vercel.com/)** - Frontend deployment platform
- **[Railway](https://railway.app/)** - Backend deployment platform

### Inspiration
- Modern video conferencing platforms
- AI-powered meeting assistants
- Open-source WebRTC projects

---

## 📞 Support & Contact

### Get Help
- 📖 [Documentation](https://github.com/yourusername/smartmeet-ai-conference/wiki)
- 🐛 [Report Bug](https://github.com/yourusername/smartmeet-ai-conference/issues/new?template=bug_report.md)
- 💡 [Request Feature](https://github.com/yourusername/smartmeet-ai-conference/issues/new?template=feature_request.md)
- 💬 [Discussions](https://github.com/yourusername/smartmeet-ai-conference/discussions)

### Resources
- [WebRTC Documentation](https://webrtc.org/getting-started/overview)
- [Socket.IO Documentation](https://socket.io/docs/v4/)
- [Google Gemini API](https://ai.google.dev/docs)
- [MongoDB Atlas Guide](https://docs.atlas.mongodb.com/)

---

## 🎯 Roadmap

### Current Features ✅
- HD video conferencing
- Real-time chat
- Screen sharing
- AI meeting summaries
- Face detection
- Missed conversation tracking

### Planned Features 🚀
- [ ] User authentication & accounts
- [ ] Meeting scheduling
- [ ] Recording & playback
- [ ] Live captions/subtitles
- [ ] Meeting analytics dashboard
- [ ] Calendar integration (Google, Outlook)
- [ ] Breakout rooms
- [ ] Virtual backgrounds
- [ ] Mobile apps (iOS/Android)
- [ ] Whiteboard collaboration
- [ ] File sharing
- [ ] Meeting templates
- [ ] Custom branding
- [ ] End-to-end encryption

---

<div align="center">

**Made with ❤️ using WebRTC, React, Node.js, and AI**

⭐ **Star this repo** if you find it helpful!

[Report Bug](https://github.com/yourusername/smartmeet-ai-conference/issues) · [Request Feature](https://github.com/yourusername/smartmeet-ai-conference/issues) · [View Demo](#)

</div>
