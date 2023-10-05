"use client";

import Actions from "~/components/normalization/NormalizeQuestionActions";
import Progress from "~/components/normalization/Progress";
import Fields from "~/components/normalization/Fields";
import Metadata from "~/components/normalization/Metadata";

import {
  ResponsesData,
  useQuestionResponses,
  useUnnormalizedData,
} from "~/lib/normalization/hooks";
import {
  EditionMetadata,
  QuestionMetadata,
  SurveyMetadata,
} from "@devographics/types";
import { useSegments } from "./hooks";
import type { QuestionWithSection } from "~/lib/normalization/types";
import QuestionData from "./QuestionData";
import isEmpty from "lodash/isEmpty";

export const NormalizeQuestion = (props: {
  survey: SurveyMetadata;
  edition: EditionMetadata;
  question: QuestionWithSection;
}) => {
  const { survey, edition, question } = props;
  const { data, loading, error } = useQuestionResponses({
    surveyId: survey.id,
    editionId: edition.id,
    questionId: question.id,
  });
  return loading ? (
    <div aria-busy={true} />
  ) : data ? (
    <Normalization {...props} data={data} />
  ) : (
    <div>no data found.</div>
  );
};

export const Normalization = ({
  survey,
  edition,
  question,
  data,
}: {
  survey: SurveyMetadata;
  edition: EditionMetadata;
  question: QuestionWithSection;
  data: ResponsesData;
}) => {
  const { responsesCount, responses, questionResult } = data;

  const questionData = questionResult.data;

  const {
    initializeSegments,
    updateSegments,
    doneCount,
    enabled,
    setEnabled,
    segments,
  } = useSegments();

  const props = {
    responsesCount,
    survey,
    edition,
    question,
    responses,
    initializeSegments,
    updateSegments,
    doneCount,
    enabled,
    setEnabled,
    segments,
    questionData,
  };

  return (
    <div className="admin-normalization admin-content">
      <Actions {...props} />
      {segments.length > 0 && <Progress {...props} />}
      <QuestionData questionData={questionData} />
      <Metadata {...props} />
      <Fields
        {...props}
        variant="unnormalized"
        responses={responses.filter((r) => isEmpty(r.normalizedValue))}
      />
      <Fields
        {...props}
        variant="normalized"
        responses={responses.filter((r) => !isEmpty(r.normalizedValue))}
      />
    </div>
  );
};

export default NormalizeQuestion;
