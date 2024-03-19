import React from 'react'
import { FacetRow } from '../HorizontalBarRow'
import Legend from '../../common2/Legend'
import { ViewDefinition } from '../types'
import { Row, Rows, SeriesHeading } from 'core/charts/common2'
import { removeNoAnswer, removeNotApplicable } from '../helpers/steps'

export const PercentageBucket: ViewDefinition = {
    steps: [removeNotApplicable, removeNoAnswer],
    component: ({ buckets, ...rest }) => {
        return (
            <>
                <SeriesHeading />
                <Legend {...rest} />
                <Rows>
                    {buckets.map((bucket, i) => (
                        <Row key={bucket.id} bucket={bucket} {...rest} rowComponent={FacetRow} />
                    ))}
                </Rows>
            </>
        )
    }
}
