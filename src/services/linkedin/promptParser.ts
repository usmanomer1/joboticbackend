import { JobSearchConfig } from '../../types/automation.types';

export class PromptParser {
  /**
   * Parse natural language prompt into structured job search config
   * Uses Gemini to extract filters and parameters
   */
  static async parseSearchPrompt(prompt: string): Promise<JobSearchConfig> {
    try {
      // Use Gemini to extract structured data from natural language
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY!
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Extract job search parameters from this natural language prompt. Return a JSON object with these fields:
              - jobTitle: string (the job title/role)
              - location: string (city, state, or remote)
              - experienceLevel: array of strings (INTERNSHIP, ENTRY_LEVEL, MID_LEVEL, SENIOR_LEVEL, DIRECTOR, EXECUTIVE)
              - jobType: array of strings (FULL_TIME, PART_TIME, CONTRACT, TEMPORARY, INTERNSHIP)
              - remote: boolean
              - datePosted: string (day, week, month)
              - easyApplyOnly: boolean
              - keywords: array of required skills/keywords
              - excludeKeywords: array of keywords to exclude
              - maxApplications: number (default 50)
              - salaryMin: number (optional)
              - salaryMax: number (optional)

              Parse this prompt: "${prompt}"
              
              Examples:
              - "Senior software engineer jobs in San Francisco posted this week" 
              - "Remote React developer positions with easy apply"
              - "Entry level data analyst roles in NYC, $70k+"
              - "Product manager jobs at startups, no FAANG"
              
              Return ONLY valid JSON, no explanation.`
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            topK: 1,
            topP: 1,
            maxOutputTokens: 1024,
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to parse prompt with AI');
      }

      const data = await response.json();
      const textResponse = data.candidates[0].content.parts[0].text;
      
      // Clean and parse JSON response
      const jsonStr = textResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(jsonStr);

      // Map to our config structure
      const config: JobSearchConfig = {
        searchPrompt: prompt, // Keep original prompt
        jobTitle: parsed.jobTitle,
        location: parsed.location,
        experienceLevel: parsed.experienceLevel,
        jobType: parsed.jobType,
        remote: parsed.remote || false,
        easyApplyOnly: parsed.easyApplyOnly || false,
        keywords: parsed.keywords,
        excludeKeywords: parsed.excludeKeywords,
        maxApplications: parsed.maxApplications || 50,
        datePosted: parsed.datePosted,
        salary: (parsed.salaryMin || parsed.salaryMax) ? {
          min: parsed.salaryMin,
          max: parsed.salaryMax
        } : undefined
      };

      return config;
    } catch (error) {
      console.error('Failed to parse prompt:', error);
      
      // Fallback: return prompt as-is
      return {
        searchPrompt: prompt,
        maxApplications: 50
      };
    }
  }

  /**
   * Extract filters from natural language within the prompt
   */
  static extractFiltersFromPrompt(prompt: string): Partial<JobSearchConfig> {
    const filters: Partial<JobSearchConfig> = {};

    // Date posted detection
    if (/today|past 24 hours/i.test(prompt)) {
      filters.datePosted = 'day';
    } else if (/this week|past week|last 7 days/i.test(prompt)) {
      filters.datePosted = 'week';
    } else if (/this month|past month|last 30 days/i.test(prompt)) {
      filters.datePosted = 'month';
    }

    // Remote detection
    if (/remote|work from home|wfh/i.test(prompt)) {
      filters.remote = true;
    }

    // Easy Apply detection
    if (/easy apply|quick apply|one-click/i.test(prompt)) {
      filters.easyApplyOnly = true;
    }

    // Experience level detection
    const experienceLevels = [];
    if (/intern|internship/i.test(prompt)) experienceLevels.push('INTERNSHIP');
    if (/entry level|junior|graduate|new grad/i.test(prompt)) experienceLevels.push('ENTRY_LEVEL');
    if (/mid level|mid-level|intermediate/i.test(prompt)) experienceLevels.push('MID_LEVEL');
    if (/senior|sr\.|lead/i.test(prompt)) experienceLevels.push('SENIOR_LEVEL');
    if (/director|head of/i.test(prompt)) experienceLevels.push('DIRECTOR');
    if (/executive|vp|vice president|c-level|cto|ceo|cfo/i.test(prompt)) experienceLevels.push('EXECUTIVE');
    
    if (experienceLevels.length > 0) {
      filters.experienceLevel = experienceLevels;
    }

    // Job type detection
    const jobTypes = [];
    if (/full time|full-time|ft/i.test(prompt)) jobTypes.push('FULL_TIME');
    if (/part time|part-time|pt/i.test(prompt)) jobTypes.push('PART_TIME');
    if (/contract|contractor|freelance/i.test(prompt)) jobTypes.push('CONTRACT');
    if (/temp|temporary/i.test(prompt)) jobTypes.push('TEMPORARY');
    
    if (jobTypes.length > 0) {
      filters.jobType = jobTypes;
    }

    // Max applications
    const maxMatch = prompt.match(/apply to (\d+)|max (\d+)|up to (\d+)|(\d+) applications/i);
    if (maxMatch) {
      const num = parseInt(maxMatch[1] || maxMatch[2] || maxMatch[3] || maxMatch[4]);
      if (!isNaN(num)) {
        filters.maxApplications = num;
      }
    }

    return filters;
  }
}