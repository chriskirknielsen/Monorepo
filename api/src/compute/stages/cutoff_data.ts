import { COUNT, CUTOFF_ANSWERS, PERCENTAGE_QUESTION } from '@devographics/constants'
import { ResponseEditionData, ComputeAxisParameters, Bucket, FacetBucket } from '../../types'
import sum from 'lodash/sum.js'
import sumBy from 'lodash/sumBy.js'
import compact from 'lodash/compact.js'
import round from 'lodash/round.js'
import { combineFacetBuckets } from './group_buckets'
import { BucketData, BucketUnits, PercentileData, Percentiles } from '@devographics/types'
import { isSpecialBucket } from './limit_data'

export function mergePercentiles(buckets: Bucket[] | FacetBucket[]) {
    const percentileKeys = ['p0', 'p25', 'p50', 'p75', 'p100'] as Percentiles[]
    const percentiles = {} as PercentileData
    for (const key of percentileKeys) {
        const values = compact(buckets.map(b => b?.percentilesByFacet?.[key]))
        percentiles[key] = round(sum(values) / buckets.length, 2)
    }
    return percentiles
}

export function mergeBuckets<T extends Bucket | FacetBucket>(
    buckets: T[],
    mergedProps: any,
    isFacet: boolean = false
) {
    const basicUnits = [
        BucketUnits.COUNT,
        BucketUnits.PERCENTAGE_QUESTION,
        BucketUnits.PERCENTAGE_SURVEY
    ]
    if (isFacet) {
        basicUnits.push(BucketUnits.PERCENTAGE_BUCKET)
    }
    const mergedBucket = {
        ...mergedProps,
        groupedBucketIds: buckets.map(b => b.id),
        [BucketUnits.AVERAGE]: round(
            sumBy(buckets, b => b[BucketUnits.AVERAGE] || 0) / buckets.length,
            2
        ),
        [BucketUnits.PERCENTILES]: mergePercentiles(buckets)
    } as T

    for (const unit of basicUnits) {
        const unit2 = unit as keyof BucketData
        mergedBucket[unit2] = round(
            sumBy(buckets, b => b[unit2] || 0),
            2
        )
    }
    return mergedBucket
}
/*

Group together any bucket that didn't make cutoff. 

*/
export function groupUnderCutoff<T extends Bucket | FacetBucket>({
    buckets,
    mainAxis,
    secondaryAxis,
    isFacet
}: {
    buckets: T[]
    mainAxis: ComputeAxisParameters
    secondaryAxis?: ComputeAxisParameters
    isFacet: boolean
}) {
    const { cutoff, cutoffPercent } = mainAxis
    const keptBuckets = buckets.filter(b => keepBucket<T>(b, cutoff, cutoffPercent, isFacet))
    const cutoffBuckets = buckets.filter(b => !keptBuckets.map(b => b.id).includes(b.id))
    const cutoffGroupBucket = mergeBuckets<T>(cutoffBuckets, { id: CUTOFF_ANSWERS }, isFacet)

    if (secondaryAxis) {
        // if we know it's a top-level Bucket and not a FacetBucket
        // we combine the facetBuckets from the cutoff buckets
        ;(cutoffGroupBucket as Bucket).facetBuckets =
            combineFacetBuckets(cutoffBuckets as Bucket[], secondaryAxis) ?? []
    }

    return cutoffBuckets.length > 0 ? [...keptBuckets, cutoffGroupBucket] : keptBuckets
}

export async function cutoffData(
    resultsByEdition: ResponseEditionData[],
    axis1: ComputeAxisParameters,
    axis2?: ComputeAxisParameters
) {
    if ((axis1.cutoff && axis1.cutoff > 1) || axis1.cutoffPercent || axis2?.cutoffPercent) {
        for (let editionData of resultsByEdition) {
            // first, limit regular buckets
            if (axis1.mergeOtherBuckets === false && axis1.sort === 'options') {
                // when mergeOtherBuckets is false, and aggregations are sorted along
                // predefined options, do not apply cutoff
                // as that might result in unexpectedly missing buckets
                // (ex: missing "#2" bucket in "rank satisfaction from 1 to 5" question)
            } else {
                // group together all buckets that don't make cutoff
                editionData.buckets = groupUnderCutoff<Bucket>({
                    buckets: editionData.buckets,
                    mainAxis: axis1,
                    secondaryAxis: axis2,
                    isFacet: false
                })
            }

            if (axis2) {
                // then, cutoff facetBuckets if they exist
                // note: we cutoff facets even when sorted by options to avoid
                // having e.g. 200+ country facets even when most of them are empty
                for (let bucket of editionData.buckets) {
                    // group together all buckets that don't make cutoff
                    bucket.facetBuckets = groupUnderCutoff<FacetBucket>({
                        buckets: bucket.facetBuckets,
                        mainAxis: axis2,
                        isFacet: true
                    })
                }
            }
        }
    }
}

/*

Note: When deciding whether to keep a regular bucket based on cutoffPercent
 we look at its PERCENTAGE_QUESTION, but when it's a facetBucket we look
 at its PERCENTAGE_BUCKET.

*/
const keepBucket = <T extends Bucket | FacetBucket>(
    bucket: T,
    cutoff: number,
    cutoffPercent?: number,
    isFacetBucket: boolean = false
) => {
    if (cutoffPercent) {
        // use cutoffPercent if specified
        const percentUnit = isFacetBucket
            ? BucketUnits.PERCENTAGE_BUCKET
            : BucketUnits.PERCENTAGE_QUESTION
        return isSpecialBucket(bucket) || (bucket[percentUnit] || 0) >= cutoffPercent
    } else {
        // else use regular count-based cutoff
        return isSpecialBucket(bucket) || (bucket[COUNT] || 0) >= cutoff
    }
}
