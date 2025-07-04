/**
 * Resume optimization service for tailoring resumes to specific jobs
 * @module services/resumeOptimization
 */

const geminiClient = require('../utils/geminiClient');
const resumeAnalysisService = require('./resumeAnalysis.service');
const { AppError } = require('../middleware/errorHandler');
const cache = require('../utils/cache');

// Optimization configuration
const OPTIMIZATION_CONFIG = {
  CACHE_TTL: 7200, // 2 hours
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  MAX_RESUME_LENGTH: 5000,
  DEFAULT_OPTIONS: {
    sections: {
      summary: true,
      skills: true,
      experience: true
    },
    addSkills: [],
    quickEdit: false,
    preserveFormat: true,
    enhanceKeywords: true
  }
};

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Resume Optimization Service class
 */
class ResumeOptimizationService {
  /**
   * Optimize resume for specific job
   * @param {string} resumeText - Original resume content
   * @param {Object} jobData - Target job information
   * @param {Object} options - Optimization options
   * @returns {Promise<Object>} Optimized resume with change tracking
   */
  async optimizeResume(resumeText, jobData, options = {}) {
    // Validate inputs
    if (!resumeText || resumeText.trim().length < 50) {
      throw new AppError('Invalid resume content provided', 400);
    }
    
    if (!jobData || !jobData.job_title || !jobData.job_description) {
      throw new AppError('Invalid job data provided', 400);
    }
    
    // Merge with default options
    const optimizationOptions = {
      ...OPTIMIZATION_CONFIG.DEFAULT_OPTIONS,
      ...options,
      sections: {
        ...OPTIMIZATION_CONFIG.DEFAULT_OPTIONS.sections,
        ...(options.sections || {})
      }
    };
    
    console.log(`Optimizing resume for: ${jobData.job_title} at ${jobData.employer_name}`);
    console.log('Optimization options:', optimizationOptions);
    
    try {
      // Check cache
      const cacheKey = this.generateCacheKey(resumeText, jobData, optimizationOptions);
      const cachedResult = cache.get(cacheKey);
      
      if (cachedResult) {
        console.log('Returning cached optimization');
        return cachedResult;
      }
      
      // Analyze current resume first
      console.log('Analyzing current resume...');
      const beforeAnalysis = await resumeAnalysisService.analyzeResume(resumeText, jobData);
      
      // Perform optimization
      console.log('Performing AI optimization...');
      const optimization = await this.performOptimization(
        resumeText, 
        jobData, 
        optimizationOptions,
        beforeAnalysis
      );
      
      // Analyze optimized resume
      console.log('Analyzing optimized resume...');
      const afterAnalysis = await resumeAnalysisService.analyzeResume(
        optimization.optimizedResume, 
        jobData
      );
      
      // Calculate improvement
      const scores = {
        before: beforeAnalysis.currentScore,
        after: afterAnalysis.currentScore,
        improvement: afterAnalysis.currentScore - beforeAnalysis.currentScore,
        improvementPercentage: Math.round(
          ((afterAnalysis.currentScore - beforeAnalysis.currentScore) / beforeAnalysis.currentScore) * 100
        )
      };
      
      // Quality checks
      const qualityReport = this.performQualityChecks(
        resumeText,
        optimization,
        optimizationOptions,
        jobData
      );
      
      // Prepare final result
      const result = {
        optimizedResume: optimization.optimizedResume,
        changes: optimization.changes,
        scores,
        analysis: {
          before: beforeAnalysis,
          after: afterAnalysis
        },
        qualityReport,
        metadata: {
          jobTitle: jobData.job_title,
          employerName: jobData.employer_name,
          optimizationDate: new Date().toISOString(),
          sectionsOptimized: Object.keys(optimizationOptions.sections)
            .filter(key => optimizationOptions.sections[key])
        }
      };
      
      // Cache result
      cache.set(cacheKey, result, OPTIMIZATION_CONFIG.CACHE_TTL);
      
      return result;
    } catch (error) {
      console.error('Resume optimization error:', error);
      throw new AppError('Failed to optimize resume', 500, {
        originalError: error.message
      });
    }
  }
  
