import { Stagehand } from '@browserbase/stagehand';
import { InterventionType } from '../../types/automation.types';
import {
  InterventionPattern,
  PatternMatch,
  PageAnalysis,
  InterventionResult,
  InterventionDetectionConfig,
  ObserveResult
} from './interventionDetection.types';

export class InterventionDetectionService {
  private patterns: InterventionPattern[];
  private config: InterventionDetectionConfig;

  constructor(config?: InterventionDetectionConfig) {
    this.config = {
      confidenceThreshold: 0.7,
      enableMultipleDetection: false,
      verboseLogging: false,
      ...config
    };

    // Initialize default intervention patterns
    this.patterns = [
      // LOGIN patterns
      {
        type: InterventionType.LOGIN,
        keywords: ['sign in', 'log in', 'login', 'email and password', 'username', 'password'],
        weight: 0.9,
        contextClues: ['forgot password', 'remember me', 'stay signed in', 'create account']
      },
      // CAPTCHA patterns
      {
        type: InterventionType.CAPTCHA,
        keywords: ['captcha', 'security check', "verify you're human", 'select all images', 'recaptcha', 'hcaptcha'],
        weight: 0.95,
        contextClues: ['i am not a robot', 'prove you are human', 'security verification']
      },
      // TWO_FA patterns
      {
        type: InterventionType.TWO_FA,
        keywords: ['two-factor', '2fa', 'verification code', 'enter code', 'authenticate', 'authenticator'],
        weight: 0.9,
        contextClues: ['6 digit code', 'sent to your phone', 'check your email', 'authentication code']
      },
      // BLOCKED patterns
      {
        type: InterventionType.BLOCKED,
        keywords: ['unusual activity', 'account restricted', 'suspended', 'blocked', 'banned', 'violation'],
        weight: 0.85,
        contextClues: ['terms of service', 'community guidelines', 'appeal', 'contact support']
      },
      // RATE_LIMIT patterns
      {
        type: InterventionType.RATE_LIMIT,
        keywords: ['too many requests', 'try again later', 'rate limit', 'slow down', 'exceeded limit'],
        weight: 0.8,
        contextClues: ['please wait', 'retry after', 'limit reached', 'cooldown period']
      },
      ...(this.config.customPatterns || [])
    ];
  }

  /**
   * Main detection method using Stagehand's observe()
   */
  async detectIntervention(stagehand: Stagehand): Promise<InterventionResult | null> {
    try {
      // Get current page info
      const page = stagehand.page;
      const currentUrl = page.url();
      const pageTitle = await page.title();

      // Use observe to get all interactive elements on the page
      const observations = await page.observe({
        instruction: "Find all interactive elements, forms, messages, alerts, and any text that indicates user action is required",
        returnAction: true
      });

      // Also observe for specific intervention indicators
      const interventionObservations = await page.observe({
        instruction: "Find any login forms, captcha elements, verification code inputs, error messages, or security warnings",
        returnAction: true
      });

      // Combine observations
      const allObservations = [...observations, ...interventionObservations];

      // Extract text content for analysis
      const observationText = allObservations
        .map(obs => obs.description)
        .join(' ')
        .toLowerCase();

      // Analyze the page state
      const analysis = this.analyzePageState(observationText, allObservations);

      // Check for each intervention type
      const detectionResults = await Promise.all([
        this.checkForLogin(observationText, allObservations),
        this.checkForCaptcha(observationText, allObservations),
        this.checkFor2FA(observationText, allObservations),
        this.checkForBlock(observationText, allObservations),
        this.checkForRateLimit(observationText, allObservations)
      ]);

      // Find the highest confidence intervention
      let bestResult: InterventionResult | null = null;
      let highestConfidence = 0;

      for (const [index, detected] of detectionResults.entries()) {
        if (detected && detected.confidence > highestConfidence && detected.confidence >= this.config.confidenceThreshold) {
          const interventionType = [
            InterventionType.LOGIN,
            InterventionType.CAPTCHA,
            InterventionType.TWO_FA,
            InterventionType.BLOCKED,
            InterventionType.RATE_LIMIT
          ][index];

          highestConfidence = detected.confidence;
          bestResult = {
            type: interventionType,
            confidence: detected.confidence,
            message: this.getInterventionMessage(interventionType),
            instructions: this.getInterventionInstructions(interventionType),
            pageContext: {
              url: currentUrl,
              title: pageTitle,
              observedElements: allObservations,
              relevantText: detected.relevantText
            },
            detectedPatterns: analysis.detectedPatterns
          };
        }
      }

      if (this.config.verboseLogging && bestResult) {
        console.log('Intervention detected:', {
          type: bestResult.type,
          confidence: bestResult.confidence,
          url: currentUrl
        });
      }

      return bestResult;
    } catch (error) {
      console.error('Error detecting intervention:', error);
      return null;
    }
  }

