/**
 * DOCX generation utility
 * @module utils/docxGenerator
 */

const { 
  Document, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  AlignmentType, 
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  NumberFormat
} = require('docx');
const { AppError } = require('../middleware/errorHandler');

/**
 * DOCX Generator class
 */
class DOCXGenerator {
  /**
   * Generate DOCX from resume data
   * @param {Object} resumeData - Resume information
   * @param {string} resumeData.text - Resume content
   * @param {number} resumeData.score - Match score
   * @param {string} resumeData.optimizedFor - Job title optimized for
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Buffer>} DOCX buffer
   */
  async generateDOCX(resumeData, metadata = {}) {
    if (!resumeData || !resumeData.text) {
      throw new AppError('Invalid resume data provided for DOCX generation', 400);
    }

    console.log('Generating DOCX document');

    try {
      const doc = this.createDocument(resumeData, metadata);
      const buffer = await Packer.toBuffer(doc);
      
      console.log('DOCX generated successfully');
      return buffer;
    } catch (error) {
      console.error('DOCX generation error:', error);
      throw new AppError('Failed to generate DOCX', 500, {
        originalError: error.message
      });
    }
  }

  /**
   * Create DOCX document
   * @param {Object} resumeData - Resume data
   * @param {Object} metadata - Metadata
   * @returns {Document} DOCX Document object
   */
  createDocument(resumeData, metadata) {
    const sections = [{
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
      headers: {
        default: new Header({
          children: [this.createHeader(resumeData, metadata)]
        })
      },
      footers: {
        default: new Footer({
          children: [this.createFooter()]
        })
      },
      children: [
        ...this.createTitleSection(resumeData, metadata),
        ...this.createImprovementsSection(metadata),
        ...this.createResumeContent(resumeData.text, metadata.changes)
      ]
    }];

    return new Document({
      creator: "AI Resume Optimizer",
      title: `Optimized Resume - ${metadata.jobTitle || 'General'}`,
      description: "AI-optimized resume document",
      sections
    });
  }

  /**
   * Create header
   * @param {Object} resumeData - Resume data
   * @param {Object} metadata - Metadata
   * @returns {Paragraph} Header paragraph
   */
  createHeader(resumeData, metadata) {
    return new Paragraph({
      children: [
        new TextRun({
          text: `Score: ${resumeData.score || 0}/10`,
          bold: true,
          size: 20,
          color: this.getScoreColor(resumeData.score || 0)
        })
      ],
      alignment: AlignmentType.RIGHT
    });
  }

  /**
   * Create footer
   * @returns {Paragraph} Footer paragraph
   */
  createFooter() {
    return new Paragraph({
      children: [
        new TextRun({
          text: "Page ",
          size: 18,
          color: "666666"
        }),
        new TextRun({
          children: [PageNumber.CURRENT],
          size: 18,
          color: "666666"
        }),
        new TextRun({
          text: " | Generated on " + new Date().toLocaleDateString(),
          size: 18,
          color: "666666"
        })
      ],
      alignment: AlignmentType.CENTER
    });
  }

  /**
   * Create title section
   * @param {Object} resumeData - Resume data
   * @param {Object} metadata - Metadata
   * @returns {Array<Paragraph>} Title paragraphs
   */
  createTitleSection(resumeData, metadata) {
    const paragraphs = [
      new Paragraph({
        children: [
          new TextRun({
            text: "Optimized Resume",
            bold: true,
            size: 36
          })
        ],
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 }
      })
    ];

