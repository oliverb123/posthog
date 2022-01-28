import React, { useEffect, useRef, useState } from 'react'
import { AutoComplete, Select } from 'antd'
import { useThrottledCallback } from 'use-debounce'
import api from 'lib/api'
import { dateMapping, isOperatorDate, isOperatorFlag, isOperatorMulti, isOperatorRegex, toString } from 'lib/utils'
import { SelectGradientOverflow } from 'lib/components/SelectGradientOverflow'
import { PropertyOperator } from '~/types'
import { dayjs, now } from 'lib/dayjs'
import generatePicker from 'antd/lib/date-picker/generatePicker'
import dayjsGenerateConfig from 'rc-picker/es/generate/dayjs'
import { propertyDefinitionsModel } from '~/models/propertyDefinitionsModel'
import { useValues } from 'kea'

export const DatePicker = generatePicker<dayjs.Dayjs>(dayjsGenerateConfig)

type PropValue = {
    id?: number
    name?: string | boolean
}

type Option = {
    label?: string
    name?: string
    status?: 'loading' | 'loaded'
    values?: PropValue[]
}

interface PropertyValueProps {
    propertyKey: string
    type: string
    endpoint?: string // Endpoint to fetch options from
    placeholder?: string
    style?: Partial<React.CSSProperties>
    bordered?: boolean
    onSet: CallableFunction
    value?: string | number | Array<string | number> | null
    operator?: PropertyOperator
    outerOptions?: Option[] // If no endpoint provided, options are given here
    autoFocus?: boolean
    allowCustom?: boolean
}

function matchesLowerCase(needle?: string, haystack?: string): boolean {
    if (typeof haystack !== 'string' || typeof needle !== 'string') {
        return false
    }
    return haystack.toLowerCase().indexOf(needle.toLowerCase()) > -1
}

function getValidationError(operator: PropertyOperator, value: any): string | null {
    if (isOperatorRegex(operator)) {
        try {
            new RegExp(value)
        } catch (e) {
            return e.message
        }
    }
    return null
}

const dayJSMightParse = (
    candidateDateTimeValue: string | number | (string | number)[] | null | undefined
): candidateDateTimeValue is string | number | undefined => ['string', 'number'].includes(typeof candidateDateTimeValue)

