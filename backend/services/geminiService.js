const { GoogleGenAI } = require('@google/genai');

class GeminiService {
    constructor() {
        // Load all API keys
        const rawApiKeys = [
            process.env.GEMINI_API_KEY,
            process.env.GOOGLE_API_KEY,
            process.env.GEMINI_API2,
            process.env.GEMINI_API3
        ].filter(key => key && key.trim()); // Filter out empty/undefined keys

        this.apiKeys = [...new Set(rawApiKeys)];
        if (rawApiKeys.length !== this.apiKeys.length) {
            console.warn('ℹ️ Duplicate Gemini API key values detected across env vars (often expected when GEMINI_API_KEY and GOOGLE_API_KEY match); duplicates were ignored.');
        }

        this.modelNames = this.getConfiguredModelNames();
        this.currentApiKeyIndex = 0;
        this.apiKey = this.apiKeys[0];
        this.clients = []; // One GoogleGenAI client per API key
        this.ai = null; // Current active client
        this.currentModelIndex = 0;
        this.chatSessions = new Map(); // Store chat sessions per meeting

        console.log(`🔑 Found ${this.apiKeys.length} Gemini API key(s)`);

        if (this.apiKeys.length > 0) {
            // Initialize a client for each API key
            this.apiKeys.forEach((key, index) => {
                try {
                    this.clients.push(new GoogleGenAI({ apiKey: key }));
                    console.log(`✅ Initialized API client ${index + 1}`);
                } catch (err) {
                    console.warn(`⚠️ Failed to initialize API client ${index + 1}: ${err.message}`);
                    this.clients.push(null);
                }
            });

            // Set primary client
            this.ai = this.clients[0];
        } else {
            console.warn('⚠️ No GEMINI_API_KEY/GOOGLE_API_KEY set - Summary feature will be disabled');
        }
    }

    getConfiguredModelNames() {
        const configuredModels = process.env.GEMINI_MODEL_PRIORITY || process.env.GEMINI_MODELS;

        if (configuredModels) {
            const parsedModels = configuredModels
                .split(',')
                .map(modelName => modelName.trim())
                .filter(Boolean);

            if (parsedModels.length > 0) {
                return parsedModels;
            }
        }

        return [
            'gemini-2.5-flash',      // Primary - latest & fastest
            'gemini-2.0-flash',      // Fallback - stable
            'gemini-2.0-flash-lite'  // Last resort - lightweight
        ];
    }

    /**
     * Switch to next API key when rate limited
     * @returns {boolean} - true if switched, false if no more API keys
     */
    switchToNextApiKey() {
        if (this.currentApiKeyIndex < this.apiKeys.length - 1) {
            this.currentApiKeyIndex++;
            this.apiKey = this.apiKeys[this.currentApiKeyIndex];
            this.ai = this.clients[this.currentApiKeyIndex];

            console.log('🔄 Switched to next configured API key');

            this.currentModelIndex = 0;
            return true;
        }
        console.log('❌ No more backup API keys available');
        return false;
    }

    /**
     * Reset to primary API key (call after cooldown period)
     */
    resetToPrimaryApiKey() {
        if (this.currentApiKeyIndex !== 0) {
            this.currentApiKeyIndex = 0;
            this.apiKey = this.apiKeys[0];
            this.ai = this.clients[0];
            this.currentModelIndex = 0;
            console.log(`↩️ Reset to primary API key`);
        }
    }

    isAvailable() {
        return !!this.ai && this.modelNames.length > 0;
    }

    /**
     * Get current model name
     */
    getCurrentModelName() {
        return this.modelNames[this.currentModelIndex];
    }

    /**
     * Switch to next fallback model
     * @returns {boolean} - true if switched, false if no more fallbacks
     */
    switchToFallback() {
        if (this.currentModelIndex < this.modelNames.length - 1) {
            this.currentModelIndex++;
            console.log(`🔄 Switched to fallback model: ${this.modelNames[this.currentModelIndex]}`);
            return true;
        }
        console.log('❌ No more fallback models available');
        return false;
    }

    /**
     * Reset to primary model (call periodically or after successful request)
     */
    resetToPrimaryModel() {
        if (this.currentModelIndex !== 0) {
            this.currentModelIndex = 0;
            console.log(`↩️ Reset to primary model: ${this.modelNames[0]}`);
        }
    }

