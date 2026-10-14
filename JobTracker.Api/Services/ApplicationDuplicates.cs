using System.Text;
using System.Text.RegularExpressions;
namespace JobTracker.Api.Services;

public static class ApplicationDuplicates
{
    public const int Threshold = 85;
    public static string Normalize(string? value) => string.Join(" ", Regex.Matches(
        (value ?? "").Normalize(NormalizationForm.FormKC).ToLowerInvariant(), @"[\p{L}\p{N}+#]+")
        .Select(m => m.Value));

    // Multiset word trigrams preserve word order and repeated content. Empty
    // descriptions provide no evidence of a duplicate, even when both are empty.
    public static int? DescriptionSimilarity(string? left, string? right)
    {
        var a = Normalize(left); var b = Normalize(right);
        if (a.Length == 0 || b.Length == 0) return null;
        if (a == b) return 100;
        static Dictionary<string, int> Shingles(string text)
        {
            var words = text.Split(' '); var size = Math.Min(3, words.Length);
            return Enumerable.Range(0, words.Length - size + 1)
                .Select(i => string.Join(" ", words.Skip(i).Take(size)))
                .GroupBy(s => s).ToDictionary(g => g.Key, g => g.Count());
        }
        var first = Shingles(a); var second = Shingles(b);
        var shared = first.Sum(pair => Math.Min(pair.Value, second.GetValueOrDefault(pair.Key)));
        return (int)Math.Floor(200.0 * shared / (first.Values.Sum() + second.Values.Sum()));
    }
}
