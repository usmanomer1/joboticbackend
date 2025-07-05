/**
 * Jake's LaTeX Resume Format - Professional PDF Generator
 * Replicates the exact format from Jake's LaTeX template
 */

const PDFDocument = require('pdfkit');
const { AppError } = require('../middleware/errorHandler');

class ATSOptimizedPDFGenerator {
  constructor() {
    // Match LaTeX settings exactly
    this.config = {
      // Page setup - Letter size with specific margins
      page: {
        size: 'LETTER',
        margins: {
          top: 36,      // 0.5in
          bottom: 36,   // 0.5in  
          left: 36,     // 0.5in
          right: 36     // 0.5in
        }
      },
      // Font sizes (in points)
      fontSize: {
        name: 26,           // \Huge in LaTeX
        contact: 9,         // \small
        sectionHeader: 11,  // \large
        jobTitle: 10,       // normal bold
        jobDetails: 9,      // \small italic
        bulletText: 9,      // \small
        skillsText: 9       // \small
      },
      // Colors
      colors: {
        black: '#000000',
        link: '#0000FF'
      },
      // Spacing (in points)
      spacing: {
        afterName: 1,
        afterContact: 12,
        beforeSection: 8,
        afterSection: 4,
        afterSectionLine: 4,
        beforeSubheading: 0,
        afterSubheading: 6,
        betweenBullets: 2,
        afterBulletList: 4
      }
    };
  }

