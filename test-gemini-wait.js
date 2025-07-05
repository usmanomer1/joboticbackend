/**
 * Test Gemini API with retry delay
 */
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testWithDelay() {
  console.log('Waiting 10 seconds before testing...');
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  console.log('\nTesting Gemini API...');
  console.log('API Key:', process.env.GEMINI_API_KEY?.substring(0, 15) + '...');
  
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Return the number 42' }] }],
      generationConfig: {
        maxOutputTokens: 10,
        temperature: 0.1
      }
    });
    
    const response = await result.response;
    const text = response.text();
    
    console.log('\n✅ SUCCESS! Gemini is working!');
    console.log('Response:', text);
    
  } catch (error) {
    console.error('\n❌ Still failing:', error.message.split('[429')[0]);
    
    if (error.message.includes('free_tier')) {
      console.log('\n🔴 CRITICAL: The API key is still on FREE TIER!');
      console.log('\nYou must:');
      console.log('1. Go to: https://aistudio.google.com/app/apikey');
      console.log('2. Create a NEW API key (not reuse the old one)');
      console.log('3. Make sure you\'re in the project with billing enabled');
      console.log('4. Update the GEMINI_API_KEY in .env with the new key');
    }
  }
}

testWithDelay();