const geminiService = require('../services/geminiService');
const meetingStore = require('../utils/meetingStore');

/**
 * Generate meeting summary
 * POST /api/summary/generate
 */
exports.generateSummary = async (req, res) => {
    try {
        const { meetingId, summaryType = 'detailed', level = 'intermediate', additionalData } = req.body;

        if (!meetingId) {
            return res.status(400).json({
                success: false,
                message: 'Meeting ID is required'
            });
        }

        // Check if Gemini is available
        if (!geminiService.isAvailable()) {
            return res.status(503).json({
                success: false,
                message: 'Summary service is not available. Please configure GEMINI_API_KEY.'
            });
        }

        // Get meeting data from store
        const meeting = await meetingStore.getMeeting(meetingId);
        
        if (!meeting) {
            return res.status(404).json({
                success: false,
                message: 'Meeting not found'
            });
        }

        // Get all meeting data including transcript and activities
        const allMeetingData = meeting.getAllMeetingData();
        
        // Prepare meeting data for summary with all available data
        const meetingData = {
            meetingId: allMeetingData.meetingId,
            title: allMeetingData.title || 'Untitled Meeting',
            host: allMeetingData.host || 'Unknown Host',
            participants: allMeetingData.participants || [],
            messages: allMeetingData.chatMessages || [],
            transcript: allMeetingData.transcript || [],
            activities: allMeetingData.activities || [],
            startTime: allMeetingData.startTime,
            endTime: additionalData?.endTime || new Date(),
            duration: calculateDuration(allMeetingData.startTime, additionalData?.endTime || new Date()),
            // Include any additional data provided
            ...additionalData
        };

        console.log(`📝 Generating ${summaryType} (level: ${level}) summary for meeting: ${meetingId}`);
        console.log(`   📊 Data: ${meetingData.messages.length} chat msgs, ${meetingData.transcript.length} transcript entries, ${meetingData.activities.length} activities`);

        // Generate summary based on type
        let result;
        if (summaryType === 'adaptive') {
            // New adaptive summary based on difficulty level
            result = await geminiService.generateAdaptiveSummary(meetingData, level);
        } else if (summaryType === 'all') {
            result = await geminiService.generateAllSummaries(meetingData);
        } else {
            result = await geminiService.generateSummary(meetingData, summaryType);
        }

        console.log(`✅ Summary generated successfully for meeting: ${meetingId}`);

        res.json(result);
    } catch (error) {
        console.error('❌ Error generating summary:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to generate summary'
        });
    }
};

/**
 * Chat with AI about meeting
 * POST /api/summary/chat
 */
exports.chatWithAI = async (req, res) => {
    try {
        const { meetingId, message, chatHistory = [] } = req.body;

        if (!meetingId) {
            return res.status(400).json({
                success: false,
                message: 'Meeting ID is required'
            });
        }

        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'Message is required'
            });
        }

        // Check if Gemini is available
        if (!geminiService.isAvailable()) {
            return res.status(503).json({
                success: false,
                message: 'AI service is not available. Please configure GEMINI_API_KEY.'
            });
        }

        // Get meeting data from store
        const meeting = await meetingStore.getMeeting(meetingId);
        
        if (!meeting) {
            return res.status(404).json({
                success: false,
                message: 'Meeting not found'
            });
        }

        // Get all meeting data
        const allMeetingData = meeting.getAllMeetingData();
        
        const meetingData = {
            meetingId: allMeetingData.meetingId,
            title: allMeetingData.title || 'Untitled Meeting',
            host: allMeetingData.host || 'Unknown Host',
            participants: allMeetingData.participants || [],
            messages: allMeetingData.chatMessages || [],
            transcript: allMeetingData.transcript || [],
            activities: allMeetingData.activities || [],
            duration: calculateDuration(allMeetingData.startTime, new Date())
        };

        console.log(`💬 AI Chat for meeting: ${meetingId} - "${message.substring(0, 50)}..."`);

        const result = await geminiService.chatAboutMeeting(meetingData, message, chatHistory);

        console.log(`✅ AI responded for meeting: ${meetingId}`);

        res.json(result);
    } catch (error) {
        console.error('❌ Error in AI chat:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get AI response'
        });
    }
};

/**
 * Check if summary service is available
 * GET /api/summary/status
 */