  /**
   * Perform AI-powered optimization
   * @param {string} resumeText - Original resume
   * @param {Object} jobData - Job information
   * @param {Object} options - Optimization options
   * @param {Object} analysis - Current resume analysis
   * @param {number} retries - Remaining retries
   * @returns {Promise<Object>} Optimization results
   */
  async performOptimization(resumeText, jobData, options, analysis, retries = OPTIMIZATION_CONFIG.MAX_RETRIES) {
    try {
      // Extract job requirements
      const jobRequirements = this.extractJobRequirements(jobData);
      
      // Build skills to add list
      const skillsToAdd = this.buildSkillsToAdd(options.addSkills, analysis);
      
      // Prepare optimization prompt
      const prompt = this.prepareOptimizationPrompt(
        resumeText,
        jobData,
        jobRequirements,
        options,
        skillsToAdd
      );
      
      // Get AI optimization
      const response = await geminiClient.generateJSON(prompt, {
        temperature: 0.4, // Balanced creativity and consistency
        maxOutputTokens: 4096 // Allow for full resume
      });
      
      // Validate response
      const validatedOptimization = this.validateOptimizationResponse(response, resumeText);
      
      return validatedOptimization;
    } catch (error) {
      console.error(`Optimization error (${retries} retries left):`, error.message);
      
      if (retries > 0 && !error.message.includes('safety')) {
        const delay = OPTIMIZATION_CONFIG.RETRY_DELAY * Math.pow(2, OPTIMIZATION_CONFIG.MAX_RETRIES - retries);
        await sleep(delay);
        return this.performOptimization(resumeText, jobData, options, analysis, retries - 1);
      }
      
      throw error;
    }
  }
  
  /**
   * Prepare optimization prompt
   * @param {string} resumeText - Original resume
   * @param {Object} jobData - Job information
   * @param {Object} jobRequirements - Extracted requirements
   * @param {Object} options - Optimization options
   * @param {Array} skillsToAdd - Skills to add
   * @returns {string} Formatted prompt
   */
  prepareOptimizationPrompt(resumeText, jobData, jobRequirements, options, skillsToAdd) {
    const sectionsToOptimize = Object.keys(options.sections)
      .filter(key => options.sections[key])
      .join(', ');
    
    const prompt = `Optimize this resume for the specific job. Follow these rules:
- Maintain original format and structure
- Add keywords naturally, don't keyword stuff
- Quantify achievements where possible (use realistic numbers)
- Keep the person's voice authentic
- Preserve all contact information exactly as is

Current Resume:
${resumeText}

Target Job Title: ${jobData.job_title}
Company: ${jobData.employer_name}

Job Description (key parts):
${this.truncateText(jobData.job_description, 1000)}

Key Requirements:
- Skills: ${jobRequirements.skills.slice(0, 10).join(', ')}
- Keywords: ${jobRequirements.keywords.slice(0, 10).join(', ')}

Skills to Add: ${skillsToAdd.join(', ') || 'None specified'}
Sections to Optimize: ${sectionsToOptimize}
Quick Edit Mode: ${options.quickEdit ? 'Yes (optimize only first 2 experiences)' : 'No'}

Optimization Instructions:
${options.sections.summary ? `
SUMMARY SECTION:
- Rewrite to mirror job description tone
- Include 2-3 key requirements from the job
- Keep it concise (3-4 lines max)
- Start with years of experience if applicable` : ''}

${options.sections.skills ? `
SKILLS SECTION:
- Add new skills in appropriate categories
- Maintain existing grouping/categories
- Put most relevant skills first
- Remove outdated or irrelevant skills if needed` : ''}

${options.sections.experience ? `
EXPERIENCE SECTION:
- Add relevant keywords naturally
- Quantify results with realistic metrics (20-40% improvements typical)
- Emphasize responsibilities that match job requirements
- Use action verbs from job description
${options.quickEdit ? '- Only optimize the first 2 experience entries' : '- Optimize all experience entries'}` : ''}

Return ONLY valid JSON:
{
  "optimizedResume": "full optimized resume text maintaining exact original formatting",
  "changes": {
    "summary": {
      "before": "original summary text",
      "after": "optimized summary text",
      "keywordsAdded": ["specific", "keywords", "added"]
    },
    "skills": {
      "added": ["AWS", "Docker"],
      "removed": ["obsolete skill"],
      "reorganized": true,
      "categories": ["Technical Skills", "Tools & Technologies", "Soft Skills"]
    },
    "experience": [
      {
        "position": "Job Title at Company",
        "before": "original bullet point",
        "after": "optimized bullet point with metrics",
        "improvementType": "quantified|keyword-enhanced|responsibility-aligned"
      }
    ]
  },
  "keywordsIntegrated": ["list", "of", "keywords", "successfully", "added"],
  "overallChanges": 15
}

IMPORTANT:
- The optimizedResume must be a complete, properly formatted resume
- Don't change personal information, dates, or company names
- Maintain the exact structure and formatting of the original
- Be specific about what changed in each section`;
    
    return prompt;
  }
  
