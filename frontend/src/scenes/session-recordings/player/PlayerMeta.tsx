import './PlayerMeta.scss'

import { LemonBanner, LemonSwitch, LemonTabs, Link } from '@posthog/lemon-ui'
import clsx from 'clsx'
import { useActions, useValues } from 'kea'
import { CopyToClipboardInline } from 'lib/components/CopyToClipboard'
import { LemonSkeleton } from 'lib/lemon-ui/LemonSkeleton'
import { Tooltip } from 'lib/lemon-ui/Tooltip'
import { DraggableToNotebook } from 'scenes/notebooks/AddToNotebook/DraggableToNotebook'
import { playerMetaLogic } from 'scenes/session-recordings/player/playerMetaLogic'
import { urls } from 'scenes/urls'

import { getCurrentExporterData } from '~/exporter/exporterViewLogic'
import { Logo } from '~/toolbar/assets/Logo'

import { sessionRecordingPlayerLogic, SessionRecordingPlayerMode } from './sessionRecordingPlayerLogic'

function URLOrScreen({ lastUrl }: { lastUrl: string | undefined }): JSX.Element | null {
    if (!lastUrl) {
        return null
    }

    // re-using the rrweb web schema means that this might be a mobile replay screen name
    let isValidUrl = false
    try {
        new URL(lastUrl || '')
        isValidUrl = true
    } catch (_e) {
        // no valid url
    }

    return (
        <span className="flex items-center gap-2 truncate">
            <span>·</span>
            <span className="flex items-center gap-1 truncate">
                {isValidUrl ? (
                    <Tooltip title="Click to open url">
                        <Link to={lastUrl} target="_blank" className="truncate">
                            {lastUrl}
                        </Link>
                    </Tooltip>
                ) : (
                    lastUrl
                )}
                <span className="flex items-center">
                    <CopyToClipboardInline
                        description={lastUrl}
                        explicitValue={lastUrl}
                        iconStyle={{ color: 'var(--muted-alt)' }}
                        selectable={true}
                    />
                </span>
            </span>
        </span>
    )
}

function PlayerWarningsRow(): JSX.Element | null {
    const { messageTooLargeWarnings } = useValues(sessionRecordingPlayerLogic)

    return messageTooLargeWarnings.length ? (
        <div>
            <LemonBanner
                type="error"
                action={{
                    children: 'Learn more',
                    to: 'https://posthog.com/docs/session-replay/troubleshooting#message-too-large-warning',
                    targetBlank: true,
                }}
            >
                This session recording had recording data that was too large and could not be captured. This will mean
                playback is not 100% accurate.{' '}
            </LemonBanner>
        </div>
    ) : null
}

export function PlayerMeta(): JSX.Element {
    const { logicProps, isFullScreen, windowTitles } = useValues(sessionRecordingPlayerLogic)

    const { windowIds, trackedWindow, currentSegment, sessionPlayerMetaDataLoading } = useValues(
        playerMetaLogic(logicProps)
    )

    const { setTrackedWindow } = useActions(playerMetaLogic(logicProps))

    const mode = logicProps.mode ?? SessionRecordingPlayerMode.Standard
    const whitelabel = getCurrentExporterData()?.whitelabel ?? false

    if (mode === SessionRecordingPlayerMode.Sharing) {
        if (whitelabel) {
            return <></>
        }
        return (
            <div className="PlayerMeta">
                <div className="flex justify-between items-center m-2">
                    {!whitelabel ? (
                        <Tooltip title="Powered by PostHog" placement="right">
                            <Link to="https://posthog.com" className="flex items-center" target="blank">
                                <Logo />
                            </Link>
                        </Tooltip>
                    ) : null}
                </div>
            </div>
        )
    }

    const currentWindow = currentSegment?.windowId
    const activeWindowId = trackedWindow || currentWindow

    return (
        <DraggableToNotebook href={urls.replaySingle(logicProps.sessionRecordingId)} onlyWithModifierKey>
            <div className={clsx('PlayerMeta', { 'PlayerMeta--fullscreen': isFullScreen })}>
                <div className="flex">
                    {sessionPlayerMetaDataLoading || !currentSegment ? (
                        <LemonSkeleton className="w-1/3 h-4 my-1" />
                    ) : (
                        activeWindowId && (
                            <>
                                <div>
                                    <LemonTabs
                                        size="small"
                                        tabs={windowIds.map((windowId, index) => ({
                                            key: windowId,
                                            label: <span>{windowTitles[windowId] || `Window ${index + 1}`}</span>,
                                        }))}
                                        activeKey={activeWindowId}
                                        onChange={(windowId) => setTrackedWindow(windowId)}
                                        barClassName="mb-0"
                                    />
                                </div>
                                <div className="flex flex-1 border-b justify-end px-2">
                                    <LemonSwitch
                                        label="Follow the user"
                                        checked={trackedWindow === null}
                                        onChange={() =>
                                            trackedWindow
                                                ? setTrackedWindow(null)
                                                : setTrackedWindow(currentWindow as string)
                                        }
                                        disabledReason={!activeWindowId && 'There is no active window'}
                                    />
                                </div>

                                {/* <URLOrScreen lastUrl={lastUrl} />
                            {lastPageviewEvent?.properties?.['$screen_name'] && (
                                <span className="flex items-center gap-2 truncate">
                                    <span>·</span>
                                    <span className="flex items-center gap-1 truncate">
                                        {lastPageviewEvent?.properties['$screen_name']}
                                    </span>
                                </span>
                            )} */}
                            </>
                        )
                    )}
                </div>
                <PlayerWarningsRow />
            </div>
        </DraggableToNotebook>
    )
}
