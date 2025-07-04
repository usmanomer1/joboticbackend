/**
 * Google Gemini AI client utility
 * @module utils/geminiClient
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { AppError } = require('../middleware/errorHandler');

// Validate API key exists
if (!process.env.GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY is not set in environment variables');
}

// Initialize Gemini client
let genAI = null;
let model = null;

/**
 * Initialize the Gemini AI client
 * @returns {GoogleGenerativeAI} Initialized client
 */
const initializeClient = () => {
  if (!process.env.GEMINI_API_KEY) {
    throw new AppError('GEMINI_API_KEY is not configured', 500);
  }
  
  try {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('Gemini AI client initialized successfully');
    return genAI;
  } catch (error) {
    console.error('Failed to initialize Gemini AI client:', error);
    throw new AppError('Failed to initialize AI service', 500);
  }
};

/**
 * Get or create the Gemini Pro model instance
 * @param {string} modelName - Model name (default: 'gemini-pro')
 * @returns {Object} Model instance
 */
const getModel = (modelName = 'gemini-1.5-flash') => {
  if (!model) {
    if (!genAI) {
      initializeClient();
    }
    
    try {
      model = genAI.getGenerativeModel({ model: modelName });
      console.log(`Gemini model '${modelName}' loaded successfully`);
    } catch (error) {
      console.error('Failed to load Gemini model:', error);
      throw new AppError('Failed to load AI model', 500);
    }
  }
  
  return model;
};

/**
 * Generate content using Gemini AI
 * @param {string} prompt - The prompt to send to the AI
 * @param {Object} options - Additional options
 * @param {number} options.maxOutputTokens - Maximum tokens in response
 * @param {number} options.temperature - Temperature for randomness (0-1)
 * @param {number} options.topP - Top-p sampling
 * @param {number} options.topK - Top-k sampling
 * @returns {Promise<string>} Generated text
 */
const generateContent = async (prompt, options = {}) => {
  try {
    if (!prompt || typeof prompt !== 'string') {
      throw new AppError('Invalid prompt provided', 400);
    }
    
    const model = getModel();
    
    // Configure generation parameters
    const generationConfig = {
      maxOutputTokens: options.maxOutputTokens || 2048,
      temperature: options.temperature || 0.7,
      topP: options.topP || 0.8,
      topK: options.topK || 40,
    };
    
    // Log request (without exposing the full prompt in production)
    console.log('Generating content with Gemini AI', {
      promptLength: prompt.length,
      config: generationConfig
    });
    
    // Generate content
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    });
    
    const response = await result.response;
    const text = response.text();
    
    if (!text) {
      throw new AppError('No response generated from AI', 500);
    }
    
    console.log('Content generated successfully', {
      responseLength: text.length
    });
    
    return text;
  } catch (error) {
    console.error('Gemini content generation error:', {
      message: error.message,
      status: error.status,
      code: error.code,
      details: error.details,
      stack: error.stack?.substring(0, 500)
    });
    
    // Handle specific Gemini errors
    if (error.message?.includes('API key')) {
      throw new AppError('Invalid AI API key', 401);
    } else if (error.message?.includes('quota')) {
      throw new AppError('AI service quota exceeded', 429);
    } else if (error.message?.includes('safety') || error.message?.includes('SAFETY')) {
      throw new AppError('Content filtered by safety settings', 400);
    } else if (error.message?.includes('RECITATION')) {
      throw new AppError('Content blocked due to recitation concerns', 400);
    } else if (error.status === 429) {
      throw new AppError('Rate limit exceeded - too many requests', 429);
    } else if (error.status === 400) {
      throw new AppError(`Invalid request: ${error.message}`, 400);
    }
    
    // Re-throw AppErrors
    if (error instanceof AppError) {
      throw error;
    }
    
    // Generic error with more details
    throw new AppError('Failed to generate content', 500, {
      originalError: error.message,
      status: error.status,
      code: error.code
    });
  }
};

/**
 * Generate structured JSON content using Gemini AI
 * @param {string} prompt - The prompt to send to the AI
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Parsed JSON response
 */
const generateJSON = async (prompt, options = {}) => {
  try {
    // Add JSON instruction to prompt
    const jsonPrompt = `${prompt}\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no explanation, just the JSON object.`;
    
    const response = await generateContent(jsonPrompt, {
      ...options,
      temperature: options.temperature || 0.3 // Lower temperature for structured output
    });
    
    // Clean response (remove markdown code blocks if present)
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.slice(7);
    }
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }
    
    // Parse JSON
    try {
      const jsonData = JSON.parse(cleanedResponse.trim());
      return jsonData;
    } catch (parseError) {
      console.error('Failed to parse AI JSON response:', cleanedResponse);
      throw new AppError('Invalid JSON response from AI', 500);
    }
  } catch (error) {
    console.error('Gemini JSON generation error:', error);
    throw error;
  }
};

/**
 * Validate Gemini connection on startup
 * @returns {Promise<boolean>} Connection status
 */
const validateConnection = async () => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('⚠️  GEMINI_API_KEY not configured - AI features will be disabled');
      return false;
    }
    
    console.log('Validating Gemini AI connection...');
    
    // Try to initialize and test with a simple prompt
    const testPrompt = 'Respond with "OK" if you can read this.';
    const response = await generateContent(testPrompt, {
      maxOutputTokens: 10,
      temperature: 0
    });
    
    if (response.toLowerCase().includes('ok')) {
      console.log('✅ Gemini AI connection validated successfully');
      return true;
    } else {
      console.warn('⚠️  Gemini AI responded but validation unclear');
      return true; // Still consider it working
    }
  } catch (error) {
    console.error('❌ Gemini AI connection validation failed:', error.message);
    return false;
  }
};

/**
 * Batch generate content for multiple prompts
 * @param {Array<string>} prompts - Array of prompts
 * @param {Object} options - Generation options
 * @returns {Promise<Array<string>>} Array of generated responses
 */
const batchGenerateContent = async (prompts, options = {}) => {
  if (!Array.isArray(prompts) || prompts.length === 0) {
    throw new AppError('Invalid prompts array provided', 400);
  }
  
  console.log(`Batch generating content for ${prompts.length} prompts`);
  
  try {
    // Process prompts in parallel with a concurrency limit
    const batchSize = 3; // Process 3 at a time to avoid rate limits
    const results = [];
    
    for (let i = 0; i < prompts.length; i += batchSize) {
      const batch = prompts.slice(i, i + batchSize);
      const batchPromises = batch.map(prompt => 
        generateContent(prompt, options).catch(error => ({
          error: error.message,
          prompt: prompt.substring(0, 50) + '...'
        }))
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < prompts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  } catch (error) {
    console.error('Batch generation error:', error);
    throw new AppError('Failed to batch generate content', 500);
  }
};

/**
 * Get model information
 * @returns {Object} Model information
 */
const getModelInfo = () => {
  return {
    provider: 'Google',
    model: 'gemini-pro',
    configured: !!process.env.GEMINI_API_KEY,
    features: {
      textGeneration: true,
      jsonMode: true,
      batchProcessing: true,
      maxTokens: 2048
    }
  };
};

// Initialize client on module load if API key exists
if (process.env.GEMINI_API_KEY) {
  try {
    initializeClient();
  } catch (error) {
    console.error('Failed to initialize Gemini client on startup:', error);
  }
}

// Export functions
module.exports = {
  getModel,
  generateContent,
  generateJSON,
  validateConnection,
  batchGenerateContent,
  getModelInfo
};