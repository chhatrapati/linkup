const express = require('express');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// OpenAI Initialization
const openai = new OpenAI({
  apiKey: process.env.apikey, // Replace with your OpenAI API key
});

const questions = [
    `
    <h2>Welcome to the Collaboration Finder Portal!</h2>
    <p>Our platform is designed to help you find the perfect collaborator for your business needs. Here's how we can assist you:</p>
    <ul>
      <li>🛠 <b>Tech Experts:</b> Connect with investors or sales partners.</li>
      <li>💰 <b>Investors:</b> Discover exciting new ideas and teams to invest in.</li>
      <li>📈 <b>Sales Partners:</b> Find innovative products to sell in your market.</li>
    </ul>
    <p><b>Let’s get started! Tell us a bit about yourself:</b></p>
    <p>- What's your current role, and what are your strengths? For example, "I’m a tech expert who has developed a healthcare app."</p>
    `,
    "What kind of collaboration are you looking for? (For example, are you looking for a technical partner, an investor, or a sales partner?)",
    "What is your business domain? (What industry or field does your business belong to? For example, 'I’m in the healthcare domain, developing a fitness tracking app.')",
    "What is your preferred region for collaboration? (Which geographical area would you prefer to collaborate in or with? For example, 'I’m looking to collaborate with partners in North America or Europe.')",
    "What’s your current role, and what are your strengths? (For example, 'I’m a tech expert who has developed a healthcare app.')",
  ];
  

// To keep track of user sessions
const userSessions = {};

app.post('/start', (req, res) => {
  const userId = req.body.userId;
  console.log(`Starting session for user: ${userId}`);
  userSessions[userId] = { currentQuestionIndex: 0, answers: {} };
  res.json({ question: questions[0] });
});

app.post('/respond', async (req, res) => {
  const { userId, response } = req.body;
  const session = userSessions[userId];

  if (!session) {
    return res.status(400).json({ error: "Session not found. Please start again." });
  }

  const currentQuestionIndex = session.currentQuestionIndex;
  const currentQuestion = questions[currentQuestionIndex];

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
console.log('isValidResponse',isValidResponse);
if (!isValidResponse) {
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
      question: customMessage, // Keep the current question
    });
  }
  
      

    // Save the user's response
    session.answers[questions[currentQuestionIndex]] = response;

    // Move to the next question or finish if all questions are answered
    if (currentQuestionIndex + 1 < questions.length) {
      session.currentQuestionIndex += 1;
      res.json({ question: questions[session.currentQuestionIndex] });
    } else {
      res.json({
        message: "All questions answered. Thank you for your responses!",
        data: session.answers,
      });
    }

    
  } catch (error) {
    console.error("Error validating response:", error);
    res.status(500).json({ error: "Something went wrong while validating the response." });
  }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