  /**
   * Check for login page
   */
  async checkForLogin(pageObservation: string, elements: ObserveResult[]): Promise<{ confidence: number; relevantText: string[] } | null> {
    const loginPattern = this.patterns.find(p => p.type === InterventionType.LOGIN)!;
    const matches = this.findPatternMatches(pageObservation, loginPattern);
    
    // Look for login-specific elements
    const loginElements = elements.filter(el => {
      const desc = el.description.toLowerCase();
      return loginPattern.keywords.some(keyword => desc.includes(keyword)) ||
             (el.method === 'fill' && desc.includes('password')) ||
             (el.method === 'fill' && desc.includes('email')) ||
             (el.method === 'click' && desc.includes('sign in'));
    });

    if (matches.length > 0 || loginElements.length >= 2) {
      const confidence = this.calculateConfidence([
        { pattern: loginPattern, matches: matches, score: matches.length * loginPattern.weight }
      ], loginElements.length);

      return {
        confidence,
        relevantText: [...matches, ...loginElements.map(el => el.description)]
      };
    }

    return null;
  }

  /**
   * Check for CAPTCHA
   */
  async checkForCaptcha(pageObservation: string, elements: ObserveResult[]): Promise<{ confidence: number; relevantText: string[] } | null> {
    const captchaPattern = this.patterns.find(p => p.type === InterventionType.CAPTCHA)!;
    const matches = this.findPatternMatches(pageObservation, captchaPattern);
    
    // Look for captcha-specific elements
    const captchaElements = elements.filter(el => {
      const desc = el.description.toLowerCase();
      return captchaPattern.keywords.some(keyword => desc.includes(keyword)) ||
             desc.includes('iframe') && desc.includes('recaptcha') ||
             el.method === 'click' && desc.includes('checkbox') && desc.includes('robot');
    });

    if (matches.length > 0 || captchaElements.length > 0) {
      const confidence = this.calculateConfidence([
        { pattern: captchaPattern, matches: matches, score: matches.length * captchaPattern.weight }
      ], captchaElements.length);

      return {
        confidence: Math.min(confidence * 1.1, 1), // Boost confidence for CAPTCHA
        relevantText: [...matches, ...captchaElements.map(el => el.description)]
      };
    }

    return null;
  }

  /**
   * Check for 2FA
   */
  async checkFor2FA(pageObservation: string, elements: ObserveResult[]): Promise<{ confidence: number; relevantText: string[] } | null> {
    const tfaPattern = this.patterns.find(p => p.type === InterventionType.TWO_FA)!;
    const matches = this.findPatternMatches(pageObservation, tfaPattern);
    
    // Look for 2FA-specific elements
    const tfaElements = elements.filter(el => {
      const desc = el.description.toLowerCase();
      return tfaPattern.keywords.some(keyword => desc.includes(keyword)) ||
             (el.method === 'fill' && desc.includes('code')) ||
             (el.method === 'fill' && desc.includes('digit'));
    });

    if (matches.length > 0 || tfaElements.length > 0) {
      const confidence = this.calculateConfidence([
        { pattern: tfaPattern, matches: matches, score: matches.length * tfaPattern.weight }
      ], tfaElements.length);

      return {
        confidence,
        relevantText: [...matches, ...tfaElements.map(el => el.description)]
      };
    }

    return null;
  }

  /**
   * Check for account block
   */
  async checkForBlock(pageObservation: string, elements: ObserveResult[]): Promise<{ confidence: number; relevantText: string[] } | null> {
    const blockPattern = this.patterns.find(p => p.type === InterventionType.BLOCKED)!;
    const matches = this.findPatternMatches(pageObservation, blockPattern);
    
    // Look for block-specific elements
    const blockElements = elements.filter(el => {
      const desc = el.description.toLowerCase();
      return blockPattern.keywords.some(keyword => desc.includes(keyword)) ||
             desc.includes('error') && desc.includes('account');
    });

    if (matches.length > 0) {
      const confidence = this.calculateConfidence([
        { pattern: blockPattern, matches: matches, score: matches.length * blockPattern.weight }
      ], blockElements.length);

      return {
        confidence,
        relevantText: [...matches, ...blockElements.map(el => el.description)]
      };
    }

    return null;
  }

