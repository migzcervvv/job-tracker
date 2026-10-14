# Applications, account settings, and the skill library

## Connection checks

Production browser requests use `/api` on the Netlify origin, which forwards to the HTTPS MonsterASP API. The routing file must be included in the frontend deployment. Local development still uses `client/.env.local` and the selected running Visual Studio profile. See [operations](operations.md) for the exact ports and deployment checks.

Account details and reminder preferences load independently. An unavailable section reports its error and provides Retry without hiding the section that loaded. Application load and save errors also expose expandable connection details.

## Duplicate applications

Creating an application checks only the current account's records. Company and job title must match after Unicode, case, punctuation, and whitespace normalization. Descriptions are compared using multiset word trigrams and a Dice overlap percentage; the score is rounded down. This is text overlap, not an AI judgment or a probability.

A description match of at least **85%** triggers a review containing links to the existing applications and their percentages. Empty descriptions cannot establish a duplicate. Different company/title values or scores below the threshold do not block saving. Users can explicitly select **Save as a separate application** for a genuine reapplication or a different opening. Editing a field clears the previous warning; saving checks the new content again.

The API enforces this check on creation, before starting automation. It preserves request-ID idempotency and uses a serializable transaction on PostgreSQL to prevent simultaneous duplicate checks from both saving unnoticed. A serialization conflict may require retrying the save. The feature uses existing tables and requires no new migration.

## Shared skill library

Administration → Skill library shows where each skill appears, how often postings call it required/preferred/nice to have, role examples, description excerpts, and skills used in the same postings. These summaries cover all accounts and remain administrator-only. Excerpts are bounded plain text from existing postings, not generated definitions.

Possible name variants are lexical suggestions, not equivalence decisions. Select two checkboxes or choose a suggested pair to populate the merge review. Search fields also support choosing entries from different pages. The review names the entry to remove and the name to keep, with a swap control. The final merge affects all accounts, transfers associations, and retains the higher importance, proficiency, and evidence strength. Related technologies and different versions should remain separate when they represent different skills.
