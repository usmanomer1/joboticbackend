/**
 * Resume analysis service for detailed job-specific evaluation
 * @module services/resumeAnalysis
 */

const geminiClient = require('../utils/geminiClient');
const { AppError } = require('../middleware/errorHandler');
const cache = require('../utils/cache');

// Analysis configuration
const ANALYSIS_CONFIG = {
  CACHE_TTL: 3600, // 1 hour
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  SCORE_SCALE: 10,
  SCORE_WEIGHTS: {
    skills: 0.4,
    experience: 0.3,
    keywords: 0.3
  }
};

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Resume Analysis Service class
 */
class ResumeAnalysisService {
  /**
   * Analyze resume against specific job requirements
   * @param {string} resumeText - Resume content
   * @param {Object} jobData - Job information
   * @returns {Promise<Object>} Detailed analysis results
   */
  async analyzeResume(resumeText, jobData) {
    // Validate inputs
    if (!resumeText || resumeText.trim().length < 50) {
      throw new AppError('Invalid resume content provided', 400);
    }
    
    if (!jobData || !jobData.job_title || !jobData.job_description) {
      throw new AppError('Invalid job data provided', 400);
    }
    
    console.log(`Analyzing resume for job: ${jobData.job_title} at ${jobData.employer_name}`);
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(resumeText, jobData);
      const cachedAnalysis = cache.get(cacheKey);
      
      if (cachedAnalysis) {
        console.log('Returning cached resume analysis');
        return cachedAnalysis;
      }
      
      // Perform AI analysis
      const analysis = await this.performAnalysis(resumeText, jobData);
      
      // Add metadata
      const enrichedAnalysis = {
        ...analysis,
        jobTitle: jobData.job_title,
        employerName: jobData.employer_name,
        analysisDate: new Date().toISOString(),
        improvementPotential: this.calculateImprovementPotential(analysis),
        quickWins: this.identifyQuickWins(analysis),
        majorChanges: this.identifyMajorChanges(analysis)
      };
      
      // Cache results
      cache.set(cacheKey, enrichedAnalysis, ANALYSIS_CONFIG.CACHE_TTL);
      
      return enrichedAnalysis;
    } catch (error) {
      console.error('Resume analysis error:', error);
      throw new AppError('Failed to analyze resume', 500, {
        originalError: error.message
      });
    }
  }
  
  /**
   * Perform AI-powered resume analysis
   * @param {string} resumeText - Resume content
   * @param {Object} jobData - Job information
   * @param {number} retries - Remaining retry attempts
   * @returns {Promise<Object>} Analysis results
   */
  async performAnalysis(resumeText, jobData, retries = ANALYSIS_CONFIG.MAX_RETRIES) {
    try {
      // Extract skills and requirements from job
      const jobRequirements = this.extractJobRequirements(jobData);
      
      // Prepare analysis prompt
      const prompt = this.prepareAnalysisPrompt(resumeText, jobData, jobRequirements);
      
      // Get AI analysis
      const response = await geminiClient.generateJSON(prompt, {
        temperature: 0.3, // Low temperature for consistent analysis
        maxOutputTokens: 4096 // Increased for complex analysis output
      });
      
      // Validate and normalize response
      const validatedAnalysis = this.validateAnalysisResponse(response);
      
      return validatedAnalysis;
    } catch (error) {
      console.error(`Analysis error (${retries} retries left):`, error.message);
      
      if (retries > 0 && !error.message.includes('safety')) {
        // Exponential backoff
        const delay = ANALYSIS_CONFIG.RETRY_DELAY * Math.pow(2, ANALYSIS_CONFIG.MAX_RETRIES - retries);
        await sleep(delay);
        return this.performAnalysis(resumeText, jobData, retries - 1);
      }
      
      throw error;
    }
  }
  
  /**
   * Prepare analysis prompt for AI
   * @param {string} resumeText - Resume content
   * @param {Object} jobData - Job information
   * @param {Object} jobRequirements - Extracted requirements
   * @returns {string} Formatted prompt
   */
  prepareAnalysisPrompt(resumeText, jobData, jobRequirements) {
    const prompt = `Analyze this resume against the job requirements.

Resume:
${this.truncateText(resumeText, 2000)}

Job Title: ${jobData.job_title}
Company: ${jobData.employer_name || 'N/A'}

Job Description:
${this.truncateText(jobData.job_description || '', 1000)}

Required Skills: ${jobRequirements.skills.join(', ') || 'Not specified'}
Required Experience: ${JSON.stringify(jobRequirements.experience)}
Required Education: ${JSON.stringify(jobRequirements.education)}

Provide detailed analysis:
1. Current match score (0-10 scale, can use decimals like 3.5)
2. Missing critical elements
3. Improvement potential

Return ONLY valid JSON:
{
  "currentScore": 3.5,
  "maxPossibleScore": 10,
  "scoreBreakdown": {
    "skills": { 
      "score": 2, 
      "max": 4, 
      "missing": ["AWS", "Docker"],
      "present": ["Python", "JavaScript"]
    },
    "experience": { 
      "score": 1, 
      "max": 3, 
      "gaps": ["No cloud experience", "Limited team leadership"],
      "strengths": ["5 years software development"]
    },
    "keywords": { 
      "score": 0.5, 
      "max": 3, 
      "missing": ["scalable", "agile", "team lead"],
      "present": ["development", "software"]
    }
  },
  "criticalMissing": {
    "skills": ["AWS", "Docker", "Kubernetes"],
    "keywords": ["team leadership", "agile methodology"],
    "experience": ["Cloud deployment experience", "Managing distributed teams"]
  },
  "improvements": {
    "immediate": "Add AWS and Docker to skills section with specific project examples",
    "summary": "Rewrite summary to emphasize technical leadership and cloud experience",
    "experience": "Quantify achievements with metrics (e.g., 'Improved performance by 40%')",
    "skills": "Group skills by category and highlight job-relevant ones first",
    "keywords": "Incorporate missing keywords naturally throughout resume"
  },
  "estimatedImprovement": 2.5,
  "matchPercentage": 35
}

IMPORTANT: 
- Be realistic with scores (most resumes score 2-6 out of 10)
- Identify specific, actionable improvements
- Focus on what's actually missing from the job requirements
- estimatedImprovement should be realistic (usually 1-3 points)`;
    
    return prompt;
  }
  
  /**
   * Extract requirements from job data
   * @param {Object} jobData - Job information
   * @returns {Object} Structured requirements
   */
  extractJobRequirements(jobData) {
    const requirements = {
      skills: [],
      experience: {},
      education: {},
      keywords: []
    };
    
    // Extract from structured fields
    if (jobData.job_required_skills) {
      requirements.skills = Array.isArray(jobData.job_required_skills) 
        ? jobData.job_required_skills 
        : [];
    }
    
    if (jobData.job_required_experience) {
      requirements.experience = jobData.job_required_experience;
    }
    
    if (jobData.job_required_education) {
      requirements.education = jobData.job_required_education;
    }
    
    // Extract from highlights if available
    if (jobData.job_highlights) {
      if (jobData.job_highlights.Qualifications) {
        const qualText = jobData.job_highlights.Qualifications.join(' ');
        requirements.skills.push(...this.extractSkillsFromText(qualText));
      }
    }
    
    // Extract keywords from description
    if (jobData.job_description) {
      requirements.keywords = this.extractKeywords(jobData.job_description);
    }
    
    // Extract from extracted_requirements if available
    if (jobData.extracted_requirements) {
      if (jobData.extracted_requirements.skills) {
        requirements.skills.push(...jobData.extracted_requirements.skills);
      }
    }
    
    // Deduplicate skills
    requirements.skills = [...new Set(requirements.skills)];
    
    return requirements;
  }
  
  /**
   * Validate and normalize AI analysis response
   * @param {Object} response - AI response
   * @returns {Object} Validated analysis
   */
  validateAnalysisResponse(response) {
    // Ensure required fields exist
    const validated = {
      currentScore: this.validateScore(response.currentScore, 0, 10),
      maxPossibleScore: response.maxPossibleScore || 10,
      scoreBreakdown: this.validateScoreBreakdown(response.scoreBreakdown),
      criticalMissing: this.validateCriticalMissing(response.criticalMissing),
      improvements: this.validateImprovements(response.improvements),
      estimatedImprovement: this.validateScore(response.estimatedImprovement, 0, 5),
      matchPercentage: this.validateScore(response.matchPercentage, 0, 100)
    };
    
    // Calculate overall improvement percentage
    validated.improvementPercentage = Math.round(
      (validated.estimatedImprovement / (10 - validated.currentScore)) * 100
    );
    
    return validated;
  }
  
  /**
   * Validate score breakdown section
   * @param {Object} breakdown - Score breakdown object
   * @returns {Object} Validated breakdown
   */
  validateScoreBreakdown(breakdown) {
    if (!breakdown || typeof breakdown !== 'object') {
      return this.getDefaultScoreBreakdown();
    }
    
    const categories = ['skills', 'experience', 'keywords'];
    const validated = {};
    
    for (const category of categories) {
      if (breakdown[category] && typeof breakdown[category] === 'object') {
        validated[category] = {
          score: this.validateScore(breakdown[category].score, 0, 4),
          max: breakdown[category].max || 4,
          missing: Array.isArray(breakdown[category].missing) ? breakdown[category].missing : [],
          present: Array.isArray(breakdown[category].present) ? breakdown[category].present : [],
          gaps: breakdown[category].gaps || [],
          strengths: breakdown[category].strengths || []
        };
      } else {
        validated[category] = this.getDefaultCategoryScore();
      }
    }
    
    return validated;
  }
  
  /**
   * Validate critical missing section
   * @param {Object} missing - Critical missing items
   * @returns {Object} Validated missing items
   */
  validateCriticalMissing(missing) {
    if (!missing || typeof missing !== 'object') {
      return {
        skills: [],
        keywords: [],
        experience: []
      };
    }
    
    return {
      skills: Array.isArray(missing.skills) ? missing.skills.slice(0, 10) : [],
      keywords: Array.isArray(missing.keywords) ? missing.keywords.slice(0, 10) : [],
      experience: Array.isArray(missing.experience) ? missing.experience.slice(0, 5) : []
    };
  }
  
  /**
   * Validate improvements section
   * @param {Object} improvements - Improvement suggestions
   * @returns {Object} Validated improvements
   */
  validateImprovements(improvements) {
    if (!improvements || typeof improvements !== 'object') {
      return this.getDefaultImprovements();
    }
    
    return {
      immediate: improvements.immediate || 'Update skills section with relevant technologies',
      summary: improvements.summary || 'Revise summary to better match job requirements',
      experience: improvements.experience || 'Add quantifiable achievements to experience',
      skills: improvements.skills || 'Reorganize skills to highlight job-relevant ones',
      keywords: improvements.keywords || 'Incorporate industry keywords throughout resume'
    };
  }
  
  /**
   * Calculate improvement potential
   * @param {Object} analysis - Analysis results
   * @returns {Object} Improvement potential details
   */
  calculateImprovementPotential(analysis) {
    const currentScore = analysis.currentScore || 0;
    const estimatedImprovement = analysis.estimatedImprovement || 0;
    const potentialScore = Math.min(currentScore + estimatedImprovement, 10);
    
    return {
      currentScore,
      potentialScore,
      improvement: estimatedImprovement,
      improvementPercentage: Math.round((estimatedImprovement / (10 - currentScore)) * 100),
      achievability: this.calculateAchievability(analysis)
    };
  }
  
  /**
   * Calculate how achievable the improvements are
   * @param {Object} analysis - Analysis results
   * @returns {string} Achievability level
   */
  calculateAchievability(analysis) {
    const missingSkillsCount = analysis.criticalMissing?.skills?.length || 0;
    const missingExperienceCount = analysis.criticalMissing?.experience?.length || 0;
    
    if (missingSkillsCount <= 2 && missingExperienceCount <= 1) {
      return 'HIGH';
    } else if (missingSkillsCount <= 4 && missingExperienceCount <= 2) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }
  
  /**
   * Identify quick wins from analysis
   * @param {Object} analysis - Analysis results
   * @returns {Array} Quick win improvements
   */
  identifyQuickWins(analysis) {
    const quickWins = [];
    
    // Keywords are usually quick to add
    if (analysis.criticalMissing?.keywords?.length > 0) {
      quickWins.push({
        type: 'keywords',
        action: 'Add missing keywords to resume',
        impact: 'HIGH',
        effort: 'LOW',
        details: `Incorporate: ${analysis.criticalMissing.keywords.slice(0, 3).join(', ')}`
      });
    }
    
    // Skills section updates
    if (analysis.criticalMissing?.skills?.length > 0) {
      const learnable = analysis.criticalMissing.skills.slice(0, 2);
      quickWins.push({
        type: 'skills',
        action: 'Update skills section',
        impact: 'HIGH',
        effort: 'MEDIUM',
        details: `Add or emphasize: ${learnable.join(', ')}`
      });
    }
    
    // Summary optimization
    if (analysis.improvements?.summary) {
      quickWins.push({
        type: 'summary',
        action: 'Revise professional summary',
        impact: 'MEDIUM',
        effort: 'LOW',
        details: analysis.improvements.summary
      });
    }
    
    return quickWins;
  }
  
  /**
   * Identify major changes needed
   * @param {Object} analysis - Analysis results
   * @returns {Array} Major change recommendations
   */
  identifyMajorChanges(analysis) {
    const majorChanges = [];
    
    // Experience gaps
    if (analysis.criticalMissing?.experience?.length > 0) {
      majorChanges.push({
        type: 'experience',
        action: 'Gain relevant experience',
        impact: 'HIGH',
        effort: 'HIGH',
        timeline: 'LONG_TERM',
        details: analysis.criticalMissing.experience.join('; ')
      });
    }
    
    // Major skill gaps
    const majorSkillGaps = (analysis.criticalMissing?.skills || [])
      .filter(skill => this.isMajorSkill(skill));
    
    if (majorSkillGaps.length > 0) {
      majorChanges.push({
        type: 'skills',
        action: 'Develop critical skills',
        impact: 'HIGH',
        effort: 'HIGH',
        timeline: 'MEDIUM_TERM',
        details: `Learn: ${majorSkillGaps.join(', ')}`
      });
    }
    
    return majorChanges;
  }
  
  /**
   * Extract skills from text
   * @param {string} text - Text to analyze
   * @returns {Array<string>} Extracted skills
   */
  extractSkillsFromText(text) {
    if (!text) return [];
    
    const skills = new Set();
    const skillPatterns = [
      /\b(JavaScript|TypeScript|Python|Java|C\+\+|C#|Ruby|Go|Rust|Swift|Kotlin|PHP|Scala|R|MATLAB)\b/gi,
      /\b(React|Angular|Vue|Node\.js|Express|Django|Flask|Spring|Rails|Laravel|\.NET|FastAPI)\b/gi,
      /\b(AWS|Azure|GCP|Docker|Kubernetes|Jenkins|Git|CI\/CD|DevOps|Terraform|Ansible)\b/gi,
      /\b(MongoDB|PostgreSQL|MySQL|Redis|Elasticsearch|DynamoDB|SQL|NoSQL|Oracle|Cassandra)\b/gi,
      /\b(Machine Learning|Deep Learning|NLP|Computer Vision|TensorFlow|PyTorch|Scikit-learn)\b/gi
    ];
    
    skillPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => skills.add(match));
      }
    });
    
    return Array.from(skills);
  }
  
  /**
   * Extract important keywords from job description
   * @param {string} text - Job description text
   * @returns {Array<string>} Important keywords
   */
  extractKeywords(text) {
    if (!text) return [];
    
    const keywords = new Set();
    const keywordPatterns = [
      /\b(leadership|team lead|manager|senior|principal|architect)\b/gi,
      /\b(scalable|distributed|microservices|cloud-native|serverless)\b/gi,
      /\b(agile|scrum|kanban|sprint|backlog|user story)\b/gi,
      /\b(performance|optimization|efficiency|reliability|availability)\b/gi,
      /\b(innovation|problem-solving|analytical|strategic|collaborative)\b/gi
    ];
    
    keywordPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => keywords.add(match.toLowerCase()));
      }
    });
    
    return Array.from(keywords);
  }
  
  /**
   * Check if a skill is major/critical
   * @param {string} skill - Skill name
   * @returns {boolean} Is major skill
   */
  isMajorSkill(skill) {
    const majorSkills = [
      'aws', 'azure', 'gcp', 'kubernetes', 'docker',
      'machine learning', 'ai', 'data science',
      'system design', 'architecture', 'security'
    ];
    
    return majorSkills.some(major => 
      skill.toLowerCase().includes(major)
    );
  }
  
  /**
   * Generate cache key for analysis
   * @param {string} resumeText - Resume content
   * @param {Object} jobData - Job data
   * @returns {string} Cache key
   */
  generateCacheKey(resumeText, jobData) {
    const resumeHash = this.hashText(resumeText);
    const jobHash = this.hashText(jobData.job_id + jobData.job_description);
    return cache.makeKey('analysis', resumeHash, jobHash);
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
   * Truncate text to length
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
  
  /**
   * Validate score value
   * @param {*} score - Score to validate
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number} Valid score
   */
  validateScore(score, min, max) {
    const numScore = Number(score);
    if (isNaN(numScore)) return min;
    return Math.max(min, Math.min(max, numScore));
  }
  
  /**
   * Get default score breakdown
   * @returns {Object} Default breakdown
   */
  getDefaultScoreBreakdown() {
    return {
      skills: this.getDefaultCategoryScore(),
      experience: this.getDefaultCategoryScore(),
      keywords: this.getDefaultCategoryScore()
    };
  }
  
  /**
   * Get default category score
   * @returns {Object} Default category
   */
  getDefaultCategoryScore() {
    return {
      score: 0,
      max: 4,
      missing: [],
      present: [],
      gaps: [],
      strengths: []
    };
  }
  
  /**
   * Get default improvements
   * @returns {Object} Default improvements
   */
  getDefaultImprovements() {
    return {
      immediate: 'Update resume to better match job requirements',
      summary: 'Revise professional summary',
      experience: 'Add quantifiable achievements',
      skills: 'Update skills section',
      keywords: 'Add relevant keywords'
    };
  }
}

// Export singleton instance
module.exports = new ResumeAnalysisService();