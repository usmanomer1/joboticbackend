/**
 * Format-Preserving Resume Editor
 * Maintains exact resume format while editing content
 */

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../middleware/errorHandler');
const geminiClient = require('../utils/geminiClient');
const puppeteer = require('puppeteer');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class FormatPreservingEditorService {
  constructor() {
    this.browserInstance = null;
  }

  /**
   * Process resume while preserving exact format
   */
  async processResume(userId, resumeText, jobDescription) {
    console.log('=== FORMAT PRESERVING EDITOR ===');
    console.log('Processing resume without changing structure...');
    
    try {
      // Step 1: Extract editable content while preserving format markers
      const editableContent = await this.extractEditableContent(resumeText);
      
      // Step 2: If job description provided, enhance content ONLY
      let enhancedText = resumeText;
      if (jobDescription) {
        enhancedText = await this.enhanceContentOnly(resumeText, jobDescription);
      }
      
      // Step 3: Generate PDF preserving exact format
      const pdfUrl = await this.generateExactPDF(enhancedText, userId);
      
      // Step 4: Save to database
      const sessionId = await this.saveSession(userId, resumeText, enhancedText, editableContent, pdfUrl);
      
      return {
        sessionId,
        pdfUrl,
        originalText: resumeText,
        enhancedText,
        editableContent
      };
      
    } catch (error) {
      console.error('Process resume error:', error);
      throw error;
    }
  }

  /**
   * Extract editable content without changing structure
   */
  async extractEditableContent(resumeText) {
    const prompt = `Analyze this resume and extract ONLY the editable content (bullet points, descriptions, etc.) while noting their exact position in the text. 

DO NOT change any formatting, structure, or layout.

For each editable element, provide:
1. Line number
2. Type (bullet, description, etc.)
3. Current content
4. Position markers

Resume:
${resumeText}

Return as JSON with structure:
{
  "editableElements": [
    {
      "id": "unique-id",
      "lineNumber": 15,
      "type": "bullet",
      "content": "Developed REST API...",
      "startPos": 245,
      "endPos": 290
    }
  ]
}`;

    try {
      const result = await geminiClient.generateContent(prompt);
      return JSON.parse(result);
    } catch (error) {
      console.error('Failed to extract editable content:', error);
      // Fallback - return basic structure
      return { editableElements: [] };
    }
  }

  /**
   * Enhance ONLY the content without changing format
   */
  async enhanceContentOnly(resumeText, jobDescription) {
    const prompt = `You are a resume content enhancer. Your job is to improve the resume content to better match the job description while STRICTLY preserving the exact format, structure, spacing, and layout.

CRITICAL RULES:
1. NEVER change the structure or formatting
2. NEVER move sections around
3. NEVER change line breaks or spacing
4. NEVER change headers or section titles
5. ONLY modify the actual content (bullet points, descriptions)
6. Keep the same number of bullet points per section
7. Maintain the exact same line length and structure
8. If a bullet point exists, enhance it but keep it as a bullet point
9. Match the writing style of the original

Job Description:
${jobDescription}

Original Resume (PRESERVE THIS EXACT FORMAT):
${resumeText}

Return the enhanced resume with the EXACT same format as the input. Only the words should change, nothing else.`;

    try {
      const enhanced = await geminiClient.generateContent(prompt);
      // Ensure we're not getting any wrapper text
      const cleanEnhanced = enhanced.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
      return cleanEnhanced;
    } catch (error) {
      console.error('Enhancement failed:', error);
      return resumeText; // Return original if enhancement fails
    }
  }

  /**
   * Generate PDF that looks exactly like the original
   */
  async generateExactPDF(resumeText, userId) {
    let browser;
    let page;
    
    try {
      browser = await this.getBrowser();
      page = await browser.newPage();
      
      // Create HTML that preserves exact formatting
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Arial:wght@400;700&display=swap');
    
    body {
      font-family: Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.2;
      margin: 0;
      padding: 0;
      color: #000;
    }
    
    .resume-content {
      white-space: pre-wrap;
      word-wrap: break-word;
      padding: 1in;
      font-family: 'Times New Roman', serif;
      font-size: 11pt;
      line-height: 1.15;
    }
    
    /* Preserve monospace for certain sections if needed */
    .monospace {
      font-family: 'Courier New', monospace;
    }
    
    @page {
      margin: 0;
      size: letter;
    }
    
    @media print {
      body {
        margin: 0;
      }
      .resume-content {
        padding: 0.75in;
      }
    }
  </style>
</head>
<body>
  <div class="resume-content">${this.escapeHtml(resumeText)}</div>
</body>
</html>`;
      
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      // Generate PDF with settings that preserve formatting
      const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: false,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        preferCSSPageSize: true
      });
      
      // Upload to Supabase
      const fileName = `${userId}/resume_${Date.now()}_${uuidv4()}.pdf`;
      
      const { data, error } = await supabase.storage
        .from('resumes')
        .upload(fileName, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true
        });
      
      if (error) {
        throw new AppError(`Failed to upload PDF: ${error.message}`, 500);
      }
      
      const { data: { publicUrl } } = supabase.storage
        .from('resumes')
        .getPublicUrl(fileName);
      
      return publicUrl;
      
    } catch (error) {
      console.error('PDF generation error:', error);
      throw error;
    } finally {
      if (page) await page.close();
    }
  }

  /**
   * Get browser instance
   */
  async getBrowser() {
    if (!this.browserInstance) {
      const options = {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      };
      this.browserInstance = await puppeteer.launch(options);
    }
    return this.browserInstance;
  }

  /**
   * Save session to database
   */
  async saveSession(userId, originalText, enhancedText, editableContent, pdfUrl) {
    // Check for existing session
    const { data: existing } = await supabase
      .from('resume_data')
      .select('id')
      .eq('user_id', userId)
      .single();
    
    const sessionData = {
      user_id: userId,
      resume_text: enhancedText,
      sections: { 
        original: originalText,
        enhanced: enhancedText,
        editable: editableContent 
      },
      schema: editableContent,
      pdf_url: pdfUrl,
      last_edited_at: new Date().toISOString()
    };
    
    if (existing) {
      // Update existing
      await supabase
        .from('resume_data')
        .update(sessionData)
        .eq('id', existing.id);
      
      return existing.id;
    } else {
      // Create new
      const newId = uuidv4();
      await supabase
        .from('resume_data')
        .insert({
          id: newId,
          ...sessionData,
          created_at: new Date().toISOString()
        });
      
      return newId;
    }
  }

  /**
   * Update specific content while preserving format
   */
  async updateContent(sessionId, updates) {
    try {
      // Get current data
      const { data: session } = await supabase
        .from('resume_data')
        .select('*')
        .eq('id', sessionId)
        .single();
      
      if (!session) {
        throw new AppError('Session not found', 404);
      }
      
      // Apply updates to text while preserving format
      let updatedText = session.sections.enhanced || session.resume_text;
      
      // Sort updates by position (reverse order to maintain positions)
      const sortedUpdates = updates.sort((a, b) => b.startPos - a.startPos);
      
      for (const update of sortedUpdates) {
        // Replace content at exact position
        updatedText = 
          updatedText.substring(0, update.startPos) + 
          update.newContent + 
          updatedText.substring(update.endPos);
      }
      
      // Generate new PDF
      const pdfUrl = await this.generateExactPDF(updatedText, session.user_id);
      
      // Update database
      await supabase
        .from('resume_data')
        .update({
          resume_text: updatedText,
          sections: {
            ...session.sections,
            enhanced: updatedText
          },
          pdf_url: pdfUrl,
          last_edited_at: new Date().toISOString()
        })
        .eq('id', sessionId);
      
      return { pdfUrl, updatedText };
      
    } catch (error) {
      console.error('Update content error:', error);
      throw error;
    }
  }

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Cleanup
   */
  async cleanup() {
    if (this.browserInstance) {
      await this.browserInstance.close();
      this.browserInstance = null;
    }
  }
}

module.exports = new FormatPreservingEditorService();