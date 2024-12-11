import { LemonButton, LemonCollapse, LemonDivider, LemonTextArea } from '@posthog/lemon-ui'
import { Spinner } from '@posthog/lemon-ui'
import { useActions, useValues } from 'kea'
import { LemonMarkdown } from 'lib/lemon-ui/LemonMarkdown'
import { useEffect, useRef, useState } from 'react'

import { sidePanelMaxAILogic } from './sidePanelMaxAILogic'
import { ChatMessage } from './sidePanelMaxAILogic'

function extractThinkingBlock(content: string): Array<string> {
    const matches = Array.from(content.matchAll(new RegExp('<thinking>(.*?)</thinking>', 'gs')))
    return matches.map((match) => match[1].trim())
}

function extractSearchReflection(content: string): Array<string> {
    const matches = Array.from(
        content.matchAll(new RegExp('<search_result_reflection>(.*?)</search_result_reflection>', 'gs'))
    )
    return matches.map((match) => match[1].trim())
}

function extractSearchQualityScore(content: string): { hasQualityScore: boolean; content: string | null } {
    const qualityMatch = content.match(new RegExp('<search_quality_score>(.*?)</search_quality_score>', 's'))
    if (!qualityMatch) {
        return { hasQualityScore: false, content: null }
    }
    return {
        hasQualityScore: true,
        content: qualityMatch[1].trim(),
    }
}

function extractInfoValidation(content: string): { hasQualityScore: boolean; content: string | null } {
    const qualityMatch = content.match(new RegExp('<info_validation>(.*?)</info_validation>', 's'))
    if (!qualityMatch) {
        return { hasQualityScore: false, content: null }
    }
    return {
        hasQualityScore: true,
        content: qualityMatch[1].trim(),
    }
}

function extractURLValidation(content: string): { hasQualityScore: boolean; content: string | null } {
    const qualityMatch = content.match(new RegExp('<url_validation>(.*?)</url_validation>', 's'))
    if (!qualityMatch) {
        return { hasQualityScore: false, content: null }
    }
    return {
        hasQualityScore: true,
        content: qualityMatch[1].trim(),
    }
}

