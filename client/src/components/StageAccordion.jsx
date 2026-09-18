import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { STATUS, statusMeta } from "../api/statusMeta.js";
import { STAGE_FIELDS } from "../api/stageFields.js";
import { relativeTime } from "../api/dates.js";
import { StageDetailForm } from "./StageDetailForm.jsx";

const AI_QUESTIONS_MARKER = "--- Suggested questions ---";

function parseFields(fieldsJson) {
  try {
    return JSON.parse(fieldsJson) ?? {};
  } catch {
    return {};
  }
}

// Splits prepNotes into whatever the user typed themselves and whatever
// n8n appended. InternalController writes the marker verbatim every time
// it appends a fresh batch, so a round asked for twice still separates
// cleanly into two AI blocks.
function splitPrepNotes(prepNotes) {
  if (!prepNotes) return { userNotes: "", aiBlocks: [] };
  const parts = prepNotes.split(AI_QUESTIONS_MARKER);
  const userNotes = parts[0].trim();
  const aiBlocks = parts
    .slice(1)
    .map((b) => b.trim())
    .filter(Boolean);
  return { userNotes, aiBlocks };
}

// Best-effort grouping of the LLM's free-text output into category
// headers + questions. The prompt asks for short headers followed by
// one question per line, but nothing enforces that shape server-side,
// so this stays lenient rather than assuming exact formatting.
function parseQuestionBlock(block) {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const groups = [];
  let current = null;

  for (const line of lines) {
    const looksLikeHeader =
      !/\?\s*$/.test(line) && line.length <= 40 && !/^[-*•\d]/.test(line);
    if (looksLikeHeader) {
      current = { header: line.replace(/:$/, ""), questions: [] };
      groups.push(current);
      continue;
    }
    const cleaned = line.replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "");
    if (!current) {
      current = { header: "Questions", questions: [] };
      groups.push(current);
    }
    current.questions.push(cleaned);
  }

  return groups;
}

