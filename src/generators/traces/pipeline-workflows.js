/**
 * Data pipeline trace generators — re-exported from the main workflow module.
 *
 * This module provides a focused entry point for the two data-pipeline workflow
 * generators so that imports, tests, and documentation can reference pipeline
 * traces independently of the other multi-service workflow patterns.
 */

export {
  generatePipelineS3SqsChainedTrace,
  generatePipelineStepFunctionsOrchestratedTrace,
} from "./workflow.js";
