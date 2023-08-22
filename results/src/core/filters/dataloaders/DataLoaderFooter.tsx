import React from 'react'
import ModalTrigger from 'core/components/ModalTrigger'
import T from 'core/i18n/T'
import FiltersPanel from '../FiltersPanel'
import Button from 'core/components/Button'
import { JSONTrigger } from 'core/blocks/block/BlockData'
import styled from 'styled-components'
import { mq, spacing, fontSize } from 'core/theme'

export const DataLoaderFooter = props => {
    const { block, data } = props
    return (
        <Footer_>
            <ModalTrigger
                trigger={
                    <Button>
                        <T k="filters.customize_chart" />
                    </Button>
                }
            >
                <FiltersPanel {...props} />
            </ModalTrigger>
            {data && <JSONTrigger block={block} data={data} buttonProps={{ variant: 'link' }} />}
        </Footer_>
    )
}

const Footer_ = styled.section`
    margin-top: ${spacing(2)};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: ${spacing()};
`