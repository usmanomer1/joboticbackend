/**
 * Test Gemini API connection directly
 */
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
  console.log('Testing Gemini API...');
  console.log('API Key present:', !!process.env.GEMINI_API_KEY);
  console.log('API Key length:', process.env.GEMINI_API_KEY?.length);
  
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    // Simple test prompt
    const testPrompt = 'Say "Hello, I am working!" if you can read this.';
    console.log('\nSending test prompt:', testPrompt);
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: testPrompt }] }],
      generationConfig: {
        maxOutputTokens: 100,
        temperature: 0.7
      }
    });
    
    const response = await result.response;
    const text = response.text();
    
    console.log('\n✅ SUCCESS! Gemini Response:', text);
    
    // Now test JSON generation (what the analysis uses)
    console.log('\n\nTesting JSON generation...');
    const jsonPrompt = `Return a simple JSON object with a score field set to 7.5 and a message field set to "Test successful". Return ONLY valid JSON, no markdown.`;
    
    const jsonResult = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: jsonPrompt }] }],
      generationConfig: {
        maxOutputTokens: 100,
        temperature: 0.3
      }
    });
    
    const jsonResponse = await jsonResult.response;
    const jsonText = jsonResponse.text();
    console.log('\nRaw JSON response:', jsonText);
    
    // Try to parse it
    try {
      const parsed = JSON.parse(jsonText.trim());
      console.log('✅ JSON parsed successfully:', parsed);
    } catch (e) {
      console.log('❌ JSON parse failed:', e.message);
      console.log('Trying to clean response...');
      
      // Clean markdown if present
      let cleaned = jsonText.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      
      const parsed2 = JSON.parse(cleaned.trim());
      console.log('✅ Cleaned JSON parsed successfully:', parsed2);
    }
    
    console.log('\n🎉 All tests passed! Gemini API is working correctly.');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('Full error:', error);
    
    if (error.message.includes('API_KEY_INVALID')) {
      console.error('\n⚠️  The API key appears to be invalid. Please check your GEMINI_API_KEY.');
    }
  }
}

testGemini();