using JobTracker.Api.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace JobTracker.Api.Tests
{
    public class FitScorerTests
    {
        [Theory]
        [InlineData(new[] { 3, 3 }, new[] { true, true }, 100)]
        [InlineData(new[] { 3, 3 }, new[] { true, false }, 50)]
        [InlineData(new[] { 3, 1 }, new[] { true, false }, 75)]
        [InlineData(new[] { 3, 1 }, new[] { false, true }, 25)]
        public void WeightsSkillMatchByImportance(int[] importances, bool[] hasSkill, int expected)
        {
            var totalWeight = importances.Sum();
            var matchedWeight = importances.Where((_, i) => hasSkill[i]).Sum();
            Assert.Equal(expected, (int)Math.Round(100.0 * matchedWeight / totalWeight));
        }

        [Fact]
        public void IdenticalVectorsScoreOne()
        {
            var v = new float[] { 0.1f, 0.5f, 0.3f };
            Assert.Equal(1.0, FitScorer.CosineSimilarity(v, v), 5);
        }

        [Fact]
        public void OrthogonalVectorsScoreZero()
        {
            Assert.Equal(0.0, FitScorer.CosineSimilarity(new float[] { 1, 0 }, new float[] { 0, 1 }), 5);
        }
    }
}