exports.checkStatus = (req, res) => {
    const isAvailable = geminiService.isAvailable();
    res.json({
        success: true,
        available: isAvailable,
        message: isAvailable 
            ? 'Summary service is available' 
            : 'Summary service requires GEMINI_API_KEY configuration'
    });
};

/**
 * Get meeting data for summary (without generating)
 * GET /api/summary/meeting-data/:meetingId
 */
exports.getMeetingData = async (req, res) => {
    try {
        const { meetingId } = req.params;

        const meeting = await meetingStore.getMeeting(meetingId);
        
        if (!meeting) {
            return res.status(404).json({
                success: false,
                message: 'Meeting not found'
            });
        }

        const messages = meeting.getChatHistory() || [];
        
        res.json({
            success: true,
            data: {
                meetingId: meeting.meetingId,
                title: meeting.title,
                host: meeting.hostUsername,
                participants: meeting.participants?.map(p => ({
                    username: p.username,
                    joinedAt: p.joinedAt
                })) || [],
                messageCount: messages.filter(m => m.type === 'text' || !m.type).length,
                pollCount: messages.filter(m => m.type === 'poll').length,
                fileCount: messages.filter(m => m.type === 'file').length,
                startTime: meeting.createdAt,
                isActive: meeting.isActive
            }
        });
    } catch (error) {
        console.error('❌ Error getting meeting data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get meeting data'
        });
    }
};

/**
 * Calculate duration between two dates
 */
function calculateDuration(start, end) {
    if (!start || !end) return 'Unknown';
    
    const startTime = new Date(start);
    const endTime = new Date(end);
    const diffMs = endTime - startTime;
    
    if (diffMs < 0) return 'Unknown';
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes} minutes`;
}

/**
 * Summarize missed messages when user was away
 * POST /api/summary/missed-messages
 */
exports.summarizeMissedMessages = async (req, res) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({
                success: false,
                message: 'Messages array is required'
            });
        }

        if (messages.length === 0) {
            return res.json({
                success: true,
                summary: 'No messages were missed during your absence.'
            });
        }

        // Check if Gemini is available
        if (!geminiService.isAvailable()) {
            return res.status(503).json({
                success: false,
                message: 'Summary service is not available. Please configure GEMINI_API_KEY.'
            });
        }

        console.log(`📝 Summarizing ${messages.length} missed messages`);

        const summary = await geminiService.summarizeMissedMessages(messages);

        console.log(`✅ Missed messages summary generated successfully`);

        res.json({
            success: true,
            summary,
            messageCount: messages.length
        });
    } catch (error) {
        console.error('❌ Error summarizing missed messages:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to summarize missed messages'
        });
    }
};

/**
 * Summarize missed speech when user was away
 * POST /api/summary/missed-speech
 */
exports.summarizeMissedSpeech = async (req, res) => {
    try {
        const { transcripts } = req.body;

        if (!transcripts || !Array.isArray(transcripts)) {
            return res.status(400).json({
                success: false,
                message: 'Transcripts array is required'
            });
        }

        if (transcripts.length === 0) {
            return res.json({
                success: true,
                summary: 'No speech was missed during your absence.'
            });
        }

        // Check if Gemini is available
        if (!geminiService.isAvailable()) {
            return res.status(503).json({
                success: false,
                message: 'Summary service is not available. Please configure GEMINI_API_KEY.'
            });
        }

        console.log(`🎤 Summarizing ${transcripts.length} missed speech segments`);

        const summary = await geminiService.summarizeMissedSpeech(transcripts);

        console.log(`✅ Missed speech summary generated successfully`);

        res.json({
            success: true,
            summary,
            transcriptCount: transcripts.length
        });
    } catch (error) {
        console.error('❌ Error summarizing missed speech:', error);
        
        // Provide more helpful error messages based on error type
        let statusCode = 500;
        let message = error.message || 'Failed to summarize missed speech';
        
        if (error.message?.includes('RATE_LIMIT')) {
            statusCode = 429; // Too Many Requests
            message = 'AI service is temporarily busy (quota exceeded). Please wait a moment and try again.';
        } else if (error.message?.includes('AI_UNAVAILABLE')) {
            statusCode = 503; // Service Unavailable
            message = 'AI service is temporarily unavailable. Please try again later.';
        }
        
        res.status(statusCode).json({
            success: false,
            message: message
        });
    }
};

module.exports = exports;
