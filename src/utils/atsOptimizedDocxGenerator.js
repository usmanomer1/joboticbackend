/**
 * Professional ATS-Optimized DOCX Generation
 * @module utils/atsOptimizedDocxGenerator
 */

const docx = require('docx');
const { AppError } = require('../middleware/errorHandler');

const {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  TabStopType,
  TabStopPosition,
  HeadingLevel
} = docx;

/**
 * Professional Resume DOCX Generator
 */
class ATSOptimizedDOCXGenerator {
  constructor() {
    this.config = {
      fonts: {
        primary: 'Calibri',
        secondary: 'Arial'
      },
      sizes: {
        name: 48,        // 24pt
        contact: 20,     // 10pt
        sectionHeader: 24, // 12pt
        jobTitle: 22,    // 11pt
        body: 20,        // 10pt
        small: 18        // 9pt
      },
      colors: {
        black: '000000',
        darkGray: '333333',
        gray: '666666'
      }
    };
  }

  /**
   * Generate professional ATS-optimized DOCX
   */
  async generateDOCX(resumeData, metadata = {}) {
    if (!resumeData || !resumeData.text) {
      throw new AppError('Invalid resume data provided', 400);
    }

    console.log('Generating professional ATS-optimized DOCX');

    try {
      const resume = this.parseResume(resumeData.text);
      
      const doc = new Document({
        creator: 'Jobotic AI',
        title: 'Resume',
        description: 'Professional Resume',
        
        styles: this.createStyles(),
        
        sections: [{
          properties: {
            page: {
              margin: {
                top: 720,    // 0.5 inch
                right: 720,
                bottom: 720,
                left: 720
              }
            }
          },
          children: this.createContent(resume)
        }]
      });

      const buffer = await docx.Packer.toBuffer(doc);
      console.log('DOCX generated successfully');
      return buffer;
    } catch (error) {
      console.error('DOCX generation error:', error);
      throw new AppError('Failed to generate DOCX', 500);
    }
  }