  async generatePDF(resumeData, metadata = {}) {
    if (!resumeData || !resumeData.text) {
      throw new AppError('Invalid resume data', 400);
    }

    console.log('Generating Jake-format PDF');

    try {
      const doc = new PDFDocument({
        size: this.config.page.size,
        margins: this.config.page.margins,
        compress: false, // Better for ATS
        info: {
          Title: 'Resume',
          Creator: 'Jobotic AI'
        }
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));

      // Parse and render
      const resume = this.parseResume(resumeData.text);
      this.renderResume(doc, resume);

      doc.end();

      return new Promise((resolve, reject) => {
        doc.on('end', () => {
          resolve(Buffer.concat(buffers));
        });
        doc.on('error', reject);
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      throw new AppError('Failed to generate PDF', 500);
    }
  }

  parseResume(text) {
    const lines = text.split('\n');
    const resume = {
      header: { name: '', phone: '', email: '', linkedin: '', github: '' },
      sections: []
    };

    let currentSection = null;
    let currentSubsection = null;
    let lineIndex = 0;

    // Parse header (first few lines)
    while (lineIndex < lines.length && lineIndex < 5) {
      const line = lines[lineIndex].trim();
      
      if (!resume.header.name && line && !line.includes('|') && !line.includes('@')) {
        resume.header.name = line;
      } else if (line.includes('|') || line.includes('@')) {
        // Parse contact line
        const parts = line.split(/[|]/).map(p => p.trim());
        parts.forEach(part => {
          if (part.includes('@')) resume.header.email = part;
          else if (part.match(/\d{3}.*\d{4}/)) resume.header.phone = part;
          else if (part.toLowerCase().includes('linkedin')) resume.header.linkedin = part;
          else if (part.toLowerCase().includes('github')) resume.header.github = part;
        });
      }
      lineIndex++;
    }

    // Parse sections
    while (lineIndex < lines.length) {
      const line = lines[lineIndex].trim();
      
      if (this.isSectionHeader(line)) {
        if (currentSection) resume.sections.push(currentSection);
        currentSection = {
          title: line.toUpperCase(),
          type: this.getSectionType(line),
          items: []
        };
        currentSubsection = null;
      } 
      else if (currentSection && line) {
        if (currentSection.type === 'experience' || currentSection.type === 'education' || currentSection.type === 'projects') {
          // Check for subsection header
          if (this.isSubsectionHeader(line, lines[lineIndex + 1])) {
            if (currentSubsection && currentSubsection.bullets.length > 0) {
              currentSection.items.push(currentSubsection);
            }
            
            // Parse the subsection header
            const { title, date, organization, location } = this.parseSubsectionHeader(line, lines[lineIndex + 1], lines[lineIndex + 2]);
            currentSubsection = {
              title,
              date,
              organization,
              location,
              bullets: []
            };
            
            // Skip lines we've consumed
            if (date && lines[lineIndex + 1]?.includes(date)) lineIndex++;
            if (location && lines[lineIndex + 1]?.includes(location)) lineIndex++;
          }
          // Check for bullet point
          else if (this.isBullet(line)) {
            if (currentSubsection) {
              currentSubsection.bullets.push(this.cleanBullet(line));
            }
          }
        }
        else if (currentSection.type === 'skills') {
          // Skills section - parse categories
          if (line.includes(':')) {
            const [category, skills] = line.split(':').map(s => s.trim());
            currentSection.items.push({ category, skills });
          }
        }
      }
      
      lineIndex++;
    }

    // Add last items
    if (currentSubsection && currentSubsection.bullets.length > 0) {
      currentSection.items.push(currentSubsection);
    }
    if (currentSection) {
      resume.sections.push(currentSection);
    }

    return resume;
  }

  renderResume(doc, resume) {
    // Header
    this.renderHeader(doc, resume.header);
    
    // Sections
    resume.sections.forEach(section => {
      this.renderSection(doc, section);
    });
  }

  renderHeader(doc, header) {
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    
    // Name - centered, large
    doc.font('Helvetica-Bold')
       .fontSize(this.config.fontSize.name)
       .text(header.name.toUpperCase(), {
         align: 'center',
         width: pageWidth
       });
    
    doc.moveDown(0.1); // Small space after name
    
    // Contact info - centered, small, with | separators
    const contactParts = [];
    if (header.phone) contactParts.push(header.phone);
    if (header.email) contactParts.push(header.email);
    if (header.linkedin) contactParts.push(header.linkedin);
    if (header.github) contactParts.push(header.github);
    
    if (contactParts.length > 0) {
      doc.font('Helvetica')
         .fontSize(this.config.fontSize.contact)
         .text(contactParts.join(' | '), {
           align: 'center',
           width: pageWidth
         });
    }
    
    doc.moveDown(1.2);
  }

  renderSection(doc, section) {
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    
    // Section header
    doc.font('Helvetica-Bold')
       .fontSize(this.config.fontSize.sectionHeader)
       .text(section.title, {
         width: pageWidth
       });
    
    // Underline
    const lineY = doc.y + 2;
    doc.moveTo(doc.x, lineY)
       .lineTo(doc.x + pageWidth, lineY)
       .lineWidth(0.5)
       .stroke();
    
    doc.moveDown(0.5);
    
    // Section content
    if (section.type === 'experience' || section.type === 'education' || section.type === 'projects') {
      section.items.forEach((item, index) => {
        this.renderSubsection(doc, item, section.type);
        if (index < section.items.length - 1) {
          doc.moveDown(0.3);
        }
      });
    } else if (section.type === 'skills') {
      this.renderSkills(doc, section.items);
    }
    
    doc.moveDown(0.8);
  }

  renderSubsection(doc, item, type) {
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftColumnWidth = pageWidth * 0.75;
    const rightColumnWidth = pageWidth * 0.25;
    
    // Save Y position for right column
    const startY = doc.y;
    
    // Left column - Title/Organization
    doc.font('Helvetica-Bold')
       .fontSize(this.config.fontSize.jobTitle);
    
    if (type === 'projects') {
      // Projects: Title | Technologies
      doc.text(item.title, doc.x, startY, {
        width: leftColumnWidth,
        lineBreak: false
      });
    } else {
      // Experience/Education: Title
      doc.text(item.title || '', doc.x, startY, {
        width: leftColumnWidth,
        lineBreak: false
      });
    }
    
    // Right column - Date
    if (item.date) {
      doc.font('Helvetica')
         .fontSize(this.config.fontSize.jobTitle)
         .text(item.date, doc.x + leftColumnWidth, startY, {
           width: rightColumnWidth,
           align: 'right',
           lineBreak: false
         });
    }
    
    doc.x = doc.page.margins.left; // Reset X
    doc.y = startY + doc.currentLineHeight(); // Move to next line
    
    // Second line - Organization/Location (italic, small)
    if (item.organization || item.location) {
      const secondLineY = doc.y;
      
      doc.font('Helvetica-Oblique')
         .fontSize(this.config.fontSize.jobDetails);
      
      if (item.organization) {
        doc.text(item.organization, doc.x, secondLineY, {
          width: leftColumnWidth,
          lineBreak: false
        });
      }
      
      if (item.location) {
        doc.text(item.location, doc.x + leftColumnWidth, secondLineY, {
          width: rightColumnWidth,
          align: 'right',
          lineBreak: false
        });
      }
      
      doc.x = doc.page.margins.left;
      doc.y = secondLineY + doc.currentLineHeight();
    }
    
    doc.moveDown(0.3);
    
    // Bullets
    const bulletIndent = 15;
    const bulletTextIndent = 25;
    
    item.bullets.forEach((bullet, index) => {
      const bulletY = doc.y;
      
      // Bullet point
      doc.font('Helvetica')
         .fontSize(this.config.fontSize.bulletText)
         .text('•', doc.x + bulletIndent, bulletY);
      
      // Bullet text
      doc.text(bullet, doc.x + bulletTextIndent, bulletY, {
        width: pageWidth - bulletTextIndent,
        align: 'left'
      });
      
      if (index < item.bullets.length - 1) {
        doc.moveDown(0.15);
      }
    });
  }

  renderSkills(doc, skills) {
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    
    skills.forEach((skill, index) => {
      doc.font('Helvetica-Bold')
         .fontSize(this.config.fontSize.skillsText)
         .text(skill.category + ': ', doc.x, doc.y, {
           continued: true,
           width: pageWidth
         });
      
      doc.font('Helvetica')
         .fontSize(this.config.fontSize.skillsText)
         .text(skill.skills);
      
      if (index < skills.length - 1) {
        doc.moveDown(0.1);
      }
    });
  }

  // Helper methods
  isSectionHeader(line) {
    const headers = [
      'EDUCATION', 'EXPERIENCE', 'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE',
      'PROJECTS', 'SKILLS', 'TECHNICAL SKILLS', 'SUMMARY', 'PROFESSIONAL SUMMARY',
      'CERTIFICATIONS', 'ACHIEVEMENTS', 'AWARDS'
    ];
    return headers.includes(line.toUpperCase().trim());
  }

  getSectionType(line) {
    const upper = line.toUpperCase();
    if (upper.includes('EXPERIENCE')) return 'experience';
    if (upper.includes('EDUCATION')) return 'education';
    if (upper.includes('PROJECT')) return 'projects';
    if (upper.includes('SKILL')) return 'skills';
    return 'other';
  }

  isSubsectionHeader(line, nextLine) {
    // Don't treat bullets as headers
    if (this.isBullet(line)) return false;
    
    // Look for patterns indicating job title, school, project
    const hasCompany = /\b(Inc|LLC|Corp|Ltd|Company|University|College|Institute)\b/i.test(line + ' ' + (nextLine || ''));
    const hasDate = /\d{4}|Present|Current/i.test(line + ' ' + (nextLine || ''));
    const hasTitle = /\b(Engineer|Developer|Manager|Analyst|Assistant|Specialist|Bachelor|Master|Associate)\b/i.test(line);
    const hasProject = line.includes('|') && /\b(Python|Java|React|Node|Docker|Git)\b/i.test(line);
    
    return hasCompany || hasDate || hasTitle || hasProject;
  }

  parseSubsectionHeader(line1, line2, line3) {
    let title = '';
    let date = '';
    let organization = '';
    let location = '';
    
    // For projects: "Title | Technologies" on one line
    if (line1.includes('|') && !line1.includes('@')) {
      const parts = line1.split('|').map(p => p.trim());
      title = parts.join(' | ');
      
      // Check for date in line1 or line2
      const dateMatch = (line1 + ' ' + (line2 || '')).match(/([A-Za-z]{3,9}\.?\s+\d{4}\s*[-–]\s*(?:[A-Za-z]{3,9}\.?\s+\d{4}|Present|Current))/);
      if (dateMatch) {
        date = dateMatch[1];
        title = title.replace(date, '').trim();
      }
    }
    // For experience/education: separate lines
    else {
      title = line1;
      
      // Extract date from title if present
      const dateInTitle = title.match(/([A-Za-z]{3,9}\.?\s+\d{4}\s*[-–]\s*(?:[A-Za-z]{3,9}\.?\s+\d{4}|Present|Current))/);
      if (dateInTitle) {
        date = dateInTitle[1];
        title = title.replace(date, '').trim();
      }
      
      // Check line2 for organization/location
      if (line2 && !this.isBullet(line2)) {
        // Check if line2 has location pattern
        const locationMatch = line2.match(/([A-Za-z\s]+,\s*[A-Z]{2})/);
        if (locationMatch) {
          location = locationMatch[1];
          organization = line2.replace(location, '').trim();
        } else {
          organization = line2;
        }
        
        // Check for date in line2
        if (!date) {
          const dateInLine2 = line2.match(/([A-Za-z]{3,9}\.?\s+\d{4}\s*[-–]\s*(?:[A-Za-z]{3,9}\.?\s+\d{4}|Present|Current))/);
          if (dateInLine2) {
            date = dateInLine2[1];
            organization = organization.replace(date, '').trim();
          }
        }
      }
    }
    
    return { title, date, organization, location };
  }

  isBullet(line) {
    return /^[-•*+]\s+/.test(line.trim()) || 
           /^(Developed|Built|Implemented|Created|Designed|Led|Managed|Improved|Collaborated|Achieved|Delivered|Maintained)/i.test(line.trim());
  }

  cleanBullet(text) {
    return text.trim().replace(/^[-•*+]\s*/, '');
  }
}

module.exports = new ATSOptimizedPDFGenerator();