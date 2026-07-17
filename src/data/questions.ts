import baseQuestions from "./questions.json"
import architectureQuestions from "./questions/architecture.json"
import toolsQuestions from "./questions/tools.json"
import memoryQuestions from "./questions/memory.json"
import evaluationQuestions from "./questions/evaluation.json"
import orchestrationQuestions from "./questions/orchestration.json"
import guardrailQuestions from "./questions/guardrails.json"

export default [
  ...baseQuestions,
  ...architectureQuestions,
  ...toolsQuestions,
  ...memoryQuestions,
  ...evaluationQuestions,
  ...orchestrationQuestions,
  ...guardrailQuestions,
]
