/**
 * Check Gemini API quota and wait for retry
 */
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function checkQuota() {
  console.log('Checking Gemini API quota status...');
  console.log('Current API Key:', process.env.GEMINI_API_KEY?.substring(0, 10) + '...');
  
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  
  // The error said retry in 45s, let's wait and try
  console.log('\nWaiting 50 seconds for quota to reset...');
  await new Promise(resolve => setTimeout(resolve, 50000));
  
  try {
    console.log('\nTrying again...');
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Say "working"' }] }],
      generationConfig: { maxOutputTokens: 10 }
    });
    
    const response = await result.response;
    const text = response.text();
    console.log('✅ SUCCESS! Response:', text);
    return true;
  } catch (error) {
    console.log('❌ Still failing:', error.message.split('\n')[0]);
    
    // Check if it's still showing free tier
    if (error.message.includes('free_tier')) {
      console.log('\n⚠️  API key is still on free tier!');
      console.log('\nPlease try:');
      console.log('1. Generate a NEW API key from: https://aistudio.google.com/app/apikey');
      console.log('2. Make sure you selected the project with billing enabled');
      console.log('3. Update the GEMINI_API_KEY in your .env file');
    }
    return false;
  }
}

checkQuota();