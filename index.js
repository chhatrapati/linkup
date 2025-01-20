const express = require('express');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const cors = require('cors');

// Configure CORS options
const corsOptions = {
  origin: 'https://linkupui.onrender.com', // Allow this specific origin
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // Allow these HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Allow these headers
  credentials: true, // Allow credentials if needed
};

const app = express();
app.use(cors(corsOptions));

app.use(bodyParser.json());

// OpenAI Initialization
const openai = new OpenAI({
  apiKey: process.env.apikey
});

// Map questions to fields
const questionsMap = {
  current_role: "What’s your current role, and what are your strengths? (For example, 'I’m a tech expert who has developed a healthcare app.')",
  collaboration_needs: "What kind of collaboration are you looking for? (For example, are you looking for a technical partner, an investor, or a sales partner?)",
  domain: "What is your business domain? (What industry or field does your business belong to? For example, 'I’m in the healthcare domain, developing a fitness tracking app.')",
  region: "What is your preferred region for collaboration? (Which geographical area would you prefer to collaborate in or with? For example, 'I’m looking to collaborate with partners in North America or Europe.')"
};

// To keep track of user sessions
const userSessions = {};

app.post('/start', (req, res) => {
  const userId = req.body.userId;
  console.log(`Starting session for user: ${userId}`);
  userSessions[userId] = { answers: {} };

  // Ask the first question
  const firstField = Object.keys(questionsMap)[0];
  res.json({ question: questionsMap[firstField] });
});

app.post('/respond', async (req, res) => {
  const { userId, response } = req.body;
  const session = userSessions[userId];

  if (!session) {
    return res.status(400).json({ error: "Session not found. Please start again." });
  }

  // Find the next missing field
  const unansweredFields = Object.keys(questionsMap).filter(field => !session.answers[field]);

  // If no fields are left, return a thank-you message
  if (unansweredFields.length === 0) {
    return res.json({
      message: "All questions answered. Thank you for your responses!",
      data: session.answers,
      isValidResponse:true
    });
  }

  // Current field and question
  const currentField = unansweredFields[0];
  const currentQuestion = questionsMap[currentField];

  try {
    // Step 1: Validate the response
    const validationResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant.",
        },
        {
          role: "user",
          content: `Does the following user response seem relevant and meaningful based on this question: "${currentQuestion}"?
          Response: "${response}"
          Please reply with "Yes" if it's valid and "No" if it seems irrelevant, dummy, or nonsensical.`,
        },
      ],
    });

    const isValidResponse = validationResponse.choices[0].message.content.trim().toLowerCase() === "yes";

    if (!isValidResponse) {
      // If the response is invalid, politely ask the same question again
      const clarificationMessage = `
      The user has provided an irrelevant or incomplete answer to the question: "${currentQuestion}". 
      Please politely ask them to provide a valid and relevant answer.
      User's response: "${response}"`;

      const clarificationResponse = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that drafts polite messages to guide users to answer questions properly.",
          },
          {
            role: "user",
            content: clarificationMessage,
          },
        ],
      });

      const customMessage = clarificationResponse.choices[0].message.content.trim();

      return res.json({
        message: customMessage,
        question: currentQuestion, // Keep the current question
        isValidResponse:false
      });
    }

    // Step 2: Extract information
    const systemPrompt = `
      Extract the following information from the user's response:
      - Current Role
      - Collaboration Needs
      - Domain
      - Region
      Return the result as a JSON object with keys: current_role, collaboration_needs, domain, region.
      If any key is missing, return only the extracted fields.
    `;

    const extractionResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `User response: "${response}"`,
        },
      ],
    });

    const extractedData = JSON.parse(extractionResponse.choices[0].message.content);

    // Merge extracted data into session answers
    session.answers = { ...session.answers, ...extractedData };

    // Find the next unanswered field
    const nextUnansweredFields = Object.keys(questionsMap).filter(field => !session.answers[field]);

    if (nextUnansweredFields.length === 0) {
      // If no fields are left, return a thank-you message
      return res.json({
        message: "All questions answered. Thank you for your responses!",
        data: session.answers,
        isValidResponse:true
      });
    }

    // Ask the next question
    const nextField = nextUnansweredFields[0];
    res.json({ isValidResponse:true,question: questionsMap[nextField] });

  } catch (error) {
    console.error("Error processing response:", error);
    res.status(500).json({ error: "Something went wrong while processing the response." });
  }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
