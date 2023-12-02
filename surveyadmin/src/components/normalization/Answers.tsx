"use client";
import { useState } from "react";
import { getQuestionObject } from "~/lib/normalization/helpers/getQuestionObject";
import { getFormPaths } from "@devographics/templates";
import { useCopy } from "../hooks";
import { CommonProps } from "./NormalizeQuestion";
import { IndividualAnswer } from "~/lib/normalization/helpers/splitResponses";
import sortBy from "lodash/sortBy";
import { Answer } from "./Answer";
import trim from "lodash/trim";
import Dialog from "./Dialog";
import { AllPresets } from "./AllPresets";

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

const getPercent = (a, b) => Math.round((a / b) * 100);

export interface AnswersProps extends CommonProps {
  allAnswers: IndividualAnswer[];
  variant: "normalized" | "unnormalized";
}

const Answers = (props: AnswersProps) => {
  const [showResponses, setShowResponses] = useState(false);
  const [showIds, setShowIds] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [showAllPresets, setShowAllPresets] = useState(false);

  const showAllPresetsModal = () => {
    setShowAllPresets(true);
  };

  const {
    survey,
    edition,
    question,
    responses,
    responsesCount,
    allAnswers,
    questionData,
    variant,
    entities,
  } = props;

  const sortedAnswers = sortBy(props[`${variant}Answers`], (a) =>
    trim(a.raw.toLowerCase().replaceAll('"', ""))
  ) as IndividualAnswer[];

  if (!sortedAnswers) return <p>Nothing to normalize</p>;

  const questionObject = getQuestionObject({
    survey,
    edition,
    section: question.section,
    question,
  })!;
  const formPaths = getFormPaths({ edition, question: questionObject });
  const rawPath = formPaths?.other;
  if (!rawPath)
    return (
      <p>
        Missing <code>rawPath</code>
      </p>
    );

  const answerProps = {
    ...props,
    showAllPresetsModal,
    rawPath,
  };

  const filteredAnswers = filterQuery
    ? sortedAnswers.filter((a) =>
        a.raw.toLowerCase().includes(filterQuery.toLowerCase())
      )
    : sortedAnswers;

  return (
    <div>
      <h3>
        {capitalizeFirstLetter(variant)} Responses (
        {getPercent(sortedAnswers.length, allAnswers.length)}% –{" "}
        {sortedAnswers.length}/{allAnswers.length}){" "}
        <a
          href="#"
          role="button"
          onClick={(e) => {
            e.preventDefault();
            setShowResponses(!showResponses);
          }}
        >
          {showResponses ? "Hide" : "Show"}
        </a>
      </h3>
      {showResponses && (
        <div className="normalization-fields">
          {variant === "normalized" ? (
            <p>
              This table shows responses that have already received at least one
              match during the normalization process.
            </p>
          ) : (
            <p>
              This table shows responses that have not received any match yet
              during the normalization process.
            </p>
          )}

          <table>
            <thead>
              <tr>
                <th colSpan={99}>
                  <div className="normalization-filter">
                    <label htmlFor="search">
                      Filter {capitalizeFirstLetter(variant)} Responses: (
                      {filteredAnswers.length} results)
                    </label>
                    <input
                      type="search"
                      id="search"
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                    />
                  </div>
                </th>
              </tr>
              <tr>
                <th></th>
                <th>Answer</th>
                <th>
                  <span>Add Tokens</span>
                  &nbsp;
                  <a
                    href="#"
                    style={{ whiteSpace: "nowrap" }}
                    onClick={(e) => {
                      e.preventDefault();
                      setShowAllPresets(!showAllPresets);
                    }}
                    data-tooltip="Edit presets…"
                  >
                    Edit Shortlist…
                  </a>
                  {showAllPresets && (
                    <Dialog
                      showModal={showAllPresets}
                      setShowModal={setShowAllPresets}
                      header={<span>Token Presets</span>}
                    >
                      <AllPresets {...props} />
                    </Dialog>
                  )}
                </th>
                <th>Current Tokens</th>

                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAnswers.map((answer, index) => {
                const { _id, responseId, raw, tokens } = answer;
                const previousRawValue = filteredAnswers[index - 1]?.raw;
                // show letter heading if this value's first letter is different from previous one
                const showLetterHeading = previousRawValue
                  ? raw?.[0].toUpperCase() !==
                    previousRawValue?.[0].toUpperCase()
                  : true;

                return (
                  <Answer
                    key={raw + index}
                    answer={answer}
                    index={index}
                    {...(showLetterHeading
                      ? { letterHeading: raw?.[0].toUpperCase() }
                      : {})}
                    {...answerProps}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const ResponseId = ({ id }: { id: string }) => {
  const [copied, copy, setCopied] = useCopy(id);

  const truncated = id.slice(0, 6) + "…";
  return (
    <code data-tooltip="Click to copy" onClick={copy}>
      {truncated}
    </code>
  );
};
export default Answers;