  /**
   * Check for rate limiting
   */
  async checkForRateLimit(pageObservation: string, elements: ObserveResult[]): Promise<{ confidence: number; relevantText: string[] } | null> {
    const rateLimitPattern = this.patterns.find(p => p.type === InterventionType.RATE_LIMIT)!;
    const matches = this.findPatternMatches(pageObservation, rateLimitPattern);
    
    // Look for rate limit-specific elements
    const rateLimitElements = elements.filter(el => {
      const desc = el.description.toLowerCase();
      return rateLimitPattern.keywords.some(keyword => desc.includes(keyword)) ||
             desc.includes('wait') && desc.includes('try');
    });

    if (matches.length > 0) {
      const confidence = this.calculateConfidence([
        { pattern: rateLimitPattern, matches: matches, score: matches.length * rateLimitPattern.weight }
      ], rateLimitElements.length);

      return {
        confidence,
        relevantText: [...matches, ...rateLimitElements.map(el => el.description)]
      };
    }

    return null;
  }

  /**
   * Analyze page state from observations
   */
  private analyzePageState(observation: string, elements: ObserveResult[]): PageAnalysis {
    const detectedPatterns: PatternMatch[] = [];

    for (const pattern of this.patterns) {
      const matches = this.findPatternMatches(observation, pattern);
      if (matches.length > 0) {
        detectedPatterns.push({
          pattern,
          matches,
          score: matches.length * pattern.weight
        });
      }
    }

    const overallConfidence = this.calculateConfidence(detectedPatterns, elements.length);
    const suggestedType = detectedPatterns.length > 0
      ? detectedPatterns.sort((a, b) => b.score - a.score)[0].pattern.type
      : undefined;

    return {
      pageContent: observation,
      observedElements: elements,
      detectedPatterns,
      overallConfidence,
      suggestedInterventionType: suggestedType
    };
  }

  /**
   * Find pattern matches in text
   */
  private findPatternMatches(text: string, pattern: InterventionPattern): string[] {
    const matches: string[] = [];
    const lowerText = text.toLowerCase();

    for (const keyword of pattern.keywords) {
      if (lowerText.includes(keyword)) {
        matches.push(keyword);
      }
    }

    // Check context clues for additional confidence
    if (pattern.contextClues) {
      for (const clue of pattern.contextClues) {
        if (lowerText.includes(clue)) {
          matches.push(`context: ${clue}`);
        }
      }
    }

    return matches;
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(matches: PatternMatch[], elementCount: number): number {
    if (matches.length === 0) return 0;

    // Base confidence from pattern matches
    const totalScore = matches.reduce((sum, match) => sum + match.score, 0);
    const avgScore = totalScore / matches.length;

    // Boost confidence based on element count
    const elementBoost = Math.min(elementCount * 0.05, 0.2);

    // Calculate final confidence
    const confidence = Math.min(avgScore + elementBoost, 1);

    return Number(confidence.toFixed(2));
  }

  /**
   * Get user-friendly intervention message
   */
  getInterventionMessage(type: InterventionType): string {
    const messages: Record<InterventionType, string> = {
      [InterventionType.LOGIN]: 'LinkedIn login required',
      [InterventionType.CAPTCHA]: 'CAPTCHA verification needed',
      [InterventionType.TWO_FA]: 'Two-factor authentication required',
      [InterventionType.BLOCKED]: 'Account access restricted',
      [InterventionType.RATE_LIMIT]: 'Rate limit detected - please wait'
    };

    return messages[type] || 'Manual intervention required';
  }

  /**
   * Get detailed instructions for user
   */
  getInterventionInstructions(type: InterventionType): string {
    const instructions: Record<InterventionType, string> = {
      [InterventionType.LOGIN]: 
        'Please log in to your LinkedIn account to continue the automation. Enter your email/username and password, then click Sign In.',
      [InterventionType.CAPTCHA]: 
        'Please complete the CAPTCHA verification. This may involve selecting images, solving a puzzle, or checking a box to prove you\'re human.',
      [InterventionType.TWO_FA]: 
        'Enter the verification code from your authenticator app or the code sent to your email/phone. This is required for account security.',
      [InterventionType.BLOCKED]: 
        'Your account appears to be restricted. Please check for any security notifications from LinkedIn and follow their instructions to restore access.',
      [InterventionType.RATE_LIMIT]: 
        'LinkedIn has temporarily limited your activity. Please wait a few minutes before continuing. This is normal when performing many actions quickly.'
    };

    return instructions[type] || 'Please complete the required action on the page to continue.';
  }

  /**
   * Add custom pattern
   */
  addCustomPattern(pattern: InterventionPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<InterventionDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}