function FieldValueDisplay({ field, value }) {
  const isEmpty =
    value === undefined || value === null || value === "" || value === false;
  if (isEmpty) return <span className="field-value-empty">—</span>;

  if (field.type === "url") {
    return (
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        className="field-value-link"
      >
        {value}
      </a>
    );
  }
  if (field.type === "date") {
    return (
      <span>
        {new Date(value).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </span>
    );
  }
  if (field.type === "datetime-local") {
    return (
      <span>
        {new Date(value).toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </span>
    );
  }
  if (field.type === "checkbox") {
    return <span className="field-value-pill">{value ? "Yes" : "No"}</span>;
  }
  if (field.type === "textarea") {
    return <p className="field-value-text">{value}</p>;
  }
  return <span>{String(value)}</span>;
}

function StageFieldGrid({ stage, fields, excludeKeys = [] }) {
  const defs = (STAGE_FIELDS[stage] ?? []).filter(
    (f) => !excludeKeys.includes(f.key),
  );
  const hasAny = defs.some((f) => {
    const v = fields[f.key];
    return v !== undefined && v !== "" && v !== false;
  });

  if (defs.length === 0) return null;
  if (!hasAny)
    return <p className="stage-entry-empty">No details recorded yet.</p>;

  return (
    <div className="field-grid">
      {defs.map((f) => {
        const spanFull = f.type === "textarea";
        return (
          <div
            className={`field-grid-item${spanFull ? " span-2" : ""}`}
            key={f.key}
          >
            <div className="field-grid-label">{f.label}</div>
            <div className="field-grid-value">
              <FieldValueDisplay field={f} value={fields[f.key]} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InterviewRoundView({ fields }) {
  const { userNotes, aiBlocks } = splitPrepNotes(fields.prepNotes);

  return (
    <>
      <StageFieldGrid
        stage={STATUS.InterviewScheduled}
        fields={fields}
        excludeKeys={["prepNotes"]}
      />

      {userNotes && (
        <div className="prep-notes-block">
          <div className="prep-notes-label">Your notes</div>
          <p className="field-value-text">{userNotes}</p>
        </div>
      )}

      {aiBlocks.map((block, i) => (
        <div className="ai-questions-card" key={i}>
          <div className="ai-questions-head">
            <span className="ai-questions-icon">✦</span>
            AI-generated interview questions
          </div>
          {parseQuestionBlock(block).map((group, gi) => (
            <div className="ai-questions-group" key={gi}>
              <div className="ai-questions-group-title">{group.header}</div>
              <ul className="ai-questions-list">
                {group.questions.map((q, qi) => (
                  <li key={qi}>{q}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}

      {!userNotes && aiBlocks.length === 0 && (
        <p className="stage-entry-empty">No prep notes yet.</p>
      )}
    </>
  );
}

// One collapsible card per stage-detail record. Always opens in read
// mode when a record exists — editing is an explicit action, not the
// default view — except the stage currently being worked, which has
// nothing to read yet and opens straight into the form.
export function StageAccordion({
  entry,
  applicationId,
  onSaved,
  onGenerateQuestions,
  generatingRound,
}) {
  const [expanded, setExpanded] = useState(Boolean(entry.defaultExpanded));
  const [mode, setMode] = useState(entry.record ? "view" : "edit");

  const meta = statusMeta(entry.stage);
  const fields = entry.record ? parseFields(entry.record.fieldsJson) : {};
  const isInterview = entry.stage === STATUS.InterviewScheduled;

  function handleSaved(saved) {
    onSaved(saved);
    if (!entry.isNewRound) setMode("view");
    // isNewRound: this component remounts fresh next render (its key
    // includes the round number, which just advanced), so no reset needed.
  }

  return (
    <div className={`stage-accordion${expanded ? " expanded" : ""}`}>
      <button
        type="button"
        className="stage-accordion-head"
        onClick={() => setExpanded((e) => !e)}
      >
        <span
          className="stage-accordion-dot"
          style={{ background: meta.color }}
        />
        <span className="stage-accordion-title">
          {meta.label}
          {entry.roundLabel && (
            <span className="stage-accordion-round">{entry.roundLabel}</span>
          )}
        </span>
        <span className="stage-accordion-meta">
          {entry.record && (
            <span className="stage-accordion-time">
              {relativeTime(entry.record.createdAt)}
            </span>
          )}
          {entry.empty && (
            <span className="stage-accordion-badge muted">
              {entry.placeholderText === "Not reached yet."
                ? "Upcoming"
                : "Skipped"}
            </span>
          )}
          {!entry.empty && !entry.editable && (
            <span className="stage-accordion-badge locked">Locked</span>
          )}
        </span>
        <motion.span
          className="stage-accordion-chevron"
          animate={{ rotate: expanded ? 90 : 0 }}
        >
          ›
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className="stage-accordion-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="stage-accordion-content">
              {entry.empty ? (
                <p className="stage-entry-empty">{entry.placeholderText}</p>
              ) : mode === "edit" ? (
                <StageDetailForm
                  applicationId={applicationId}
                  stage={entry.stage}
                  initialFields={fields}
                  onSaved={handleSaved}
                  appendsNewRound={Boolean(entry.isNewRound)}
                  stageDetailId={entry.record?.id ?? null}
                  onCancel={entry.record ? () => setMode("view") : null}
                />
              ) : (
                <>
                  {isInterview ? (
                    <InterviewRoundView fields={fields} />
                  ) : (
                    <StageFieldGrid stage={entry.stage} fields={fields} />
                  )}

                  {entry.editable && (
                    <div className="stage-accordion-content-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setMode("edit")}
                      >
                        Edit details
                      </button>
                    </div>
                  )}
                </>
              )}

              {entry.isNewRound && onGenerateQuestions && (
                <div className="stage-accordion-content-actions">
                  <button
                    type="button"
                    className="icon-btn stage-accordion-generate"
                    onClick={() =>
                      onGenerateQuestions(
                        entry.roundLabel.replace("Round ", ""),
                      )
                    }
                    disabled={generatingRound !== null}
                    title="Generates likely questions from this job description and your resume, into Prep notes"
                  >
                    {generatingRound !== null
                      ? "Working…"
                      : "Suggest questions"}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