export function MaxChatInterface(): JSX.Element {
    const { currentMessages, isSearchingThinking, isRateLimited } = useValues(sidePanelMaxAILogic)
    const { submitMessage } = useActions(sidePanelMaxAILogic)
    const [inputMessage, setInputMessage] = useState('')
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        submitMessage('__GREETING__')
    }, [submitMessage])

    const showInput =
        !isLoading && currentMessages.length > 0 && currentMessages.some((msg) => msg.role === 'assistant')

    useEffect(() => {
        if (currentMessages.some((msg) => msg.role === 'assistant')) {
            setIsLoading(false)
        }
    }, [currentMessages])

    const handleSubmit = (e: React.FormEvent): void => {
        e.preventDefault()
        if (inputMessage.trim()) {
            submitMessage(inputMessage)
            setInputMessage('')
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit(e)
        }
    }

    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [currentMessages])

    const displayMessages = currentMessages.filter((message) => message.content !== '__GREETING__')

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
                <div className="bg-bg-light dark:bg-bg-transparent rounded p-1">
                    <h4 className="mb-2">Tips for chatting with Max:</h4>
                    <ul className="list-disc pl-4 space-y-2 text-muted">
                        <li>Max can't handle files or images (yet.)</li>
                        <li>
                            Max can't see what page you're on, or the contents. Copy/paste error messages or queries to
                            share with Max.
                        </li>
                        <li>Max can make mistakes. Please double-check responses.</li>
                    </ul>
                </div>
                {isLoading ? (
                    <div className="flex items-center gap-2 text-muted">
                        <span>Max is crawling out of his burrow and shaking off his quills...</span>
                        <Spinner className="text-lg" />
                    </div>
                ) : (
                    <>
                        {displayMessages.map((message: ChatMessage, idx: number) => (
                            <div
                                key={`${message.timestamp}-${idx}`}
                                className={`flex w-full ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                {message.role === 'user' && <div className="text-sm text-muted mr-2 mt-2">You</div>}

                                <div className={message.role === 'assistant' ? 'flex flex-col' : ''}>
                                    {message.role === 'assistant' && <div className="text-sm text-muted mb-1">Max</div>}
                                    <div
                                        className={`p-2 rounded-lg min-w-[90%] whitespace-pre-wrap ${
                                            message.role === 'assistant'
                                                ? 'bg-bg-light dark:bg-bg-depth text-default'
                                                : 'bg-bg-light dark:bg-bg-side text-default'
                                        }`}
                                    >
                                        {message.role === 'assistant'
                                            ? typeof message.content === 'string' &&
                                              (message.content.includes('<search_state>started</search_state>') ? (
                                                  <div className="flex items-center gap-2">
                                                      <span>Max is searching...</span>
                                                      <Spinner className="text-lg" />
                                                  </div>
                                              ) : message.content.includes('<search_state>completed</search_state>') ? (
                                                  <div>Max searched</div>
                                              ) : (
                                                  <>
                                                      <LemonMarkdown>
                                                          {message.content
                                                              .replace(new RegExp('<thinking>.*?</thinking>', 's'), '')
                                                              .replace(
                                                                  new RegExp(
                                                                      '<search_result_reflection>.*?</search_result_reflection>',
                                                                      'gs'
                                                                  ),
                                                                  ''
                                                              )
                                                              .replace(
                                                                  new RegExp(
                                                                      '<search_quality_score>.*?</search_quality_score>',
                                                                      's'
                                                                  ),
                                                                  ''
                                                              )
                                                              .replace(
                                                                  new RegExp(
                                                                      '<info_validation>.*?</info_validation>',
                                                                      's'
                                                                  ),
                                                                  ''
                                                              )
                                                              .replace(
                                                                  new RegExp(
                                                                      '<url_validation>.*?</url_validation>',
                                                                      's'
                                                                  ),
                                                                  ''
                                                              )
                                                              .replace(new RegExp('<reply>|</reply>', 'g'), '')
                                                              .trim()}
                                                      </LemonMarkdown>

                                                      {/* Only show analysis for non-greeting messages */}
                                                      {idx === 0
                                                          ? null
                                                          : (extractThinkingBlock(message.content).length > 0 ||
                                                                extractSearchReflection(message.content).length > 0 ||
                                                                extractSearchQualityScore(message.content)
                                                                    .hasQualityScore ||
                                                                extractInfoValidation(message.content)
                                                                    .hasQualityScore ||
                                                                extractURLValidation(message.content)
                                                                    .hasQualityScore) && (
                                                                <LemonCollapse
                                                                    key={`analysis-${message.timestamp}`}
                                                                    className="mt-4 text-sm"
                                                                    panels={[
                                                                        {
                                                                            key: 'analysis',
                                                                            header: (
                                                                                <span className="text-muted">
                                                                                    What was Max thinking?
                                                                                </span>
                                                                            ),
                                                                            content: (
                                                                                <div className="space-y-3 p-1">
                                                                                    {/* Thinking blocks */}
                                                                                    {extractThinkingBlock(
                                                                                        message.content
                                                                                    ).map((content, index) => (
                                                                                        <LemonCollapse
                                                                                            key={`thinking-${index}-${message.timestamp}`}
                                                                                            panels={[
                                                                                                {
                                                                                                    key: 'thinking',
                                                                                                    header: 'Thinking',
                                                                                                    content: (
                                                                                                        <div>
                                                                                                            {content}
                                                                                                        </div>
                                                                                                    ),
                                                                                                },
                                                                                            ]}
                                                                                        />
                                                                                    ))}

                                                                                    {/* Search Reflection blocks */}
                                                                                    {extractSearchReflection(
                                                                                        message.content
                                                                                    ).map((content, index) => (
                                                                                        <LemonCollapse
                                                                                            key={`reflection-${index}-${message.timestamp}`}
                                                                                            panels={[
                                                                                                {
                                                                                                    key: 'reflection',
                                                                                                    header: 'Search Reflection',
                                                                                                    content: (
                                                                                                        <div>
                                                                                                            {content}
                                                                                                        </div>
                                                                                                    ),
                                                                                                },
                                                                                            ]}
                                                                                        />
                                                                                    ))}

                                                                                    {/* Search Quality Score */}
                                                                                    {extractSearchQualityScore(
                                                                                        message.content
                                                                                    ).hasQualityScore && (
                                                                                        <LemonCollapse
                                                                                            panels={[
                                                                                                {
                                                                                                    key: 'quality',
                                                                                                    header: 'Search Quality',
                                                                                                    content: (
                                                                                                        <div>
                                                                                                            {
                                                                                                                extractSearchQualityScore(
                                                                                                                    message.content
                                                                                                                )
                                                                                                                    .content
                                                                                                            }
                                                                                                        </div>
                                                                                                    ),
                                                                                                },
                                                                                            ]}
                                                                                        />
                                                                                    )}

                                                                                    {/* Info Validation */}
                                                                                    {extractInfoValidation(
                                                                                        message.content
                                                                                    ).hasQualityScore && (
                                                                                        <LemonCollapse
                                                                                            panels={[
                                                                                                {
                                                                                                    key: 'info',
                                                                                                    header: 'Information Validation',
                                                                                                    content: (
                                                                                                        <div>
                                                                                                            {
                                                                                                                extractInfoValidation(
                                                                                                                    message.content
                                                                                                                )
                                                                                                                    .content
                                                                                                            }
                                                                                                        </div>
                                                                                                    ),
                                                                                                },
                                                                                            ]}
                                                                                        />
                                                                                    )}

                                                                                    {/* URL Validation */}
                                                                                    {extractURLValidation(
                                                                                        message.content
                                                                                    ).hasQualityScore && (
                                                                                        <LemonCollapse
                                                                                            panels={[
                                                                                                {
                                                                                                    key: 'url',
                                                                                                    header: 'URL Validation',
                                                                                                    content: (
                                                                                                        <div>
                                                                                                            {
                                                                                                                extractURLValidation(
                                                                                                                    message.content
                                                                                                                )
                                                                                                                    .content
                                                                                                            }
                                                                                                        </div>
                                                                                                    ),
                                                                                                },
                                                                                            ]}
                                                                                        />
                                                                                    )}
                                                                                </div>
                                                                            ),
                                                                        },
                                                                    ]}
                                                                />
                                                            )}
                                                  </>
                                              ))
                                            : message.content}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {isSearchingThinking &&
                            displayMessages.length > 0 &&
                            displayMessages[displayMessages.length - 1].role === 'user' && (
                                <div className="flex justify-start">
                                    <div className="flex flex-col">
                                        <div className="text-sm text-muted mb-1">Max</div>
                                        <div className="p-2 rounded-lg bg-bg-light dark:bg-bg-depth text-default">
                                            <div className="flex items-center gap-2">
                                                <span>
                                                    {isRateLimited
                                                        ? "🫣 Uh-oh, I'm really popular today, we've been rate-limited. I just need to catch my breath. Hang on, I'll resume searching in less than a minute..."
                                                        : 'Searching and thinking...'}
                                                </span>
                                                <Spinner className="text-lg" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                    </>
                )}
                <div ref={messagesEndRef} />
            </div>

            <LemonDivider />

            {showInput && (
                <>
                    <form onSubmit={handleSubmit} className="p-4 pb-1">
                        <LemonTextArea
                            value={inputMessage}
                            onChange={setInputMessage}
                            onKeyDown={handleKeyDown}
                            placeholder="Type or paste here..."
                            minRows={4}
                            maxRows={12}
                            className="w-full"
                            data-attr="max-chat-input"
                        />
                        <div className="px-0 text-xs text-muted mt-1 mb-2">
                            `enter` to send, `shift+enter` for a new line
                        </div>
                        <LemonButton
                            type="primary"
                            htmlType="submit"
                            data-attr="max-chat-send"
                            disabled={!inputMessage.trim() || isSearchingThinking}
                            className="w-full"
                            center
                        >
                            Send
                        </LemonButton>
                    </form>
                </>
            )}
        </div>
    )
}
