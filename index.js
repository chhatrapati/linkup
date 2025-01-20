const express = require('express');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const cors = require('cors');

const app = express();
app.use(cors());
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

// Start session
app.post('/start', (req, res) => {
  const userId = req.body.userId;
  console.log(`Starting session for user: ${userId}`);
  userSessions[userId] = { answers: {} };

  // Ask the first question
  const firstField = Object.keys(questionsMap)[0];
  res.json({ question: questionsMap[firstField] });
});

// Handle user response
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
      data: session.answers
    });
  }

  // Process the user's response for the current field
  const currentField = unansweredFields[0];
  const currentQuestion = questionsMap[currentField];

  try {
    // Validate user response using OpenAI
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
    console.log('isValidResponse', isValidResponse);

    if (!isValidResponse) {
      // If the response is invalid, ask the same question again with a clarification message
      const dynamicPrompt = `
      The user has provided an irrelevant or incomplete answer to the question: "${currentQuestion}". 
      Please rephrase or explain why their input is not sufficient and politely ask them to provide a valid and relevant answer for the same question. 
      Keep the tone friendly and professional and in very short message.
      User's response: "${response}"`;

      const generatedMessage = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that drafts polite messages to guide users to answer questions properly.",
          },
          {
            role: "user",
            content: dynamicPrompt,
          },
        ],
      });

      const customMessage = generatedMessage.choices[0].message.content.trim();

      return res.json({
        message: customMessage,
        question: currentQuestion, // Keep the current question
        isValidResponse:false
      });
    }

    // Save the valid response
    session.answers[currentField] = response;

    // Find the next missing field
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
    console.error("Error validating response:", error);
    res.status(500).json({ error: "Something went wrong while validating the response." });
  }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
