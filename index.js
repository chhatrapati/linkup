const express = require('express');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({
    apiKey: process.env.apikey
});

// In-memory user sessions storage
const userSessions = {};

const questions = {
    current_role: "What is your current role or strength?",
    collaboration_needs: "What kind of collaboration are you looking for?",
    domain: "What is your business domain?",
    region: "What is your preferred region for collaboration?"
};

// Start questionnaire
app.post('/start', (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ message: 'User ID is required.' });
    }

    userSessions[userId] = {
        responses: {}
    };

    res.json({
        message: 'Questionnaire started.',
        question: questions.current_role // Ask the first question (current_role)
    });
});

// Handle user responses
app.post('/respond', async (req, res) => {
    const { userId, response } = req.body;
    const userSession = userSessions[userId];

    if (!userSession) {
        return res.status(400).json({ message: 'Session not found. Start the questionnaire first.' });
    }

    // Process the user's response
    const systemPrompt = `
      Extract the following information from the user's response:
      - Current Role
      - Collaboration Needs
      - Domain
      - Region
      Return the result as a JSON object with keys: current_role, collaboration_needs, domain, region.
      If any key is missing, return only the extracted fields.
    `;
    
    try {
        const aiResponse = await getChatGPTResponse(systemPrompt, response);
        console.log(aiResponse);
        const extractedData = JSON.parse(aiResponse);

        // Update the session with the extracted data
        Object.keys(extractedData).forEach(key => {
            userSession.responses[key] = extractedData[key];
        });

        // Find the next missing field
        const missingFields = Object.keys(questions).filter(field => !userSession.responses[field]);

        if (missingFields.length === 0) {
            // If no fields are missing, all questions are answered
            return res.json({
                message: 'All questions answered.',
                data: userSession.responses
            });
        } else {
            // Ask the next missing field's question
            const nextField = missingFields[0];
            return res.json({
                message: `Next question: ${questions[nextField]}`,
                question: questions[nextField]
            });
        }
    } catch (error) {
        console.error('Error extracting information:', error);
        return res.status(500).json({ message: 'Failed to process the response.' });
    }
});

// Function to get ChatGPT response
async function getChatGPTResponse(prompt, userResponse) {
    const messages = [
        { role: 'system', content: prompt },
        { role: 'user', content: userResponse }
    ];

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: messages,
            temperature: 0.5
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error('Error with ChatGPT API:', error.response?.data || error.message);
        throw new Error('ChatGPT API call failed.');
    }
}

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
