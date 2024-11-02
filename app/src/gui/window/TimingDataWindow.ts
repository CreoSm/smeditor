import { App } from "../../App"
import { TIMING_WINDOW_DATA } from "../../data/TimingDataWindowData"
import { EventHandler } from "../../util/EventHandler"
import { Dropdown } from "../element/Dropdown"
import { Window } from "./Window"

export class TimingDataWindow extends Window {
  app: App

  private lastBeat: number
  private chartTiming = false
  private readonly interval
  private changeHandler = () => this.setData()

  constructor(app: App) {
    super({
      title: "Edit Timing Data",
      width: 300,
      height: 340,
      disableClose: false,
      win_id: "timing_data",
      blocking: false,
    })
    this.app = app
    this.lastBeat = Math.round(this.app.chartManager.beat * 1000) / 1000
    this.chartTiming =
      this.app.chartManager.loadedChart!.timingData.usesChartTiming()
    this.initView()
    this.interval = setInterval(() => {
      if (
        Math.round(this.app.chartManager.beat * 1000) / 1000 !=
        this.lastBeat
      ) {
        this.lastBeat = Math.round(this.app.chartManager.beat * 1000) / 1000
        this.setData()
      }
    }, 17)
    EventHandler.on("timingModified", this.changeHandler)
    EventHandler.on("chartLoaded", this.changeHandler)
  }

  onClose() {
    EventHandler.off("timingModified", this.changeHandler)
    clearInterval(this.interval)
  }

  initView(): void {
    this.viewElement.replaceChildren()
    this.viewElement.classList.add("timing-data")
    const padding = document.createElement("div")
    padding.classList.add("padding")
    const songLabel = document.createElement("div")
    songLabel.classList.add("label")
    songLabel.innerText = "Apply to"

    const item = Dropdown.create(
      ["All charts", "This chart"],
      this.chartTiming ? "This chart" : "All charts"
    )
    item.onChange(value => {
      this.chartTiming = value == "This chart"
    })
    padding.appendChild(songLabel)
    padding.appendChild(item.view)
    Object.values(TIMING_WINDOW_DATA).forEach(entry => {
      const label = document.createElement("div")
      label.classList.add("label")
      label.innerText = entry.title

      const item = entry.element.create(this.app, () =>
        this.chartTiming
          ? this.app.chartManager.loadedChart!.timingData
          : this.app.chartManager.loadedSM!.timingData
      )

      padding.appendChild(label)
      padding.appendChild(item)
    })
    this.viewElement.appendChild(padding)
    this.setData()
  }

  setData() {
    if (!this.app.chartManager.loadedChart) return
    Object.values(TIMING_WINDOW_DATA).forEach((entry, index) => {
      const item = this.viewElement.children[0].children[index * 2 + 3]
      entry.element.update(
        item,
        this.app.chartManager.loadedChart!.timingData,
        this.lastBeat
      )
    })
  }
}