  /**
   * Extract job requirements
   * @param {Object} jobData - Job information
   * @returns {Object} Structured requirements
   */
  extractJobRequirements(jobData) {
    const requirements = {
      skills: [],
      keywords: [],
      responsibilities: []
    };
    
    // Extract from structured fields
    if (jobData.job_required_skills) {
      requirements.skills = Array.isArray(jobData.job_required_skills) 
        ? jobData.job_required_skills 
        : [];
    }
    
    // Extract from highlights
    if (jobData.job_highlights) {
      if (jobData.job_highlights.Qualifications) {
        requirements.skills.push(...this.extractSkillsFromText(
          jobData.job_highlights.Qualifications.join(' ')
        ));
      }
      if (jobData.job_highlights.Responsibilities) {
        requirements.responsibilities = jobData.job_highlights.Responsibilities;
      }
    }
    
    // Extract keywords from description
    if (jobData.job_description) {
      requirements.keywords = this.extractKeywords(jobData.job_description);
    }
    
    // Deduplicate
    requirements.skills = [...new Set(requirements.skills)];
    requirements.keywords = [...new Set(requirements.keywords)];
    
    return requirements;
  }
  
  /**
   * Build list of skills to add based on analysis
   * @param {Array} requestedSkills - Skills requested to add
   * @param {Object} analysis - Resume analysis
   * @returns {Array} Final skills to add
   */
  buildSkillsToAdd(requestedSkills, analysis) {
    const skillsToAdd = new Set(requestedSkills || []);
    
    // Add top missing critical skills from analysis
    if (analysis.criticalMissing?.skills) {
      analysis.criticalMissing.skills.slice(0, 3).forEach(skill => {
        skillsToAdd.add(skill);
      });
    }
    
    // Limit to reasonable number
    return Array.from(skillsToAdd).slice(0, 5);
  }
  
  /**
   * Validate optimization response
   * @param {Object} response - AI response
   * @param {string} originalResume - Original resume for comparison
   * @returns {Object} Validated optimization
   */
  validateOptimizationResponse(response, originalResume) {
    // Ensure optimized resume exists and is reasonable
    if (!response.optimizedResume || response.optimizedResume.length < originalResume.length * 0.8) {
      throw new AppError('Invalid optimized resume in response', 500);
    }
    
    // Validate changes object
    const changes = response.changes || {};
    const validatedChanges = {
      summary: this.validateSectionChange(changes.summary),
      skills: this.validateSkillsChange(changes.skills),
      experience: this.validateExperienceChanges(changes.experience)
    };
    
    return {
      optimizedResume: response.optimizedResume,
      changes: validatedChanges,
      keywordsIntegrated: Array.isArray(response.keywordsIntegrated) 
        ? response.keywordsIntegrated 
        : [],
      overallChanges: response.overallChanges || 0
    };
  }
  
