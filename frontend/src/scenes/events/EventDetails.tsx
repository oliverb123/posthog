import './EventDetails.scss'

import { Properties } from '@posthog/plugin-scaffold'
import { ErrorDisplay } from 'lib/components/Errors/ErrorDisplay'
import { HTMLElementsDisplay } from 'lib/components/HTMLElementsDisplay/HTMLElementsDisplay'
import { JSONViewer } from 'lib/components/JSONViewer'
import { PropertiesTable } from 'lib/components/PropertiesTable'
import { dayjs } from 'lib/dayjs'
import { LemonButton } from 'lib/lemon-ui/LemonButton'
import { LemonTableProps } from 'lib/lemon-ui/LemonTable'
import { LemonTabs } from 'lib/lemon-ui/LemonTabs'
import { KEY_MAPPING } from 'lib/taxonomy'
import { pluralize } from 'lib/utils'
import { useState } from 'react'

import { EventType, PropertyDefinitionType } from '~/types'

interface EventDetailsProps {
    event: EventType
    tableProps?: Partial<LemonTableProps<Record<string, any>>>
}

export function EventDetails({ event, tableProps }: EventDetailsProps): JSX.Element {
    const [showSystemProps, setShowSystemProps] = useState(false)
    const [activeTab, setActiveTab] = useState(event.event === '$exception' ? 'exception' : 'properties')

    const displayedEventProperties: Properties = {}
    const visibleSystemProperties: Properties = {}
    let systemPropsCount = 0
    for (const key of Object.keys(event.properties)) {
        if (KEY_MAPPING.event[key] && KEY_MAPPING.event[key].system) {
            systemPropsCount += 1
            if (showSystemProps) {
                visibleSystemProperties[key] = event.properties[key]
            }
        }
        if (!KEY_MAPPING.event[key] || !KEY_MAPPING.event[key].system) {
            displayedEventProperties[key] = event.properties[key]
        }
    }

    const tabs = [
        {
            key: 'properties',
            label: 'Properties',
            content: (
                <div className="ml-10 mt-2">
                    <PropertiesTable
                        type={PropertyDefinitionType.Event}
                        properties={{
                            ...('timestamp' in event ? { $timestamp: dayjs(event.timestamp).toISOString() } : {}),
                            ...displayedEventProperties,
                            ...visibleSystemProperties,
                        }}
                        useDetectedPropertyType={true}
                        tableProps={tableProps}
                        filterable
                        searchable
                    />
                    {systemPropsCount > 0 && (
                        <LemonButton className="mb-2" onClick={() => setShowSystemProps(!showSystemProps)} size="small">
                            {showSystemProps ? 'Hide' : 'Show'}{' '}
                            {pluralize(systemPropsCount, 'system property', 'system properties')}
                        </LemonButton>
                    )}
                </div>
            ),
        },
        {
            key: 'json',
            label: 'JSON',
            content: (
                <div className="px-4 py-4">
                    <JSONViewer src={event} name="event" collapsed={1} collapseStringsAfterLength={80} sortKeys />
                </div>
            ),
        },
    ]

    if (event.elements && event.elements.length > 0) {
        tabs.push({
            key: 'elements',
            label: 'Elements',
            content: <HTMLElementsDisplay elements={event.elements} />,
        })
    }

    if (event.event === '$exception') {
        tabs.push({
            key: 'exception',
            label: 'Exception',
            content: (
                <div className="ml-10 my-2">
                    <ErrorDisplay event={event} />
                </div>
            ),
        })
    }

    return <LemonTabs data-attr="event-details" tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
}
