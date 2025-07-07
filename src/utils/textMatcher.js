const diff = require('diff');

class TextMatcher {
  constructor() {
    // Thresholds for matching
    this.exactMatchThreshold = 1.0;
    this.highConfidenceThreshold = 0.85;
    this.mediumConfidenceThreshold = 0.70;
    this.lowConfidenceThreshold = 0.50;
  }

  /**
   * Normalize text for comparison
   * @param {string} text - Text to normalize
   * @returns {string} - Normalized text
   */
  normalizeText(text) {
    if (!text) return '';
    
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/['']/g, "'") // Normalize quotes
      .replace(/[""]/g, '"') // Normalize double quotes
      .replace(/[-–—]/g, '-') // Normalize dashes
      .replace(/\u00A0/g, ' ') // Replace non-breaking spaces
      .trim();
  }

  /**
   * Calculate similarity between two strings
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} - Similarity score (0-1)
   */
  calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const norm1 = this.normalizeText(str1);
    const norm2 = this.normalizeText(str2);
    
    // Exact match after normalization
    if (norm1 === norm2) return 1;
    
    // Use Levenshtein distance for fuzzy matching
    const distance = this.levenshteinDistance(norm1, norm2);
    const maxLength = Math.max(norm1.length, norm2.length);
    
    if (maxLength === 0) return 1;
    
    return 1 - (distance / maxLength);
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} - Edit distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Find best matching text block
   * @param {Array} textBlocks - Array of text blocks
   * @param {string} searchText - Text to find
   * @returns {Object|null} - Best matching block or null
   */
  findBestMatch(textBlocks, searchText) {
    if (!textBlocks || !searchText) return null;
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const block of textBlocks) {
      const similarity = this.calculateSimilarity(block.text, searchText);
      
      if (similarity > bestScore && similarity >= this.lowConfidenceThreshold) {
        bestScore = similarity;
        bestMatch = block;
      }
    }
    
    return bestMatch ? { ...bestMatch, matchScore: bestScore } : null;
  }

  /**
   * Map AI suggestions to HTML text blocks
   * @param {Array} textBlocks - Text blocks from HTML parser
   * @param {Array} aiSuggestions - Suggestions from AI
   * @returns {Array} - Mapped suggestions
   */
  mapSuggestionsToHtml(textBlocks, aiSuggestions) {
    const mappedSuggestions = [];
    
    for (const suggestion of aiSuggestions) {
      // Find matching text block
      const matchedBlock = this.findBestMatch(textBlocks, suggestion.originalText);
      
      if (matchedBlock) {
        const confidence = this.getConfidenceLevel(matchedBlock.matchScore);
        
        mappedSuggestions.push({
          blockId: matchedBlock.id,
          originalText: matchedBlock.text,
          suggestedText: suggestion.suggestedText,
          confidence: confidence,
          matchScore: matchedBlock.matchScore,
          type: suggestion.type || 'general', // 'bullet', 'summary', 'skill', etc.
          reason: suggestion.reason || null,
          pageIndex: matchedBlock.pageIndex,
          position: matchedBlock.position
        });
      } else {
        console.warn(`No match found for suggestion: "${suggestion.originalText.substring(0, 50)}..."`);
      }
    }
    
    return mappedSuggestions;
  }

  /**
   * Get confidence level based on match score
   * @param {number} score - Match score (0-1)
   * @returns {string} - Confidence level
   */
  getConfidenceLevel(score) {
    if (score >= this.exactMatchThreshold) return 'exact';
    if (score >= this.highConfidenceThreshold) return 'high';
    if (score >= this.mediumConfidenceThreshold) return 'medium';
    return 'low';
  }

  /**
   * Validate suggestions don't break HTML structure
   * @param {string} originalText - Original text
   * @param {string} suggestedText - Suggested text
   * @returns {Object} - Validation result
   */
  validateSuggestion(originalText, suggestedText) {
    const validation = {
      isValid: true,
      warnings: [],
      errors: []
    };
    
    // Check for HTML tags in suggested text
    if (/<[^>]+>/.test(suggestedText)) {
      validation.errors.push('Suggested text contains HTML tags');
      validation.isValid = false;
    }
    
    // Check for extreme length differences
    const lengthRatio = suggestedText.length / originalText.length;
    if (lengthRatio > 2) {
      validation.warnings.push('Suggested text is significantly longer than original');
    } else if (lengthRatio < 0.5) {
      validation.warnings.push('Suggested text is significantly shorter than original');
    }
    
    // Check for special characters that might break layout
    const problematicChars = ['<', '>', '&', '\n', '\r', '\t'];
    for (const char of problematicChars) {
      if (suggestedText.includes(char)) {
        validation.warnings.push(`Contains special character: ${char}`);
      }
    }
    
    return validation;
  }

  /**
   * Prepare text blocks for AI processing
   * @param {Array} textBlocks - Text blocks from parser
   * @param {string} sectionType - Type of section (experience, skills, etc.)
   * @returns {Array} - Prepared blocks for AI
   */
  prepareBlocksForAI(textBlocks, sectionType = null) {
    return textBlocks
      .filter(block => block.text && block.text.trim().length > 0)
      .map(block => ({
        id: block.id,
        text: block.text,
        type: this.identifyBlockType(block.text),
        sectionType: sectionType,
        context: {
          fontSize: block.fontSize,
          isBold: block.fontWeight > 400,
          isIndented: block.position.left > 100 // Rough heuristic
        }
      }));
  }

  /**
   * Identify the type of text block
   * @param {string} text - Text content
   * @returns {string} - Block type
   */
  identifyBlockType(text) {
    const trimmedText = text.trim();
    
    // Bullet points
    if (/^[•◦\-*]\s/.test(trimmedText)) {
      return 'bullet';
    }
    
    // Dates
    if (/\b\d{4}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(trimmedText)) {
      return 'date';
    }
    
    // Headers (all caps or short)
    if (trimmedText === trimmedText.toUpperCase() && trimmedText.length < 30) {
      return 'header';
    }
    
    // Email/contact
    if (/\b[\w._%+-]+@[\w.-]+\.[A-Z|a-z]{2,}\b/.test(trimmedText)) {
      return 'contact';
    }
    
    // Skills (comma-separated list)
    if (trimmedText.includes(',') && trimmedText.split(',').length > 2) {
      return 'skills';
    }
    
    return 'text';
  }

  /**
   * Apply suggestions to text blocks
   * @param {Array} textBlocks - Original text blocks
   * @param {Array} mappedSuggestions - Mapped suggestions
   * @returns {Array} - Modified text blocks
   */
  applySuggestionsToBlocks(textBlocks, mappedSuggestions) {
    const modifiedBlocks = [...textBlocks];
    const blockMap = new Map(textBlocks.map(block => [block.id, block]));
    
    for (const suggestion of mappedSuggestions) {
      const block = blockMap.get(suggestion.blockId);
      if (block) {
        // Validate suggestion first
        const validation = this.validateSuggestion(block.text, suggestion.suggestedText);
        
        if (validation.isValid) {
          // Create a modified copy
          const modifiedBlock = {
            ...block,
            text: suggestion.suggestedText,
            originalText: block.text,
            modified: true,
            confidence: suggestion.confidence,
            warnings: validation.warnings
          };
          
          // Replace in array
          const index = modifiedBlocks.findIndex(b => b.id === block.id);
          if (index !== -1) {
            modifiedBlocks[index] = modifiedBlock;
          }
        } else {
          console.error(`Invalid suggestion for block ${block.id}:`, validation.errors);
        }
      }
    }
    
    return modifiedBlocks;
  }

  /**
   * Create AI prompt for specific text block
   * @param {Object} block - Text block
   * @param {string} jobDescription - Job description for context
   * @returns {string} - AI prompt
   */
  createBlockPrompt(block, jobDescription = null) {
    const blockTypePrompts = {
      bullet: `Improve this resume bullet point to be more impactful and quantified. Original: "${block.text}"`,
      skills: `Enhance this skills list to be more relevant and comprehensive. Original: "${block.text}"`,
      summary: `Improve this professional summary to be more compelling. Original: "${block.text}"`,
      text: `Enhance this resume text to be more professional and impactful. Original: "${block.text}"`
    };
    
    let prompt = blockTypePrompts[block.type] || blockTypePrompts.text;
    
    if (jobDescription) {
      prompt += `\n\nConsider this job description for context:\n${jobDescription.substring(0, 500)}...`;
    }
    
    prompt += '\n\nProvide only the improved text, no explanations.';
    
    return prompt;
  }

  /**
   * Batch similar blocks for efficient AI processing
   * @param {Array} blocks - Text blocks
   * @returns {Array} - Batched blocks
   */
  batchBlocksForAI(blocks, maxBatchSize = 5) {
    const batches = [];
    const blocksByType = {};
    
    // Group by type
    blocks.forEach(block => {
      const type = block.type || 'text';
      if (!blocksByType[type]) {
        blocksByType[type] = [];
      }
      blocksByType[type].push(block);
    });
    
    // Create batches
    Object.entries(blocksByType).forEach(([type, typeBlocks]) => {
      for (let i = 0; i < typeBlocks.length; i += maxBatchSize) {
        batches.push({
          type: type,
          blocks: typeBlocks.slice(i, i + maxBatchSize)
        });
      }
    });
    
    return batches;
  }
}

module.exports = new TextMatcher();