  /**
   * Validate section change
   * @param {Object} change - Section change object
   * @returns {Object} Validated change
   */
  validateSectionChange(change) {
    if (!change || typeof change !== 'object') {
      return {
        before: '',
        after: '',
        keywordsAdded: []
      };
    }
    
    return {
      before: change.before || '',
      after: change.after || '',
      keywordsAdded: Array.isArray(change.keywordsAdded) 
        ? change.keywordsAdded 
        : []
    };
  }
  
  /**
   * Validate skills change
   * @param {Object} change - Skills change object
   * @returns {Object} Validated change
   */
  validateSkillsChange(change) {
    if (!change || typeof change !== 'object') {
      return {
        added: [],
        removed: [],
        reorganized: false,
        categories: []
      };
    }
    
    return {
      added: Array.isArray(change.added) ? change.added : [],
      removed: Array.isArray(change.removed) ? change.removed : [],
      reorganized: Boolean(change.reorganized),
      categories: Array.isArray(change.categories) ? change.categories : []
    };
  }
  
  /**
   * Validate experience changes
   * @param {Array} changes - Experience changes array
   * @returns {Array} Validated changes
   */
  validateExperienceChanges(changes) {
    if (!Array.isArray(changes)) return [];
    
    return changes.map(change => ({
      position: change.position || 'Unknown Position',
      before: change.before || '',
      after: change.after || '',
      improvementType: change.improvementType || 'general'
    })).slice(0, 10); // Limit to 10 changes
  }
  
  /**
   * Perform quality checks on optimization
   * @param {string} originalResume - Original resume
   * @param {Object} optimization - Optimization results
   * @param {Object} options - Optimization options
   * @param {Object} jobData - Job data
   * @returns {Object} Quality report
   */
  performQualityChecks(originalResume, optimization, options, jobData) {
    const report = {
      passed: true,
      checks: {
        skillsAdded: this.checkSkillsAdded(optimization, options),
        readability: this.checkReadability(originalResume, optimization.optimizedResume),
        keywordDensity: this.checkKeywordDensity(optimization),
        formatPreserved: this.checkFormatPreserved(originalResume, optimization.optimizedResume),
        relevanceImproved: true // Assumed from score improvement
      },
      warnings: []
    };
    
    // Compile warnings
    if (!report.checks.skillsAdded.allAdded) {
      report.warnings.push('Not all requested skills were added');
    }
    
    if (report.checks.keywordDensity.ratio > 3) {
      report.warnings.push('Keyword density may be too high');
    }
    
    if (!report.checks.formatPreserved) {
      report.warnings.push('Resume format may have been altered');
    }
    
    report.passed = report.warnings.length === 0;
    
    return report;
  }
  
  /**
   * Check if requested skills were added
   * @param {Object} optimization - Optimization results
   * @param {Object} options - Options with requested skills
   * @returns {Object} Skills check result
   */
  checkSkillsAdded(optimization, options) {
    const requestedSkills = options.addSkills || [];
    const addedSkills = optimization.changes?.skills?.added || [];
    
    const addedSet = new Set(addedSkills.map(s => s.toLowerCase()));
    const missing = requestedSkills.filter(skill => 
      !addedSet.has(skill.toLowerCase())
    );
    
    return {
      requested: requestedSkills.length,
      added: addedSkills.length,
      missing,
      allAdded: missing.length === 0
    };
  }
  
  /**
   * Check readability metrics
   * @param {string} original - Original text
   * @param {string} optimized - Optimized text
   * @returns {Object} Readability metrics
   */
  checkReadability(original, optimized) {
    // Simple readability checks
    const originalWords = original.split(/\s+/).length;
    const optimizedWords = optimized.split(/\s+/).length;
    
    const lengthChange = ((optimizedWords - originalWords) / originalWords) * 100;
    
    return {
      originalLength: originalWords,
      optimizedLength: optimizedWords,
      lengthChangePercent: Math.round(lengthChange),
      acceptable: Math.abs(lengthChange) < 30 // Within 30% change
    };
  }
  