    if (metadata.jobTitle || resumeData.optimizedFor) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Optimized for: ${metadata.jobTitle || resumeData.optimizedFor}`,
              size: 24,
              italics: true
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        })
      );
    }

    if (metadata.company) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Target Company: ${metadata.company}`,
              size: 22
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        })
      );
    }

    return paragraphs;
  }

  /**
   * Create improvements section
   * @param {Object} metadata - Metadata
   * @returns {Array<Paragraph>} Improvements paragraphs
   */
  createImprovementsSection(metadata) {
    if (!metadata.improvements || metadata.improvements.length === 0) {
      return [];
    }

    const paragraphs = [
      new Paragraph({
        children: [
          new TextRun({
            text: "Optimizations Applied",
            bold: true,
            size: 28
          })
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
        border: {
          bottom: {
            color: "27ae60",
            space: 1,
            style: BorderStyle.SINGLE,
            size: 6
          }
        }
      })
    ];

    metadata.improvements.slice(0, 5).forEach(improvement => {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "✓ ",
              bold: true,
              color: "27ae60",
              size: 20
            }),
            new TextRun({
              text: improvement,
              size: 20
            })
          ],
          spacing: { after: 100 },
          indent: { left: 360 }
        })
      );
    });

    paragraphs.push(
      new Paragraph({
        text: "",
        spacing: { after: 400 }
      })
    );

    return paragraphs;
  }

  /**
   * Create resume content
   * @param {string} text - Resume text
   * @param {Object} changes - Changes object
   * @returns {Array<Paragraph>} Content paragraphs
   */
  createResumeContent(text, changes = {}) {
    const paragraphs = [
      new Paragraph({
        children: [
          new TextRun({
            text: "Resume Content",
            bold: true,
            size: 28
          })
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
        border: {
          bottom: {
            color: "000000",
            space: 1,
            style: BorderStyle.SINGLE,
            size: 6
          }
        }
      })
    ];

    // Parse resume content
    const contentParagraphs = this.parseResumeText(text, changes);
    paragraphs.push(...contentParagraphs);

    return paragraphs;
  }

  /**
   * Parse resume text into paragraphs
   * @param {string} text - Resume text
   * @param {Object} changes - Changes object
   * @returns {Array<Paragraph>} Parsed paragraphs
   */
  parseResumeText(text, changes) {
    const lines = text.split('\n');
    const paragraphs = [];
    let currentSection = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line === '') {
        // Empty line - create paragraph from current section
        if (currentSection.length > 0) {
          paragraphs.push(this.createResumeParagraph(currentSection.join('\n'), changes));
          currentSection = [];
        }
        continue;
      }

      currentSection.push(lines[i]); // Keep original formatting
    }

    // Don't forget the last section
    if (currentSection.length > 0) {
      paragraphs.push(this.createResumeParagraph(currentSection.join('\n'), changes));
    }

    return paragraphs;
  }

  /**
   * Create resume paragraph with formatting
   * @param {string} text - Paragraph text
   * @param {Object} changes - Changes object
   * @returns {Paragraph} Formatted paragraph
   */
  createResumeParagraph(text, changes) {
    const isHeading = this.isHeading(text);
    const children = [];

    // Check if this text contains any keywords that were added
    const highlightedKeywords = changes?.keywordsIntegrated || [];
    
    if (highlightedKeywords.length > 0 && !isHeading) {
      // Split text and highlight keywords
      let remainingText = text;
      let lastIndex = 0;

      highlightedKeywords.forEach(keyword => {
        const regex = new RegExp(`\\b(${this.escapeRegex(keyword)})\\b`, 'gi');
        const match = regex.exec(remainingText);
        
        if (match) {
          // Add text before keyword
          if (match.index > lastIndex) {
            children.push(
              new TextRun({
                text: remainingText.substring(lastIndex, match.index),
                size: 22
              })
            );
          }
          
          // Add highlighted keyword
          children.push(
            new TextRun({
              text: match[1],
              size: 22,
              highlight: "yellow"
            })
          );
          
          lastIndex = match.index + match[1].length;
        }
      });

      // Add remaining text
      if (lastIndex < remainingText.length) {
        children.push(
          new TextRun({
            text: remainingText.substring(lastIndex),
            size: 22
          })
        );
      }
    } else {
      // No highlighting needed
      children.push(
        new TextRun({
          text: text,
          bold: isHeading,
          size: isHeading ? 26 : 22
        })
      );
    }

    return new Paragraph({
      children,
      heading: isHeading ? HeadingLevel.HEADING_2 : undefined,
      spacing: { 
        after: isHeading ? 200 : 150,
        before: isHeading ? 300 : 0
      }
    });
  }

  /**
   * Check if text is a heading
   * @param {string} text - Text to check
   * @returns {boolean} Is heading
   */
  isHeading(text) {
    const trimmed = text.trim();
    
    // Common resume headings
    const headingPatterns = [
      /^(EXPERIENCE|EDUCATION|SKILLS|SUMMARY|OBJECTIVE|PROJECTS|ACHIEVEMENTS|CERTIFICATIONS)/i,
      /^[A-Z\s]{3,}$/,  // All caps
      /:$/              // Ends with colon
    ];
    
    return headingPatterns.some(pattern => pattern.test(trimmed));
  }

  /**
   * Get score color
   * @param {number} score - Score value
   * @returns {string} Hex color without #
   */
  getScoreColor(score) {
    if (score >= 8) return "27ae60"; // Green
    if (score >= 6) return "3498db"; // Blue
    if (score >= 4) return "f39c12"; // Orange
    return "e74c3c"; // Red
  }

  /**
   * Escape regex special characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Export singleton instance
module.exports = new DOCXGenerator();