/**
 * Test different Gemini models to see quota status
 */
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testModels() {
  const models = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro',
    'gemini-pro-vision'
  ];
  
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  for (const modelName of models) {
    console.log(`\nTesting model: ${modelName}`);
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'Say "working"' }] }],
        generationConfig: { maxOutputTokens: 10 }
      });
      
      const response = await result.response;
      const text = response.text();
      console.log(`✅ ${modelName}: ${text.trim()}`);
    } catch (error) {
      console.log(`❌ ${modelName}: ${error.message.split('\n')[0]}`);
    }
  }
}

testModels();