namespace JobTracker.Api.Models;

public enum ApplicationStatus
{
    Applied = 0,
    AssessmentPending = 1,
    AssessmentSent = 2,
    InterviewScheduled = 3,
    Offered = 4,
    Rejected = 5,
    OfferAccepted = 6,
    OfferDeclined = 7,
    Withdrawn = 8,
    Archived = 9
}