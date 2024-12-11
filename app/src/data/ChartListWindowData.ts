import { App } from "../App"
import { Chart } from "../chart/sm/Chart"
import { Icons } from "../gui/Icons"
import { DirectoryWindow } from "../gui/window/DirectoryWindow"
import { ActionHistory } from "../util/ActionHistory"
import { FileHandler } from "../util/file-handler/FileHandler"
import { dirname } from "../util/Path"
import { AUDIO_EXT } from "./FileData"

type ChartPropertyEditor = {
  title: string
  element: (chart: Chart, app: App) => HTMLElement
}

function createContentEditableDiv() {
  const input = document.createElement("div")
  input.spellcheck = false
  input.contentEditable = "true"
  input.classList.add("inlineEdit")
  input.onkeydown = ev => {
    if (ev.key == "Enter") input.blur()
  }
  return input
}

type KeyWithPropertyType<T, V> = {
  [K in keyof T]-?: T[K] extends V ? K & NoUnion<K> : never
}[keyof T]

type NoUnion<T, U = T> = T extends U ? ([U] extends [T] ? T : never) : never

function simplePropertyEditor(
  title: string,
  property: KeyWithPropertyType<Chart, string>
): ChartPropertyEditor {
  return {
    title,
    element: chart => {
      const inlineDiv = createContentEditableDiv()
      inlineDiv.onblur = () => {
        const val = inlineDiv.innerText
        const lastVal = chart[property]
        ActionHistory.instance.run({
          action: () => {
            chart[property] = val as any
            inlineDiv.innerText = val
          },
          undo: () => {
            chart[property] = lastVal as any
            inlineDiv.innerText = lastVal
          },
        })
        inlineDiv.scrollLeft = 0
      }
      inlineDiv.innerText = chart[property]
      return inlineDiv
    },
  }
}

export const CHART_PROPERTIES_DATA: {
  [key: string]: ChartPropertyEditor
} = {
  name: simplePropertyEditor("Name", "chartName"),
  credit: simplePropertyEditor("Artist", "credit"),
  style: simplePropertyEditor("Style", "chartStyle"),
  description: simplePropertyEditor("Description", "description"),
  music: {
    title: "Music File",
    element: (chart, app) => {
      const container = document.createElement("div")
      container.classList.add(
        "flex-row",
        "flex-column-gap",
        "flex-static",
        "hide-buttons"
      )

      const handleInput = () => {
        if (
          input.innerText ==
          (chart.music ?? app.chartManager.loadedSM!.properties.MUSIC ?? "")
        )
          return
        const playing = app.chartManager.chartAudio.isPlaying()
        if (
          input.innerText == "" ||
          input.innerText == app.chartManager.loadedSM!.properties.MUSIC
        ) {
          chart.music = undefined
          input.innerText = app.chartManager.loadedSM!.properties.MUSIC + ""
          app.chartManager.loadAudio()
          if (playing) app.chartManager.chartAudio.play()
          return
        }
        const val =
          input.innerText == app.chartManager.loadedSM!.properties.MUSIC
            ? undefined
            : input.innerText
        const lastVal = chart.music
        ActionHistory.instance.run({
          action: () => {
            chart.music = val
            input.innerText =
              val ?? app.chartManager.loadedSM!.properties.MUSIC ?? ""
            app.chartManager.loadAudio()
            if (playing) app.chartManager.chartAudio.play()
          },
          undo: () => {
            chart.music = lastVal
            input.innerText =
              lastVal ?? app.chartManager.loadedSM!.properties.MUSIC ?? ""
            app.chartManager.loadAudio()
            if (playing) app.chartManager.chartAudio.play()
          },
        })
      }
      const input = createContentEditableDiv()
      input.style.flex = "1"
      input.onblur = handleInput
      input.innerText =
        chart.music ?? app.chartManager.loadedSM!.properties.MUSIC ?? ""

      const dirButton = document.createElement("button")
      dirButton.onclick = () => {
        const dir = dirname(app.chartManager.smPath)
        if (window.nw) {
          const fileSelector = document.createElement("input")
          fileSelector.type = "file"
          fileSelector.accept = "audio/*"
          fileSelector.onchange = () => {
            input.innerText = FileHandler.getRelativePath(
              dir,
              fileSelector.value
            )
            handleInput()
          }
          fileSelector.click()
        } else {
          app.windowManager.openWindow(
            new DirectoryWindow(
              app,
              {
                title: "Select an audio file...",
                accepted_file_types: AUDIO_EXT,
                disableClose: true,
                callback: (path: string) => {
                  input.innerText = FileHandler.getRelativePath(dir, path)
                  handleInput()
                },
              },
              dir +
                "/" +
                (chart.music ??
                  app.chartManager.loadedSM!.properties.MUSIC ??
                  "")
            )
          )
        }
      }
      const icon = Icons.getIcon("FOLDER", 12)
      dirButton.appendChild(icon)

      const revertButton = document.createElement("button")
      revertButton.onclick = () => {
        if (
          input.innerText == (app.chartManager.loadedSM!.properties.MUSIC ?? "")
        )
          return
        input.innerText = app.chartManager.loadedSM!.properties.MUSIC ?? ""
        handleInput()
      }
      const icon2 = Icons.getIcon("REVERT", 12)
      revertButton.appendChild(icon2)

      container.appendChild(input)
      container.appendChild(dirButton)
      container.appendChild(revertButton)
      return container
    },
  },
}
