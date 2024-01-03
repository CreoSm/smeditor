import { Assets, Rectangle, Texture } from "pixi.js"
import { StandardTimingWindow } from "./StandardTimingWindow"

import judgmentITGUrl from "../../../assets/judgment/judgmentITG.png"
import judgmentWaterfallUrl from "../../../assets/judgment/judgmentWaterfall.png"

export class JudgmentTexture {
  static ITG = new JudgmentTexture(judgmentITGUrl, [
    "w0",
    "w1",
    "w2",
    "w3",
    "w4",
    "w5",
    "miss",
  ])
  static WATERFALL = new JudgmentTexture(judgmentWaterfallUrl, [
    "w0",
    "w1",
    "w2",
    "w3",
    "w4",
    "w5",
    "miss",
  ])

  private texHeight = 0
  private texWidth = 0
  private texture?: Texture
  private judgeNames: string[] = []

  constructor(path: string, judgeNames: string[]) {
    this.judgeNames = judgeNames
    this.loadTex(path)
  }

  private async loadTex(path: string) {
    const judge_tex = await Assets.load(path)
    this.texture = judge_tex
    this.texHeight = judge_tex.height
    this.texWidth = judge_tex.width
  }

  getTexture(
    error: number,
    judgment: StandardTimingWindow
  ): Texture | undefined {
    if (!this.judgeNames.includes(judgment.id)) return
    let tex_coord_x = 0
    const tex_coord_y =
      (this.judgeNames.indexOf(judgment.id) * this.texHeight) /
      this.judgeNames.length
    if (error >= 0) tex_coord_x += this.texWidth / 2
    return new Texture({
      source: this.texture!.source,
      frame: new Rectangle(
        tex_coord_x,
        tex_coord_y,
        this.texWidth / 2,
        this.texHeight / this.judgeNames.length
      ),
    })
  }
}
