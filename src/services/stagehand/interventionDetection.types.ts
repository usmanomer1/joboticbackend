import { InterventionType } from '../../types/automation.types';

// Stagehand observe result structure
export interface ObserveResult {
  selector: string;
  description: string;
  method?: string;
  arguments?: any[];
}

// Pattern for detecting interventions
export interface InterventionPattern {
  type: InterventionType;
  keywords: string[];
  weight: number;
  contextClues?: string[];
}

// Result of pattern matching
export interface PatternMatch {
  pattern: InterventionPattern;
  matches: string[];
  score: number;
  context?: string;
}

// Page analysis result
export interface PageAnalysis {
  pageContent: string;
  observedElements: ObserveResult[];
  detectedPatterns: PatternMatch[];
  overallConfidence: number;
  suggestedInterventionType?: InterventionType;
}

// Intervention detection result
export interface InterventionResult {
  type: InterventionType;
  confidence: number;
  message: string;
  instructions: string;
  pageContext: {
    url?: string;
    title?: string;
    observedElements: ObserveResult[];
    relevantText?: string[];
  };
  detectedPatterns: PatternMatch[];
}

// Service configuration
export interface InterventionDetectionConfig {
  confidenceThreshold?: number;
  enableMultipleDetection?: boolean;
  customPatterns?: InterventionPattern[];
  verboseLogging?: boolean;
}