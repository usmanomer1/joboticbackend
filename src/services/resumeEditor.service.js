/**
 * Resume Editor Service
 * Handles real-time resume editing with PDF generation
 */

const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const { AppError } = require('../middleware/errorHandler');

// In-memory session storage (in production, use Redis)
const sessions = new Map();

// Temp file storage
const TEMP_DIR = process.env.VERCEL ? '/tmp' : path.join(process.cwd(), 'temp', 'editor');
const SESSION_TTL = 3600000; // 1 hour
const CLEANUP_INTERVAL = 3600000; // 1 hour

class ResumeEditorService {
  constructor() {
    this.initTempDir();
    this.startCleanupJob();
  }

  async initTempDir() {
    try {
      await fs.mkdir(TEMP_DIR, { recursive: true });
      console.log('Resume editor temp directory ready:', TEMP_DIR);
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  startCleanupJob() {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, CLEANUP_INTERVAL);
    console.log('Resume editor cleanup job scheduled');
  }

  /**
   * Parse resume text and initialize editing session
   */
  async parseAndInitialize(sessionId, resumeText, jobId) {
    // Parse resume into sections
    const sections = this.parseResumeText(resumeText);
    
    // Create editable schema
    const schema = this.createEditableSchema(sections);
    
    // Store session data
    const sessionData = {
      id: sessionId,
      sections,
      schema,
      jobId,
      createdAt: Date.now(),
      lastModified: Date.now()
    };
    
    sessions.set(sessionId, sessionData);
    
    // Generate initial PDF
    await this.generatePreviewPdf(sessionId);
    
    return {
      sections,
      schema
    };
  }

  /**
   * Parse resume text into structured sections
   */
  parseResumeText(text) {
    const lines = text.split('\n').map(line => line.trim());
    const sections = {
      personalInfo: {
        name: '',
        title: '',
        email: '',
        phone: '',
        location: '',
        linkedin: '',
        github: '',
        website: ''
      },
      summary: '',
      skills: [],
      experience: [],
      projects: [],
      education: [],
      certifications: []
    };

    let currentSection = null;
    let currentItem = null;
    let lineIndex = 0;

    // Parse personal info (usually first few lines)
    if (lines[0] && !this.isSectionHeader(lines[0])) {
      sections.personalInfo.name = lines[0];
      lineIndex++;
    }

    // Check for title/role
    if (lines[lineIndex] && !this.isSectionHeader(lines[lineIndex]) && !lines[lineIndex].includes('@')) {
      sections.personalInfo.title = lines[lineIndex];
      lineIndex++;
    }

    // Parse contact line
    if (lines[lineIndex] && (lines[lineIndex].includes('@') || lines[lineIndex].includes('|'))) {
      this.parseContactInfo(lines[lineIndex], sections.personalInfo);
      lineIndex++;
    }

    // Parse remaining sections
    for (let i = lineIndex; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const sectionType = this.detectSectionType(line);
      
      if (sectionType) {
        currentSection = sectionType;
        currentItem = null;
        continue;
      }

      // Parse based on current section
      switch (currentSection) {
        case 'summary':
          sections.summary += (sections.summary ? ' ' : '') + line;
          break;
          
        case 'skills':
          this.parseSkillsLine(line, sections.skills);
          break;
          
        case 'experience':
          this.parseExperienceItem(line, lines[i + 1], sections.experience, i);
          break;
          
        case 'projects':
          this.parseProjectItem(line, lines[i + 1], sections.projects, i);
          break;
          
        case 'education':
          this.parseEducationItem(line, lines[i + 1], sections.education, i);
          break;
          
        case 'certifications':
          sections.certifications.push({ name: line, date: '', issuer: '' });
          break;
      }
    }

    return sections;
  }

  /**
   * Create editable schema for frontend
   */
  createEditableSchema(sections) {
    return {
      personalInfo: {
        title: 'Personal Information',
        fields: {
          name: { type: 'text', label: 'Full Name', required: true },
          title: { type: 'text', label: 'Professional Title', required: false },
          email: { type: 'email', label: 'Email', required: true },
          phone: { type: 'tel', label: 'Phone', required: false },
          location: { type: 'text', label: 'Location', required: false },
          linkedin: { type: 'url', label: 'LinkedIn', required: false },
          github: { type: 'url', label: 'GitHub', required: false },
          website: { type: 'url', label: 'Website', required: false }
        }
      },
      summary: {
        title: 'Professional Summary',
        fields: {
          text: { type: 'textarea', label: 'Summary', required: false, maxLength: 500 }
        }
      },
      skills: {
        title: 'Skills',
        type: 'array',
        itemSchema: {
          category: { type: 'text', label: 'Category', placeholder: 'e.g., Languages' },
          skills: { type: 'text', label: 'Skills', placeholder: 'e.g., JavaScript, Python, Java' }
        }
      },
      experience: {
        title: 'Work Experience',
        type: 'array',
        itemSchema: {
          title: { type: 'text', label: 'Job Title', required: true },
          company: { type: 'text', label: 'Company', required: true },
          location: { type: 'text', label: 'Location', required: false },
          startDate: { type: 'text', label: 'Start Date', placeholder: 'MMM YYYY' },
          endDate: { type: 'text', label: 'End Date', placeholder: 'MMM YYYY or Present' },
          bullets: { type: 'array', label: 'Accomplishments', itemType: 'text' }
        }
      },
      projects: {
        title: 'Projects',
        type: 'array',
        itemSchema: {
          name: { type: 'text', label: 'Project Name', required: true },
          technologies: { type: 'text', label: 'Technologies', required: false },
          date: { type: 'text', label: 'Date', placeholder: 'MMM YYYY' },
          bullets: { type: 'array', label: 'Description', itemType: 'text' }
        }
      },
      education: {
        title: 'Education',
        type: 'array',
        itemSchema: {
          degree: { type: 'text', label: 'Degree', required: true },
          school: { type: 'text', label: 'School', required: true },
          location: { type: 'text', label: 'Location', required: false },
          graduationDate: { type: 'text', label: 'Graduation Date', placeholder: 'MMM YYYY' },
          gpa: { type: 'text', label: 'GPA', required: false }
        }
      },
      certifications: {
        title: 'Certifications',
        type: 'array',
        itemSchema: {
          name: { type: 'text', label: 'Certification Name', required: true },
          issuer: { type: 'text', label: 'Issuing Organization', required: false },
          date: { type: 'text', label: 'Date', placeholder: 'MMM YYYY' }
        }
      }
    };
  }

  /**
   * Update a specific section
   */
  async updateSection(sessionId, sectionId, data) {
    const session = sessions.get(sessionId);
    if (!session || this.isSessionExpired(session)) {
      return null;
    }

    // Update section data
    session.sections[sectionId] = data;
    session.lastModified = Date.now();

    // Regenerate PDF
    await this.generatePreviewPdf(sessionId);

    return true;
  }

  /**
   * Generate PDF preview
   */
  async generatePreviewPdf(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return null;

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 36, bottom: 36, left: 36, right: 36 }
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));

    // Generate PDF content
    this.renderPdfContent(doc, session.sections);

    doc.end();

    return new Promise((resolve) => {
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        session.pdfBuffer = pdfBuffer;
        resolve(pdfBuffer);
      });
    });
  }

  /**
   * Render PDF content
   */
  renderPdfContent(doc, sections) {
    const { personalInfo, summary, skills, experience, projects, education, certifications } = sections;

    // Personal Info
    if (personalInfo.name) {
      doc.fontSize(24).font('Helvetica-Bold').text(personalInfo.name, { align: 'center' });
      doc.moveDown(0.2);
    }

    if (personalInfo.title) {
      doc.fontSize(14).font('Helvetica').text(personalInfo.title, { align: 'center' });
      doc.moveDown(0.3);
    }

    // Contact info
    const contactParts = [];
    if (personalInfo.email) contactParts.push(personalInfo.email);
    if (personalInfo.phone) contactParts.push(personalInfo.phone);
    if (personalInfo.location) contactParts.push(personalInfo.location);
    
    if (contactParts.length > 0) {
      doc.fontSize(10).font('Helvetica').text(contactParts.join(' | '), { align: 'center' });
      doc.moveDown(0.5);
    }

    // Links
    const linkParts = [];
    if (personalInfo.linkedin) linkParts.push(personalInfo.linkedin);
    if (personalInfo.github) linkParts.push(personalInfo.github);
    if (personalInfo.website) linkParts.push(personalInfo.website);
    
    if (linkParts.length > 0) {
      doc.fontSize(10).text(linkParts.join(' | '), { align: 'center' });
      doc.moveDown(1);
    }

    // Summary
    if (summary) {
      this.renderSection(doc, 'PROFESSIONAL SUMMARY');
      doc.fontSize(10).font('Helvetica').text(summary, { align: 'justify' });
      doc.moveDown(0.8);
    }

    // Skills
    if (skills.length > 0) {
      this.renderSection(doc, 'SKILLS');
      skills.forEach(skillGroup => {
        if (skillGroup.category && skillGroup.skills) {
          doc.fontSize(10)
            .font('Helvetica-Bold').text(`${skillGroup.category}: `, { continued: true })
            .font('Helvetica').text(skillGroup.skills);
          doc.moveDown(0.3);
        }
      });
      doc.moveDown(0.5);
    }

    // Experience
    if (experience.length > 0) {
      this.renderSection(doc, 'EXPERIENCE');
      experience.forEach(job => {
        this.renderExperience(doc, job);
      });
    }

    // Projects
    if (projects.length > 0) {
      this.renderSection(doc, 'PROJECTS');
      projects.forEach(project => {
        this.renderProject(doc, project);
      });
    }

    // Education
    if (education.length > 0) {
      this.renderSection(doc, 'EDUCATION');
      education.forEach(edu => {
        this.renderEducation(doc, edu);
      });
    }

    // Certifications
    if (certifications.length > 0) {
      this.renderSection(doc, 'CERTIFICATIONS');
      certifications.forEach(cert => {
        doc.fontSize(10).font('Helvetica-Bold').text(cert.name);
        if (cert.issuer || cert.date) {
          const details = [cert.issuer, cert.date].filter(Boolean).join(' - ');
          doc.fontSize(9).font('Helvetica').text(details);
        }
        doc.moveDown(0.5);
      });
    }
  }

  renderSection(doc, title) {
    doc.fontSize(12).font('Helvetica-Bold').text(title);
    doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
    doc.moveDown(0.5);
  }

  renderExperience(doc, job) {
    // Job title and dates
    doc.fontSize(11).font('Helvetica-Bold').text(job.title || 'Position');
    
    // Company and location
    const companyLine = [job.company, job.location].filter(Boolean).join(' - ');
    if (companyLine) {
      doc.fontSize(10).font('Helvetica-Oblique').text(companyLine);
    }
    
    // Date range
    if (job.startDate || job.endDate) {
      doc.fontSize(9).font('Helvetica').text(`${job.startDate || ''} - ${job.endDate || 'Present'}`);
    }
    
    doc.moveDown(0.3);
    
    // Bullets
    if (job.bullets && job.bullets.length > 0) {
      job.bullets.forEach(bullet => {
        if (bullet) {
          doc.fontSize(10).font('Helvetica').text(`• ${bullet}`, { indent: 15 });
          doc.moveDown(0.2);
        }
      });
    }
    
    doc.moveDown(0.5);
  }

  renderProject(doc, project) {
    // Project name
    doc.fontSize(11).font('Helvetica-Bold').text(project.name || 'Project');
    
    // Technologies and date
    const details = [project.technologies, project.date].filter(Boolean).join(' | ');
    if (details) {
      doc.fontSize(9).font('Helvetica').text(details);
    }
    
    doc.moveDown(0.3);
    
    // Bullets
    if (project.bullets && project.bullets.length > 0) {
      project.bullets.forEach(bullet => {
        if (bullet) {
          doc.fontSize(10).font('Helvetica').text(`• ${bullet}`, { indent: 15 });
          doc.moveDown(0.2);
        }
      });
    }
    
    doc.moveDown(0.5);
  }

  renderEducation(doc, edu) {
    doc.fontSize(11).font('Helvetica-Bold').text(edu.degree || 'Degree');
    doc.fontSize(10).font('Helvetica').text(edu.school || 'School');
    
    const details = [];
    if (edu.location) details.push(edu.location);
    if (edu.graduationDate) details.push(edu.graduationDate);
    if (edu.gpa) details.push(`GPA: ${edu.gpa}`);
    
    if (details.length > 0) {
      doc.fontSize(9).text(details.join(' | '));
    }
    
    doc.moveDown(0.5);
  }

  /**
   * Get preview PDF
   */
  async getPreviewPdf(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || this.isSessionExpired(session)) {
      return null;
    }
    
    return session.pdfBuffer;
  }

  /**
   * Finalize resume
   */
  async finalizeResume(sessionId, format) {
    const session = sessions.get(sessionId);
    if (!session || this.isSessionExpired(session)) {
      return null;
    }

    const fileId = uuidv4();
    const filename = `resume_${new Date().toISOString().split('T')[0]}.${format}`;

    let buffer;
    if (format === 'pdf') {
      buffer = session.pdfBuffer;
    } else {
      buffer = await this.generateDocx(session.sections);
    }

    // Store file temporarily
    const filePath = path.join(TEMP_DIR, `${fileId}.${format}`);
    await fs.writeFile(filePath, buffer);

    // Store file info
    session.finalFiles = session.finalFiles || {};
    session.finalFiles[fileId] = {
      path: filePath,
      filename,
      format,
      createdAt: Date.now()
    };

    return { fileId, filename };
  }

  /**
   * Generate DOCX
   */
  async generateDocx(sections) {
    const { personalInfo, summary, skills, experience, projects, education } = sections;

    const doc = new Document({
      sections: [{
        children: [
          // Personal info
          new Paragraph({
            children: [new TextRun({ text: personalInfo.name || 'Name', bold: true, size: 48 })],
            alignment: 'center'
          }),
          new Paragraph({
            children: [new TextRun({ text: personalInfo.title || '', size: 28 })],
            alignment: 'center'
          }),
          // Add more content as needed...
          new Paragraph({ text: '' }), // Spacer
          // Summary
          ...(summary ? [
            new Paragraph({ children: [new TextRun({ text: 'PROFESSIONAL SUMMARY', bold: true, size: 24 })] }),
            new Paragraph({ text: summary, size: 20 })
          ] : [])
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    return buffer;
  }

  /**
   * Get download file
   */
  async getDownloadFile(fileId) {
    // Search all sessions for this file
    for (const [sessionId, session] of sessions) {
      if (session.finalFiles && session.finalFiles[fileId]) {
        const fileInfo = session.finalFiles[fileId];
        try {
          const buffer = await fs.readFile(fileInfo.path);
          return {
            buffer,
            filename: fileInfo.filename,
            format: fileInfo.format
          };
        } catch (error) {
          console.error('Failed to read file:', error);
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Get empty schema
   */
  getEmptySchema() {
    return this.createEditableSchema({
      personalInfo: {},
      summary: '',
      skills: [],
      experience: [],
      projects: [],
      education: [],
      certifications: []
    });
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions() {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of sessions) {
      if (this.isSessionExpired(session)) {
        // Delete any files
        if (session.finalFiles) {
          for (const fileInfo of Object.values(session.finalFiles)) {
            try {
              await fs.unlink(fileInfo.path);
            } catch (error) {
              // File might already be deleted
            }
          }
        }
        sessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} expired resume editor sessions`);
    }
  }

  isSessionExpired(session) {
    return Date.now() - session.createdAt > SESSION_TTL;
  }

  // Helper methods
  isSectionHeader(line) {
    const headers = [
      'SUMMARY', 'OBJECTIVE', 'PROFESSIONAL SUMMARY',
      'EXPERIENCE', 'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE',
      'EDUCATION', 'SKILLS', 'TECHNICAL SKILLS',
      'PROJECTS', 'CERTIFICATIONS', 'ACHIEVEMENTS'
    ];
    return headers.includes(line.toUpperCase());
  }

  detectSectionType(line) {
    const upper = line.toUpperCase();
    if (upper.includes('SUMMARY') || upper.includes('OBJECTIVE')) return 'summary';
    if (upper.includes('EXPERIENCE')) return 'experience';
    if (upper.includes('EDUCATION')) return 'education';
    if (upper.includes('SKILL')) return 'skills';
    if (upper.includes('PROJECT')) return 'projects';
    if (upper.includes('CERTIF')) return 'certifications';
    return null;
  }

  parseContactInfo(line, info) {
    const parts = line.split(/[|,]/).map(p => p.trim());
    parts.forEach(part => {
      if (part.includes('@')) info.email = part;
      else if (part.match(/\d{3}.*\d{4}/)) info.phone = part;
      else if (part.toLowerCase().includes('linkedin')) info.linkedin = part;
      else if (part.toLowerCase().includes('github')) info.github = part;
      else if (part.match(/^[A-Za-z\s]+,\s*[A-Z]{2}$/)) info.location = part;
    });
  }

  parseSkillsLine(line, skills) {
    if (line.includes(':')) {
      const [category, skillList] = line.split(':').map(s => s.trim());
      skills.push({ category, skills: skillList });
    }
  }

  parseExperienceItem(line, nextLine, experience) {
    if (!this.isBullet(line) && line.length > 10) {
      const exp = {
        title: line,
        company: '',
        location: '',
        startDate: '',
        endDate: '',
        bullets: []
      };
      experience.push(exp);
    } else if (experience.length > 0 && this.isBullet(line)) {
      const lastExp = experience[experience.length - 1];
      lastExp.bullets.push(this.cleanBullet(line));
    }
  }

  parseProjectItem(line, nextLine, projects) {
    if (!this.isBullet(line) && line.length > 5) {
      const project = {
        name: line.split('|')[0].trim(),
        technologies: line.includes('|') ? line.split('|')[1]?.trim() : '',
        date: '',
        bullets: []
      };
      projects.push(project);
    } else if (projects.length > 0 && this.isBullet(line)) {
      const lastProject = projects[projects.length - 1];
      lastProject.bullets.push(this.cleanBullet(line));
    }
  }

  parseEducationItem(line, nextLine, education) {
    if (!this.isBullet(line) && line.length > 10) {
      education.push({
        degree: line,
        school: '',
        location: '',
        graduationDate: '',
        gpa: ''
      });
    }
  }

  isBullet(line) {
    return /^[-•*+]/.test(line.trim()) || /^(Developed|Built|Created|Led|Managed)/.test(line.trim());
  }

  cleanBullet(text) {
    return text.replace(/^[-•*+]\s*/, '').trim();
  }
}

module.exports = new ResumeEditorService();