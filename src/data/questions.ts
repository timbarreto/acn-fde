import baseQuestions from "./questions.json"
import architectureQuestions from "./questions/architecture.json"
import toolsQuestions from "./questions/tools.json"
import memoryQuestions from "./questions/memory.json"
import evaluationQuestions from "./questions/evaluation.json"
import orchestrationQuestions from "./questions/orchestration.json"
import guardrailQuestions from "./questions/guardrails.json"

const questions = [
  ...baseQuestions,
  ...architectureQuestions,
  ...toolsQuestions,
  ...memoryQuestions,
  ...evaluationQuestions,
  ...orchestrationQuestions,
  ...guardrailQuestions,
]

export default questions
