import { median } from "../../util/Math"
import { Options } from "../../util/Options"

import { ChartManager } from "../ChartManager"
import {
  HoldNotedataEntry,
  isHoldNote,
  Notedata,
  NotedataEntry,
} from "../sm/NoteTypes"
import { HoldDroppedTimingWindow } from "./HoldDroppedTimingWindow"
import { HoldTimingWindow } from "./HoldTimingWindow"
import { StandardTimingWindow } from "./StandardTimingWindow"
import { TimingWindow } from "./TimingWindow"
import {
  isHoldDroppedTimingWindow,
  isHoldTimingWindow,
  isMineTimingWindow,
  isStandardMissTimingWindow,
  isStandardTimingWindow,
  TimingWindowCollection,
} from "./TimingWindowCollection"

interface JudgementDataPoint {
  second: number
  error: number
  judgement: TimingWindow
  notes: NotedataEntry[]
}

export class GameplayStats {
  private judgementCounts: Map<TimingWindow, number> = new Map()
  private holdJudgementCounts: Map<HoldTimingWindow, [number, number]> =
    new Map()
  private dancePoints = 0
  private maxCumulativeDancePoints = 0
  private maxDancePoints = 0
  private chartManager: ChartManager
  private readonly notedata: Notedata
  private dataPoints: JudgementDataPoint[] = []
  private handlers: ((error: number, judge: TimingWindow) => void)[] = []
  private combo = 0
  private missCombo = 0
  private maxCombo = 0
  private bestJudge?: StandardTimingWindow

  constructor(chartManager: ChartManager) {
    this.notedata = chartManager.loadedChart!.getNotedata()
    this.chartManager = chartManager
    this.bestJudge = TimingWindowCollection.getCollection(
      Options.play.timingCollection
    ).getStandardWindows()[0]
    this.calculateMaxDP()
  }

  onJudge(handler: (error: number, judge: TimingWindow) => void) {
    this.handlers.push(handler)
  }

  applyOffset(offset: number) {
    this.dataPoints = this.dataPoints.map(point => {
      if (isStandardMissTimingWindow(point.judgement)) return point
      if (!isStandardTimingWindow(point.judgement)) return point
      return {
        ...point,
        error: point.error + offset,
      }
    })
    this.recalculate()
  }

  /**
   * Adds a new judgement.
   *
   * @param {NotedataEntry[]} notes - The notes in this row.
   * @param {TimingWindow} judge - The judgement received
   * @param {number} error - The timing error in ms
   * @memberof GameplayStats
   */
  addDataPoint(notes: NotedataEntry[], judge: TimingWindow, error: number) {
    if (!this.judgementCounts.has(judge)) this.judgementCounts.set(judge, 0)
    this.judgementCounts.set(judge, this.judgementCounts.get(judge)! + 1)
    this.dancePoints += judge.dancePoints

    const comboMult = this.chartManager.loadedChart!.timingData.getEventAtBeat(
      "COMBOS",
      notes[0].beat
    )
    const hitMult = comboMult?.hitMult ?? 1
    const missMult = comboMult?.missMult ?? 1

    if (!isMineTimingWindow(judge))
      this.maxCumulativeDancePoints += TimingWindowCollection.getCollection(
        Options.play.timingCollection
      ).getMaxDancePoints()
    if (isStandardMissTimingWindow(judge)) {
      this.maxCumulativeDancePoints += notes
        .filter(isHoldNote)
        .reduce((totalDP, note) => {
          return (
            totalDP +
            TimingWindowCollection.getCollection(
              Options.play.timingCollection
            ).getMaxHoldDancePoints(note.type)
          )
        }, 0)
      this.combo = 0
      this.missCombo += missMult
      this.bestJudge = undefined
    } else if (isStandardTimingWindow(judge)) {
      if (
        TimingWindowCollection.getCollection(
          Options.play.timingCollection
        ).shouldHideNote(judge)
      ) {
        this.combo += notes.length * hitMult
        if (this.combo > this.maxCombo) this.maxCombo = this.combo
        this.missCombo = 0
        if (
          this.bestJudge &&
          judge.getTimingWindowMS() > this.bestJudge.getTimingWindowMS()
        )
          this.bestJudge = judge
      } else {
        this.bestJudge = undefined
        this.combo = 0
      }
    }
    this.handlers.forEach(handler => handler(error, judge))
    this.dataPoints.push({
      second: notes[0].second,
      error,
      judgement: judge,
      notes,
    })
  }

  /**
   * Add a new judgement for holds
   *
   * @param {HoldNotedataEntry} note - The hold note
   * @param {(HoldTimingWindow | HoldDroppedTimingWindow)} judge - The judgement received
   * @memberof GameplayStats
   */
  addHoldDataPoint(
    note: HoldNotedataEntry,
    judge: HoldTimingWindow | HoldDroppedTimingWindow
  ) {
    if (!this.judgementCounts.has(judge)) this.judgementCounts.set(judge, 0)
    this.judgementCounts.set(judge, this.judgementCounts.get(judge)! + 1)
    const holdJudge = TimingWindowCollection.getCollection(
      Options.play.timingCollection
    ).getHeldJudgement(note)
    if (!this.holdJudgementCounts.has(holdJudge))
      this.holdJudgementCounts.set(holdJudge, [0, 0])
    const count = this.holdJudgementCounts.get(holdJudge)!
    if (isHoldTimingWindow(judge)) count[0]++
    else count[1]++
    this.holdJudgementCounts.set(holdJudge, count)
    this.dancePoints += judge.dancePoints
    this.maxCumulativeDancePoints += TimingWindowCollection.getCollection(
      Options.play.timingCollection
    ).getMaxHoldDancePoints(note.type)
    this.handlers.forEach(handler => handler(0, judge))
    if (isHoldDroppedTimingWindow(judge)) {
      this.bestJudge = undefined
    }
  }

