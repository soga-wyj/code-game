import React, { useImperativeHandle, useRef, useState } from 'react'
import type { PracticeRow, TextSegment } from '../../data'
import styles from './index.less'

export interface RowProps {
    row: PracticeRow,
    next: () => void,
    prev: () => void,
    report: (index: number, typedLength: number, errorCount: number) => void
}

export interface RowRefMethods {
    blur: () => void
    focus: () => void
    setIsRead: (bl: boolean) => void
}

type CharState = 'todo' | 'ok' | 'bad' | 'cursor'

function Row(props: RowProps, ref: React.Ref<RowRefMethods>) {
    const { row } = props
    const { target } = row
    const [typed, setTyped] = useState('')
    const [isReadOnly, setIsReadOnly] = useState(true)
    const inputRef = useRef<HTMLInputElement>(null)
    // 中文输入法 composing 期间，拼音串会临时进入 input，需要跳过换行判断
    const composingRef = useRef(false)

    useImperativeHandle(ref, () => {
        return {
            blur: blur,
            focus: focus,
            setIsRead: setIsRead
        }
    })

    function blur() {
        inputRef.current?.blur()
    }
    function focus() {
        // 自己控制滚动位置，避免聚焦时浏览器把页面再滚一下
        inputRef.current?.focus({ preventScroll: true })
    }
    function setIsRead(bl: boolean) {
        setIsReadOnly(bl)
    }

    function isMatch(expected: string, actual: string | undefined) {
        if (actual == null) return false
        // 空格兼容中文输入法可能打出的全角空格
        if (expected === ' ') return actual === ' ' || actual === '\u3000'
        return expected === actual
    }

    function countErrors(value: string) {
        let errors = 0
        for (let i = 0; i < value.length; i++) {
            if (!isMatch(target[i], value[i])) errors++
        }
        return errors
    }

    function handleInputValue(value: string) {
        // 输入法一次上屏多个字时，超出当前题目的部分直接截断
        const nextValue = value.slice(0, target.length)
        if (nextValue !== value && inputRef.current) {
            inputRef.current.value = nextValue // 保持 input 与已录入内容一致
        }
        props.report(row.index, nextValue.length, countErrors(nextValue))
        setTyped(nextValue)

        if (nextValue.length >= target.length) { // 词和释义都打完，进入下一题
            blur()
            props.next()
            return
        }
        if (nextValue === '' && typed !== '') { // 退格清空，回到上一题
            blur()
            props.prev()
        }
    }

    function changeInputValue(event: React.ChangeEvent<HTMLInputElement>) {
        if (composingRef.current) { // 拼音未上屏，不做换行判断
            return
        }
        handleInputValue(event.target.value)
    }

    function compositionStart() {
        composingRef.current = true
    }

    function compositionEnd(event: React.CompositionEvent<HTMLInputElement>) {
        composingRef.current = false
        handleInputValue(event.currentTarget.value)
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        // 刚跳到新题、输入框还是空的时候，退格直接回上一题
        if (event.key === 'Backspace' && !isReadOnly && typed === '' && !composingRef.current) {
            event.preventDefault()
            props.prev()
        }
    }

    function preventPaste(event: React.ClipboardEvent<HTMLInputElement>) {
        event.preventDefault()
    }

    function getCharState(index: number): CharState {
        if (index < typed.length) {
            return isMatch(target[index], typed[index]) ? 'ok' : 'bad'
        }
        if (!isReadOnly && index === typed.length) {
            return 'cursor'
        }
        return 'todo'
    }

    const active = !isReadOnly
    const started = active || typed.length > 0
    const typedErrors = started ? countErrors(typed) : 0
    // 当前题始终显示手迹；已经打过的题只在有错字时保留，方便回看错在哪
    const showTrace = typed.length > 0 && (active || typedErrors > 0)
    const serial = String(row.index + 1).padStart(3, '0')

    function renderText() {
        const nodes: React.ReactNode[] = []
        let offset = 0
        row.segments.forEach((segment: TextSegment, segIndex: number) => {
            if (!started) {
                // 未轮到的题目只渲染纯文本，避免上百道题逐字生成 DOM
                nodes.push(segment.kind === 'gap'
                    ? <span key={`gap-${segIndex}`} className={`${styles.gap} ${styles.todo}`}>·</span>
                    : <span key={`seg-${segIndex}`} className={styles[segment.kind]}>{segment.text}</span>)
            } else {
                [...segment.text].forEach((char: string, charIndex: number) => {
                    const index = offset + charIndex
                    nodes.push(
                        <span
                            key={`${segment.kind}-${index}`}
                            className={`${styles.char} ${styles[segment.kind]} ${styles[getCharState(index)]}`}
                        >
                            {segment.kind === 'gap' ? '·' : char}
                        </span>
                    )
                })
            }
            offset += segment.text.length
        })
        return nodes
    }

    return (<li
        className={styles.row}
        data-row={row.index}
        data-active={active}
        onClick={() => { if (active) focus() }}
    >
        <p className={styles.line}>
            <span className={styles.num} aria-hidden="true">{serial}</span>
            {renderText()}
        </p>

        {
            showTrace && (
                <p className={styles.trace} aria-hidden="true">
                    <span className={styles.traceLabel}>手迹</span>
                    {
                        typed.split('').map((char, index) => {
                            const matched = isMatch(target[index], char)
                            const isGap = char === ' ' || char === '\u3000'
                            const className = `${styles.traceChar} ${matched ? styles.ok : styles.bad}${isGap ? ` ${styles.traceGap}` : ''}`
                            return (
                                <span key={`trace-${index}`} className={className}>
                                    {isGap ? '·' : char}
                                </span>
                            )
                        })
                    }
                </p>
            )
        }

        <div className={styles.meta} data-show={active}>
            {row.frequency ? <span className={styles.badge}>近五年行测考频 {row.frequency} 次</span> : null}
            {row.group ? <span className={styles.badge}>辨析组 {row.group.split('·').join(' · ')}</span> : null}
            {!row.meaning ? <span className={styles.badge}>暂未收录释义，只练词形</span> : null}
        </div>

        <input
            ref={inputRef}
            className={styles.input}
            type="text"
            readOnly={isReadOnly}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label={`第 ${row.index + 1} 题：${row.word}`}
            onChange={changeInputValue}
            onKeyDown={handleKeyDown}
            onPaste={preventPaste}
            onCompositionStart={compositionStart}
            onCompositionEnd={compositionEnd}
        />
    </li>)
}

export default React.memo(React.forwardRef<RowRefMethods, RowProps>(Row))
