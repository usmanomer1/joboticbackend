/**
 * PDF Parser Service
 * Extracts text and structure from PDF files using pdf-parse
 */

const pdfParse = require('pdf-parse');
const fs = require('fs-extra');
const path = require('path');

class PDFParserService {
  /**
   * Extract text from PDF buffer
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @returns {Promise<Object>} - Extracted text and metadata
   */
  async extractTextFromPDF(pdfBuffer) {
    try {
      const data = await pdfParse(pdfBuffer);
      
      return {
        text: data.text,
        numPages: data.numpages,
        info: data.info,
        metadata: data.metadata
      };
    } catch (error) {
      console.error('PDF parsing error:', error);
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }

  /**
   * Extract text from PDF file path
   * @param {string} pdfPath - Path to PDF file
   * @returns {Promise<string>} - Extracted text
   */
  async extractTextFromFile(pdfPath) {
    try {
      const pdfBuffer = await fs.readFile(pdfPath);
      const result = await this.extractTextFromPDF(pdfBuffer);
      return result.text;
    } catch (error) {
      console.error('PDF file reading error:', error);
      throw new Error(`Failed to read PDF file: ${error.message}`);
    }
  }

  /**
   * Parse resume structure from text
   * @param {string} text - Resume text
   * @returns {Object} - Parsed resume structure
   */
  parseResumeText(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    
    const resume = {
      personalInfo: {},
      sections: [],
      experience: [],
      education: [],
      skills: []
    };

    // Section headers to look for
    const sectionPatterns = {
      experience: /^(EXPERIENCE|WORK EXPERIENCE|EMPLOYMENT|PROFESSIONAL EXPERIENCE|CAREER HISTORY)/i,
      education: /^(EDUCATION|ACADEMIC|QUALIFICATIONS|ACADEMIC BACKGROUND)/i,
      skills: /^(SKILLS|TECHNICAL SKILLS|CORE COMPETENCIES|EXPERTISE|TECHNOLOGIES)/i,
      projects: /^(PROJECTS|PORTFOLIO|PERSONAL PROJECTS)/i,
      summary: /^(SUMMARY|PROFILE|OBJECTIVE|PROFESSIONAL SUMMARY|CAREER OBJECTIVE)/i,
      certifications: /^(CERTIFICATIONS|CERTIFICATES|LICENSES|CREDENTIALS)/i,
      achievements: /^(ACHIEVEMENTS|ACCOMPLISHMENTS|AWARDS|HONORS)/i
    };

    let currentSection = null;
    let currentSectionItems = [];
    let lineIndex = 0;

    // Try to extract name from first few lines
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      // Name is usually at the top, may be in caps, and typically 2-4 words
      if (line.length < 50 && line.split(' ').length >= 2 && line.split(' ').length <= 4) {
        if (/^[A-Z][a-zA-Z\s\-']+$/.test(line) || line === line.toUpperCase()) {
          resume.personalInfo.name = line;
          lineIndex = i + 1;
          break;
        }
      }
    }

    // Look for contact info in next few lines after name
    for (let i = lineIndex; i < Math.min(lineIndex + 5, lines.length); i++) {
      const line = lines[i];
      
      // Email
      const emailMatch = line.match(/[\w\.-]+@[\w\.-]+\.\w+/);
      if (emailMatch && !resume.personalInfo.email) {
        resume.personalInfo.email = emailMatch[0];
      }
      
      // Phone
      const phoneMatch = line.match(/\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/);
      if (phoneMatch && !resume.personalInfo.phone) {
        resume.personalInfo.phone = phoneMatch[0];
      }
      
      // LinkedIn
      if (line.toLowerCase().includes('linkedin') && !resume.personalInfo.linkedin) {
        resume.personalInfo.linkedin = line;
      }
    }

    // Parse sections
    for (let i = lineIndex; i < lines.length; i++) {
      const line = lines[i];
      let sectionFound = false;

      // Check if this line is a section header
      for (const [sectionType, pattern] of Object.entries(sectionPatterns)) {
        if (pattern.test(line) && line.length < 50) {
          // Save previous section
          if (currentSection) {
            resume.sections.push({
              type: currentSection,
              title: lines[currentSection === 'experience' ? i - currentSectionItems.length - 1 : i - currentSectionItems.length],
              items: this.processSectionItems(currentSection, currentSectionItems)
            });
          }

          currentSection = sectionType;
          currentSectionItems = [];
          sectionFound = true;
          break;
        }
      }

      if (!sectionFound && currentSection) {
        currentSectionItems.push(line);
      }
    }

    // Save last section
    if (currentSection && currentSectionItems.length > 0) {
      resume.sections.push({
        type: currentSection,
        title: currentSection.toUpperCase(),
        items: this.processSectionItems(currentSection, currentSectionItems)
      });
    }

    // Extract structured data for specific sections
    resume.sections.forEach(section => {
      if (section.type === 'experience') {
        resume.experience = this.parseExperienceItems(section.items);
      } else if (section.type === 'education') {
        resume.education = this.parseEducationItems(section.items);
      } else if (section.type === 'skills') {
        resume.skills = this.parseSkillsItems(section.items);
      }
    });

    return resume;
  }

  /**
   * Process section items based on section type
   */
  processSectionItems(sectionType, items) {
    const processedItems = [];
    
    if (sectionType === 'experience' || sectionType === 'projects') {
      // Group items into job/project blocks
      let currentBlock = null;
      
      items.forEach(item => {
        // Check if it's a job title or company (usually contains dates or is in title case)
        if (item.match(/\d{4}/) || (item.split(' ').length <= 8 && /^[A-Z]/.test(item))) {
          if (currentBlock && currentBlock.bullets.length > 0) {
            processedItems.push(currentBlock);
          }
          currentBlock = {
            type: 'position',
            header: item,
            bullets: []
          };
        } else if (currentBlock && (item.startsWith('•') || item.startsWith('-') || item.startsWith('*'))) {
          currentBlock.bullets.push({
            type: 'bullet',
            text: item.replace(/^[•\-*]\s*/, '')
          });
        } else if (currentBlock) {
          currentBlock.bullets.push({
            type: 'text',
            text: item
          });
        }
      });
      
      if (currentBlock) {
        processedItems.push(currentBlock);
      }
    } else {
      // For other sections, just process as text items
      items.forEach(item => {
        processedItems.push({
          type: 'text',
          text: item
        });
      });
    }
    
    return processedItems;
  }

  /**
   * Parse experience items into structured format
   */
  parseExperienceItems(items) {
    const experiences = [];
    
    items.forEach(item => {
      if (item.type === 'position') {
        const exp = {
          title: '',
          company: '',
          duration: '',
          bullets: item.bullets.map(b => b.text)
        };
        
        // Try to extract title, company, and dates from header
        const headerParts = item.header.split(/[|,–-]/);
        if (headerParts.length >= 2) {
          exp.title = headerParts[0].trim();
          exp.company = headerParts[1].trim();
          
          // Look for dates
          const dateMatch = item.header.match(/\b(\d{4})\b.*\b(\d{4}|Present)\b/i);
          if (dateMatch) {
            exp.duration = dateMatch[0];
          }
        } else {
          exp.title = item.header;
        }
        
        experiences.push(exp);
      }
    });
    
    return experiences;
  }

  /**
   * Parse education items
   */
  parseEducationItems(items) {
    const education = [];
    
    items.forEach(item => {
      if (item.type === 'text') {
        // Look for degree patterns
        if (item.text.match(/bachelor|master|phd|degree|diploma/i)) {
          education.push({
            degree: item.text,
            school: '',
            year: ''
          });
        }
      }
    });
    
    return education;
  }

  /**
   * Parse skills items
   */
  parseSkillsItems(items) {
    const skills = [];
    
    items.forEach(item => {
      if (item.type === 'text') {
        // Split by common delimiters
        const skillList = item.text.split(/[,;|•]/);
        skillList.forEach(skill => {
          const trimmed = skill.trim();
          if (trimmed && trimmed.length > 1) {
            skills.push(trimmed);
          }
        });
      }
    });
    
    return skills;
  }
}

module.exports = new PDFParserService();