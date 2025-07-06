/**
 * Resume Editor V2 - Simple parsing with edit interface
 * Preserves format while enabling field-by-field editing
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

class ResumeEditorV2Service {
  /**
   * Parse resume into editable sections while preserving format
   */
  async parseForEdit(userId, resumeText, jobDescription) {
    console.log('=== RESUME EDITOR V2 ===');
    console.log('Parsing for edit interface...');
    
    try {
      // Parse resume into sections
      const sections = this.parseIntoSections(resumeText);
      
      // Generate edit schema for frontend
      const editSchema = this.generateEditSchema(sections);
      
      // Store in Supabase
      const sessionId = uuidv4();
      console.log('Attempting to save to Supabase...');
      console.log('Session ID:', sessionId);
      console.log('User ID:', userId);
      console.log('Sections count:', sections.length);
      console.log('Schema sections:', editSchema.length);
      
      const insertData = {
        id: sessionId,
        user_id: userId,
        resume_text: resumeText,  // Changed from original_text
        sections: sections,
        schema: editSchema,  // Changed from edit_schema
        created_at: new Date().toISOString(),
        last_edited_at: new Date().toISOString()
      };
      
      console.log('Insert data size:', JSON.stringify(insertData).length, 'bytes');
      
      const { data: resumeData, error } = await supabase
        .from('resume_data')
        .insert(insertData)
        .select()
        .single();
      
      if (error) {
        console.error('=== SUPABASE ERROR ===');
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
        console.error('Error hint:', error.hint);
        console.error('Full error:', JSON.stringify(error, null, 2));
        
        // Check specific error types
        if (error.code === '42P01') {
          throw new AppError('Database table does not exist', 500);
        } else if (error.code === '23505') {
          throw new AppError('Duplicate entry - this session already exists', 500);
        } else if (error.code === '22P02') {
          throw new AppError('Invalid data format', 500);
        } else if (error.message?.includes('JWT')) {
          throw new AppError('Authentication error with database', 500);
        }
        
        throw new AppError(`Failed to save resume data: ${error.message}`, 500);
      }
      
      // Generate initial PDF
      const pdfUrl = await simplePdfGenerator.generatePDF(resumeText, userId);
      
      // Update with PDF URL
      await supabase
        .from('resume_data')
        .update({ pdf_url: pdfUrl })
        .eq('id', sessionId);
      
      return {
        sessionId,
        pdfUrl,
        editSchema,
        sections
      };
      
    } catch (error) {
      console.error('Parse for edit error:', error);
      throw error;
    }
  }

  /**
   * Parse resume text into sections
   * Simple approach - just identify sections and content
   */
  parseIntoSections(resumeText) {
    const lines = resumeText.split('\n');
    const sections = [];
    let currentSection = null;
    
    // First few lines are usually personal info
    const personalInfoEnd = this.findPersonalInfoEnd(lines);
    if (personalInfoEnd > 0) {
      sections.push({
        id: 'personal',
        type: 'personal',
        title: 'Personal Information',
        content: lines.slice(0, personalInfoEnd).join('\n'),
        startLine: 0,
        endLine: personalInfoEnd
      });
    }
    
    // Parse remaining sections
    for (let i = personalInfoEnd; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (this.isSectionHeader(line, lines[i-1], lines[i+1])) {
        // Save previous section
        if (currentSection) {
          sections.push(currentSection);
        }
        
        // Start new section
        currentSection = {
          id: this.generateSectionId(line),
          type: this.detectSectionType(line),
          title: line,
          content: '',
          items: [],
          startLine: i,
          endLine: i
        };
      } else if (currentSection && line) {
        // Add to current section
        currentSection.content += (currentSection.content ? '\n' : '') + lines[i];
        currentSection.endLine = i;
      }
    }
    
    // Don't forget last section
    if (currentSection) {
      sections.push(currentSection);
    }
    
    // Parse section content into items
    sections.forEach(section => {
      if (section.type !== 'personal') {
        section.items = this.parseSectionItems(section);
      }
    });
    
    return sections;
  }

  /**
   * Find where personal info ends
   */
  findPersonalInfoEnd(lines) {
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      if (this.isSectionHeader(lines[i], lines[i-1], lines[i+1])) {
        return i;
      }
    }
    return 3; // Default to first 3 lines
  }

  /**
   * Check if line is a section header
   */
  isSectionHeader(line, prevLine, nextLine) {
    if (!line || line.length < 3) return false;
    
    // Common patterns:
    // 1. ALL CAPS
    if (line === line.toUpperCase() && line.match(/[A-Z]/)) return true;
    
    // 2. Common section keywords
    const keywords = ['experience', 'education', 'skills', 'projects', 'summary'];
    return keywords.some(keyword => line.toLowerCase().includes(keyword));
  }

  /**
   * Detect section type from title
   */
  detectSectionType(title) {
    const lower = title.toLowerCase();
    if (lower.includes('experience') || lower.includes('employment')) return 'experience';
    if (lower.includes('education')) return 'education';
    if (lower.includes('skill')) return 'skills';
    if (lower.includes('project')) return 'projects';
    if (lower.includes('summary') || lower.includes('objective')) return 'summary';
    return 'other';
  }

  /**
   * Generate section ID from title
   */
  generateSectionId(title) {
    return title.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
  }

  /**
   * Parse section content into individual items
   */
  parseSectionItems(section) {
    const items = [];
    const lines = section.content.split('\n').map(l => l.trim()).filter(Boolean);
    
    if (section.type === 'experience' || section.type === 'projects') {
      // Parse experience/project items
      let currentItem = null;
      
      lines.forEach(line => {
        if (line.startsWith('•') || line.startsWith('-')) {
          // Bullet point
          if (currentItem) {
            currentItem.bullets.push(line.replace(/^[•\-]\s*/, ''));
          }
        } else if (line.match(/\d{4}/) || !currentItem) {
          // New item (has year or is first non-bullet)
          if (currentItem) items.push(currentItem);
          currentItem = {
            id: uuidv4(),
            lines: [line],
            bullets: []
          };
        } else if (currentItem) {
          // Additional info line
          currentItem.lines.push(line);
        }
      });
      
      if (currentItem) items.push(currentItem);
      
    } else if (section.type === 'education') {
      // Parse education items - group by institution
      let currentItem = null;
      
      lines.forEach(line => {
        if (!currentItem || (!line.match(/\d{4}/) && items.length > 0 && currentItem.lines.length >= 2)) {
          // New education item
          if (currentItem) items.push(currentItem);
          currentItem = {
            id: uuidv4(),
            lines: [line]
          };
        } else {
          currentItem.lines.push(line);
        }
      });
      
      if (currentItem) items.push(currentItem);
      
    } else if (section.type === 'skills') {
      // Parse skills - usually categories with items
      lines.forEach(line => {
        if (line.includes(':')) {
          const [category, skills] = line.split(':').map(s => s.trim());
          items.push({
            id: uuidv4(),
            category,
            skills
          });
        } else {
          // Single line skill
          items.push({
            id: uuidv4(),
            skills: line
          });
        }
      });
    } else {
      // Other sections - just preserve lines
      items.push({
        id: uuidv4(),
        content: lines.join('\n')
      });
    }
    
    return items;
  }

  /**
   * Generate edit schema for frontend
   */
  generateEditSchema(sections) {
    return sections.map(section => {
      if (section.type === 'personal') {
        // Parse personal info into fields
        const lines = section.content.split('\n');
        const fields = [];
        
        // First line is usually name
        if (lines[0]) {
          fields.push({
            id: 'name',
            label: 'Name',
            type: 'text',
            value: lines[0].trim()
          });
        }
        
        // Look for contact info
        lines.forEach((line, index) => {
          if (index === 0) return;
          
          if (line.includes('@')) {
            // Email line or combined contact
            fields.push({
              id: `contact_${index}`,
              label: 'Contact Info',
              type: 'text',
              value: line.trim()
            });
          } else if (line.trim()) {
            fields.push({
              id: `line_${index}`,
              label: `Line ${index}`,
              type: 'text',
              value: line.trim()
            });
          }
        });
        
        return {
          id: section.id,
          title: section.title,
          type: 'personal',
          fields
        };
        
      } else if (section.type === 'experience' || section.type === 'projects') {
        return {
          id: section.id,
          title: section.title,
          type: 'experience',
          items: section.items.map(item => ({
            id: item.id,
            fields: [
              ...item.lines.map((line, idx) => ({
                id: `line_${idx}`,
                label: idx === 0 ? 'Title' : `Info ${idx}`,
                type: 'text',
                value: line
              })),
              {
                id: 'bullets',
                label: 'Bullet Points',
                type: 'bullets',
                value: item.bullets
              }
            ]
          }))
        };
        
      } else if (section.type === 'education') {
        return {
          id: section.id,
          title: section.title,
          type: 'education',
          items: section.items.map(item => ({
            id: item.id,
            fields: item.lines.map((line, idx) => ({
              id: `line_${idx}`,
              label: idx === 0 ? 'Institution' : idx === 1 ? 'Degree' : `Info ${idx}`,
              type: 'text',
              value: line
            }))
          }))
        };
        
      } else if (section.type === 'skills') {
        return {
          id: section.id,
          title: section.title,
          type: 'skills',
          items: section.items.map(item => ({
            id: item.id,
            fields: [
              item.category && {
                id: 'category',
                label: 'Category',
                type: 'text',
                value: item.category
              },
              {
                id: 'skills',
                label: 'Skills',
                type: 'text',
                value: item.skills
              }
            ].filter(Boolean)
          }))
        };
        
      } else {
        return {
          id: section.id,
          title: section.title,
          type: 'other',
          fields: [{
            id: 'content',
            label: 'Content',
            type: 'textarea',
            value: section.items[0]?.content || ''
          }]
        };
      }
    });
  }

  /**
   * Update a specific field and regenerate PDF
   */
  async updateField(sessionId, sectionId, itemId, fieldId, newValue) {
    try {
      // Get resume data
      const { data: resumeData, error } = await supabase
        .from('resume_data')
        .select('*')
        .eq('id', sessionId)
        .single();
      
      if (!resumeData) {
        throw new AppError('Session not found', 404);
      }
      
      // Update the specific field in the schema
      const updatedSchema = JSON.parse(JSON.stringify(resumeData.edit_schema));
      const section = updatedSchema.find(s => s.id === sectionId);
      
      if (!section) {
        throw new AppError('Section not found', 404);
      }
      
      if (section.type === 'personal') {
        // Update personal field
        const field = section.fields.find(f => f.id === fieldId);
        if (field) field.value = newValue;
      } else if (section.items) {
        // Update item field
        const item = section.items.find(i => i.id === itemId);
        if (item) {
          const field = item.fields.find(f => f.id === fieldId);
          if (field) field.value = newValue;
        }
      } else {
        // Update section field
        const field = section.fields.find(f => f.id === fieldId);
        if (field) field.value = newValue;
      }
      
      // Reconstruct resume text from schema
      const updatedText = this.reconstructResumeText(updatedSchema, resumeData.original_text);
      
      // Update in database
      await supabase
        .from('resume_data')
        .update({
          current_text: updatedText,
          edit_schema: updatedSchema,
          last_edited_at: new Date().toISOString()
        })
        .eq('id', sessionId);
      
      // Generate new PDF
      const pdfUrl = await simplePdfGenerator.generatePDF(updatedText, resumeData.user_id);
      
      // Update PDF URL
      await supabase
        .from('resume_data')
        .update({ pdf_url: pdfUrl })
        .eq('id', sessionId);
      
      return { pdfUrl, updatedText };
      
    } catch (error) {
      console.error('Update field error:', error);
      throw error;
    }
  }

  /**
   * Reconstruct resume text from edit schema
   */
  reconstructResumeText(schema, originalText) {
    let reconstructed = '';
    
    schema.forEach((section, sectionIndex) => {
      if (sectionIndex > 0) reconstructed += '\n\n';
      
      if (section.type === 'personal') {
        // Reconstruct personal info
        section.fields.forEach(field => {
          reconstructed += field.value + '\n';
        });
        
      } else if (section.type === 'experience' || section.type === 'projects') {
        // Add section title
        reconstructed += section.title + '\n';
        
        // Add items
        section.items.forEach((item, itemIndex) => {
          if (itemIndex > 0) reconstructed += '\n';
          
          // Add non-bullet fields
          item.fields.forEach(field => {
            if (field.id !== 'bullets') {
              reconstructed += field.value + '\n';
            }
          });
          
          // Add bullets
          const bulletsField = item.fields.find(f => f.id === 'bullets');
          if (bulletsField && bulletsField.value) {
            bulletsField.value.forEach(bullet => {
              reconstructed += '• ' + bullet + '\n';
            });
          }
        });
        
      } else if (section.type === 'education') {
        // Add section title
        reconstructed += section.title + '\n';
        
        // Add items
        section.items.forEach((item, itemIndex) => {
          if (itemIndex > 0) reconstructed += '\n';
          
          item.fields.forEach(field => {
            reconstructed += field.value + '\n';
          });
        });
        
      } else if (section.type === 'skills') {
        // Add section title
        reconstructed += section.title + '\n';
        
        // Add skill items
        section.items.forEach(item => {
          let line = '';
          const catField = item.fields.find(f => f.id === 'category');
          const skillField = item.fields.find(f => f.id === 'skills');
          
          if (catField && catField.value) {
            line = catField.value + ': ' + skillField.value;
          } else {
            line = skillField.value;
          }
          reconstructed += line + '\n';
        });
        
      } else {
        // Other sections
        reconstructed += section.title + '\n';
        const contentField = section.fields.find(f => f.id === 'content');
        if (contentField) {
          reconstructed += contentField.value + '\n';
        }
      }
    });
    
    return reconstructed.trim();
  }

  /**
   * Get resume data
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

module.exports = new ResumeEditorV2Service();