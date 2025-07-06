/**
 * Simple Resume Editor Service
 * Preserves original format, only updates content
 */

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../middleware/errorHandler');
const simplePdfGenerator = require('./simplePdfGenerator');
const geminiClient = require('../utils/geminiClient');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class SimpleResumeEditorService {
  /**
   * Parse resume and store in Supabase
   * Returns the original format with AI improvements
   */
  async parseAndInitialize(userId, resumeText, jobDescription) {
    console.log('=== SIMPLE RESUME EDITOR ===');
    console.log('Preserving original format, enhancing content only...');
    
    try {
      // Store original resume
      const resumeId = uuidv4();
      
      // If job description provided, enhance resume content
      let enhancedResumeText = resumeText;
      if (jobDescription) {
        enhancedResumeText = await this.enhanceResumeContent(resumeText, jobDescription);
      }
      
      // Create/update resume data in Supabase
      const { data: resumeData, error } = await supabase
        .from('resume_data')
        .upsert({
          id: resumeId,
          user_id: userId,
          original_text: resumeText,
          enhanced_text: enhancedResumeText,
          job_description: jobDescription,
          created_at: new Date().toISOString(),
          last_edited_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) {
        console.error('Supabase error:', error);
        throw new AppError('Failed to save resume data', 500);
      }
      
      // Generate PDF with enhanced content
      const pdfUrl = await simplePdfGenerator.generatePDF(enhancedResumeText, userId);
      
      // Update with PDF URL
      await supabase
        .from('resume_data')
        .update({ pdf_url: pdfUrl })
        .eq('id', resumeId);
      
      return {
        sessionId: resumeId,
        pdfUrl: pdfUrl,
        originalText: resumeText,
        enhancedText: enhancedResumeText,
        changes: this.identifyChanges(resumeText, enhancedResumeText)
      };
      
    } catch (error) {
      console.error('Parse and initialize error:', error);
      throw error;
    }
  }

  /**
   * Enhance resume content using AI while preserving format
   */
  async enhanceResumeContent(resumeText, jobDescription) {
    try {
      const prompt = `You are a resume improvement AI. Your task is to enhance the resume content to better match the job description while STRICTLY preserving the original format.

CRITICAL RULES:
1. Keep the EXACT same structure and formatting
2. Keep all section headers exactly as they are
3. Keep the same number of sections
4. Keep bullet point structure (if bullet points exist, keep them as bullet points)
5. Only modify the content/wording to better match the job requirements
6. You can add or remove individual bullet points within sections
7. Make content more impactful and relevant to the job
8. DO NOT change the order of sections
9. DO NOT change formatting style
10. DO NOT add new sections

Job Description:
${jobDescription}

Current Resume:
${resumeText}

Return ONLY the improved resume text with the EXACT same formatting as the input. Do not include any explanations or markup.`;

      const improvedResume = await geminiClient.generateContent(prompt);
      return improvedResume || resumeText;
      
    } catch (error) {
      console.error('AI enhancement error:', error);
      // If AI fails, return original
      return resumeText;
    }
  }

  /**
   * Identify what changed between original and enhanced
   */
  identifyChanges(original, enhanced) {
    const originalLines = original.split('\n');
    const enhancedLines = enhanced.split('\n');
    const changes = [];
    
    // Simple line-by-line comparison
    const maxLines = Math.max(originalLines.length, enhancedLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const origLine = originalLines[i] || '';
      const enhLine = enhancedLines[i] || '';
      
      if (origLine !== enhLine) {
        changes.push({
          line: i + 1,
          original: origLine,
          enhanced: enhLine,
          type: !origLine ? 'added' : !enhLine ? 'removed' : 'modified'
        });
      }
    }
    
    return changes;
  }

  /**
   * Update resume with manual edits
   */
  async updateResume(sessionId, updatedText) {
    try {
      // Get existing resume data
      const { data: resumeData, error: fetchError } = await supabase
        .from('resume_data')
        .select('*')
        .eq('id', sessionId)
        .single();
      
      if (!resumeData) {
        throw new AppError('Resume session not found', 404);
      }
      
      // Update text
      const { error: updateError } = await supabase
        .from('resume_data')
        .update({
          enhanced_text: updatedText,
          last_edited_at: new Date().toISOString()
        })
        .eq('id', sessionId);
      
      if (updateError) {
        throw new AppError('Failed to update resume', 500);
      }
      
      // Generate new PDF
      const pdfUrl = await simplePdfGenerator.generatePDF(updatedText, resumeData.user_id);
      
      // Update PDF URL
      await supabase
        .from('resume_data')
        .update({ pdf_url: pdfUrl })
        .eq('id', sessionId);
      
      return {
        pdfUrl,
        changes: this.identifyChanges(resumeData.original_text, updatedText)
      };
      
    } catch (error) {
      console.error('Update resume error:', error);
      throw error;
    }
  }

  /**
   * Get resume data by session ID
   */
  async getResumeData(sessionId) {
    const { data, error } = await supabase
      .from('resume_data')
      .select('*')
      .eq('id', sessionId)
      .single();
    
    if (error || !data) {
      throw new AppError('Resume not found', 404);
    }
    
    return data;
  }
}

module.exports = new SimpleResumeEditorService();