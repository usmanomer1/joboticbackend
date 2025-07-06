/**
 * Resume Editor Service with Supabase Integration
 * Dynamically parses resume sections and persists to Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const { AppError } = require('../middleware/errorHandler');
const pdfGenerator = require('./pdfGenerator');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class ResumeEditorSupabaseService {
  /**
   * Parse resume and initialize/update Supabase data
   */
  async parseAndInitialize(userId, resumeText, jobId) {
    // Dynamically parse resume into sections
    const parsedData = this.intelligentParse(resumeText);
    
    // Generate schema based on what we found
    const schema = this.generateDynamicSchema(parsedData.sections);
    
    // Check if user already has resume data
    const { data: existingResume, error: fetchError } = await supabase
      .from('resume_data')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    let resumeData;
    
    if (existingResume) {
      // Update existing resume
      const { data, error } = await supabase
        .from('resume_data')
        .update({
          sections: parsedData.sections,
          schema: schema,
          resume_text: resumeText,
          last_edited_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();
        
      if (error) throw new AppError('Failed to update resume data', 500);
      resumeData = data;
    } else {
      // Get profile ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .single();
      
      // Create new resume data
      const { data, error } = await supabase
        .from('resume_data')
        .insert({
          user_id: userId,
          profile_id: profile?.id,
          sections: parsedData.sections,
          schema: schema,
          resume_text: resumeText
        })
        .select()
        .single();
        
      if (error) throw new AppError('Failed to create resume data', 500);
      resumeData = data;
    }
    
    // Generate PDF and upload to Supabase
    const pdfUrl = await this.generateAndUploadPdf(userId, resumeData.sections);
    
    // Update with PDF URL
    await supabase
      .from('resume_data')
      .update({ pdf_url: pdfUrl })
      .eq('id', resumeData.id);
    
    return {
      resumeId: resumeData.id,
      sections: parsedData.sections,
      schema: schema,
      pdfUrl: pdfUrl
    };
  }

  /**
   * Intelligent parsing that detects any section type
   */
  intelligentParse(resumeText) {
    const lines = resumeText.split('\n').map(line => line.trim()).filter(Boolean);
    const sections = {};
    let currentSection = null;
    let currentSectionKey = null;
    
    // First, extract personal info from top
    const personalInfo = this.extractPersonalInfo(lines.slice(0, 10));
    sections.personalInfo = personalInfo;
    
    // Find where personal info ends
    let startIndex = this.findSectionStart(lines);
    
    // Parse remaining content
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if this is a section header
      if (this.isSectionHeader(line, lines[i - 1], lines[i + 1])) {
        // Save previous section if exists
        if (currentSection && currentSectionKey) {
          sections[currentSectionKey] = this.processSection(currentSectionKey, currentSection);
        }
        
        // Start new section
        currentSectionKey = this.generateSectionKey(line);
        currentSection = {
          title: line,
          content: []
        };
      } else if (currentSection) {
        currentSection.content.push(line);
      }
    }
    
    // Don't forget last section
    if (currentSection && currentSectionKey) {
      sections[currentSectionKey] = this.processSection(currentSectionKey, currentSection);
    }
    
    return { sections };
  }

  /**
   * Extract personal info flexibly
   */
  extractPersonalInfo(topLines) {
    const info = {
      name: '',
      title: '',
      email: '',
      phone: '',
      location: '',
      linkedin: '',
      github: '',
      website: '',
      additionalLinks: []
    };
    
    // First non-empty line is usually name
    info.name = topLines.find(line => line && !this.isContactInfo(line)) || '';
    
    // Look for patterns in remaining lines
    topLines.forEach(line => {
      if (!line) return;
      
      // Email
      const emailMatch = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) info.email = emailMatch[1];
      
      // Phone
      const phoneMatch = line.match(/(\+?\d{1,4})?[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/);
      if (phoneMatch && phoneMatch[0].length >= 10) info.phone = phoneMatch[0];
      
      // LinkedIn
      if (line.toLowerCase().includes('linkedin')) {
        info.linkedin = line;
      }
      
      // GitHub
      if (line.toLowerCase().includes('github')) {
        info.github = line;
      }
      
      // Portfolio/Website
      if (line.match(/https?:\/\//) && !info.linkedin && !info.github) {
        if (!info.website) {
          info.website = line;
        } else {
          info.additionalLinks.push(line);
        }
      }
      
      // Location (City, State pattern)
      if (line.match(/^[A-Za-z\s]+,\s*[A-Z]{2}$/)) {
        info.location = line;
      }
      
      // Professional title (if between name and contact info)
      if (!this.isContactInfo(line) && line !== info.name && !info.title) {
        info.title = line;
      }
    });
    
    return info;
  }

  /**
   * Detect if line is a section header
   */
  isSectionHeader(line, prevLine, nextLine) {
    if (!line || line.length < 3) return false;
    
    // Common patterns:
    // 1. ALL CAPS
    if (line === line.toUpperCase() && line.match(/[A-Z]/)) return true;
    
    // 2. Title Case with colon
    if (line.endsWith(':')) return true;
    
    // 3. Surrounded by empty lines
    if (!prevLine && nextLine) return true;
    
    // 4. Common section keywords
    const sectionKeywords = [
      'experience', 'education', 'skills', 'summary', 'objective',
      'projects', 'publications', 'certifications', 'awards',
      'interests', 'references', 'languages', 'expertise',
      'qualifications', 'achievements', 'profile', 'about'
    ];
    
    const lowerLine = line.toLowerCase();
    return sectionKeywords.some(keyword => lowerLine.includes(keyword));
  }

  /**
   * Generate a clean key from section title
   */
  generateSectionKey(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .trim();
  }

  /**
   * Process section content based on patterns
   */
  processSection(key, section) {
    const content = section.content.join('\n');
    
    // Detect section type based on content patterns
    if (this.isListSection(content)) {
      return {
        title: section.title,
        type: 'list',
        items: this.parseListItems(section.content)
      };
    } else if (this.isExperienceSection(content)) {
      return {
        title: section.title,
        type: 'experience',
        items: this.parseExperienceItems(section.content)
      };
    } else if (this.isEducationSection(content)) {
      return {
        title: section.title,
        type: 'education',
        items: this.parseEducationItems(section.content)
      };
    } else if (this.isSkillsSection(content)) {
      return {
        title: section.title,
        type: 'skills',
        categories: this.parseSkillCategories(section.content)
      };
    } else {
      // Default to paragraph
      return {
        title: section.title,
        type: 'paragraph',
        content: content
      };
    }
  }

  /**
   * Generate dynamic schema based on detected sections
   */
  generateDynamicSchema(sections) {
    const schema = {};
    
    Object.entries(sections).forEach(([key, section]) => {
      if (key === 'personalInfo') {
        schema[key] = {
          title: 'Personal Information',
          fields: {
            name: { type: 'text', label: 'Full Name' },
            title: { type: 'text', label: 'Professional Title' },
            email: { type: 'email', label: 'Email' },
            phone: { type: 'tel', label: 'Phone' },
            location: { type: 'text', label: 'Location' },
            linkedin: { type: 'url', label: 'LinkedIn' },
            github: { type: 'url', label: 'GitHub' },
            website: { type: 'url', label: 'Website' }
          }
        };
      } else if (section.type === 'list') {
        schema[key] = {
          title: section.title,
          type: 'array',
          itemType: 'text'
        };
      } else if (section.type === 'experience') {
        schema[key] = {
          title: section.title,
          type: 'array',
          itemSchema: {
            title: { type: 'text', label: 'Position' },
            organization: { type: 'text', label: 'Company/Organization' },
            location: { type: 'text', label: 'Location' },
            dateRange: { type: 'text', label: 'Date Range' },
            description: { type: 'array', label: 'Description', itemType: 'text' }
          }
        };
      } else if (section.type === 'education') {
        schema[key] = {
          title: section.title,
          type: 'array',
          itemSchema: {
            degree: { type: 'text', label: 'Degree/Certification' },
            institution: { type: 'text', label: 'Institution' },
            location: { type: 'text', label: 'Location' },
            date: { type: 'text', label: 'Date' },
            details: { type: 'array', label: 'Additional Details', itemType: 'text' }
          }
        };
      } else if (section.type === 'skills') {
        schema[key] = {
          title: section.title,
          type: 'skillCategories',
          categorySchema: {
            name: { type: 'text', label: 'Category' },
            skills: { type: 'text', label: 'Skills (comma separated)' }
          }
        };
      } else {
        schema[key] = {
          title: section.title,
          type: 'textarea',
          label: section.title
        };
      }
    });
    
    return schema;
  }

  /**
   * Update a section in Supabase
   */
  async updateSection(userId, sectionId, data) {
    // Get current resume data
    const { data: resumeData, error: fetchError } = await supabase
      .from('resume_data')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (!resumeData) throw new AppError('Resume not found', 404);
    
    // Update the specific section
    const updatedSections = {
      ...resumeData.sections,
      [sectionId]: data
    };
    
    // Update in database
    const { error: updateError } = await supabase
      .from('resume_data')
      .update({
        sections: updatedSections,
        resume_text: this.sectionsToText(updatedSections)
      })
      .eq('id', resumeData.id);
    
    if (updateError) throw new AppError('Failed to update section', 500);
    
    // Generate new PDF and upload
    const pdfUrl = await this.generateAndUploadPdf(userId, updatedSections);
    
    // Update PDF URL
    await supabase
      .from('resume_data')
      .update({ pdf_url: pdfUrl })
      .eq('id', resumeData.id);
    
    // Also update the profile table's resume_text
    await supabase
      .from('profiles')
      .update({ 
        resume_text: this.sectionsToText(updatedSections),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);
    
    return { pdfUrl };
  }

  /**
   * Generate PDF and upload to Supabase storage
   */
  async generateAndUploadPdf(userId, sections) {
    // Use the new puppeteer-based PDF generator
    const resumeData = { sections };
    const pdfUrl = await pdfGenerator.generatePDF(resumeData, userId);
    return pdfUrl;
  }



  /**
   * Convert sections back to text
   */
  sectionsToText(sections) {
    let text = '';
    
    // Personal info
    const info = sections.personalInfo;
    if (info.name) text += info.name + '\n';
    if (info.title) text += info.title + '\n';
    
    const contactParts = [];
    if (info.email) contactParts.push(info.email);
    if (info.phone) contactParts.push(info.phone);
    if (info.location) contactParts.push(info.location);
    if (contactParts.length) text += contactParts.join(' | ') + '\n';
    
    const linkParts = [];
    if (info.linkedin) linkParts.push(info.linkedin);
    if (info.github) linkParts.push(info.github);
    if (info.website) linkParts.push(info.website);
    if (linkParts.length) text += linkParts.join(' | ') + '\n';
    
    text += '\n';
    
    // Other sections
    Object.entries(sections).forEach(([key, section]) => {
      if (key === 'personalInfo') return;
      
      text += section.title + '\n';
      
      switch (section.type) {
        case 'paragraph':
          text += section.content + '\n';
          break;
        case 'list':
          section.items.forEach(item => {
            text += `• ${item}\n`;
          });
          break;
        case 'experience':
          section.items.forEach(item => {
            text += `${item.title}\n`;
            if (item.organization) text += `${item.organization}\n`;
            if (item.dateRange) text += `${item.dateRange}\n`;
            if (item.description) {
              item.description.forEach(desc => {
                text += `• ${desc}\n`;
              });
            }
            text += '\n';
          });
          break;
        case 'skills':
          section.categories.forEach(cat => {
            text += `${cat.name}: ${cat.skills}\n`;
          });
          break;
      }
      
      text += '\n';
    });
    
    return text.trim();
  }

  // Helper methods...
  isContactInfo(line) {
    return line.includes('@') || 
           line.match(/\d{3}.*\d{4}/) ||
           line.includes('linkedin') ||
           line.includes('github') ||
           line.match(/https?:\/\//);
  }

  findSectionStart(lines) {
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      if (this.isSectionHeader(lines[i], lines[i-1], lines[i+1])) {
        return i;
      }
    }
    return 5; // Default
  }

  isListSection(content) {
    const lines = content.split('\n');
    const bulletCount = lines.filter(l => l.trim().startsWith('•') || l.trim().startsWith('-')).length;
    return bulletCount > lines.length * 0.5;
  }

  isExperienceSection(content) {
    return content.match(/\d{4}/) && (content.includes('present') || content.includes('current'));
  }

  isEducationSection(content) {
    return content.match(/(university|college|school|degree|bachelor|master|phd)/i);
  }

  isSkillsSection(content) {
    return content.includes(':') && content.split(':').length > 2;
  }

  parseListItems(lines) {
    return lines
      .filter(line => line.trim())
      .map(line => line.replace(/^[•\-*]\s*/, '').trim());
  }

  parseExperienceItems(lines) {
    const items = [];
    let currentItem = null;
    
    lines.forEach(line => {
      if (!line.trim()) return;
      
      // New item (has dates or looks like title)
      if (line.match(/\d{4}/) || (!currentItem && !line.startsWith('•'))) {
        if (currentItem) items.push(currentItem);
        currentItem = {
          title: line,
          description: []
        };
      } else if (currentItem) {
        if (line.startsWith('•')) {
          currentItem.description.push(line.replace(/^[•\-*]\s*/, '').trim());
        } else if (!currentItem.organization) {
          currentItem.organization = line;
        } else if (!currentItem.dateRange && line.match(/\d{4}/)) {
          currentItem.dateRange = line;
        }
      }
    });
    
    if (currentItem) items.push(currentItem);
    return items;
  }

  parseEducationItems(lines) {
    return this.parseExperienceItems(lines).map(item => ({
      degree: item.title,
      institution: item.organization,
      date: item.dateRange,
      details: item.description
    }));
  }

  parseSkillCategories(lines) {
    const categories = [];
    
    lines.forEach(line => {
      if (!line.trim()) return;
      
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        categories.push({
          name: line.substring(0, colonIndex).trim(),
          skills: line.substring(colonIndex + 1).trim()
        });
      }
    });
    
    return categories;
  }


  /**
   * Get resume data for a user
   */
  async getResumeData(userId) {
    const { data, error } = await supabase
      .from('resume_data')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw new AppError('Failed to fetch resume data', 500);
    }
    
    return data;
  }

  /**
   * Add a new section
   */
  async addSection(userId, sectionKey, sectionTitle, sectionType) {
    const { data: resumeData } = await supabase
      .from('resume_data')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (!resumeData) throw new AppError('Resume not found', 404);
    
    // Add new section
    const newSection = {
      title: sectionTitle,
      type: sectionType,
      ...(sectionType === 'list' ? { items: [] } : {}),
      ...(sectionType === 'experience' ? { items: [] } : {}),
      ...(sectionType === 'skills' ? { categories: [] } : {}),
      ...(sectionType === 'paragraph' ? { content: '' } : {})
    };
    
    const updatedSections = {
      ...resumeData.sections,
      [sectionKey]: newSection
    };
    
    // Update schema
    const updatedSchema = this.generateDynamicSchema(updatedSections);
    
    // Update in database
    await supabase
      .from('resume_data')
      .update({
        sections: updatedSections,
        schema: updatedSchema
      })
      .eq('id', resumeData.id);
    
    // Generate new PDF
    const pdfUrl = await this.generateAndUploadPdf(userId, updatedSections);
    
    await supabase
      .from('resume_data')
      .update({ pdf_url: pdfUrl })
      .eq('id', resumeData.id);
    
    return { pdfUrl, schema: updatedSchema, sections: updatedSections };
  }

  /**
   * Remove a section
   */
  async removeSection(userId, sectionId) {
    const { data: resumeData } = await supabase
      .from('resume_data')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (!resumeData) throw new AppError('Resume not found', 404);
    
    const updatedSections = { ...resumeData.sections };
    delete updatedSections[sectionId];
    
    // Update in database
    await supabase
      .from('resume_data')
      .update({
        sections: updatedSections,
        resume_text: this.sectionsToText(updatedSections)
      })
      .eq('id', resumeData.id);
    
    // Generate new PDF
    const pdfUrl = await this.generateAndUploadPdf(userId, updatedSections);
    
    await supabase
      .from('resume_data')
      .update({ pdf_url: pdfUrl })
      .eq('id', resumeData.id);
    
    return { pdfUrl };
  }

  /**
   * Reorder sections
   */
  async reorderSections(userId, sectionOrder) {
    const { data: resumeData } = await supabase
      .from('resume_data')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (!resumeData) throw new AppError('Resume not found', 404);
    
    // Reorder sections based on new order
    const reorderedSections = {};
    
    // Always put personalInfo first
    if (resumeData.sections.personalInfo) {
      reorderedSections.personalInfo = resumeData.sections.personalInfo;
    }
    
    // Then add in specified order
    sectionOrder.forEach(key => {
      if (key !== 'personalInfo' && resumeData.sections[key]) {
        reorderedSections[key] = resumeData.sections[key];
      }
    });
    
    // Update in database
    await supabase
      .from('resume_data')
      .update({
        sections: reorderedSections,
        resume_text: this.sectionsToText(reorderedSections)
      })
      .eq('id', resumeData.id);
    
    // Generate new PDF
    const pdfUrl = await this.generateAndUploadPdf(userId, reorderedSections);
    
    await supabase
      .from('resume_data')
      .update({ pdf_url: pdfUrl })
      .eq('id', resumeData.id);
    
    return { pdfUrl, sections: reorderedSections };
  }
}

module.exports = new ResumeEditorSupabaseService();