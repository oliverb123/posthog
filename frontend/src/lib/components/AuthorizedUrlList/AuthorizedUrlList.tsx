import { IconPencil, IconPlus, IconTrash } from '@posthog/icons'
import clsx from 'clsx'
import { useActions, useValues } from 'kea'
import { Form } from 'kea-forms'
import { IconOpenInApp } from 'lib/lemon-ui/icons'
import { LemonButton } from 'lib/lemon-ui/LemonButton'
import { LemonDialog } from 'lib/lemon-ui/LemonDialog'
import { LemonField } from 'lib/lemon-ui/LemonField'
import { LemonInput } from 'lib/lemon-ui/LemonInput/LemonInput'
import { LemonTag } from 'lib/lemon-ui/LemonTag/LemonTag'
import { Spinner } from 'lib/lemon-ui/Spinner/Spinner'
import { Tooltip } from 'lib/lemon-ui/Tooltip'

import { ExperimentIdType } from '~/types'

import { authorizedUrlListLogic, AuthorizedUrlListType } from './authorizedUrlListLogic'

function EmptyState({
    numberOfResults,
    isSearching,
    isAddingEntry,
    type,
}: {
    numberOfResults: number
    isSearching: boolean
    isAddingEntry: boolean
    type: AuthorizedUrlListType
}): JSX.Element | null {
    if (numberOfResults > 0) {
        return null
    }

    return isSearching || !isAddingEntry ? (
        <div className="border rounded p-4 text-muted-alt">
            {isSearching ? (
                <>
                    There are no authorized {type === AuthorizedUrlListType.RECORDING_DOMAINS ? 'domains' : 'URLs'} that
                    match your search.
                </>
            ) : (
                <>
                    {type === AuthorizedUrlListType.RECORDING_DOMAINS
                        ? 'No domains are specified, so recordings will be authorized on all domains.'
                        : 'There are no authorized urls. Add one to get started.'}
                </>
            )}
        </div>
    ) : null
}

function AuthorizedUrlForm({ actionId, experimentId, query, type }: AuthorizedUrlListProps): JSX.Element {
    const logic = authorizedUrlListLogic({
        actionId: actionId ?? null,
        experimentId: experimentId ?? null,
        query: query,
        type,
    })
    const { isProposedUrlSubmitting } = useValues(logic)
    const { cancelProposingUrl } = useActions(logic)
    return (
        <Form
            logic={authorizedUrlListLogic}
            props={{ actionId, type, experimentId, query }}
            formKey="proposedUrl"
            enableFormOnSubmit
            className="w-full space-y-2"
        >
            <LemonField name="url">
                <LemonInput
                    autoFocus
                    placeholder="Enter a URL or wildcard subdomain (e.g. https://*.posthog.com)"
                    data-attr="url-input"
                />
            </LemonField>
            <div className="flex justify-end gap-2">
                <LemonButton type="secondary" onClick={cancelProposingUrl}>
                    Cancel
                </LemonButton>
                <LemonButton htmlType="submit" type="primary" disabled={isProposedUrlSubmitting} data-attr="url-save">
                    Save
                </LemonButton>
            </div>
        </Form>
    )
}

export interface AuthorizedUrlListProps {
    actionId?: number
    experimentId?: ExperimentIdType
    query?: string | null
    type: AuthorizedUrlListType
}