  /**
   * Returns the score. 1 is 100%.
   *
   * @return {*}  {number}
   * @memberof GameplayStats
   */
  getScore(): number {
    if (this.maxDancePoints == 0) return 0
    return this.dancePoints / this.maxDancePoints
  }

  /**
   * Returns the cumulative score.
   * Cumulative score is based on the number of arrows that have received a judgement.
   * 1 is 100%.
   *
   * @return {*}  {number}
   * @memberof GameplayStats
   */
  getCumulativeScore(): number {
    if (this.maxCumulativeDancePoints == 0) return 0
    return this.dancePoints / this.maxCumulativeDancePoints
  }

  getDataPoints(): JudgementDataPoint[] {
    return this.dataPoints
  }

  getMedian(): number {
    return median(
      this.dataPoints
        .filter(
          point =>
            !isStandardMissTimingWindow(point.judgement) &&
            isStandardTimingWindow(point.judgement)
        )
        .map(data => data.error)
    )
  }

  /**
   * Returns the max combo.
   *
   * @return {*}  {number}
   * @memberof GameplayStats
   */
  getMaxCombo(): number {
    return this.maxCombo
  }

  /**
   * Recalculates the judgements and scores of this object using the current timing windows.
   *
   * @memberof GameplayStats
   */
  recalculate() {
    this.calculateMaxDP()
    this.dancePoints = 0
    this.maxCumulativeDancePoints = 0
    for (const entry of this.holdJudgementCounts.entries()) {
      const judge = entry[0]
      this.dancePoints += entry[0].dancePoints * entry[1][0]
      this.maxCumulativeDancePoints +=
        (entry[1][0] + entry[1][1]) *
        TimingWindowCollection.getCollection(
          Options.play.timingCollection
        ).getMaxHoldDancePoints(judge.noteType)
    }
    this.judgementCounts.clear()
    for (const dataPoint of this.dataPoints) {
      let judge: TimingWindow = TimingWindowCollection.getCollection(
        Options.play.timingCollection
      ).judgeInput(dataPoint.error)
      if (
        isStandardMissTimingWindow(dataPoint.judgement) ||
        isMineTimingWindow(dataPoint.judgement)
      )
        judge = dataPoint.judgement
      if (!this.judgementCounts.has(judge)) this.judgementCounts.set(judge, 0)
      this.judgementCounts.set(judge, this.judgementCounts.get(judge)! + 1)
      this.dancePoints += judge.dancePoints
      dataPoint.judgement = judge
      if (!isMineTimingWindow(judge))
        this.maxCumulativeDancePoints += TimingWindowCollection.getCollection(
          Options.play.timingCollection
        ).getMaxDancePoints()
      if (isStandardMissTimingWindow(judge)) {
        this.maxCumulativeDancePoints += dataPoint.notes
          .filter(isHoldNote)
          .reduce((totalDP, note) => {
            return (
              totalDP +
              TimingWindowCollection.getCollection(
                Options.play.timingCollection
              ).getMaxHoldDancePoints(note.type)
            )
          }, 0)
      }
    }
  }

  private calculateMaxDP() {
    const chordCohesion: Map<number, NotedataEntry[]> = new Map()
    const numHoldsMap: Map<string, number> = new Map()
    for (const note of this.notedata) {
      if (note.type == "Mine" || note.fake) continue
      if (isHoldNote(note)) {
        if (!numHoldsMap.has(note.type)) numHoldsMap.set(note.type, 0)
        numHoldsMap.set(note.type, numHoldsMap.get(note.type)! + 1)
      }
      if (!chordCohesion.has(note.beat)) chordCohesion.set(note.beat, [])
      chordCohesion.get(note.beat)!.push(note)
    }
    this.maxDancePoints =
      chordCohesion.size *
      TimingWindowCollection.getCollection(
        Options.play.timingCollection
      ).getMaxDancePoints()
    this.maxDancePoints += Array.from(numHoldsMap.entries()).reduce(
      (totalDP, entry) => {
        return (
          totalDP +
          entry[1] *
            TimingWindowCollection.getCollection(
              Options.play.timingCollection
            ).getMaxHoldDancePoints(entry[0])
        )
      },
      0
    )
  }

  /**
   * Returns the number of judgements for a given judgement.
   *
   * @param {TimingWindow} window
   * @return {*}  {number}
   * @memberof GameplayStats
   */
  getCount(window: TimingWindow): number {
    return this.judgementCounts.get(window) ?? 0
  }

  /**
   * Returns the current combo
   *
   * @return {*}  {number}
   * @memberof GameplayStats
   */
  getCombo(): number {
    return this.combo
  }

  /**
   * Returns the current miss combo.
   *
   * @return {*}  {number}
   * @memberof GameplayStats
   */
  getMissCombo(): number {
    return this.missCombo
  }

  /**
   * Returns the best judgement received
   *
   * @return {*}  {(StandardTimingWindow | undefined)}
   * @memberof GameplayStats
   */
  getBestJudge(): StandardTimingWindow | undefined {
    return this.bestJudge
  }
}
