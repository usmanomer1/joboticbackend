/**
 * Resume Editor Service with Supabase Integration
 * Dynamically parses resume sections and persists to Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const { AppError } = require('../middleware/errorHandler');
const pdfGenerator = require('./pdfGenerator');
const supabaseConfig = require('../../config/supabase.config');

// Initialize Supabase client
console.log('Initializing Supabase with config:', {
  url: supabaseConfig.url,
  keyLength: supabaseConfig.anonKey?.length,
  keyPreview: supabaseConfig.anonKey?.substring(0, 20) + '...'
});

const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

class ResumeEditorSupabaseService {
  /**
   * Parse resume and initialize/update Supabase data
   */
  async parseAndInitialize(userId, resumeText, jobId) {
    // Dynamically parse resume into sections
    const parsedData = this.intelligentParse(resumeText);
    
    // Generate frontend-friendly edit schema
    const editSchema = this.generateEditSchema(parsedData.sections);
    
    // Check if user already has resume data
    const { data: existingResume, error: fetchError } = await supabase
      .from('resume_data')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching existing resume:', fetchError);
    }
    
    let resumeData;
    
    if (existingResume) {
      // Update existing resume
      const { data, error } = await supabase
        .from('resume_data')
        .update({
          sections: parsedData.sections,
          schema: editSchema,
          resume_text: resumeText,
          last_edited_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();
        
      if (error) {
        console.error('Supabase update error:', error);
        throw new AppError(`Failed to update resume data: ${error.message}`, 500);
      }
      resumeData = data;
    } else {
      // Get profile ID (optional - may not exist for all users)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .single();
      
      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Profile lookup error:', profileError);
      }
      
      // Create new resume data
      const insertData = {
        user_id: userId,
        sections: parsedData.sections,
        schema: editSchema,
        resume_text: resumeText
      };
      
      // Only add profile_id if it exists
      if (profile?.id) {
        insertData.profile_id = profile.id;
      }
      
      console.log('Attempting to insert resume data for user:', userId);
      
      const { data, error } = await supabase
        .from('resume_data')
        .insert(insertData)
        .select()
        .single();
        
      if (error) {
        console.error('Supabase insert error:', error);
        throw new AppError(`Failed to create resume data: ${error.message}`, 500);
      }
      resumeData = data;
    }
    
    // Generate PDF and upload to Supabase
    const pdfUrl = await this.generateAndUploadPdf(userId, resumeData.sections);
    
    // Update with PDF URL
    await supabase
      .from('resume_data')
      .update({ pdf_url: pdfUrl })
      .eq('id', resumeData.id);
    
    // Get match data if jobId provided
    let matchData = null;
    if (jobId) {
      matchData = await this.calculateMatchData(parsedData.sections, jobId);
    }
    
    return {
      sessionId: resumeData.id,
      pdfUrl: pdfUrl,
      editSchema: editSchema,
      matchData: matchData
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
   * Generate frontend-friendly edit schema
   */
  generateEditSchema(sections) {
    const schemaSections = [];
    
    // Personal Information Section
    if (sections.personalInfo) {
      const personal = sections.personalInfo;
      schemaSections.push({
        id: 'personal',
        title: 'Personal Information',
        type: 'single',
        fields: [
          { name: 'fullName', type: 'text', value: personal.name || '', label: 'Full Name' },
          { name: 'title', type: 'text', value: personal.title || '', label: 'Professional Title' },
          { name: 'email', type: 'email', value: personal.email || '', label: 'Email' },
          { name: 'phone', type: 'tel', value: personal.phone || '', label: 'Phone' },
          { name: 'location', type: 'text', value: personal.location || '', label: 'Location' },
          { name: 'linkedin', type: 'url', value: personal.linkedin || '', label: 'LinkedIn' },
          { name: 'github', type: 'url', value: personal.github || '', label: 'GitHub' },
          { name: 'website', type: 'url', value: personal.website || '', label: 'Website' }
        ]
      });
    }
    
    // Process other sections dynamically
    Object.entries(sections).forEach(([key, section]) => {
      if (key === 'personalInfo') return;
      
      if (section.type === 'skills') {
        // Skills section with grouped categories
        const groups = section.categories.map(cat => ({
          name: cat.name.toLowerCase().replace(/\s+/g, '_'),
          label: cat.name,
          values: cat.skills.split(',').map(s => s.trim()).filter(Boolean),
          type: 'tags'
        }));
        
        schemaSections.push({
          id: key,
          title: section.title,
          type: 'grouped',
          groups: groups
        });
      } else if (section.type === 'experience') {
        // Experience section with multiple entries
        const entries = section.items.map((item, index) => ({
          id: `${key}-${index}`,
          fields: [
            { name: 'company', type: 'text', value: item.organization || '', label: 'Company' },
            { name: 'position', type: 'text', value: item.title || '', label: 'Position' },
            { name: 'duration', type: 'text', value: item.dateRange || '', label: 'Duration' },
            { name: 'location', type: 'text', value: item.location || '', label: 'Location' },
            { name: 'bullets', type: 'bullets', value: item.description || [], label: 'Responsibilities' }
          ]
        }));
        
        schemaSections.push({
          id: key,
          title: section.title,
          type: 'multiple',
          entries: entries
        });
      } else if (section.type === 'education') {
        // Education section with multiple entries
        const entries = section.items.map((item, index) => ({
          id: `${key}-${index}`,
          fields: [
            { name: 'degree', type: 'text', value: item.degree || '', label: 'Degree' },
            { name: 'institution', type: 'text', value: item.institution || '', label: 'Institution' },
            { name: 'duration', type: 'text', value: item.date || '', label: 'Graduation Date' },
            { name: 'location', type: 'text', value: item.location || '', label: 'Location' },
            { name: 'bullets', type: 'bullets', value: item.details || [], label: 'Details' }
          ]
        }));
        
        schemaSections.push({
          id: key,
          title: section.title,
          type: 'multiple',
          entries: entries
        });
      } else if (section.type === 'list') {
        // List sections (like certifications, awards)
        schemaSections.push({
          id: key,
          title: section.title,
          type: 'list',
          items: section.items || []
        });
      } else {
        // Paragraph sections (like summary, objective)
        schemaSections.push({
          id: key,
          title: section.title,
          type: 'paragraph',
          value: section.content || ''
        });
      }
    });
    
    return {
      sections: schemaSections
    };
  }

  /**
   * Update a section using sessionId (which is the resume ID)
   */
  async updateSection(sessionId, sectionId, data, jobId = null) {
    // Get current resume data using sessionId
    const { data: resumeData, error: fetchError } = await supabase
      .from('resume_data')
      .select('*')
      .eq('id', sessionId)
      .single();
    
    if (!resumeData) throw new AppError('Session not found', 404);
    
    // Update the specific section based on its type
    const updatedSections = { ...resumeData.sections };
    const section = updatedSections[sectionId];
    
    if (!section && sectionId !== 'personal') throw new AppError('Section not found', 404);
    
    // Handle different section types
    if (sectionId === 'personal') {
      // Update personal info fields
      updatedSections.personalInfo = {
        ...updatedSections.personalInfo,
        name: data.fullName || updatedSections.personalInfo.name,
        title: data.title || updatedSections.personalInfo.title,
        email: data.email || updatedSections.personalInfo.email,
        phone: data.phone || updatedSections.personalInfo.phone,
        location: data.location || updatedSections.personalInfo.location,
        linkedin: data.linkedin || updatedSections.personalInfo.linkedin,
        github: data.github || updatedSections.personalInfo.github,
        website: data.website || updatedSections.personalInfo.website
      };
    } else if (section.type === 'skills') {
      // Update skills with new grouped format
      const categories = [];
      Object.entries(data).forEach(([categoryKey, skills]) => {
        const categoryName = categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
        if (skills && skills.length > 0) {
          categories.push({
            name: categoryName,
            skills: skills.join(', ')
          });
        }
      });
      updatedSections[sectionId] = {
        ...section,
        categories: categories
      };
    } else if (section.type === 'experience' || section.type === 'education') {
      // Update experience/education entries
      updatedSections[sectionId] = {
        ...section,
        items: data.entries || section.items
      };
    } else if (section.type === 'list') {
      // Update list items
      updatedSections[sectionId] = {
        ...section,
        items: data.items || section.items
      };
    } else {
      // Update paragraph content
      updatedSections[sectionId] = {
        ...section,
        content: data.value || section.content
      };
    }
    
    // Update in database with timestamp
    const { error: updateError } = await supabase
      .from('resume_data')
      .update({
        sections: updatedSections,
        schema: this.generateEditSchema(updatedSections),
        resume_text: this.sectionsToText(updatedSections),
        last_edited_at: new Date().toISOString()
      })
      .eq('id', sessionId);
    
    if (updateError) throw new AppError('Failed to update section', 500);
    
    // Generate new PDF and upload
    const pdfUrl = await this.generateAndUploadPdf(resumeData.user_id, updatedSections);
    
    // Update PDF URL
    await supabase
      .from('resume_data')
      .update({ pdf_url: pdfUrl })
      .eq('id', sessionId);
    
    // Also update the profile table's resume_text
    await supabase
      .from('profiles')
      .update({ 
        resume_text: this.sectionsToText(updatedSections),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', resumeData.user_id);
    
    // Calculate new match score if jobId provided
    let newScore = null;
    if (jobId) {
      const matchData = await this.calculateMatchData(updatedSections, jobId);
      newScore = matchData ? matchData.currentScore : null;
    }
    
    return { 
      newPdfUrl: pdfUrl,
      status: 'success',
      newScore: newScore
    };
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
        const categoryName = line.substring(0, colonIndex).trim();
        const skillsText = line.substring(colonIndex + 1).trim();
        
        // Detect common skill categories
        let normalizedName = categoryName;
        if (categoryName.toLowerCase().includes('language') || categoryName.toLowerCase().includes('programming')) {
          normalizedName = 'Languages';
        } else if (categoryName.toLowerCase().includes('framework') || categoryName.toLowerCase().includes('library')) {
          normalizedName = 'Frameworks';
        } else if (categoryName.toLowerCase().includes('tool') || categoryName.toLowerCase().includes('software')) {
          normalizedName = 'Tools';
        } else if (categoryName.toLowerCase().includes('database') || categoryName.toLowerCase().includes('data')) {
          normalizedName = 'Databases';
        } else if (categoryName.toLowerCase().includes('cloud') || categoryName.toLowerCase().includes('platform')) {
          normalizedName = 'Cloud/Platforms';
        }
        
        categories.push({
          name: normalizedName,
          skills: skillsText
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

  /**
   * Calculate match data for job comparison
   */
  async calculateMatchData(sections, jobId) {
    try {
      // Get job details from database or external API
      // For now, returning mock data - integrate with your job matching service
      const skills = this.extractAllSkills(sections);
      
      return {
        currentScore: 7.5,
        urgent: 2,
        critical: 1,
        optional: 3,
        missingSkills: ['Docker', 'Kubernetes', 'AWS'],
        matchedSkills: skills.slice(0, 5),
        recommendations: [
          'Add more cloud experience',
          'Include DevOps projects'
        ]
      };
    } catch (error) {
      console.error('Error calculating match data:', error);
      return null;
    }
  }

  /**
   * Extract all skills from resume sections
   */
  extractAllSkills(sections) {
    const skills = [];
    
    Object.values(sections).forEach(section => {
      if (section.type === 'skills' && section.categories) {
        section.categories.forEach(cat => {
          const categorySkills = cat.skills.split(',').map(s => s.trim()).filter(Boolean);
          skills.push(...categorySkills);
        });
      }
    });
    
    return skills;
  }

  /**
   * Generate and upload PDF to Supabase
   */
  async generateAndUploadPdf(userId, sections) {
    try {
      // Use the PDF generator service
      const pdfUrl = await pdfGenerator.generatePDF({ sections }, userId);
      return pdfUrl;
    } catch (error) {
      console.error('Error generating PDF:', error);
      throw new AppError('Failed to generate PDF', 500);
    }
  }

  /**
   * Convert sections back to text format
   */
  sectionsToText(sections) {
    let text = '';
    
    // Personal info first
    if (sections.personalInfo) {
      const info = sections.personalInfo;
      if (info.name) text += `${info.name}\n`;
      if (info.title) text += `${info.title}\n`;
      if (info.email) text += `${info.email}\n`;
      if (info.phone) text += `${info.phone}\n`;
      if (info.location) text += `${info.location}\n`;
      if (info.linkedin) text += `${info.linkedin}\n`;
      if (info.github) text += `${info.github}\n`;
      text += '\n';
    }
    
    // Other sections
    Object.entries(sections).forEach(([key, section]) => {
      if (key === 'personalInfo') return;
      
      text += `${section.title}\n`;
      text += '='.repeat(section.title.length) + '\n';
      
      if (section.type === 'paragraph') {
        text += `${section.content}\n`;
      } else if (section.type === 'list') {
        section.items.forEach(item => {
          text += `• ${item}\n`;
        });
      } else if (section.type === 'experience' || section.type === 'education') {
        section.items.forEach(item => {
          if (item.title || item.degree) text += `${item.title || item.degree}\n`;
          if (item.organization || item.institution) text += `${item.organization || item.institution}\n`;
          if (item.dateRange || item.date) text += `${item.dateRange || item.date}\n`;
          if (item.location) text += `${item.location}\n`;
          if (item.description || item.details) {
            (item.description || item.details).forEach(desc => {
              text += `• ${desc}\n`;
            });
          }
          text += '\n';
        });
      } else if (section.type === 'skills') {
        section.categories.forEach(cat => {
          text += `${cat.name}: ${cat.skills}\n`;
        });
      }
      
      text += '\n';
    });
    
    return text.trim();
  }

  /**
   * Cleanup old sessions (resumes not edited in the last hour)
   * This should be run periodically (e.g., every hour via cron job or scheduled function)
   */
  async cleanupOldSessions() {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      // Delete old resume data that hasn't been edited in the last hour
      // Only delete if user doesn't have a profile (temporary sessions)
      const { data: deletedRecords, error } = await supabase
        .from('resume_data')
        .delete()
        .lt('last_edited_at', oneHourAgo)
        .is('profile_id', null)
        .select('id, pdf_url, docx_url');
      
      if (error) {
        console.error('Error cleaning up old sessions:', error);
        return;
      }
      
      // Clean up associated files from storage
      if (deletedRecords && deletedRecords.length > 0) {
        console.log(`Cleaning up ${deletedRecords.length} old sessions`);
        
        for (const record of deletedRecords) {
          // Extract file paths from URLs and delete from storage
          if (record.pdf_url) {
            const pdfPath = this.extractStoragePath(record.pdf_url);
            if (pdfPath) {
              await supabase.storage.from('resumes').remove([pdfPath]);
            }
          }
          if (record.docx_url) {
            const docxPath = this.extractStoragePath(record.docx_url);
            if (docxPath) {
              await supabase.storage.from('resumes').remove([docxPath]);
            }
          }
        }
      }
      
      return deletedRecords?.length || 0;
    } catch (error) {
      console.error('Session cleanup error:', error);
      return 0;
    }
  }

  /**
   * Extract storage path from Supabase URL
   */
  extractStoragePath(url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      const bucketIndex = pathParts.findIndex(p => p === 'resumes');
      if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
        return pathParts.slice(bucketIndex + 1).join('/');
      }
      return null;
    } catch (error) {
      return null;
    }
  }
}

// Create instance
const resumeEditorService = new ResumeEditorSupabaseService();

// Set up cleanup job to run every hour
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    resumeEditorService.cleanupOldSessions()
      .then(count => {
        if (count > 0) {
          console.log(`Cleaned up ${count} old resume sessions`);
        }
      })
      .catch(err => console.error('Cleanup job error:', err));
  }, 60 * 60 * 1000); // Run every hour
}

module.exports = resumeEditorService;