  /**
   * Check keyword density
   * @param {Object} optimization - Optimization results
   * @returns {Object} Keyword density metrics
   */
  checkKeywordDensity(optimization) {
    const keywords = optimization.keywordsIntegrated || [];
    const resumeLength = optimization.optimizedResume.split(/\s+/).length;
    
    const keywordCount = keywords.length;
    const density = (keywordCount / resumeLength) * 100;
    
    return {
      keywords: keywordCount,
      resumeWords: resumeLength,
      ratio: Math.round(density * 10) / 10,
      acceptable: density < 5 // Less than 5% keyword density
    };
  }
  
  /**
   * Check if format was preserved
   * @param {string} original - Original resume
   * @param {string} optimized - Optimized resume
   * @returns {boolean} Format preserved
   */
  checkFormatPreserved(original, optimized) {
    // Check major structural elements
    const originalLines = original.split('\n').length;
    const optimizedLines = optimized.split('\n').length;
    
    const linesDiff = Math.abs(originalLines - optimizedLines);
    const lineChangePercent = (linesDiff / originalLines) * 100;
    
    // Check section headers remain
    const commonHeaders = ['experience', 'education', 'skills', 'summary'];
    const originalHeaders = commonHeaders.filter(h => 
      original.toLowerCase().includes(h)
    );
    const optimizedHeaders = commonHeaders.filter(h => 
      optimized.toLowerCase().includes(h)
    );
    
    return lineChangePercent < 20 && originalHeaders.length === optimizedHeaders.length;
  }
  
  /**
   * Extract skills from text
   * @param {string} text - Text to analyze
   * @returns {Array<string>} Extracted skills
   */
  extractSkillsFromText(text) {
    if (!text) return [];
    
    const skills = new Set();
    const patterns = [
      /\b(JavaScript|TypeScript|Python|Java|C\+\+|C#|Ruby|Go|Rust)\b/gi,
      /\b(React|Angular|Vue|Node\.js|Express|Django|Flask|Spring)\b/gi,
      /\b(AWS|Azure|GCP|Docker|Kubernetes|Jenkins|Git|CI\/CD)\b/gi,
      /\b(MongoDB|PostgreSQL|MySQL|Redis|SQL|NoSQL)\b/gi
    ];
    
    patterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => skills.add(match));
      }
    });
    
    return Array.from(skills);
  }
  
  /**
   * Extract keywords from text
   * @param {string} text - Text to analyze
   * @returns {Array<string>} Keywords
   */
  extractKeywords(text) {
    if (!text) return [];
    
    const keywords = new Set();
    const patterns = [
      /\b(leadership|team lead|senior|principal|architect)\b/gi,
      /\b(scalable|distributed|microservices|cloud-native)\b/gi,
      /\b(agile|scrum|kanban|sprint)\b/gi,
      /\b(performance|optimization|efficiency|reliability)\b/gi
    ];
    
    patterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => keywords.add(match.toLowerCase()));
      }
    });
    
    return Array.from(keywords);
  }
  
  /**
   * Generate cache key
   * @param {string} resumeText - Resume content
   * @param {Object} jobData - Job data
   * @param {Object} options - Optimization options
   * @returns {string} Cache key
   */
  generateCacheKey(resumeText, jobData, options) {
    const resumeHash = this.hashText(resumeText);
    const jobHash = this.hashText(jobData.job_id + jobData.job_description);
    const optionsHash = this.hashText(JSON.stringify(options));
    return cache.makeKey('optimization', resumeHash, jobHash, optionsHash);
  }
  
  /**
   * Simple text hashing
   * @param {string} text - Text to hash
   * @returns {string} Hash value
   */
  hashText(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
  
  /**
   * Truncate text
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}

// Export singleton instance
module.exports = new ResumeOptimizationService();