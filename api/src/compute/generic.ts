import { inspect } from 'util'
import config from '../config'
import { generateFiltersQuery } from '../filters'
import { computeParticipationByYear } from './demographics'
import { getGenericPipeline } from './generic_pipeline'
import { computeCompletionByYear } from './completion'
import {
    RequestContext,
    GenericComputeArguments,
    Survey,
    Edition,
    Section,
    QuestionApiObject,
    ResponseEditionData,
    ComputeAxisParameters,
    EditionApiObject,
    SortSpecifier,
    SortOrder,
    SortOrderNumeric
} from '../types'
import {
    discardEmptyIds,
    addDefaultBucketCounts,
    moveFacetBucketsToDefaultBuckets,
    addMissingBuckets,
    addEntities,
    addCompletionCounts,
    addPercentages,
    sortData,
    limitData,
    cutoffData,
    addEditionYears,
    discardEmptyEditions,
    addLabels,
    addAveragesByFacet,
    removeEmptyEditions,
    addPercentilesByFacet,
    groupBuckets,
    applyDatasetCutoff,
    combineWithFreeform,
    groupOtherBuckets,
    addOverallBucket,
    addTokens
} from './stages/index'
import {
    ResponsesTypes,
    DbSuffixes,
    SurveyMetadata,
    EditionMetadata,
    ResponsesParameters,
    Filters,
    ResultsSubFieldEnum,
    SortProperty
} from '@devographics/types'
import { getCollection } from '../helpers/db'
import { getPastEditions } from '../helpers/surveys'
import { computeKey } from '../helpers/caching'
import isEmpty from 'lodash/isEmpty.js'
import { logToFile } from '@devographics/debug'
import { SENTIMENT_FACET } from '@devographics/constants'

export const convertOrder = (order: SortOrder): SortOrderNumeric => (order === 'asc' ? 1 : -1)

export const convertOrderReverse = (order: SortOrderNumeric): SortOrder =>
    order === 1 ? 'asc' : 'desc'

/*

Always use freeform/other field for source field

TODO:

- Actually differentiate between "freeform" and "prenormalized"
- Add ability to specify more than one response type in the same result list to generate
    global rankings of all responses

*/
export const getDbPath = (
    question: QuestionApiObject,
    responsesType: ResponsesTypes = ResponsesTypes.RESPONSES
) => {
    const { normPaths } = question

    if (question.id === 'source') {
        return normPaths?.other
    } else {
        if (responsesType === ResponsesTypes.RESPONSES) {
            return normPaths?.response
        } else if (responsesType === ResponsesTypes.COMBINED) {
            return normPaths?.response
        } else if (responsesType === ResponsesTypes.PRENORMALIZED) {
            return normPaths?.prenormalized
        } else {
            return normPaths?.other
        }
    }
}

const getQuestionSort = ({
    specifier: specifier_,
    question,
    enableBucketGroups
}: {
    specifier?: SortSpecifier
    question: QuestionApiObject
    enableBucketGroups?: boolean
}) => {
    let defaultSort: SortProperty,
        defaultOrder: SortOrder = 'desc'
    if (enableBucketGroups && question.groups) {
        // if we're grouping, use group order
        defaultSort = 'options'
    } else if (question.defaultSort) {
        // if question has a default sort, use it
        defaultSort = question.defaultSort
    } else if (question.optionsAreSequential) {
        if (question.options) {
            defaultSort = 'options'
        } else {
            // values are numeric but no options are specified, in this case
            // sort by id to get a nice curve of successive number
            defaultSort = 'id'
            defaultOrder = 'asc'
        }
    } else {
        // default to sorting by bucket count
        defaultSort = 'count'
    }
    const specifier = {
        sort: defaultSort,
        order: defaultOrder
    }
    // if sort/order have been explicitly passed, use that instead
    if (specifier_?.property) {
        specifier.sort = specifier_?.property
    }
    if (specifier_?.order) {
        specifier.order = specifier_?.order
    }
    // console.log('=====')
    // console.log({ ...specifier, order: convertOrder(specifier.order) })
    return { ...specifier, order: convertOrder(specifier.order) }
}

export const getGenericCacheKey = ({
    edition,
    question,
    subField = ResultsSubFieldEnum.RESPONSES,
    selectedEditionId,
    parameters,
    filters,
    facet
}: {
    edition: EditionApiObject
    question: QuestionApiObject
    subField: ResultsSubFieldEnum
    selectedEditionId: string
    parameters?: ResponsesParameters
    filters?: Filters
    facet?: string
}) => {
    const cacheKeyOptions: any = {
        editionId: selectedEditionId || `allEditions(${edition.id})`,
        questionId: question.id,
        subField
    }
    if (!isEmpty(parameters)) {
        const { enableCache, ...cacheKeyParameters } = parameters
        if (!isEmpty(cacheKeyParameters)) {
            cacheKeyOptions.parameters = { parameters: cacheKeyParameters }
        }
    }
    if (!isEmpty(filters)) {
        cacheKeyOptions.filters = { filters }
    }
    if (!isEmpty(facet)) {
        cacheKeyOptions.facet = { facet }
    }
    return computeKey('generic', cacheKeyOptions)
}