export function PropertyValue({
    propertyKey,
    type,
    endpoint = undefined,
    placeholder = undefined,
    style = {},
    bordered = true,
    onSet,
    value,
    operator,
    outerOptions = undefined,
    autoFocus = false,
    allowCustom = true,
}: PropertyValueProps): JSX.Element {
    const isMultiSelect = operator && isOperatorMulti(operator)
    const [input, setInput] = useState(isMultiSelect ? '' : toString(value))
    const [shouldBlur, setShouldBlur] = useState(false)
    const [options, setOptions] = useState({} as Record<string, Option>)
    const autoCompleteRef = useRef<HTMLElement>(null)

    const [datePickerOpen, setDatePickerOpen] = useState(operator && isOperatorDate(operator) && autoFocus)

    const { formatForDisplay } = useValues(propertyDefinitionsModel)

    // update the input field if passed a new `value` prop
    useEffect(() => {
        if (!value) {
            setInput('')
        } else if (value !== input) {
            const valueObject = options[propertyKey]?.values?.find((v) => v.id === value)
            if (valueObject) {
                setInput(toString(valueObject.name))
            }
        }
    }, [value])

    const loadPropertyValues = useThrottledCallback((newInput) => {
        if (type === 'cohort') {
            return
        }
        const key = propertyKey.split('__')[0]
        setOptions({ ...options, [propertyKey]: { ...options[propertyKey], status: 'loading' } })
        if (outerOptions) {
            setOptions({
                ...options,
                [propertyKey]: {
                    values: [...Array.from(new Set(outerOptions))],
                    status: 'loaded',
                },
            })
        } else {
            api.get(endpoint || 'api/' + type + '/values/?key=' + key + (newInput ? '&value=' + newInput : '')).then(
                (propValues: PropValue[]) => {
                    setOptions({
                        ...options,
                        [propertyKey]: {
                            values: [...Array.from(new Set(propValues))],
                            status: 'loaded',
                        },
                    })
                }
            )
        }
    }, 300)

    function setValue(newValue: PropertyValueProps['value']): void {
        onSet(newValue)
        if (isMultiSelect) {
            setInput('')
        }
    }

    useEffect(() => {
        loadPropertyValues('')
    }, [propertyKey])

    useEffect(() => {
        if (input === '' && shouldBlur) {
            ;(document.activeElement as HTMLElement)?.blur()
            setShouldBlur(false)
        }
    }, [input, shouldBlur])

    const displayOptions = (options[propertyKey]?.values || []).filter(
        (option) => input === '' || matchesLowerCase(input, toString(option?.name))
    )

    const validationError = operator ? getValidationError(operator, value) : null

    const [datePickerStartingValue] = useState(dayJSMightParse(value) ? dayjs(value) : null)

    const commonInputProps = {
        style: { width: '100%', ...style },
        onSearch: (newInput: string) => {
            setInput(newInput)
            if (!Object.keys(options).includes(newInput) && !(operator && isOperatorFlag(operator))) {
                loadPropertyValues(newInput)
            }
        },
        ['data-attr']: 'prop-val',
        dropdownMatchSelectWidth: 350,
        bordered,
        placeholder,
        allowClear: Boolean(value),
        onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Escape') {
                setInput('')
                setShouldBlur(true)
                return
            }
            if (!isMultiSelect && e.key === 'Enter') {
                // We have not explicitly selected a dropdown item by pressing the up/down keys; or the ref is unavailable
                if (
                    !autoCompleteRef.current ||
                    autoCompleteRef.current?.querySelectorAll?.('.ant-select-item-option-active')?.length === 0
                ) {
                    setValue(input)
                }
            }
        },
        handleBlur: () => {
            if (input != '') {
                if (Array.isArray(value) && !value.includes(input)) {
                    setValue([...value, ...[input]])
                } else if (!Array.isArray(value)) {
                    setValue(input)
                }
                setInput('')
            }
        },
    }

    return (
        <>
            {isMultiSelect ? (
                <SelectGradientOverflow
                    loading={options[propertyKey]?.status === 'loading'}
                    propertyKey={propertyKey}
                    {...commonInputProps}
                    autoFocus={autoFocus}
                    value={value === null ? [] : value}
                    mode="multiple"
                    showSearch
                    onChange={(val, payload) => {
                        if (Array.isArray(payload) && payload.length > 0) {
                            setValue(val)
                        } else if (payload instanceof Option) {
                            setValue(payload?.value ?? [])
                        } else {
                            setValue([])
                        }
                    }}
                >
                    {input && !displayOptions.some(({ name }) => input.toLowerCase() === toString(name).toLowerCase()) && (
                        <Select.Option key="specify-value" value={input} className="ph-no-capture">
                            Specify: {formatForDisplay(propertyKey, input)}
                        </Select.Option>
                    )}
                    {displayOptions.map(({ name: _name }, index) => {
                        const name = toString(_name)
                        return (
                            <Select.Option
                                key={name}
                                value={name}
                                data-attr={'prop-val-' + index}
                                className="ph-no-capture"
                                title={name}
                            >
                                {name === '' ? <i>(empty string)</i> : formatForDisplay(propertyKey, name)}
                            </Select.Option>
                        )
                    })}
                </SelectGradientOverflow>
            ) : operator && isOperatorDate(operator) ? (
                <>
                    <DatePicker
                        {...commonInputProps}
                        autoFocus={autoFocus}
                        open={datePickerOpen}
                        inputReadOnly={false}
                        className={'filter-date-picker'}
                        dropdownClassName={'filter-date-picker-dropdown'}
                        format="YYYY-MM-DD HH:mm:ss"
                        showTime={true}
                        showNow={false}
                        value={datePickerStartingValue}
                        onFocus={() => setDatePickerOpen(true)}
                        onBlur={() => setDatePickerOpen(false)}
                        onOk={(selectedDate) => {
                            setValue(selectedDate.format('YYYY-MM-DD HH:mm:ss'))
                            setDatePickerOpen(false)
                        }}
                        getPopupContainer={(trigger: Element | null) => {
                            const container = trigger?.parentElement?.parentElement?.parentElement
                            return container ?? document.body
                        }}
                        renderExtraFooter={() => (
                            <>
                                <span>quick choices: </span>{' '}
                                <Select
                                    bordered={true}
                                    style={{ width: '100%' }}
                                    onSelect={(selectedRelativeRange) => {
                                        const matchedMapping = dateMapping[String(selectedRelativeRange)]
                                        const formattedForDateFilter =
                                            matchedMapping?.getFormattedDate &&
                                            matchedMapping?.getFormattedDate(now(), 'YYYY-MM-DD HH:mm:ss')
                                        setValue(formattedForDateFilter?.split(' - ')[0])
                                    }}
                                    placeholder={'e.g. 7 days ago'}
                                >
                                    {[
                                        ...Object.entries(dateMapping).map(([key, { inactive }]) => {
                                            if (key === 'Custom' || key == 'All time' || inactive) {
                                                return null
                                            }

                                            return (
                                                <Select.Option key={key} value={key}>
                                                    {key.startsWith('Last') ? key.replace('Last ', '') + ' ago' : key}
                                                </Select.Option>
                                            )
                                        }),
                                    ]}
                                </Select>
                            </>
                        )}
                    />
                </>
            ) : (
                <AutoComplete
                    {...commonInputProps}
                    autoFocus={autoFocus}
                    value={input}
                    onClear={() => {
                        setInput('')
                        setValue('')
                    }}
                    onChange={(val) => {
                        setInput(toString(val))
                    }}
                    onSelect={(val, option) => {
                        setInput(option.title)
                        setValue(toString(val))
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            setInput(toString(input))
                            setValue(toString(input))
                        }
                    }}
                    ref={autoCompleteRef}
                >
                    {[
                        ...(input && allowCustom && !displayOptions.some(({ name }) => input === toString(name))
                            ? [
                                  <AutoComplete.Option key="@@@specify-value" value={input} className="ph-no-capture">
                                      Specify: {input}
                                  </AutoComplete.Option>,
                              ]
                            : []),
                        ...displayOptions.map(({ name: _name, id }, index) => {
                            const name = toString(_name)
                            return (
                                <AutoComplete.Option
                                    key={id ? toString(id) : name}
                                    value={id ? toString(id) : name}
                                    data-attr={'prop-val-' + index}
                                    className="ph-no-capture"
                                    title={name}
                                >
                                    {name}
                                </AutoComplete.Option>
                            )
                        }),
                    ]}
                </AutoComplete>
            )}
            {validationError && <p className="text-danger">{validationError}</p>}
        </>
    )
}
