import { Dispatch, SetStateAction } from 'react'
import {
    Bucket,
    Entity,
    FacetBucket,
    FeaturesOptions,
    SimplifiedSentimentOptions,
    StandardQuestionData
} from '@devographics/types'
import { BlockComponentProps } from 'core/types'
import { PERCENTAGE_QUESTION, SENTIMENT_FACET } from '@devographics/constants'

export const experienceColors = {
    [FeaturesOptions.NEVER_HEARD]: '#D696F4',
    [FeaturesOptions.HEARD]: '#6A8CE1',
    [FeaturesOptions.USED]: '#78DFED'
}

export const sentimentColors = {
    [SimplifiedSentimentOptions.NEGATIVE_SENTIMENT]: '#FA6868',
    [SimplifiedSentimentOptions.NEUTRAL_SENTIMENT]: '#C1C1C1',
    [SimplifiedSentimentOptions.POSITIVE_SENTIMENT]: '#7EE464'
}

export const DEFAULT_VARIABLE = PERCENTAGE_QUESTION

export enum GroupingOptions {
    EXPERIENCE = 'experience',
    SENTIMENT = 'sentiment'
}

export enum OrderOptions {
    ASC = 'asc',
    DESC = 'desc'
}

export enum ColumnModes {
    STACKED = 'stacked',
    SEPARATE = 'separate'
}

export const sortOptions = {
    experience: Object.values(FeaturesOptions),
    sentiment: Object.values(SimplifiedSentimentOptions)
}

type SectionItemsData = {
    items: StandardQuestionData[]
}

export interface MultiItemsExperienceBlockProps extends BlockComponentProps {
    data: SectionItemsData
    // series: DataSeries<StandardQuestionData>[]
}

export type ColumnId = FeaturesOptions | SimplifiedSentimentOptions

export type Variable = typeof PERCENTAGE_QUESTION

export type FacetId = string

export type ChartState = {
    facetId: FacetId
    setFacetId: Dispatch<SetStateAction<FacetId>>
    grouping: GroupingOptions
    setGrouping: Dispatch<SetStateAction<GroupingOptions>>
    sort: ColumnId
    setSort: Dispatch<SetStateAction<ColumnId>>
    order: OrderOptions
    setOrder: Dispatch<SetStateAction<OrderOptions>>
    variable: Variable
    setVariable: Dispatch<SetStateAction<Variable>>
    columnMode: ColumnModes
    setColumnMode: Dispatch<SetStateAction<ColumnModes>>
}

export type CombinedItem = {
    id: string
    entity: Entity
    combinedBuckets: CombinedBucket[]
}

export type CombinedBucket = {
    id: string
    bucket: Bucket
    facetBucket: FacetBucket
    value: number
}

export type Totals = { id: string } & { [key in ColumnId]: number }

export type MaxValue = { id: ColumnId; maxValue: number }

export type CellDimension = { id: CombinedBucket['id']; width: number; offset: number }