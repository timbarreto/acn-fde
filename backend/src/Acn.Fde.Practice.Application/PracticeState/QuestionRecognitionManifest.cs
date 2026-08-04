using System.Reflection;
using System.Text.Json;

namespace Acn.Fde.Practice.Application.PracticeState;

internal sealed class QuestionRecognitionManifest
{
    private static readonly Lazy<QuestionRecognitionManifest> _current = new(Load);
    private readonly IReadOnlyDictionary<string, RecognizedQuestion> _questions;

    private QuestionRecognitionManifest(IEnumerable<RecognizedQuestion> questions)
    {
        _questions = questions.ToDictionary(question => question.Id, StringComparer.Ordinal);
    }

    public static QuestionRecognitionManifest Current => _current.Value;

    public bool ContainsQuestion(string questionId) => _questions.ContainsKey(questionId);

    public bool ContainsOption(string questionId, string optionId)
        => _questions.TryGetValue(questionId, out var question)
            && question.OptionIds.Contains(optionId, StringComparer.Ordinal);

    public bool IsValidAnswer(string questionId, IReadOnlyCollection<string>? optionIds)
    {
        if (!_questions.TryGetValue(questionId, out var question)
            || optionIds is null
            || optionIds.Count == 0
            || optionIds.Count > (question.Type == "single" ? 1 : question.OptionIds.Count)
            || optionIds.Distinct(StringComparer.Ordinal).Count() != optionIds.Count)
        {
            return false;
        }

        return optionIds.All(optionId => optionId.Length <= 32
            && question.OptionIds.Contains(optionId, StringComparer.Ordinal));
    }

    private static QuestionRecognitionManifest Load()
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("QuestionRecognitionManifest")
            ?? throw new InvalidOperationException("The question recognition manifest is unavailable.");
        var document = JsonSerializer.Deserialize<ManifestDocument>(stream, JsonDefaults.SerializerOptions)
            ?? throw new InvalidDataException("The question recognition manifest is malformed.");
        return document.SchemaVersion == 1
            ? new QuestionRecognitionManifest(document.Questions)
            : throw new InvalidDataException("The question recognition manifest version is unsupported.");
    }

    private sealed class ManifestDocument
    {
        public int SchemaVersion { get; set; }
        public List<RecognizedQuestion> Questions { get; set; } = [];
    }

    private sealed class RecognizedQuestion
    {
        public string Id { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public List<string> OptionIds { get; set; } = [];
    }
}