    /**
     * Check if error is a rate limit error (including RESOURCE_EXHAUSTED)
     */
    isRateLimitError(error) {
        const errorMsg = error.message?.toLowerCase() || '';
        const errorCode = error.code || error.status || '';
        return errorCode === 429 ||
               errorCode === 'RESOURCE_EXHAUSTED' ||
               errorMsg.includes('429') ||
               errorMsg.includes('rate_limit') ||
               errorMsg.includes('quota') ||
               errorMsg.includes('resource exhausted') ||
               errorMsg.includes('resource_exhausted') ||
               errorMsg.includes('too many requests');
    }

    isApiKeyInvalidError(error) {
        const msg = error.message || '';
        if (!msg) return false;
        const lower = msg.toLowerCase();
        return lower.includes('api key not valid') || lower.includes('api_key_invalid') || lower.includes('api key invalid') || lower.includes('api key is not valid');
    }

    /**
     * Check if error is a model not found error (should switch to fallback)
     */
    isModelNotFoundError(error) {
        const errorMsg = error.message?.toLowerCase() || '';
        return errorMsg.includes('404') ||
               errorMsg.includes('not found') ||
               errorMsg.includes('is not supported');
    }

    isPermissionDeniedError(error) {
        const errorMsg = error.message?.toLowerCase() || '';
        const errorCode = error.code || error.status || '';

        return errorCode === 403 ||
               errorCode === 'PERMISSION_DENIED' ||
               errorMsg.includes('403') ||
               errorMsg.includes('forbidden') ||
               errorMsg.includes('permission denied') ||
               errorMsg.includes('access denied') ||
               errorMsg.includes('project has been denied access') ||
               errorMsg.includes('not authorized');
    }

