/**
 * Simple PDF Generator without Puppeteer
 * Temporary solution for Railway deployment
 */

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../middleware/errorHandler');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class SimplePdfGeneratorService {
  /**
   * Generate a simple text file instead of PDF (temporary)
   */
  async generatePDF(resumeData, userId) {
    console.log('Simple PDF Generator: Creating text version for user:', userId);
    
    try {
      // Generate text content
      const textContent = this.generateTextContent(resumeData);
      
      // Convert to buffer
      const buffer = Buffer.from(textContent, 'utf-8');
      
      // Upload to Supabase as .txt for now
      const fileName = `${userId}/resume_${Date.now()}_${uuidv4()}.txt`;
      console.log('Uploading text file to Supabase:', fileName);
      
      const { data, error } = await supabase.storage
        .from('resumes')
        .upload(fileName, buffer, {
          contentType: 'text/plain',
          upsert: true
        });
      
      if (error) {
        console.error('Supabase storage upload error:', error);
        throw new AppError(`Failed to upload file to storage: ${error.message}`, 500);
      }
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('resumes')
        .getPublicUrl(fileName);
      
      console.log('File public URL:', publicUrl);
      return publicUrl;
      
    } catch (error) {
      console.error('Simple PDF generation error:', error);
      throw error;
    }
  }
  
  /**
   * Generate text content from resume data
   */
  generateTextContent(resumeData) {
    const { sections } = resumeData;
    let content = '';
    
    // Personal Info
    if (sections.personalInfo) {
      const info = sections.personalInfo;
      if (info.name) content += `${info.name}\n`;
      if (info.title) content += `${info.title}\n`;
      if (info.email) content += `${info.email} | `;
      if (info.phone) content += `${info.phone} | `;
      if (info.location) content += `${info.location}\n`;
      if (info.linkedin) content += `LinkedIn: ${info.linkedin}\n`;
      if (info.github) content += `GitHub: ${info.github}\n`;
      content += '\n';
    }
    
    // Other sections
    Object.entries(sections).forEach(([key, section]) => {
      if (key === 'personalInfo') return;
      
      content += `${section.title?.toUpperCase() || key.toUpperCase()}\n`;
      content += '='.repeat(50) + '\n';
      
      if (section.type === 'paragraph') {
        content += `${section.content}\n`;
      } else if (section.type === 'list') {
        section.items?.forEach(item => {
          content += `• ${item}\n`;
        });
      } else if (section.type === 'experience' || section.type === 'education') {
        section.items?.forEach(item => {
          if (item.title || item.degree) content += `${item.title || item.degree}\n`;
          if (item.organization || item.institution) content += `${item.organization || item.institution}`;
          if (item.location) content += ` | ${item.location}`;
          if (item.dateRange || item.date) content += ` | ${item.dateRange || item.date}`;
          content += '\n';
          if (item.description || item.details) {
            (item.description || item.details).forEach(desc => {
              content += `  • ${desc}\n`;
            });
          }
          content += '\n';
        });
      } else if (section.type === 'skills') {
        section.categories?.forEach(cat => {
          content += `${cat.name}: ${cat.skills}\n`;
        });
      }
      
      content += '\n';
    });
    
    return content;
  }
}

module.exports = new SimplePdfGeneratorService();