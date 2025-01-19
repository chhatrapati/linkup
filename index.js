const express = require('express');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const cors = require('cors'); // Import the cors middleware


const app = express();
// Enable CORS for all origins
app.use(cors());
app.use(bodyParser.json());

// Initialize the OpenAI API
const openai = new OpenAI({
    apiKey: process.env.apikey // Replace with your actual API key
});

// In-memory user sessions storage
const userSessions = {};

const questions = [
    "What is your current role or strength?",
    "What kind of collaboration are you looking for?",
    "What is your business domain?",
    "What is your preferred region for collaboration?"
];

// Start questionnaire
app.post('/start', (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ message: 'User ID is required.' });
    }

    userSessions[userId] = {
        currentIndex: 0,
        currentQuestion: questions[0],
        responses: {}
    };

    res.json({
        message: 'Questionnaire started.',
        question: userSessions[userId].currentQuestion
    });
});

// Handle user responses
app.post('/respond', async (req, res) => {
    const { userId, response } = req.body;
    const userSession = userSessions[userId];

    if (!userSession) {
        return res.status(400).json({ message: 'Session not found. Start the questionnaire first.' });
    }

    userSession.responses[userSession.currentIndex] = response;

    const requiredKeys = ['current_role', 'collaboration_needs', 'domain', 'region'];
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

        const isComplete = requiredKeys.every(key => key in extractedData && extractedData[key]);

        if (isComplete) {
            userSession.responses = extractedData;

            return res.json({
                message: 'All questions answered.',
                data: extractedData
            });
        } else {
            userSession.currentIndex++;
            if (userSession.currentIndex < questions.length) {
                userSession.currentQuestion = questions[userSession.currentIndex];
                return res.json({
                    message: 'Next question:',
                    question: userSession.currentQuestion
                });
            } else {
                return res.json({
                    message: 'All questions answered.',
                    data: userSession.responses
                });
            }
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