    /**
     * Execute with automatic fallback on rate limit or model not found
     * Now also switches API keys when all models for current key are exhausted
     * @param {Function} operation - Async function that receives (ai client, modelName)
     * @param {number} maxRetries - Maximum fallback attempts per API key
     */
    async executeWithFallback(operation, maxRetries = 3) {
        let lastError = null;
        const startModelIndex = this.currentModelIndex;
        const startApiKeyIndex = this.currentApiKeyIndex;

        // Try each API key
        for (let apiKeyAttempt = 0; apiKeyAttempt <= this.apiKeys.length; apiKeyAttempt++) {
            // Try each model with current API key
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    const currentModel = this.modelNames[this.currentModelIndex];
                    const currentKeyNum = this.currentApiKeyIndex + 1;
                    console.log(`🤖 API Key ${currentKeyNum}/${this.apiKeys.length} | Model: ${currentModel} (attempt ${attempt + 1}/${maxRetries})`);

                    const result = await operation(this.ai, currentModel);

                    console.log(`✅ API call successful with API Key ${currentKeyNum}, model: ${currentModel}`);

                    // Schedule reset to primary API key after 5 minutes
                    if (this.currentApiKeyIndex !== 0) {
                        setTimeout(() => this.resetToPrimaryApiKey(), 300000); // 5 minutes
                    }
                    // Schedule reset to primary model after 1 minute
                    if (this.currentModelIndex !== 0) {
                        setTimeout(() => this.resetToPrimaryModel(), 60000);
                    }

                    return result;
                } catch (error) {
                    lastError = error;
                    try {
                        console.error(`❌ Error with API Key ${this.currentApiKeyIndex + 1}, ${this.modelNames[this.currentModelIndex]}:`, error.message);
                    } catch (logErr) {
                        console.error(`❌ Error:`, error.message);
                    }

                    // If API key is invalid, try next API key
                    if (this.isApiKeyInvalidError(error)) {
                        console.log(`🔑 API Key ${this.currentApiKeyIndex + 1} is invalid, trying next...`);
                        if (!this.switchToNextApiKey()) {
                            throw new Error('GEMINI_API_KEY_INVALID: All API keys are invalid. Please set valid API keys.');
                        }
                        break; // Break inner loop, continue with new API key
                    }

                    // If access is denied for the current model/project, try the next fallback model first.
                    if (this.isPermissionDeniedError(error)) {
                        console.log(`🚫 Access denied for API Key ${this.currentApiKeyIndex + 1}, model ${this.modelNames[this.currentModelIndex]}`);

                        if (this.switchToFallback()) {
                            continue;
                        }

                        console.log(`🔄 All models exhausted for API Key ${this.currentApiKeyIndex + 1}, switching API key...`);
                        if (this.switchToNextApiKey()) {
                            break;
                        }

                        this.currentModelIndex = startModelIndex;
                        this.currentApiKeyIndex = startApiKeyIndex;
                        throw new Error('GEMINI_ACCESS_DENIED: The configured Gemini API key does not have access to the available models. Check Gemini API access, project billing, and model availability.');
                    }

                    // If rate limit error, try next model first, then next API key
                    if (this.isRateLimitError(error)) {
                        console.log(`⚠️ Rate limit hit (code: ${error.code || error.status || 'N/A'})`);

                        // Try fallback model first
                        if (this.switchToFallback()) {
                            continue; // Try next model
                        }

                        // All models exhausted, try next API key
                        console.log(`🔄 All models exhausted for API Key ${this.currentApiKeyIndex + 1}, switching API key...`);
                        if (this.switchToNextApiKey()) {
                            break; // Break inner loop, continue with new API key
                        }

                        // All API keys and models exhausted
                        this.currentModelIndex = startModelIndex;
                        this.currentApiKeyIndex = startApiKeyIndex;
                        const retryMatch = error.message?.match(/retry in (\d+)/i);
                        const retryTime = retryMatch ? retryMatch[1] : '60';
                        throw new Error(`RATE_LIMIT: All API keys quota exceeded. Please wait ${retryTime} seconds or try again later.`);
                    }

                    // If model not found, try fallback model
                    if (this.isModelNotFoundError(error)) {
                        if (!this.switchToFallback()) {
                            throw new Error('AI_UNAVAILABLE: All AI models are currently unavailable.');
                        }
                        continue;
                    }

                    // Non-recoverable error, don't retry
                    throw error;
                }
            }
        }

        // All retries exhausted
        this.currentModelIndex = startModelIndex;
        this.currentApiKeyIndex = startApiKeyIndex;

        if (lastError) {
            if (this.isPermissionDeniedError(lastError)) {
                throw new Error('GEMINI_ACCESS_DENIED: The configured Gemini API key does not have access to the available models. Check Gemini API access, project billing, and model availability.');
            }

            if (this.isRateLimitError(lastError)) {
                const retryMatch = lastError.message?.match(/retry in (\d+)/i);
                const retryTime = retryMatch ? retryMatch[1] : '60';
                throw new Error(`RATE_LIMIT: All Gemini API keys quota exceeded. Please wait ${retryTime} seconds or try again later.`);
            }

            if (this.isModelNotFoundError(lastError)) {
                throw new Error('AI_UNAVAILABLE: All Gemini models are currently unavailable.');
            }
        }

        throw lastError || new Error('Failed after all retry attempts');
    }

    /**
     * Generate adaptive summary based on difficulty level
     * @param {Object} meetingData - The meeting data to summarize
     * @param {string} level - 'simple' | 'intermediate' | 'advanced'
     * @returns {Promise<Object>} - The generated summary
     */
    async generateAdaptiveSummary(meetingData, level = 'intermediate') {
        if (!this.isAvailable()) {
            throw new Error('Gemini AI is not configured. Please add GEMINI_API_KEY to your environment.');
        }

        const { meetingId, title, host, participants, messages, transcript, activities, duration, startTime, endTime } = meetingData;

        // Format all data for AI
        const formattedTranscript = this.formatTranscript(transcript);
        const formattedChat = this.formatConversation(messages);
        const formattedActivities = this.formatActivities(activities);
        const participantList = this.formatParticipants(participants);

        // Determine what data is available
        const hasTranscript = transcript && transcript.length > 0;
        const hasChat = messages && messages.filter(m => m.type === 'text' || !m.type).length > 0;
        const hasActivities = activities && activities.length > 0;

        const levelPrompts = {
            simple: `You are a helpful assistant for students. Generate a SIMPLE, easy-to-understand summary of this meeting.

Meeting: ${title || 'Untitled Meeting'}
Host: ${host || 'Unknown'}
Duration: ${duration || 'Unknown'}
Participants: ${participantList}

${hasTranscript ? `=== SPOKEN CONVERSATION ===\n${formattedTranscript}\n` : ''}
${hasChat ? `=== CHAT MESSAGES ===\n${formattedChat}\n` : ''}

${!hasTranscript && !hasChat ? 'Note: No conversation was recorded for this meeting.' : ''}

**Instructions for SIMPLE level:**
- Use very simple language that a beginner can understand
- Avoid technical jargon - explain any necessary terms
- Keep sentences short (10-15 words max)
- Use bullet points for easy reading
- Maximum 5-7 key points only
- Focus on: What was discussed? What was decided?

Format:
**📌 Main Topic**
[One simple sentence]

**💡 Key Points**
• [Point 1 - simple language]
• [Point 2 - simple language]
• [Point 3 - simple language]

**✅ What to Remember**
[1-2 simple takeaways]`,

            intermediate: `You are a helpful assistant for students. Generate a BALANCED summary of this meeting with moderate detail.

Meeting: ${title || 'Untitled Meeting'}
Meeting ID: ${meetingId}
Host: ${host || 'Unknown'}
Duration: ${duration || 'Unknown'}
Participants (${participants?.length || 0}): ${participantList}

${hasTranscript ? `=== SPOKEN CONVERSATION ===\n${formattedTranscript}\n` : ''}
${hasChat ? `=== CHAT MESSAGES ===\n${formattedChat}\n` : ''}
${hasActivities ? `=== ACTIVITIES ===\n${formattedActivities}\n` : ''}

${!hasTranscript && !hasChat ? 'Note: No conversation was recorded.' : ''}

**Instructions for INTERMEDIATE level:**
- Use clear, professional language
- Include main discussion topics with brief explanations
- Mention important decisions and their context
- Include relevant details but avoid overwhelming info
- Use formatting for readability

Format:
**📋 Meeting Overview**
[2-3 sentences about the meeting purpose and context]

**💬 Discussion Highlights**
1. **[Topic 1]**: [Brief explanation with key details]
2. **[Topic 2]**: [Brief explanation with key details]
3. **[Topic 3]**: [Brief explanation with key details]

**🎯 Decisions & Outcomes**
• [Decision 1 with brief context]
• [Decision 2 with brief context]

**📝 Key Takeaways**
[3-5 bullet points summarizing what's important]`,

            advanced: `You are a professional meeting analyst. Generate a COMPREHENSIVE, detailed summary of this meeting.

Meeting: ${title || 'Untitled Meeting'}
Meeting ID: ${meetingId}
Host: ${host || 'Unknown'}
Start Time: ${startTime || 'Unknown'}
End Time: ${endTime || 'Unknown'}
Duration: ${duration || 'Unknown'}
Participants (${participants?.length || 0}): ${participantList}

${hasTranscript ? `=== FULL SPOKEN TRANSCRIPT ===\n${formattedTranscript}\n` : ''}
${hasChat ? `=== COMPLETE CHAT LOG ===\n${formattedChat}\n` : ''}
${hasActivities ? `=== ALL MEETING ACTIVITIES ===\n${formattedActivities}\n` : ''}

${!hasTranscript && !hasChat ? 'Note: No conversation was recorded.' : ''}

**Instructions for ADVANCED level:**
- Provide thorough, analytical summary
- Include all significant discussion points with full context
- Analyze participant contributions and dynamics
- Identify patterns, themes, and connections
- Include technical details where relevant
- Provide critical analysis and insights

Format with these sections:
## 📊 Executive Summary
[Comprehensive overview paragraph]

## 🎯 Meeting Objectives & Context
[What this meeting aimed to achieve]

## 💬 Detailed Discussion Analysis
### Topic 1: [Name]
- **Context**: [Background]
- **Discussion**: [What was said]
- **Participants**: [Who contributed]
- **Outcome**: [Result]

### Topic 2: [Name]
[Same structure...]

## 🔍 Key Insights & Analysis
- [Analytical observation 1]
- [Analytical observation 2]
- [Pattern or theme identified]

## ✅ Decisions & Resolutions
| Decision | Context | Impact |
|----------|---------|--------|
| [Decision 1] | [Why] | [Effect] |

## 👥 Participant Engagement
[Analysis of who contributed what]

## 📈 Recommendations
[Suggestions based on meeting content]

## 📝 Comprehensive Summary
[Detailed wrap-up paragraph]`
        };

        const prompt = levelPrompts[level] || levelPrompts.intermediate;

        // Use fallback mechanism for generating content
        return await this.executeWithFallback(async (ai, modelName) => {
            const result = await ai.models.generateContent({
                model: modelName,
                contents: prompt
            });
            const summaryText = result.text;

            // Also generate action items
            const actionItemsPrompt = `Based on this meeting content, extract action items:

${hasTranscript ? `Transcript: ${formattedTranscript}` : ''}
${hasChat ? `Chat: ${formattedChat}` : ''}

List action items as:
- [ ] Task (Assigned to: Name, if mentioned)

Keep it ${level === 'simple' ? 'brief with only essential tasks' : level === 'advanced' ? 'comprehensive with all tasks and subtasks' : 'balanced with main tasks'}.
If no specific action items, suggest 2-3 based on discussion.`;

            const actionResult = await ai.models.generateContent({
                model: modelName,
                contents: actionItemsPrompt
            });
            const actionItems = actionResult.text;

            return {
                success: true,
                level,
                summary: summaryText,
                actionItems: actionItems,
                modelUsed: modelName,
                meetingInfo: {
                    meetingId,
                    title,
                    host,
                    participantCount: participants?.length || 0,
                    messageCount: messages?.filter(m => m.type === 'text' || !m.type).length || 0,
                    transcriptCount: transcript?.length || 0,
                    activityCount: activities?.length || 0,
                    duration,
                    startTime,
                    endTime
                },
                generatedAt: new Date().toISOString()
            };
        });
    }

    /**
     * Chat with AI about meeting content
     * @param {Object} meetingData - The meeting data for context
     * @param {string} userMessage - User's question
     * @param {Array} chatHistory - Previous chat messages
     * @returns {Promise<Object>} - AI response
     */
    async chatAboutMeeting(meetingData, userMessage, chatHistory = []) {
        if (!this.isAvailable()) {
            throw new Error('Gemini AI is not configured. Please add GEMINI_API_KEY to your environment.');
        }

        const { meetingId, title, host, participants, messages, transcript, activities, duration } = meetingData;

        const formattedTranscript = this.formatTranscript(transcript);
        const formattedChat = this.formatConversation(messages);
        const formattedActivities = this.formatActivities(activities);
        const participantList = this.formatParticipants(participants);

        const hasTranscript = transcript && transcript.length > 0;
        const hasChat = messages && messages.filter(m => m.type === 'text' || !m.type).length > 0;

        // Build context for the AI
        const systemContext = `You are a helpful AI assistant that answers questions about a meeting. Be conversational, helpful, and accurate.

=== MEETING INFORMATION ===
Meeting: ${title || 'Untitled Meeting'}
Host: ${host || 'Unknown'}
Duration: ${duration || 'Unknown'}
Participants: ${participantList}

${hasTranscript ? `=== SPOKEN CONVERSATION (Transcript) ===\n${formattedTranscript}\n` : ''}
${hasChat ? `=== CHAT MESSAGES ===\n${formattedChat}\n` : ''}
${activities?.length ? `=== MEETING ACTIVITIES ===\n${formattedActivities}\n` : ''}

${!hasTranscript && !hasChat ? 'Note: Limited conversation data available for this meeting.' : ''}

=== INSTRUCTIONS ===
- Answer questions based ONLY on the meeting data above
- If something wasn't discussed, say "That wasn't mentioned in this meeting"
- Be helpful and suggest related information from the meeting
- Use simple, clear language
- Format responses with markdown for readability
- If asked for summaries, provide them based on actual content
- Be conversational and friendly`;

        // Build chat history for context
        let conversationHistory = chatHistory.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        // Use fallback mechanism for chat
        return await this.executeWithFallback(async (ai, modelName) => {
            // Create chat with system context (new SDK: ai.chats.create)
            const chat = ai.chats.create({
                model: modelName,
                history: [
                    {
                        role: 'user',
                        parts: [{ text: systemContext + '\n\nPlease acknowledge you understand the meeting context and are ready to help.' }]
                    },
                    {
                        role: 'model',
                        parts: [{ text: 'I understand the meeting context and I\'m ready to help you with any questions about this meeting. What would you like to know?' }]
                    },
                    ...conversationHistory
                ]
            });

            const result = await chat.sendMessage({ message: userMessage });
            const aiResponse = result.text;

            return {
                success: true,
                response: aiResponse,
                modelUsed: modelName,
                meetingInfo: {
                    meetingId,
                    title,
                    host,
                    participantCount: participants?.length || 0,
                    messageCount: messages?.filter(m => m.type === 'text' || !m.type).length || 0,
                    duration
                }
            };
        });
    }

    /**
     * Generate meeting summary from conversation data (legacy support)
     * @param {Object} meetingData - The meeting data to summarize
     * @param {string} summaryType - 'brief' | 'detailed' | 'action-items'
     * @returns {Promise<Object>} - The generated summary
     */
    async generateSummary(meetingData, summaryType = 'detailed') {
        if (!this.isAvailable()) {
            throw new Error('Gemini AI is not configured. Please add GEMINI_API_KEY to your environment.');
        }

        const { meetingId, title, host, participants, messages, transcript, activities, duration, startTime, endTime } = meetingData;

        // Format all data for AI
        const formattedTranscript = this.formatTranscript(transcript);
        const formattedChat = this.formatConversation(messages);
        const formattedActivities = this.formatActivities(activities);
        const participantList = this.formatParticipants(participants);
        const pollSummary = this.formatPolls(messages);

        // Determine what data is available
        const hasTranscript = transcript && transcript.length > 0;
        const hasChat = messages && messages.filter(m => m.type === 'text' || !m.type).length > 0;
        const hasActivities = activities && activities.length > 0;

        const prompts = {
            brief: `You are a professional meeting assistant. Generate a BRIEF summary (2-3 sentences max) of this meeting.

Meeting: ${title || 'Untitled Meeting'}
Host: ${host || 'Unknown'}
Duration: ${duration || 'Unknown'}
Participants: ${participantList}

${hasTranscript ? `=== SPOKEN CONVERSATION (Speech-to-Text) ===\n${formattedTranscript}\n` : ''}
${hasChat ? `=== CHAT MESSAGES ===\n${formattedChat}\n` : ''}
${hasActivities ? `=== MEETING ACTIVITIES ===\n${formattedActivities}\n` : ''}
${pollSummary ? `=== POLLS ===\n${pollSummary}` : ''}

${!hasTranscript && !hasChat ? 'Note: No conversation was recorded for this meeting. Summarize based on available activity data.' : ''}

Provide ONLY a brief 2-3 sentence summary highlighting the main topic and outcome. Be concise.`,

            detailed: `You are a professional meeting assistant. Generate a comprehensive summary of this meeting.

Meeting: ${title || 'Untitled Meeting'}
Meeting ID: ${meetingId}
Host: ${host || 'Unknown'}
Start Time: ${startTime || 'Unknown'}
End Time: ${endTime || 'Unknown'}
Duration: ${duration || 'Unknown'}
Participants (${participants?.length || 0}): ${participantList}

${hasTranscript ? `=== SPOKEN CONVERSATION (Speech-to-Text Transcript) ===\n${formattedTranscript}\n` : ''}
${hasChat ? `=== CHAT MESSAGES ===\n${formattedChat}\n` : ''}
${hasActivities ? `=== MEETING ACTIVITIES (Join/Leave, Screen Share, Hand Raises, etc.) ===\n${formattedActivities}\n` : ''}
${pollSummary ? `=== POLLS CONDUCTED ===\n${pollSummary}\n` : ''}

${!hasTranscript && !hasChat ? 'Note: No conversation was recorded. Generate summary based on participant activities and meeting metadata.' : ''}

Please provide a detailed summary with the following sections:
1. **Meeting Overview** - Brief introduction of the meeting purpose
2. **Key Discussion Points** - Main topics discussed (from transcript and chat)
3. **Decisions Made** - Any decisions or conclusions reached
4. **Action Items** - Tasks assigned or next steps identified
5. **Participant Contributions** - Notable contributions from participants
6. **Meeting Dynamics** - Screen shares, hand raises, and engagement patterns
7. **Summary** - Final wrap-up

Format with markdown for readability.`,

            'action-items': `You are a professional meeting assistant. Extract ONLY the action items and tasks from this meeting.

Meeting: ${title || 'Untitled Meeting'}
Participants: ${participantList}

${hasTranscript ? `=== SPOKEN CONVERSATION ===\n${formattedTranscript}\n` : ''}
${hasChat ? `=== CHAT MESSAGES ===\n${formattedChat}\n` : ''}

List all action items, tasks, and follow-ups mentioned in the meeting. Format as:
- [ ] Task description (Assigned to: Name, if mentioned)

If no specific action items were discussed, provide suggested action items based on the conversation topics.`
        };

        const prompt = prompts[summaryType] || prompts.detailed;

        try {
            // Use fallback mechanism for rate limit handling
            const result = await this.executeWithFallback(async (ai, modelName) => {
                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: prompt
                });
                return response;
            });

            const text = result.text;

            return {
                success: true,
                type: summaryType,
                summary: text,
                meetingInfo: {
                    meetingId,
                    title,
                    host,
                    participantCount: participants?.length || 0,
                    messageCount: messages?.filter(m => m.type === 'text' || !m.type).length || 0,
                    transcriptCount: transcript?.length || 0,
                    activityCount: activities?.length || 0,
                    duration,
                    startTime,
                    endTime
                },
                generatedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Gemini API Error:', error);

            if (error.message?.includes('RATE_LIMIT')) {
                throw new Error('AI service is temporarily busy. Please try again in a moment.');
            }
            if (error.message?.includes('GEMINI_API_KEY_INVALID')) {
                throw new Error('AI service configuration invalid: GEMINI_API_KEY is not valid. Please update your backend environment.');
            }
            throw new Error(`Failed to generate summary: ${error.message}`);
        }
    }

    /**
     * Generate all summary types at once
     */
    async generateAllSummaries(meetingData) {
        if (!this.isAvailable()) {
            throw new Error('Gemini AI is not configured. Please add GEMINI_API_KEY to your environment.');
        }

        try {
            const [brief, detailed, actionItems] = await Promise.all([
                this.generateSummary(meetingData, 'brief'),
                this.generateSummary(meetingData, 'detailed'),
                this.generateSummary(meetingData, 'action-items')
            ]);

            return {
                success: true,
                brief: brief.summary,
                detailed: detailed.summary,
                actionItems: actionItems.summary,
                meetingInfo: detailed.meetingInfo,
                generatedAt: new Date().toISOString()
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Format speech transcript into readable conversation
     */
    formatTranscript(transcript) {
        if (!transcript || transcript.length === 0) {
            return 'No spoken conversation recorded.';
        }

        return transcript
            .filter(t => t.isFinal) // Only include final transcriptions
            .map(t => {
                const time = t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : '';
                return `[${time}] ${t.username}: ${t.text}`;
            })
            .join('\n') || 'No spoken conversation recorded.';
    }

    /**
     * Format chat messages into readable conversation
     */
    formatConversation(messages) {
        if (!messages || messages.length === 0) {
            return 'No chat messages recorded.';
        }

        return messages
            .filter(msg => msg.type === 'text' || !msg.type)
            .map(msg => {
                const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
                return `[${time}] ${msg.username}: ${msg.message}`;
            })
            .join('\n') || 'No chat messages recorded.';
    }

    /**
     * Format activities into readable list
     */
    formatActivities(activities) {
        if (!activities || activities.length === 0) {
            return 'No activities recorded.';
        }

        const activityLabels = {
            'join': '➡️ joined the meeting',
            'leave': '⬅️ left the meeting',
            'hand-raise': '✋ raised hand',
            'hand-lower': '👇 lowered hand',
            'screen-share-start': '🖥️ started screen sharing',
            'screen-share-stop': '🖥️ stopped screen sharing',
            'mute': '🔇 muted microphone',
            'unmute': '🔊 unmuted microphone',
            'video-off': '📷 turned off camera',
            'video-on': '📷 turned on camera'
        };

        return activities
            .map(a => {
                const time = a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '';
                const action = activityLabels[a.type] || a.type;
                return `[${time}] ${a.username} ${action}`;
            })
            .join('\n');
    }

    /**
     * Format participants list
     */
    formatParticipants(participants) {
        if (!participants || participants.length === 0) {
            return 'Unknown';
        }
        return participants.map(p => p.username || p.name || 'Unknown').join(', ');
    }

    /**
     * Format polls summary
     */
    formatPolls(messages) {
        if (!messages) return '';

        const polls = messages.filter(msg => msg.type === 'poll');
        if (polls.length === 0) return '';

        return polls.map(poll => {
            const optionsText = poll.options
                ?.map(opt => `  - ${opt.text || opt}: ${opt.count || 0} votes`)
                .join('\n') || '';
            return `Question: ${poll.question}\n${optionsText}`;
        }).join('\n\n');
    }

    /**
     * Summarize missed messages when user was away
     * @param {Array} messages - Array of missed messages
     * @returns {Promise<string>} - Summary of what was missed
     */
    async summarizeMissedMessages(messages) {
        if (!this.isAvailable()) {
            throw new Error('Gemini AI is not configured. Please add GEMINI_API_KEY to your environment.');
        }

        if (!messages || messages.length === 0) {
            return 'No messages to summarize.';
        }

        // Format messages for AI
        const formattedMessages = messages.map(msg => {
            const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
            const sender = msg.senderName || 'Unknown';
            const text = msg.text || msg.message || '';
            return `[${time}] ${sender}: ${text}`;
        }).join('\n');

        const prompt = `You are a helpful meeting assistant. A participant was away from the meeting and missed these messages. 
Provide a brief, clear summary of what they missed so they can quickly catch up.

MISSED MESSAGES:
${formattedMessages}

INSTRUCTIONS:
1. Summarize the key points discussed
2. Highlight any important decisions or action items mentioned
3. Note if anyone asked a question that might need attention
4. Keep it concise but informative (2-4 sentences for short conversations, more for longer ones)
5. Use bullet points if there are multiple distinct topics
6. Be friendly and helpful in tone

Provide a helpful "catch-up" summary:`;

        try {
            const result = await this.executeWithFallback(async (ai, modelName) => {
                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: prompt
                });
                return response;
            });

            const summary = result.text;
            return summary || 'Unable to generate summary.';
        } catch (error) {
            console.error('Error summarizing missed messages:', error);

            if (error.message?.includes('RATE_LIMIT')) {
                throw new Error('AI service is temporarily busy. Please try again in a moment.');
            }
            if (error.message?.includes('GEMINI_API_KEY_INVALID')) {
                throw new Error('AI service configuration invalid: GEMINI_API_KEY is not valid. Please update your backend environment.');
            }
            throw new Error('Failed to generate summary. Please try again.');
        }
    }

    /**
     * Summarize missed speech transcripts when user was away
     * @param {Array} transcripts - Array of transcript objects with userId, username, text, timestamp
     * @returns {Promise<string>} - AI-generated summary
     */
    async summarizeMissedSpeech(transcripts) {
        if (!this.isAvailable()) {
            throw new Error('Gemini AI is not configured. Please add GEMINI_API_KEY to your environment.');
        }

        if (!transcripts || transcripts.length === 0) {
            return 'No speech to summarize.';
        }

        // Format transcripts for AI
        const formattedTranscripts = transcripts.map(t => {
            const time = t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : '';
            const speaker = t.speakerName || t.username || 'Unknown Speaker';
            const text = t.text || '';
            return `[${time}] ${speaker}: "${text}"`;
        }).join('\n');

        const prompt = `You are a helpful meeting assistant. A participant was away from the meeting and missed these spoken conversations. 
Provide a clear summary of what was said so they can quickly catch up on what they missed hearing.

MISSED SPEECH TRANSCRIPTS:
${formattedTranscripts}

INSTRUCTIONS:
1. Summarize the key topics and points that were spoken
2. Highlight any important announcements, decisions, or action items mentioned verbally
3. Note if anyone asked a question directed at others or needed attention
4. Identify who was speaking the most and about what topics
5. Keep it concise but informative - focus on what's important
6. Use bullet points if there are multiple distinct topics or speakers
7. Be friendly and helpful in tone

Provide a helpful "catch-up" summary of what was said:`;

        try {
            const result = await this.executeWithFallback(async (ai, modelName) => {
                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: prompt
                });
                return response;
            });

            const summary = result.text;
            return summary || 'Unable to generate summary.';
        } catch (error) {
            console.error('Error summarizing missed speech:', error);

            if (error.message?.includes('RATE_LIMIT')) {
                throw new Error('AI service is temporarily busy. Please try again in a moment.');
            }
            if (error.message?.includes('GEMINI_API_KEY_INVALID')) {
                throw new Error('AI service configuration invalid: GEMINI_API_KEY is not valid. Please update your backend environment.');
            }
            throw new Error('Failed to generate speech summary. Please try again.');
        }
    }
}

// Singleton instance
const geminiService = new GeminiService();

module.exports = geminiService;