export type GenericComputeOptions = {
    context: RequestContext
    survey: SurveyMetadata
    edition: EditionMetadata
    section: Section // not used
    question: QuestionApiObject
    questionObjects: QuestionApiObject[]
    computeArguments: GenericComputeArguments
}

const DEFAULT_LIMIT = 50

export async function genericComputeFunction(options: GenericComputeOptions) {
    const { context, survey, edition, question, questionObjects, computeArguments } = options

    let axis1: ComputeAxisParameters,
        axis2: ComputeAxisParameters | null = null
    const { db, isDebug } = context
    const collection = getCollection(db, survey)

    // TODO "responsesType" is now called "subField" elsewhere, change it here as well at some point
    const { responsesType, filters, parameters = {}, facet, selectedEditionId } = computeArguments
    const {
        cutoff = 1,
        cutoffPercent,
        sort,
        limit = DEFAULT_LIMIT,
        facetSort,
        facetLimit = DEFAULT_LIMIT,
        facetCutoff = 1,
        facetCutoffPercent,
        showNoAnswer,
        mergeOtherBuckets = true,
        enableBucketGroups = true,
        enableAddOverallBucket = true,
        enableAddMissingBuckets
    } = parameters

    // these are not passed as parameters anymore, but just default to being always true
    // if the extra groups are not needed they can just be ignored by the user
    const groupUnderCutoff = true
    const groupOverLimit = true

    /*

    Axis 1

    */
    const sortSpecifier = getQuestionSort({ specifier: sort, question, enableBucketGroups })
    axis1 = {
        question,
        ...sortSpecifier,
        cutoff,
        cutoffPercent,
        groupUnderCutoff,
        groupOverLimit,
        mergeOtherBuckets,
        enableBucketGroups,
        enableAddMissingBuckets,
        limit
    }
    if (question.options) {
        axis1.options = question.options
    }

    /*

    Axis 2

    
    */
    if (facet) {
        if (facet === SENTIMENT_FACET) {
            /*

            Hack: when dealing with questions that supports sentiment, 
            override axis2 and use sentiment in its place

            */
            const sentimentAxis = {
                sort: axis1.sort,
                order: axis1.order,
                cutoff: axis1.cutoff,
                limit: axis1.limit,
                question: {
                    surveyId: axis1.question.surveyId,
                    template: axis1.question.template,
                    id: `${axis1.question.id}__sentiment`,
                    normPaths: {
                        response: `${axis1.question?.normPaths?.base}.sentiment`
                    }
                }
            }
            // do the switch axes around thing
            axis2 = axis1
            axis1 = sentimentAxis
        } else {
            let [sectionId, mainFieldId, subPathId] = facet?.split('__')
            const facetId = subPathId ? `${mainFieldId}__${subPathId}` : mainFieldId
            const facetQuestion = questionObjects.find(
                q => q.id === facetId && q.surveyId === survey.id
            )
            if (facetQuestion) {
                axis2 = {
                    question: facetQuestion,
                    ...getQuestionSort({
                        specifier: facetSort,
                        question: facetQuestion,
                        enableBucketGroups
                    }),
                    cutoff: facetCutoff,
                    cutoffPercent: facetCutoffPercent,
                    groupUnderCutoff,
                    groupOverLimit,
                    mergeOtherBuckets,
                    enableBucketGroups,
                    enableAddMissingBuckets,
                    limit: facetLimit
                }
                if (facetQuestion?.options) {
                    axis2.options = facetQuestion?.options
                }
                // switch both axes in order to get a better result object structure
                const temp = axis1
                axis1 = axis2
                axis2 = temp
            }
        }
    }

    const dbPath = getDbPath(question, responsesType)

    if (!dbPath) {
        throw new Error(
            `No dbPath found for question id ${question.id} with subfield ${responsesType}`
        )
    }

    let match: any = {
        surveyId: survey.id,
        [dbPath]: { $nin: [null, '', [], {}] }
    }
    if (filters) {
        const filtersQuery = await generateFiltersQuery({ filters, dbPath })
        match = { ...match, ...filtersQuery }
    }
    if (selectedEditionId) {
        // if edition is passed, restrict aggregation to specific edition
        match.editionId = selectedEditionId
    } else {
        // restrict aggregation to current and past editions, to avoid including results from the future
        const pastEditions = getPastEditions({ survey, edition })
        match.editionId = { $in: pastEditions.map(e => e.id) }
    }

    // TODO: merge these counts into the main aggregation pipeline if possible
    const totalRespondentsByYear = await computeParticipationByYear({ context, survey })
    const completionByYear = await computeCompletionByYear({ context, match, survey })

    const pipelineProps = {
        surveyId: survey.id,
        selectedEditionId,
        filters,
        axis1,
        axis2,
        responsesType,
        showNoAnswer,
        survey,
        edition
    }

    const pipeline = await getGenericPipeline(pipelineProps)

    let results = (await collection.aggregate(pipeline).toArray()) as ResponseEditionData[]

    if (isDebug) {
        console.log(
            `// Using collection ${
                survey.normalizedCollectionName || 'normalized_responses'
            } on db ${process.env.MONGO_PUBLIC_DB}`
        )
        // console.log(
        //     inspect(
        //         {
        //             match,
        //             pipeline
        //         },
        //         { colors: true, depth: null }
        //     )
        // )
        // console.log('// raw results')
        // console.log(JSON.stringify(results, null, 2))

        await logToFile('last_query/computeArguments.json', computeArguments)
        await logToFile('last_query/axis1.json', axis1)
        await logToFile('last_query/axis2.json', axis2)
        await logToFile('last_query/match.json', match)
        await logToFile('last_query/pipeline.json', pipeline)
        await logToFile('last_query/rawResults.yml', results)
    }

    if (!axis2) {
        // TODO: get rid of this by rewriting the mongo aggregation
        // if no facet is specified, move default buckets down one level
        await moveFacetBucketsToDefaultBuckets(results)
    }

    if (responsesType === ResponsesTypes.COMBINED) {
        if (isDebug) {
            console.log('// combined mode: getting freeform results…')
        }
        results = await combineWithFreeform(results, options)
    }

    await discardEmptyIds(results)

    results = await discardEmptyEditions(results)

    await addEntities(results, context)
    await addTokens(results, context)

    if (axis2) {
        await addDefaultBucketCounts(results)

        await addMissingBuckets(results, axis2, axis1)

        await addCompletionCounts(results, totalRespondentsByYear, completionByYear)

        // optionally add overall, non-facetted bucket as a point of comparison
        // note: for now, disable this for sentiment questions to avoid infinite loops
        if (enableAddOverallBucket && facet !== SENTIMENT_FACET) {
            await addOverallBucket(results, axis1, options)
        }

        // once buckets don't move anymore we can calculate percentages
        await addPercentages(results)

        results = await applyDatasetCutoff(results, computeArguments, axis2, axis1)

        // await addDeltas(results)

        await addEditionYears(results, survey)

        await addAveragesByFacet(results, axis2, axis1)
        await addPercentilesByFacet(results, axis2, axis1)

        await sortData(results, axis2, axis1)

        // bucket grouping
        await groupBuckets(results, axis2, axis1)

        // group cutoff buckets together
        await cutoffData(results, axis2, axis1)

        // for all following steps, use groups as options
        if (axis1.enableBucketGroups && axis1.question.groups) {
            axis1.options = axis1.question.groups
        }
        if (axis2.enableBucketGroups && axis2.question.groups) {
            axis2.options = axis2.question.groups
        }
        await limitData(results, axis2, axis1)

        // group any "non-standard" bucket, including cutoff data, unmatched answers,
        // off-limit answers, etc.
        await groupOtherBuckets(results, axis2, axis1)

        await addLabels(results, axis2, axis1)
    } else {
        results = await addMissingBuckets(results, axis1)

        await addCompletionCounts(results, totalRespondentsByYear, completionByYear)

        await addPercentages(results)

        results = await applyDatasetCutoff(results, computeArguments, axis1)

        // await addDeltas(results)

        await addEditionYears(results, survey)

        // we only group buckets after we've calculated every other value
        // while the buckets are "flat"
        await groupBuckets(results, axis1)

        await cutoffData(results, axis1)

        // for all following steps, use groups as options
        if (axis1.enableBucketGroups && axis1.question.groups) {
            axis1.options = axis1.question.groups
        }
        await sortData(results, axis1)
        await limitData(results, axis1)

        // group any "non-standard" bucket, including cutoff data, unmatched answers,
        // off-limit answers, etc.
        await groupOtherBuckets(results, axis1)

        await addLabels(results, axis1)
    }

    if (isDebug) {
        // console.log('// results final')
        // console.log(JSON.stringify(results, undefined, 2))
        await logToFile('last_query/results.yml', results)
    }

    return results
}