  /**
   * Parse resume text into structured format
   */
  parseResume(text) {
    const lines = text.split('\n');
    const resume = {
      contact: {
        name: '',
        details: []
      },
      sections: []
    };

    let currentSection = null;
    let currentSubsection = null;
    let inBulletList = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // First non-empty line is usually the name
      if (!resume.contact.name && i < 3) {
        if (!this.isSectionHeader(line) && !line.includes('|') && !line.includes('@')) {
          resume.contact.name = line;
          continue;
        }
      }

      // Contact info line
      if (i < 5 && (line.includes('|') || line.includes('@') || /\d{3}[-.)]\d{3}[-.)]\d{4}/.test(line))) {
        resume.contact.details = this.parseContactLine(line);
        continue;
      }

      // Section headers
      if (this.isSectionHeader(line)) {
        if (currentSection) {
          resume.sections.push(currentSection);
        }
        currentSection = {
          title: line.toUpperCase(),
          content: []
        };
        currentSubsection = null;
        inBulletList = false;
        continue;
      }

      if (!currentSection) continue;

      // Subsection headers
      if (this.isSubsectionHeader(line, lines[i + 1])) {
        currentSubsection = {
          title: line,
          subtitle: '',
          bullets: []
        };
        currentSection.content.push(currentSubsection);
        inBulletList = false;
        continue;
      }

      // Subtitle
      if (currentSubsection && !currentSubsection.subtitle && !this.isBullet(line)) {
        if (this.isSubtitle(line)) {
          currentSubsection.subtitle = line;
          continue;
        }
      }

      // Bullets
      if (this.isBullet(line) || (inBulletList && !this.isSubsectionHeader(line, lines[i + 1]))) {
        const bulletText = this.cleanBullet(line);
        if (currentSubsection) {
          currentSubsection.bullets.push(bulletText);
          inBulletList = true;
        } else {
          currentSection.content.push({
            type: 'bullet',
            text: bulletText
          });
        }
        continue;
      }

      // Paragraph
      if (currentSection) {
        inBulletList = false;
        currentSection.content.push({
          type: 'paragraph',
          text: line
        });
      }
    }

    if (currentSection) {
      resume.sections.push(currentSection);
    }

    return resume;
  }

  /**
   * Create document styles
   */
  createStyles() {
    return {
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          basedOn: 'Normal',
          run: {
            font: this.config.fonts.primary,
            size: this.config.sizes.body,
            color: this.config.colors.black
          }
        },
        {
          id: 'ContactName',
          name: 'Contact Name',
          basedOn: 'Normal',
          run: {
            bold: true,
            size: this.config.sizes.name
          },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 }
          }
        },
        {
          id: 'ContactInfo',
          name: 'Contact Info',
          basedOn: 'Normal',
          run: {
            size: this.config.sizes.contact
          },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 }
          }
        },
        {
          id: 'SectionHeader',
          name: 'Section Header',
          basedOn: 'Normal',
          run: {
            bold: true,
            size: this.config.sizes.sectionHeader
          },
          paragraph: {
            spacing: { before: 240, after: 120 },
            border: {
              bottom: {
                color: this.config.colors.black,
                space: 1,
                style: BorderStyle.SINGLE,
                size: 6
              }
            }
          }
        },
        {
          id: 'JobTitle',
          name: 'Job Title',
          basedOn: 'Normal',
          run: {
            bold: true,
            size: this.config.sizes.jobTitle
          },
          paragraph: {
            spacing: { after: 60 }
          }
        },
        {
          id: 'Subtitle',
          name: 'Subtitle',
          basedOn: 'Normal',
          run: {
            italics: true,
            size: this.config.sizes.small,
            color: this.config.colors.gray
          },
          paragraph: {
            spacing: { after: 120 }
          }
        },
        {
          id: 'BulletPoint',
          name: 'Bullet Point',
          basedOn: 'Normal',
          run: {
            size: this.config.sizes.body
          },
          paragraph: {
            spacing: { after: 60 },
            indent: { left: 360, hanging: 180 }
          }
        }
      ]
    };
  }

  /**
   * Create document content
   */
  createContent(resume) {
    const elements = [];

    // Contact section
    if (resume.contact.name) {
      elements.push(
        new Paragraph({
          text: resume.contact.name,
          style: 'ContactName'
        })
      );
    }

    if (resume.contact.details.length > 0) {
      elements.push(
        new Paragraph({
          text: resume.contact.details.join(' | '),
          style: 'ContactInfo'
        })
      );
    }

    // Sections
    for (const section of resume.sections) {
      elements.push(...this.createSection(section));
    }

    return elements;
  }

  /**
   * Create section elements
   */
  createSection(section) {
    const elements = [];

    // Section header
    elements.push(
      new Paragraph({
        text: section.title,
        style: 'SectionHeader'
      })
    );

    // Section content
    for (const item of section.content) {
      if (item.type === 'paragraph') {
        elements.push(
          new Paragraph({
            text: item.text,
            spacing: { after: 120 }
          })
        );
      } else if (item.type === 'bullet') {
        elements.push(this.createBullet(item.text));
      } else if (item.title) {
        elements.push(...this.createSubsection(item));
      }
    }

    return elements;
  }

  /**
   * Create subsection elements
   */
  createSubsection(subsection) {
    const elements = [];

    // Parse date from title if present
    const titleParts = this.extractDateFromTitle(subsection.title);

    if (titleParts.date) {
      // Title with date on same line
      elements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: titleParts.title,
              bold: true,
              size: this.config.sizes.jobTitle
            }),
            new TextRun({
              text: '\t',
            }),
            new TextRun({
              text: titleParts.date,
              bold: true,
              size: this.config.sizes.jobTitle
            })
          ],
          tabStops: [{
            type: TabStopType.RIGHT,
            position: TabStopPosition.MAX
          }],
          spacing: { after: 60 }
        })
      );
    } else {
      elements.push(
        new Paragraph({
          text: subsection.title,
          style: 'JobTitle'
        })
      );
    }

    // Subtitle
    if (subsection.subtitle) {
      elements.push(
        new Paragraph({
          text: subsection.subtitle,
          style: 'Subtitle'
        })
      );
    }

    // Bullets
    for (const bullet of subsection.bullets) {
      elements.push(this.createBullet(bullet));
    }

    // Add spacing after subsection
    if (subsection.bullets.length > 0) {
      elements.push(new Paragraph({ text: '', spacing: { after: 120 } }));
    }

    return elements;
  }

  /**
   * Create bullet point
   */
  createBullet(text) {
    return new Paragraph({
      children: [
        new TextRun({
          text: `• ${text}`,
          size: this.config.sizes.body
        })
      ],
      style: 'BulletPoint'
    });
  }

  /**
   * Helper methods (same as PDF generator)
   */
  isSectionHeader(line) {
    const headers = [
      'SUMMARY', 'OBJECTIVE', 'PROFESSIONAL SUMMARY',
      'EXPERIENCE', 'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE',
      'EDUCATION', 'SKILLS', 'TECHNICAL SKILLS',
      'PROJECTS', 'CERTIFICATIONS', 'ACHIEVEMENTS',
      'AWARDS', 'PUBLICATIONS', 'REFERENCES'
    ];
    
    const upper = line.toUpperCase().trim();
    return headers.includes(upper) || 
           (upper === line && upper.length > 3 && upper.length < 30 && /^[A-Z\s]+$/.test(upper));
  }

  isSubsectionHeader(line, nextLine) {
    if (this.isBullet(line)) return false;
    
    const hasCompanyKeywords = /\b(Inc|LLC|Corp|Ltd|Company|University|College|School|Institute)\b/i.test(line);
    const hasDatePattern = /\d{4}|\bPresent\b|\bCurrent\b/i.test(line + ' ' + (nextLine || ''));
    const isTitleCase = /^[A-Z][a-zA-Z\s,.\-&]+$/.test(line) && line.length > 10;
    const hasJobTitleKeywords = /\b(Engineer|Developer|Manager|Director|Analyst|Designer|Consultant|Lead|Senior|Junior)\b/i.test(line);
    
    return hasCompanyKeywords || hasDatePattern || (isTitleCase && hasJobTitleKeywords);
  }

  isSubtitle(line) {
    const hasLocation = /[A-Za-z\s]+,\s*[A-Z]{2}/.test(line);
    const hasDate = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\b.*\d{4}|\d{4}\s*-\s*\d{4}|\d{4}\s*–\s*Present/i.test(line);
    
    return hasLocation || hasDate;
  }

  isBullet(line) {
    const bulletMarkers = /^[\s]*[-•·*+◦▪▸➤]\s+/;
    const actionVerbs = /^(Achieved|Administered|Analyzed|Built|Collaborated|Conducted|Coordinated|Created|Designed|Developed|Directed|Enhanced|Established|Executed|Facilitated|Generated|Implemented|Improved|Increased|Led|Maintained|Managed|Optimized|Organized|Performed|Planned|Prepared|Presented|Produced|Provided|Reduced|Resolved|Spearheaded|Streamlined|Supervised|Trained|Transformed|Utilized)/i;
    
    return bulletMarkers.test(line) || actionVerbs.test(line.trim());
  }

  cleanBullet(text) {
    return text.replace(/^[\s]*[-•·*+◦▪▸➤]\s*/, '').trim();
  }

  parseContactLine(line) {
    return line.split(/[|•·]/).map(part => part.trim()).filter(part => part);
  }

  extractDateFromTitle(title) {
    const datePattern = /(.+?)\s*[\(（]?\s*(\d{4}\s*[-–—]\s*(?:\d{4}|Present|Current))[\)）]?\s*$/i;
    const match = title.match(datePattern);
    
    if (match) {
      return {
        title: match[1].trim(),
        date: match[2].trim()
      };
    }
    
    return { title, date: null };
  }
}

// Export singleton
module.exports = new ATSOptimizedDOCXGenerator();