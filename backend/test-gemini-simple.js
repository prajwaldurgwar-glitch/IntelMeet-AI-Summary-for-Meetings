require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const configuredModels = process.env.GEMINI_MODEL_PRIORITY || process.env.GEMINI_MODELS;
    const modelNames = configuredModels
        ? configuredModels.split(',').map(modelName => modelName.trim()).filter(Boolean)
        : ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
    
    console.log('--- Gemini API Test ---');
    console.log(`API Key present: ${!!apiKey}`);
    if (apiKey) {
        console.log(`API Key length: ${apiKey.length}`);
        console.log(`API Key start: ${apiKey.substring(0, 5)}...`);
        console.log(`API Key end: ...${apiKey.substring(apiKey.length - 5)}`);
    } else {
        console.error('ERROR: GEMINI_API_KEY is missing in .env file');
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    console.log(`Configured models: ${modelNames.join(', ')}`);

    // Test the supported constructor and the configured model list.
    console.log('\nTesting string constructor with configured models');
    let modelSucceeded = false;
    try {
        for (const modelName of modelNames) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                console.log(`Trying ${modelName}...`);
                const result = await model.generateContent('Hello, are you working?');
                console.log(`Response received from ${modelName}:`, result.response.text());
                console.log(`✅ ${modelName} PASSED`);
                modelSucceeded = true;
                break;
            } catch (error) {
                console.error(`❌ ${modelName} FAILED:`, error.message);
                if (error.code || error.status) {
                    console.error(`   Code/Status: ${error.code || error.status}`);
                }
            }
        }

        if (!modelSucceeded) {
            console.error('❌ No configured Gemini model succeeded with the current API key.');
        }
    } catch (error) {
        console.error('❌ Gemini test runner failed:', error.message);
    }
}

testGemini();