export function AuthorizedUrlList({
    actionId,
    experimentId,
    query,
    type,
    addText = 'Add',
}: AuthorizedUrlListProps & { addText?: string }): JSX.Element {
    const logic = authorizedUrlListLogic({
        experimentId: experimentId ?? null,
        actionId: actionId ?? null,
        type,
        query,
    })
    const {
        urlsKeyed,
        suggestionsLoading,
        searchTerm,
        launchUrl,
        editUrlIndex,
        isAddUrlFormVisible,
        onlyAllowDomains,
    } = useValues(logic)
    const { addUrl, removeUrl, setSearchTerm, newUrl, setEditUrlIndex } = useActions(logic)

    return (
        <div>
            <div className="flex items-center mb-4 gap-2 justify-between">
                <LemonInput
                    type="search"
                    placeholder={`Search for authorized ${onlyAllowDomains ? 'domains' : 'URLs'}`}
                    onChange={setSearchTerm}
                    value={searchTerm}
                />
                <LemonButton onClick={newUrl} type="secondary" icon={<IconPlus />} data-attr="toolbar-add-url">
                    {addText}
                </LemonButton>
            </div>
            {suggestionsLoading ? (
                <div className="border rounded p-4 bg-bg-light" key={-1}>
                    <Spinner className="text-xl" />
                </div>
            ) : (
                <div className="space-y-2">
                    {isAddUrlFormVisible && (
                        <div className="border rounded p-2 bg-bg-light">
                            <AuthorizedUrlForm
                                type={type}
                                actionId={actionId}
                                experimentId={experimentId}
                                query={query}
                            />
                        </div>
                    )}
                    <EmptyState
                        numberOfResults={urlsKeyed.length}
                        isSearching={searchTerm.length > 0}
                        isAddingEntry={isAddUrlFormVisible}
                        type={type}
                    />
                    {urlsKeyed.map((keyedURL, index) => {
                        return editUrlIndex === index ? (
                            <div className="border rounded p-2 bg-bg-light">
                                <AuthorizedUrlForm type={type} actionId={actionId} />
                            </div>
                        ) : (
                            <div key={index} className={clsx('border rounded flex items-center p-2 pl-4 bg-bg-light')}>
                                {keyedURL.type === 'suggestion' && (
                                    <Tooltip title={'Seen in ' + keyedURL.count + ' events in the last 3 days'}>
                                        <LemonTag type="highlight" className="mr-4 uppercase cursor-pointer">
                                            Suggestion
                                        </LemonTag>
                                    </Tooltip>
                                )}
                                <span title={keyedURL.url} className="flex-1 truncate">
                                    {keyedURL.url}
                                </span>
                                <div className="Actions flex space-x-2 shrink-0">
                                    {keyedURL.type === 'suggestion' ? (
                                        <LemonButton
                                            onClick={() => addUrl(keyedURL.url)}
                                            icon={<IconPlus />}
                                            data-attr="toolbar-apply-suggestion"
                                        >
                                            Apply suggestion
                                        </LemonButton>
                                    ) : (
                                        <>
                                            <LemonButton
                                                icon={<IconOpenInApp />}
                                                to={
                                                    // toolbar urls are sent through the backend to be validated
                                                    // and have toolbar auth information added
                                                    type === AuthorizedUrlListType.TOOLBAR_URLS
                                                        ? launchUrl(keyedURL.url)
                                                        : // other urls are simply opened directly
                                                          `${keyedURL.url}${query ? query : ''}`
                                                }
                                                targetBlank
                                                tooltip={
                                                    type === AuthorizedUrlListType.TOOLBAR_URLS
                                                        ? 'Launch toolbar'
                                                        : 'Launch url'
                                                }
                                                center
                                                data-attr="toolbar-open"
                                                disabledReason={
                                                    keyedURL.url.includes('*')
                                                        ? 'Wildcard domains cannot be launched'
                                                        : undefined
                                                }
                                            >
                                                Launch
                                            </LemonButton>

                                            <LemonButton
                                                icon={<IconPencil />}
                                                onClick={() => setEditUrlIndex(keyedURL.originalIndex)}
                                                tooltip="Edit"
                                                center
                                            />

                                            <LemonButton
                                                icon={<IconTrash />}
                                                tooltip={`Remove ${onlyAllowDomains ? 'domain' : 'URL'}`}
                                                center
                                                onClick={() => {
                                                    LemonDialog.open({
                                                        title: <>Remove {keyedURL.url} ?</>,
                                                        description: `Are you sure you want to remove this authorized ${
                                                            onlyAllowDomains ? 'domain' : 'URL'
                                                        }?`,
                                                        primaryButton: {
                                                            status: 'danger',
                                                            children: 'Remove',
                                                            onClick: () => removeUrl(index),
                                                        },
                                                        secondaryButton: {
                                                            children: 'Cancel',
                                                        },
                                                    })
                                                }}
                                            />
                                        </>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
