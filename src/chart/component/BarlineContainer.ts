import { BitmapText, Container, Sprite, Texture } from "pixi.js"
import { EventHandler } from "../../util/EventHandler"
import { Options } from "../../util/Options"
import { destroyChildIf } from "../../util/Util"
import { EditMode } from "../ChartManager"
import { ChartRenderer } from "../ChartRenderer"

const MAX_POOL = 200

interface Barline extends Sprite {
  type: "barline"
  beat: number
  deactivated: boolean
  marked: boolean
  dirtyTime: number
}

interface BarlineLabel extends BitmapText {
  type: "label"
  beat: number
  deactivated: boolean
  marked: boolean
  dirtyTime: number
}

type BarlineObject = Barline | BarlineLabel

const measureNumbers = {
  fontName: "Main",
  fontSize: 20,
  fill: ["#ffffff"],
}

export class BarlineContainer extends Container {
  children: BarlineObject[] = []

  private renderer: ChartRenderer
  private barlineMap: Map<number, Barline> = new Map()
  private barlineLabelMap: Map<number, BarlineLabel> = new Map()

  constructor(renderer: ChartRenderer) {
    super()
    this.renderer = renderer
    const timeSig = () => {
      this.removeChildren()
      this.barlineMap.clear()
      this.barlineLabelMap.clear()
    }
    EventHandler.on("timeSigChanged", timeSig)
    this.on("destroyed", () => [EventHandler.off("timeSigChanged", timeSig)])
  }

  update(beat: number, fromBeat: number, toBeat: number) {
    this.visible =
      this.renderer.chartManager.getMode() != EditMode.Play ||
      !Options.play.hideBarlines

    //Reset mark of old objects
    this.children.forEach(child => (child.marked = false))

    fromBeat = Math.max(0, fromBeat)
    const td = this.renderer.chart.timingData
    const timeSigs = td.getTimingData("TIMESIGNATURES")
    let timeSig = td.getTimingEventAtBeat("TIMESIGNATURES", fromBeat)
    let timeSigIndex = timeSig
      ? timeSigs.findIndex(t => t.beat == timeSig!.beat)
      : -1
    let divisionLength = td.getDivisionLength(fromBeat)
    const distToDivision =
      (td.getDivisionOfMeasure(fromBeat) % 1) * divisionLength

    // now we are at a beat division
    let barBeat = Math.max(0, fromBeat - distToDivision)
    let divNumber = Math.round(td.getDivisionOfMeasure(barBeat))
    // console.log("starting at " + barBeat, " div number " + divNumber)

    let divisionsPerMeasure = timeSig?.upper ?? 4

    const endLoop = () => {
      divNumber++
      divNumber %= divisionsPerMeasure
      // go to next beat
      barBeat += divisionLength
      // have we new time sig ???
      if (barBeat >= timeSigs[timeSigIndex + 1]?.beat) {
        // console.log("new time sig")
        timeSigIndex++
        // go to start of new sig
        timeSig = timeSigs[timeSigIndex]
        barBeat = timeSig.beat
        divisionLength = td.getDivisionLength(barBeat)
        divNumber = 0
        divisionsPerMeasure = timeSig.upper
      }
    }

    while (barBeat < toBeat) {
      if (this.barlineMap.size > MAX_POOL) break
      if (Options.chart.CMod && this.renderer.chart.isBeatWarped(barBeat)) {
        endLoop()
        continue
      }
      const [outOfBounds, endSearch, yPos] = this.checkBounds(barBeat, beat)
      if (endSearch) break
      if (outOfBounds) {
        endLoop()
        continue
      }

      const isMeasure = divNumber % divisionsPerMeasure == 0

      //Move element
      const barline = this.getBarline(barBeat, isMeasure)
      barline.y = yPos
      barline.height = (isMeasure ? 4 : 1) / Options.chart.zoom
      if (isMeasure) {
        const barlineLabel = this.getBarlineLabel(barBeat)
        barlineLabel.y = yPos
        barlineLabel.scale.y = Options.chart.reverse ? -1 : 1
      }
      endLoop()
    }

    //Remove old elements
    this.children
      .filter(child => !child.deactivated && !child.marked)
      .forEach(child => {
        child.deactivated = true
        child.visible = false
        if (child.type == "barline") this.barlineMap.delete(child.beat)
        if (child.type == "label") this.barlineLabelMap.delete(child.beat)
      })

    destroyChildIf(this.children, child => Date.now() - child.dirtyTime > 5000)
  }

  private checkBounds(
    bar_beat: number,
    beat: number
  ): [boolean, boolean, number] {
    const y = this.renderer.getYPosFromBeat(bar_beat)
    if (y < this.renderer.getUpperBound()) return [true, false, y]
    if (y > this.renderer.getLowerBound()) {
      if (bar_beat < beat || this.renderer.isNegScroll(bar_beat))
        return [true, false, y]
      else return [true, true, y]
    }
    return [false, false, y]
  }

  private getBarline(beat: number, isMeasure: boolean): Barline {
    if (this.barlineMap.get(beat)) {
      const cached = this.barlineMap.get(beat)!
      return Object.assign(cached, {
        deactivated: false,
        marked: true,
        dirtyTime: Date.now(),
      })
    }
    let newChild: (Partial<Barline> & Sprite) | undefined
    for (const child of this.children) {
      if (child.type == "barline" && child.deactivated) {
        newChild = child
      }
    }
    if (!newChild) {
      newChild = new Sprite(Texture.WHITE) as Barline
      this.addChild(newChild as Barline)
    }
    Object.assign(newChild, {
      type: "barline",
      beat,
      width: this.renderer.chart.gameType.notefieldWidth + 128,
      height: isMeasure ? 4 : 1,
      visible: true,
      marked: true,
      deactivated: false,
      dirtyTime: Date.now(),
    })
    newChild.anchor.set(0.5)
    this.barlineMap.set(beat, newChild as Barline)
    return newChild as Barline
  }

  private getBarlineLabel(beat: number): BarlineLabel {
    if (this.barlineLabelMap.get(beat)) {
      const cached = this.barlineLabelMap.get(beat)!
      return Object.assign(cached, {
        deactivated: false,
        marked: true,
        dirtyTime: Date.now(),
      })
    }
    let newChild: (Partial<BarlineLabel> & BitmapText) | undefined
    for (const child of this.children) {
      if (child.type == "label" && child.deactivated) {
        newChild = child
      }
    }
    if (!newChild) {
      newChild = new BitmapText("", measureNumbers) as BarlineLabel
      this.addChild(newChild as BarlineLabel)
    }
    Object.assign(newChild, {
      type: "label",
      beat,
      x: (this.renderer.chart.gameType.notefieldWidth + 128) / -2 - 16,
      text: `${Math.round(this.renderer.chart.timingData.getMeasure(beat))}`,
      visible: true,
      marked: true,
      deactivated: false,
      dirtyTime: Date.now(),
    })
    newChild.anchor.x = 1
    newChild.anchor.y = 0.5

    this.barlineLabelMap.set(beat, newChild as BarlineLabel)
    return newChild as BarlineLabel
  }
}